"""POS hardware API — receipt printing and barcode scanner config."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from auth.dependencies import require_role
from db.models import User
from integrations.pos_hardware import receipt_printer, barcode_scanner

router = APIRouter(prefix="/api/pos", tags=["pos-hardware"])


class PrintReceiptRequest(BaseModel):
    order: dict
    store: dict | None = None
    model_config = ConfigDict(json_schema_extra={"examples": [{
        "order": {
            "order_id": "ORD-2024-042",
            "customer_name": "Ramesh Patel",
            "items": [
                {"product_name": "Basmati Rice 5kg", "qty": 2, "unit_price": 275, "total": 550},
                {"product_name": "Toor Dal 1kg", "qty": 1, "unit_price": 160, "total": 160},
            ],
            "total_amount": 710,
            "gst_amount": 35.5,
            "payment_method": "UPI",
            "timestamp": 1712500000,
        },
        "store": {"store_name": "Sharma General Store", "phone": "+919876543210", "gstin": "27AABCU9603R1ZM"},
    }]})


@router.get("/printer/status")
async def printer_status():
    """Get receipt printer connection status."""
    return receipt_printer.get_status()


@router.post("/printer/print")
async def print_receipt(
    body: PrintReceiptRequest,
    user: User = Depends(require_role("cashier")),
):
    """Generate and print a receipt for an order."""
    receipt_bytes = receipt_printer.generate_receipt(body.order, body.store)
    result = receipt_printer.print_receipt(receipt_bytes)
    return result


@router.post("/printer/preview")
async def preview_receipt(body: PrintReceiptRequest):
    """Generate receipt text preview without printing."""
    receipt_bytes = receipt_printer.generate_receipt(body.order, body.store)
    # Strip ESC/POS control codes for text preview
    text = receipt_bytes.decode("utf-8", errors="replace")
    # Remove non-printable characters
    cleaned = "".join(c for c in text if c.isprintable() or c in "\n\r")
    return {"preview": cleaned, "size_bytes": len(receipt_bytes)}


@router.get("/printer/log")
async def print_log(limit: int = 20):
    """Get recent print history (demo mode)."""
    return {"log": receipt_printer.get_print_log(limit)}


@router.get("/scanner/config")
async def scanner_config():
    """Get barcode scanner configuration for the frontend."""
    return barcode_scanner.get_scanner_config()


@router.get("/scanner/validate/{barcode}")
async def validate_barcode(barcode: str):
    """Validate a barcode and detect its format."""
    fmt = barcode_scanner.detect_format(barcode)
    valid = True
    if fmt == "EAN-13":
        valid = barcode_scanner.validate_ean13(barcode)

    return {
        "barcode": barcode,
        "format": fmt,
        "valid": valid,
    }
