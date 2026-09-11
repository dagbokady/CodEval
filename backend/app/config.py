from functools import lru_cache

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
    # Tolérance accordée à l'envoi final déclenché à l'expiration du temps :
    # le client pousse son travail au moment où la session se ferme.
    autosave_grace_seconds: int = 60

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
