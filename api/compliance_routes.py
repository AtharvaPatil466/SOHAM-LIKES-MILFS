"""DPDP Act / GDPR compliance API endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth.dependencies import require_role
from auth.dpdp_compliance import dpdp_manager
from db.models import User

router = APIRouter(prefix="/api/compliance", tags=["security"])


class ConsentRecord(BaseModel):
    customer_id: str
    purpose: str
    consented: bool
    channel: str = "in_app"


class ErasureRequest(BaseModel):
    customer_id: str
    reason: str = ""


class BreachReport(BaseModel):
    description: str
    affected_records: int
    data_types: list[str]
    severity: str = "medium"


@router.get("/purposes")
async def list_purposes():
    """List all data processing purposes and their legal basis."""
    return {"purposes": dpdp_manager.get_purpose_registry()}


@router.get("/retention-policies")
async def retention_policies():
    """List data retention periods for each category."""
    return {"policies": dpdp_manager.get_retention_policies()}


@router.post("/consent")
async def record_consent(
    body: ConsentRecord,
    user: User = Depends(require_role("cashier")),
):
    """Record customer consent for a data processing purpose."""
    return dpdp_manager.record_consent(
        customer_id=body.customer_id,
        purpose=body.purpose,
        consented=body.consented,
        channel=body.channel,
    )


@router.get("/consent/{customer_id}")
async def get_consent(
    customer_id: str,
    user: User = Depends(require_role("staff")),
):
    """Get consent history for a customer."""
    return {"customer_id": customer_id, "consent_records": dpdp_manager.get_consent_history(customer_id)}


@router.get("/consent/{customer_id}/check/{purpose}")
async def check_consent(
    customer_id: str,
    purpose: str,
):
    """Check if customer has consented to a specific purpose."""
    return {"customer_id": customer_id, "purpose": purpose, "consented": dpdp_manager.check_consent(customer_id, purpose)}


@router.post("/data-export")
async def request_data_export(
    customer_id: str,
    user: User = Depends(require_role("manager")),
):
    """Generate a DPDP-compliant data export (Right to Access)."""
    customer_data = {
        "personal_info": {"customer_id": customer_id, "note": "Full data would be fetched from DB"},
        "consent_records": dpdp_manager.get_consent_history(customer_id),
    }
    return dpdp_manager.generate_data_export(customer_data)


@router.post("/erasure")
async def request_erasure(
    body: ErasureRequest,
    user: User = Depends(require_role("owner")),
):
    """Submit a Right to Erasure request (Right to be Forgotten)."""
    return dpdp_manager.request_data_erasure(body.customer_id, body.reason)


@router.get("/erasure-requests")
async def list_erasure_requests(
    status: str = "",
    user: User = Depends(require_role("owner")),
):
    """List pending data erasure requests."""
    return {"requests": dpdp_manager.get_data_requests(status)}


@router.post("/breach")
async def report_breach(
    body: BreachReport,
    user: User = Depends(require_role("owner")),
):
    """Report a data breach (72-hour notification requirement)."""
    return dpdp_manager.log_data_breach(
        description=body.description,
        affected_records=body.affected_records,
        data_types=body.data_types,
        severity=body.severity,
    )


@router.get("/breaches")
async def list_breaches(user: User = Depends(require_role("owner"))):
    """List all data breach incidents."""
    return {"breaches": dpdp_manager.get_breach_log()}
