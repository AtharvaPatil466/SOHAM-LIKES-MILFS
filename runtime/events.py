"""Event type constants for the RetailOS runtime.

Centralizes all event type strings to prevent typos and enable
autocomplete. Import from here instead of using magic strings.
"""


# ── Inventory events ──
LOW_STOCK = "low_stock"
STOCK_UPDATE = "stock_update"
INVENTORY_CHECK = "inventory_check"
EXPIRY_RISK = "expiry_risk"

# ── Procurement events ──
START_PROCUREMENT = "start_procurement"
PROCUREMENT_APPROVED = "procurement_approved"
SEASONAL_PREEMPT = "seasonal_preempt"

# ── Negotiation events ──
SUPPLIER_REPLY = "supplier_reply"
DEAL_CONFIRMED = "deal_confirmed"
CLARIFICATION = "clarification"

# ── Customer events ──
CHURN_RISK = "churn_risk"

# ── Shelf events ──
SHELF_OPTIMIZATION = "shelf_optimization"
SHELF_PLACEMENT_APPROVED = "shelf_placement_approved"

# ── Scheduling events ──
SHIFT_REVIEW = "shift_review"
SCHEDULE_APPROVED = "schedule_approved"

# ── Analytics events ──
DAILY_ANALYTICS = "daily_analytics"

# ── Lifecycle / intercepted events ──
DELIVERY = "delivery"
QUALITY_ISSUE = "quality_issue"

# ── Audit event types (internal) ──
RUNTIME_START = "runtime_start"
RUNTIME_STOP = "runtime_stop"
EVENT_LOOP_ERROR = "event_loop_error"
INVALID_EVENT = "invalid_event"
ROUTING_DECISION = "routing_decision"
GEMINI_API_ERROR = "gemini_api_error"
SKILL_NOT_FOUND = "skill_not_found"
SKILL_PAUSED_SKIP = "skill_paused_skip"
SKILL_EXECUTED = "skill_executed"
SKILL_ERROR = "skill_error"
SKILL_ESCALATION = "skill_escalation"
AUTO_APPROVED = "auto_approved"
APPROVAL_REQUESTED = "approval_requested"
OWNER_APPROVED = "owner_approved"
OWNER_REJECTED = "owner_rejected"
