from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


# psycopg3 (our Postgres driver) auto-prepares a statement on the server
# after it sees the same SQL text run a handful of times. That's invisible
# on a direct connection, but pooled Postgres endpoints that run PgBouncer
# in transaction-pooling mode (Neon and Supabase's default "pooler"
# connection strings both do this) hand out a different physical backend
# connection per transaction — so a statement prepared during one request
# can vanish before the next request's turn, and psycopg raises once a
# frequently-repeated INSERT/UPDATE (audit_logs, on literally every
# transaction) crosses that threshold. `prepare_threshold=None` disables
# server-side prepare entirely, which is exactly what Neon/Supabase's own
# docs recommend for psycopg + a pooled connection string. Harmless for a
# direct (non-pooled) Postgres connection or SQLite — this only changes
# psycopg3's own behavior and SQLite doesn't take this connect_arg at all.
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
elif settings.database_url.startswith("postgresql"):
    connect_args = {"prepare_threshold": None}
else:
    connect_args = {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()