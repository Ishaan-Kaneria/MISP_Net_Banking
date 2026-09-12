from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./arthai.db"
    jwt_secret: str = "local-development-secret-change-me"
    jwt_expire_min: int = 720
    cors_origins: str = "http://localhost:3000"
    gemini_api_key: str = ""
    llm_model: str = "gemini-3.6-flash"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("database_url")
    @classmethod
    def _use_psycopg3_driver(cls, value: str) -> str:
        # requirements.txt installs psycopg (v3), not psycopg2. Hosts like
        # Render/Railway/Fly hand out plain "postgres://" or "postgresql://"
        # connection strings, which SQLAlchemy resolves to the psycopg2
        # dialect by default — that driver isn't installed, so the app would
        # crash on startup. Normalize to the psycopg3 dialect explicitly.
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value


settings = Settings()
