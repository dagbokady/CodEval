"""Exécution de code non fiable sous contraintes de ressources (CDC XII).

L'implémentation par défaut isole via un processus fils : répertoire temporaire
dédié, limites POSIX (CPU, mémoire, fichiers, processus), délai mural, sortie
tronquée et environnement minimal. L'interface `Sandbox` permet de substituer une
isolation plus forte (conteneur, micro-VM) sans toucher au moteur de correction.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from typing import Protocol

from ..config import settings


@dataclass
class ExecResult:
    exit_code: int
    stdout: str
    stderr: str
    timed_out: bool


class Sandbox(Protocol):
    def run(
        self, workdir: str, cmd: list[str], stdin: str = "", timeout: float | None = None
    ) -> ExecResult: ...


def _limits() -> None:  # pragma: no cover - exécuté dans le processus fils
    """Applique les limites de ressources (best effort selon la plateforme)."""
    import resource

    cpu = settings.sandbox_cpu_seconds
    caps = [
        (resource.RLIMIT_CPU, (cpu, cpu + 1)),
        (resource.RLIMIT_FSIZE, (8 * 1024 * 1024, 8 * 1024 * 1024)),
        (resource.RLIMIT_NOFILE, (256, 256)),
    ]
    # RLIMIT_AS est inexploitable sur macOS : les runtimes y réservent de larges plages.
    if sys.platform.startswith("linux"):
        mem = settings.sandbox_memory_mb * 1024 * 1024
        caps.append((resource.RLIMIT_AS, (mem, mem)))
        caps.append(
            (
                resource.RLIMIT_NPROC,
                (settings.sandbox_max_processes, settings.sandbox_max_processes),
            )
        )
    for res_id, values in caps:
        try:
            resource.setrlimit(res_id, values)
        except (ValueError, OSError):
            continue
    try:
        os.setsid()
    except OSError:
        pass


class SubprocessSandbox:
    """Isolation locale : suffisante pour le MVP, remplaçable en production."""

    def run(
        self, workdir: str, cmd: list[str], stdin: str = "", timeout: float | None = None
    ) -> ExecResult:
        limit = timeout or settings.sandbox_wall_timeout
        env = {"PATH": "/usr/bin:/bin:/usr/local/bin", "HOME": workdir, "LANG": "C.UTF-8"}
        try:
            proc = subprocess.run(
                cmd,
                cwd=workdir,
                input=stdin,
                capture_output=True,
                text=True,
                timeout=limit,
                env=env,
                preexec_fn=_limits if os.name == "posix" else None,
                errors="replace",
            )
        except subprocess.TimeoutExpired:
            return ExecResult(-1, "", "Délai d'exécution dépassé", True)
        except (OSError, subprocess.SubprocessError) as exc:
            return ExecResult(-1, "", f"Environnement d'exécution indisponible : {exc}", False)
        cap = settings.sandbox_max_output_bytes
        return ExecResult(proc.returncode, proc.stdout[:cap], proc.stderr[:cap], False)


class Workspace:
    """Répertoire temporaire jetable pour une production."""

    def __init__(self) -> None:
        self.path = tempfile.mkdtemp(prefix="codeval-")

    def write(self, filename: str, content: str) -> None:
        with open(os.path.join(self.path, filename), "w", encoding="utf-8") as fh:
            fh.write(content)

    def __enter__(self) -> "Workspace":
        return self

    def __exit__(self, *_exc) -> None:
        shutil.rmtree(self.path, ignore_errors=True)


default_sandbox: Sandbox = SubprocessSandbox()
