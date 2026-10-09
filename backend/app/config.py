from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CODEVAL_", env_file=".env", extra="ignore")

    secret_key: str = "dev-secret-change-me"
    database_url: str = "postgresql+psycopg://codeval:codeval@localhost:5432/codeval"
    access_token_minutes: int = 720
    pool_size: int = 10
    pool_max_overflow: int = 20
    cors_origins: str = "http://localhost:5173"

    # Limites imposées aux programmes soumis (code non fiable, CDC XII)
    sandbox_cpu_seconds: int = 5
    sandbox_memory_mb: int = 256
    sandbox_wall_timeout: int = 10
    sandbox_max_processes: int = 64
    sandbox_max_output_bytes: int = 64 * 1024
    sandbox_compile_timeout: int = 20

    worker_poll_seconds: float = 2.0
    # Tolérance accordée à l'envoi final déclenché à la clôture (fin du temps,
    # clôture par l'enseignant, verrouillage) : le client pousse son travail au
    # moment où la session se ferme, parfois après une coupure réseau.
    autosave_grace_seconds: int = 120

    # Limite de tentatives de connexion
    login_max_attempts: int = 5
    login_lockout_minutes: int = 15

    # Envoi des e-mails (code de vérification, mot de passe oublié). Mailjet
    # d'abord, par son API ; à défaut SMTP ; sans l'un ni l'autre, le contenu
    # part dans les journaux du serveur (développement).
    mailjet_api_key: str = ""
    mailjet_api_secret: str = ""
    mail_from_name: str = "CodEval"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    # Adresse d'expédition, pour Mailjet comme pour SMTP. Avec Mailjet, elle
    # doit être validée comme expéditeur dans le compte.
    smtp_from: str = "noreply@codeval.fr"
    frontend_url: str = "http://localhost:5173"
    reset_token_minutes: int = 30

    # Code envoyé pour confirmer l'adresse avant la création d'un compte.
    # À False (développement local seulement), enseignants et apprenants
    # s'inscrivent sans code : n'importe quelle adresse est acceptée.
    email_verification: bool = True
    email_code_minutes: int = 15
    email_code_max_attempts: int = 5
    email_code_resend_seconds: int = 60
    email_code_per_ip_hour: int = 10

    # Compte d'administration créé par `python -m app.seed`
    org_name: str = ""
    admin_email: str = ""
    admin_password: str = ""
    admin_name: str = "Administration"

    @field_validator("database_url")
    @classmethod
    def _psycopg_driver(cls, v: str) -> str:
        # Render et d'autres hébergeurs fournissent postgres:// ou postgresql://
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
