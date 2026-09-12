"""Add wallet_topups table for the Razorpay Add Money flow."""

import sqlalchemy as sa
from alembic import op

revision = "20260912_wallet_topups"
down_revision = "20260912_arthai_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wallet_topups",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("razorpay_order_id", sa.String(64), nullable=False),
        sa.Column("razorpay_payment_id", sa.String(64), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("transaction_id", sa.String(36), sa.ForeignKey("transactions.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_wallet_topups_user_id", "wallet_topups", ["user_id"])
    op.create_index("ix_wallet_topups_razorpay_order_id", "wallet_topups", ["razorpay_order_id"], unique=True)


def downgrade() -> None:
    op.drop_table("wallet_topups")
