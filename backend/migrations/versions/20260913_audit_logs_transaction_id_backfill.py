"""Defensively add audit_logs.transaction_id for databases stamped past it.

`20260912_arthai_initial`'s upgrade() was edited in place at some point from a
bare create_all() to explicit op.create_table(...) calls that include
audit_logs.transaction_id -- but its revision id was never changed. Alembic
tracks "already applied" purely by revision id, so any database that was
migrated using an *earlier* body of that same script (before this column
existed in it) is permanently stuck without the column: `alembic upgrade
head` sees "20260912_arthai_initial" already stamped and never re-runs it,
no matter how its body has since changed. That's exactly what happened
against a live Neon Postgres database -- every `/txn` call's AuditLog insert
failed with `psycopg.errors.UndefinedColumn: column "transaction_id" of
relation "audit_logs" does not exist`.

This checks the live schema instead of assuming a starting state, so it's
safe to run against both kinds of database: one already carrying the column
(from a fresh `20260912_arthai_initial` that had it from the start) is a
no-op here, one missing it gets patched.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260913_audit_logs_txn_id"
down_revision = "20260912_wallet_topups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("audit_logs")}
    if "transaction_id" not in columns:
        # batch_alter_table, not a bare op.add_column: SQLite can't ALTER a
        # column into existence with an inline foreign key in one statement
        # (Alembic raises NotImplementedError -- it needs the copy-and-move
        # "batch mode" strategy for that). Postgres allows it directly, and
        # batch mode reduces to a normal ALTER there, so this one form is
        # safe on both.
        with op.batch_alter_table("audit_logs") as batch_op:
            batch_op.add_column(sa.Column("transaction_id", sa.String(36), nullable=True))
            # SQLite's batch mode (a copy-and-move rebuild) requires every
            # constraint it carries over to have an explicit name; naming it
            # here as its own step keeps the plain add_column above generic
            # enough to also work unchanged on Postgres.
            batch_op.create_foreign_key("fk_audit_logs_transaction_id", "transactions", ["transaction_id"], ["id"])
        existing_indexes = {index["name"] for index in inspector.get_indexes("audit_logs")}
        if "ix_audit_logs_transaction_id" not in existing_indexes:
            op.create_index("ix_audit_logs_transaction_id", "audit_logs", ["transaction_id"])


def downgrade() -> None:
    # Deliberately a no-op: this migration only backfills a column that
    # 20260912_arthai_initial was always supposed to have created. Dropping
    # it on downgrade could destroy a column other, unrelated data now
    # depends on for a database where this migration was the one that
    # genuinely created it.
    pass
