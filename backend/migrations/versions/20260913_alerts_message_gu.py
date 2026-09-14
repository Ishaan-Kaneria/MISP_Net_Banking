"""Add alerts.message_gu so security/stress alerts are trilingual (EN/HI/GU)
like the rest of the app (chat replies, translations.ts) instead of only
ever offering Hindi as an alternative to English.

Nullable, and no backfill: existing alert rows have no Gujarati source text
to derive one from at the DB layer. New alerts (app/pipeline.py) always set
it; the API and frontend fall back to message_en for older rows that have
it as NULL.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260913_alerts_message_gu"
down_revision = "20260913_audit_logs_txn_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("alerts")}
    if "message_gu" not in columns:
        op.add_column("alerts", sa.Column("message_gu", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("alerts") as batch_op:
        batch_op.drop_column("message_gu")
