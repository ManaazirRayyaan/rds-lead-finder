from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_maps_api_key: str = ""
    database_url: str = "postgresql+psycopg:///rds_lead_finder"
    cors_origins: str = "http://localhost:5173"
    admin_username: str = "admin"
    admin_password_hash: str = ""
    session_secret: str = ""
    session_hours: int = 12
    auth_cookie_secure: bool = False
    enable_api_docs: bool = True

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def auth_configured(self) -> bool:
        return bool(
            self.admin_username.strip()
            and self.admin_password_hash.strip()
            and len(self.session_secret) >= 32
        )

@lru_cache
def get_settings() -> Settings:
    # Environment files are read once per process; restart after changing .env.
    return Settings()
