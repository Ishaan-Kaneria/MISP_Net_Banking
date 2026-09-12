from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./arthai.db"
    jwt_secret: str = "local-development-secret-change-me"
    jwt_expire_min: int = 720
    cors_origins: str = "http://localhost:3000"
    gemini_api_key: str = ""
    llm_model: str = "gemini-3.6-flash"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
