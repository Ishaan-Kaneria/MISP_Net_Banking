"""Create the Arth-AI application schema.

Explicit table definitions (not Base.metadata.create_all(bind=op.get_bind())).
A migration built from create_all() only captures whatever models.py happens
to look like at the moment `alembic revision` is run — any column or table
added to models.py afterwards is invisible to it, so `alembic upgrade head`
silently does nothing for that change against a real database (main.py's own
create_all() masks this locally on SQLite by creating missing tables, but it
does not add columns to an already-existing Postgres table). Every future
schema change must ship as its own revision with its own explicit
op.add_column/op.create_table calls.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260912_arthai_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("pin_hash", sa.String(255), nullable=False),
        sa.Column("lang", sa.String(2), nullable=False),
        sa.Column("kyc_status", sa.String(20), nullable=False),
        sa.Column("device_id", sa.String(120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_phone", "users", ["phone"], unique=True)

    op.create_table(
        "accounts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("balance", sa.Numeric(14, 2), nullable=False),
    )

    op.create_table(
        "transactions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("payee", sa.String(180), nullable=True),
        sa.Column("mcc", sa.String(20), nullable=True),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lng", sa.Float(), nullable=True),
        sa.Column("device_id", sa.String(120), nullable=True),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("fraud_score", sa.Float(), nullable=False),
    )
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"])
    op.create_index("ix_transactions_ts", "transactions", ["ts"])

    op.create_table(
        "user_features",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("spend_7d", sa.Numeric(14, 2), nullable=False),
        sa.Column("spend_30d", sa.Numeric(14, 2), nullable=False),
        sa.Column("savings_rate", sa.Float(), nullable=False),
        sa.Column("salary_amt", sa.Numeric(14, 2), nullable=False),
        sa.Column("emi_count", sa.Integer(), nullable=False),
        sa.Column("night_txn_ratio", sa.Float(), nullable=False),
        sa.Column("unique_payees_7d", sa.Integer(), nullable=False),
        sa.Column("missed_emi_30d", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "user_scores",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("fraud_score", sa.Float(), nullable=False),
        sa.Column("segment", sa.String(30), nullable=False),
        sa.Column("life_stage", sa.String(30), nullable=False),
        sa.Column("stress_flag", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "recommendations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("product_code", sa.String(40), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("blocked_by_ethics", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_recommendations_user_id", "recommendations", ["user_id"])

    op.create_table(
        "alerts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("message_hi", sa.Text(), nullable=False),
        sa.Column("message_en", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_alerts_user_id", "alerts", ["user_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("transaction_id", sa.String(36), sa.ForeignKey("transactions.id"), nullable=True),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("features", sa.JSON(), nullable=False),
        sa.Column("reasons", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_logs_transaction_id", "audit_logs", ["transaction_id"])

    op.create_table(
        "kyc_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("doc_type", sa.String(20), nullable=False),
        sa.Column("mock_ref", sa.String(120), nullable=False),
        sa.Column("consent_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("lang", sa.String(2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_chat_messages_user_id", "chat_messages", ["user_id"])

    op.create_table(
        "documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("source", sa.String(120), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("documents")
    op.drop_table("chat_messages")
    op.drop_table("kyc_events")
    op.drop_table("audit_logs")
    op.drop_table("alerts")
    op.drop_table("recommendations")
    op.drop_table("user_scores")
    op.drop_table("user_features")
    op.drop_table("transactions")
    op.drop_table("accounts")
    op.drop_table("users")
