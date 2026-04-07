"""initial schema — all 26 models

Revision ID: 50733d721f6c
Revises:
Create Date: 2026-04-05 15:19:42.112535

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '50733d721f6c'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Stores (must come first — other tables FK to it) ──
    op.create_table(
        'stores',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('store_name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(20)),
        sa.Column('address', sa.Text),
        sa.Column('gstin', sa.String(20)),
        sa.Column('hours_json', sa.Text),
        sa.Column('holiday_note', sa.Text),
        sa.Column('created_at', sa.Float),
    )

    # ── Users ──
    op.create_table(
        'users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('username', sa.String(80), unique=True, nullable=False),
        sa.Column('email', sa.String(255), unique=True, nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('role', sa.String(20), nullable=False, server_default='staff'),
        sa.Column('phone', sa.String(20)),
        sa.Column('is_active', sa.Boolean, server_default=sa.text('1')),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
        sa.Column('created_at', sa.Float),
        sa.Column('last_login', sa.Float),
    )
    op.create_index('ix_users_username', 'users', ['username'])
    op.create_index('ix_users_email', 'users', ['email'])

    # ── Products ──
    op.create_table(
        'products',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('sku', sa.String(30), unique=True, nullable=False),
        sa.Column('product_name', sa.String(255), nullable=False),
        sa.Column('category', sa.String(100), nullable=False, server_default=''),
        sa.Column('image_url', sa.Text),
        sa.Column('barcode', sa.String(50)),
        sa.Column('current_stock', sa.Integer, server_default='0'),
        sa.Column('reorder_threshold', sa.Integer, server_default='0'),
        sa.Column('daily_sales_rate', sa.Float, server_default='0'),
        sa.Column('unit_price', sa.Float, server_default='0'),
        sa.Column('cost_price', sa.Float, server_default='0'),
        sa.Column('shelf_life_days', sa.Integer),
        sa.Column('last_restock_date', sa.String(20)),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
        sa.Column('is_active', sa.Boolean, server_default=sa.text('1')),
        sa.Column('created_at', sa.Float),
    )
    op.create_index('ix_products_sku', 'products', ['sku'])
    op.create_index('ix_products_barcode', 'products', ['barcode'])
    op.create_index('ix_products_category', 'products', ['category'])

    # ── Customers ──
    op.create_table(
        'customers',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('customer_code', sa.String(20), unique=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(20), unique=True, nullable=False),
        sa.Column('email', sa.String(255)),
        sa.Column('whatsapp_opted_in', sa.Boolean, server_default=sa.text('0')),
        sa.Column('last_offer_timestamp', sa.Float),
        sa.Column('last_offer_category', sa.String(100)),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
        sa.Column('created_at', sa.Float),
    )
    op.create_index('ix_customers_customer_code', 'customers', ['customer_code'])
    op.create_index('ix_customers_phone', 'customers', ['phone'])

    # ── Purchase History ──
    op.create_table(
        'purchase_history',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('customer_id', sa.String(36), sa.ForeignKey('customers.id')),
        sa.Column('product', sa.String(255), nullable=False),
        sa.Column('category', sa.String(100), server_default=''),
        sa.Column('quantity', sa.Integer, server_default='1'),
        sa.Column('price', sa.Float, server_default='0'),
        sa.Column('timestamp', sa.Float),
    )
    op.create_index('ix_purchase_history_customer_id', 'purchase_history', ['customer_id'])

    # ── Suppliers ──
    op.create_table(
        'suppliers',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('supplier_id', sa.String(20), unique=True, nullable=False),
        sa.Column('supplier_name', sa.String(255), nullable=False),
        sa.Column('contact_phone', sa.String(20)),
        sa.Column('whatsapp_number', sa.String(20)),
        sa.Column('products_json', sa.Text),
        sa.Column('categories_json', sa.Text),
        sa.Column('price_per_unit', sa.Float, server_default='0'),
        sa.Column('reliability_score', sa.Float, server_default='3.0'),
        sa.Column('delivery_days', sa.Integer, server_default='7'),
        sa.Column('min_order_qty', sa.Integer, server_default='1'),
        sa.Column('payment_terms', sa.String(100)),
        sa.Column('location', sa.String(255)),
        sa.Column('notes', sa.Text),
        sa.Column('is_active', sa.Boolean, server_default=sa.text('1')),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
        sa.Column('created_at', sa.Float),
    )
    op.create_index('ix_suppliers_supplier_id', 'suppliers', ['supplier_id'])

    # ── Orders ──
    op.create_table(
        'orders',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('order_id', sa.String(30), unique=True, nullable=False),
        sa.Column('customer_id', sa.String(36), sa.ForeignKey('customers.id')),
        sa.Column('customer_name', sa.String(255)),
        sa.Column('phone', sa.String(20)),
        sa.Column('total_amount', sa.Float, server_default='0'),
        sa.Column('gst_amount', sa.Float, server_default='0'),
        sa.Column('discount_amount', sa.Float, server_default='0'),
        sa.Column('status', sa.String(30), server_default='pending'),
        sa.Column('payment_method', sa.String(30), server_default='Cash'),
        sa.Column('source', sa.String(30), server_default='counter'),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
        sa.Column('timestamp', sa.Float),
    )
    op.create_index('ix_orders_order_id', 'orders', ['order_id'])
    op.create_index('ix_orders_timestamp', 'orders', ['timestamp'])
    op.create_index('ix_orders_status', 'orders', ['status'])

    # ── Order Items ──
    op.create_table(
        'order_items',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('order_id', sa.String(36), sa.ForeignKey('orders.id')),
        sa.Column('sku', sa.String(30), nullable=False),
        sa.Column('product_name', sa.String(255), nullable=False),
        sa.Column('qty', sa.Integer, server_default='1'),
        sa.Column('unit_price', sa.Float, server_default='0'),
        sa.Column('total', sa.Float, server_default='0'),
    )
    op.create_index('ix_order_items_order_id', 'order_items', ['order_id'])

    # ── Udhaar Ledgers ──
    op.create_table(
        'udhaar_ledgers',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('udhaar_id', sa.String(20), unique=True, nullable=False),
        sa.Column('customer_id', sa.String(36), sa.ForeignKey('customers.id')),
        sa.Column('customer_name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(20), nullable=False),
        sa.Column('total_credit', sa.Float, server_default='0'),
        sa.Column('total_paid', sa.Float, server_default='0'),
        sa.Column('balance', sa.Float, server_default='0'),
        sa.Column('credit_limit', sa.Float, server_default='5000'),
        sa.Column('last_reminder_sent', sa.String(20)),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
        sa.Column('created_at', sa.String(20), nullable=False),
    )
    op.create_index('ix_udhaar_ledgers_udhaar_id', 'udhaar_ledgers', ['udhaar_id'])
    op.create_index('ix_udhaar_ledgers_customer_id', 'udhaar_ledgers', ['customer_id'])

    # ── Udhaar Entries ──
    op.create_table(
        'udhaar_entries',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('ledger_id', sa.String(36), sa.ForeignKey('udhaar_ledgers.id')),
        sa.Column('order_id', sa.String(30)),
        sa.Column('entry_type', sa.String(10), nullable=False),
        sa.Column('amount', sa.Float, nullable=False),
        sa.Column('items_json', sa.Text),
        sa.Column('note', sa.Text),
        sa.Column('date', sa.String(20), nullable=False),
        sa.Column('timestamp', sa.Float),
    )
    op.create_index('ix_udhaar_entries_ledger_id', 'udhaar_entries', ['ledger_id'])

    # ── Returns ──
    op.create_table(
        'returns',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('return_id', sa.String(20), unique=True, nullable=False),
        sa.Column('order_id', sa.String(30), nullable=False),
        sa.Column('customer_id', sa.String(36), sa.ForeignKey('customers.id')),
        sa.Column('customer_name', sa.String(255), nullable=False),
        sa.Column('refund_amount', sa.Float, server_default='0'),
        sa.Column('refund_method', sa.String(30), server_default='Cash'),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
        sa.Column('timestamp', sa.Float),
        sa.Column('processed_at', sa.Float),
    )
    op.create_index('ix_returns_return_id', 'returns', ['return_id'])

    # ── Return Items ──
    op.create_table(
        'return_items',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('return_id', sa.String(36), sa.ForeignKey('returns.id')),
        sa.Column('sku', sa.String(30), nullable=False),
        sa.Column('product_name', sa.String(255), nullable=False),
        sa.Column('qty', sa.Integer, server_default='1'),
        sa.Column('unit_price', sa.Float, server_default='0'),
        sa.Column('reason', sa.String(255), server_default=''),
        sa.Column('action', sa.String(30), server_default='refund'),
    )
    op.create_index('ix_return_items_return_id', 'return_items', ['return_id'])

    # ── Delivery Requests ──
    op.create_table(
        'delivery_requests',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('request_id', sa.String(20), unique=True, nullable=False),
        sa.Column('customer_id', sa.String(36), sa.ForeignKey('customers.id')),
        sa.Column('customer_name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(20), nullable=False),
        sa.Column('address', sa.Text, nullable=False),
        sa.Column('total_amount', sa.Float, server_default='0'),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('delivery_slot', sa.String(50)),
        sa.Column('notes', sa.Text),
        sa.Column('assigned_to', sa.String(36)),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
        sa.Column('requested_at', sa.Float),
        sa.Column('dispatched_at', sa.Float),
        sa.Column('delivered_at', sa.Float),
    )
    op.create_index('ix_delivery_requests_request_id', 'delivery_requests', ['request_id'])

    # ── Delivery Items ──
    op.create_table(
        'delivery_items',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('delivery_id', sa.String(36), sa.ForeignKey('delivery_requests.id')),
        sa.Column('sku', sa.String(30), nullable=False),
        sa.Column('product_name', sa.String(255), nullable=False),
        sa.Column('qty', sa.Integer, server_default='1'),
        sa.Column('unit_price', sa.Float, server_default='0'),
    )
    op.create_index('ix_delivery_items_delivery_id', 'delivery_items', ['delivery_id'])

    # ── Staff Members ──
    op.create_table(
        'staff_members',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('staff_code', sa.String(20), unique=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(20)),
        sa.Column('role', sa.String(50), server_default='cashier'),
        sa.Column('hourly_rate', sa.Float, server_default='0'),
        sa.Column('is_active', sa.Boolean, server_default=sa.text('1')),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
        sa.Column('joined_at', sa.Float),
    )
    op.create_index('ix_staff_members_staff_code', 'staff_members', ['staff_code'])

    # ── Staff Shifts ──
    op.create_table(
        'staff_shifts_v2',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('staff_id', sa.String(36), sa.ForeignKey('staff_members.id')),
        sa.Column('shift_date', sa.String(20), nullable=False),
        sa.Column('start_hour', sa.Integer, nullable=False),
        sa.Column('end_hour', sa.Integer, nullable=False),
        sa.Column('status', sa.String(20), server_default='scheduled'),
    )
    op.create_index('ix_staff_shifts_staff_id', 'staff_shifts_v2', ['staff_id'])
    op.create_index('ix_staff_shifts_date', 'staff_shifts_v2', ['shift_date'])

    # ── Attendance Records ──
    op.create_table(
        'attendance_records',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('staff_id', sa.String(36), sa.ForeignKey('staff_members.id')),
        sa.Column('date', sa.String(20), nullable=False),
        sa.Column('clock_in', sa.Float),
        sa.Column('clock_out', sa.Float),
        sa.Column('status', sa.String(20), server_default='present'),
        sa.Column('hours_worked', sa.Float, server_default='0'),
        sa.UniqueConstraint('staff_id', 'date', name='uq_attendance_staff_date'),
    )
    op.create_index('ix_attendance_records_staff_id', 'attendance_records', ['staff_id'])

    # ── Shelf Zones ──
    op.create_table(
        'shelf_zones',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('zone_id', sa.String(10), unique=True, nullable=False),
        sa.Column('zone_name', sa.String(100), nullable=False),
        sa.Column('zone_type', sa.String(30), nullable=False),
        sa.Column('total_slots', sa.Integer, server_default='10'),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
    )
    op.create_index('ix_shelf_zones_zone_id', 'shelf_zones', ['zone_id'])

    # ── Shelf Products ──
    op.create_table(
        'shelf_products',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('zone_id', sa.String(36), sa.ForeignKey('shelf_zones.id')),
        sa.Column('sku', sa.String(30), nullable=False),
        sa.Column('product_name', sa.String(255), nullable=False),
        sa.Column('shelf_level', sa.String(20), server_default='lower'),
        sa.Column('placed_date', sa.String(20)),
        sa.Column('days_here', sa.Integer, server_default='0'),
    )
    op.create_index('ix_shelf_products_zone_id', 'shelf_products', ['zone_id'])

    # ── Notifications ──
    op.create_table(
        'notifications',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id')),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
        sa.Column('channel', sa.String(20), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('body', sa.Text, nullable=False),
        sa.Column('category', sa.String(50), server_default='general'),
        sa.Column('priority', sa.String(10), server_default='normal'),
        sa.Column('is_read', sa.Boolean, server_default=sa.text('0')),
        sa.Column('sent_at', sa.Float),
        sa.Column('read_at', sa.Float),
        sa.Column('metadata_json', sa.Text),
    )
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('ix_notifications_user_read', 'notifications', ['user_id', 'is_read'])

    # ── Promotions ──
    op.create_table(
        'promotions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('promo_code', sa.String(30), unique=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text),
        sa.Column('promo_type', sa.String(30), nullable=False),
        sa.Column('discount_value', sa.Float, server_default='0'),
        sa.Column('min_order_amount', sa.Float, server_default='0'),
        sa.Column('applicable_skus_json', sa.Text),
        sa.Column('applicable_categories_json', sa.Text),
        sa.Column('max_uses', sa.Integer, server_default='0'),
        sa.Column('current_uses', sa.Integer, server_default='0'),
        sa.Column('starts_at', sa.Float, nullable=False),
        sa.Column('ends_at', sa.Float, nullable=False),
        sa.Column('is_active', sa.Boolean, server_default=sa.text('1')),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
        sa.Column('created_at', sa.Float),
    )
    op.create_index('ix_promotions_promo_code', 'promotions', ['promo_code'])

    # ── Loyalty Accounts ──
    op.create_table(
        'loyalty_accounts',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('customer_id', sa.String(36), sa.ForeignKey('customers.id'), unique=True),
        sa.Column('points_balance', sa.Integer, server_default='0'),
        sa.Column('lifetime_points', sa.Integer, server_default='0'),
        sa.Column('tier', sa.String(20), server_default='bronze'),
        sa.Column('created_at', sa.Float),
    )
    op.create_index('ix_loyalty_accounts_customer_id', 'loyalty_accounts', ['customer_id'])

    # ── Loyalty Transactions ──
    op.create_table(
        'loyalty_transactions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('account_id', sa.String(36), sa.ForeignKey('loyalty_accounts.id')),
        sa.Column('order_id', sa.String(30)),
        sa.Column('points', sa.Integer, nullable=False),
        sa.Column('description', sa.String(255), nullable=False),
        sa.Column('timestamp', sa.Float),
    )
    op.create_index('ix_loyalty_transactions_account_id', 'loyalty_transactions', ['account_id'])

    # ── Purchase Orders ──
    op.create_table(
        'purchase_orders',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('po_number', sa.String(30), unique=True, nullable=False),
        sa.Column('supplier_id', sa.String(36), sa.ForeignKey('suppliers.id')),
        sa.Column('status', sa.String(20), server_default='draft'),
        sa.Column('total_amount', sa.Float, server_default='0'),
        sa.Column('payment_status', sa.String(20), server_default='unpaid'),
        sa.Column('expected_delivery', sa.String(20)),
        sa.Column('actual_delivery', sa.String(20)),
        sa.Column('notes', sa.Text),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
        sa.Column('created_at', sa.Float),
    )
    op.create_index('ix_purchase_orders_po_number', 'purchase_orders', ['po_number'])
    op.create_index('ix_purchase_orders_supplier_id', 'purchase_orders', ['supplier_id'])

    # ── Purchase Order Items ──
    op.create_table(
        'purchase_order_items',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('po_id', sa.String(36), sa.ForeignKey('purchase_orders.id')),
        sa.Column('sku', sa.String(30), nullable=False),
        sa.Column('product_name', sa.String(255), nullable=False),
        sa.Column('qty', sa.Integer, server_default='1'),
        sa.Column('unit_price', sa.Float, server_default='0'),
        sa.Column('total', sa.Float, server_default='0'),
        sa.Column('received_qty', sa.Integer, server_default='0'),
    )
    op.create_index('ix_purchase_order_items_po_id', 'purchase_order_items', ['po_id'])

    # ── Audit Logs ──
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('timestamp', sa.Float, nullable=False),
        sa.Column('skill', sa.String(50), nullable=False),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('decision', sa.Text, nullable=False),
        sa.Column('reasoning', sa.Text, nullable=False),
        sa.Column('outcome', sa.Text, nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('metadata_json', sa.Text),
        sa.Column('store_id', sa.String(36), sa.ForeignKey('stores.id')),
    )
    op.create_index('ix_audit_logs_timestamp', 'audit_logs', ['timestamp'])
    op.create_index('ix_audit_logs_skill', 'audit_logs', ['skill'])
    op.create_index('ix_audit_logs_event_type', 'audit_logs', ['event_type'])


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('purchase_order_items')
    op.drop_table('purchase_orders')
    op.drop_table('loyalty_transactions')
    op.drop_table('loyalty_accounts')
    op.drop_table('promotions')
    op.drop_table('notifications')
    op.drop_table('shelf_products')
    op.drop_table('shelf_zones')
    op.drop_table('attendance_records')
    op.drop_table('staff_shifts_v2')
    op.drop_table('staff_members')
    op.drop_table('delivery_items')
    op.drop_table('delivery_requests')
    op.drop_table('return_items')
    op.drop_table('returns')
    op.drop_table('udhaar_entries')
    op.drop_table('udhaar_ledgers')
    op.drop_table('order_items')
    op.drop_table('orders')
    op.drop_table('suppliers')
    op.drop_table('purchase_history')
    op.drop_table('customers')
    op.drop_table('products')
    op.drop_table('users')
    op.drop_table('stores')
