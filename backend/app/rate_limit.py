from __future__ import annotations

import time
import threading

from .config import settings


class LoginRateLimiter:
    def __init__(self):
        self._attempts: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _cleanup(self, key: str) -> list[float]:
        window = settings.login_lockout_minutes * 60
        cutoff = time.monotonic() - window
        self._attempts[key] = [t for t in self._attempts.get(key, []) if t > cutoff]
        return self._attempts[key]

    def is_locked(self, key: str) -> bool:
        with self._lock:
            attempts = self._cleanup(key)
            return len(attempts) >= settings.login_max_attempts

    def record_failure(self, key: str) -> None:
        with self._lock:
            self._cleanup(key)
            self._attempts.setdefault(key, []).append(time.monotonic())

    def reset(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)


limiter = LoginRateLimiter()
