"""POS hardware integration — barcode scanners and receipt printers.

Supports:
- USB/HID barcode scanners (keyboard wedge mode — no driver needed)
- ESC/POS thermal receipt printers (Epson, Star, generic 58mm/80mm)
- Network printers via TCP socket
- Demo mode for development without hardware

The barcode scanner in keyboard-wedge mode types characters into
any focused input field, so the frontend just needs an <input> that
auto-submits on Enter. This module handles the receipt printer side.
"""

import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)


class ReceiptPrinter:
    """ESC/POS receipt printer driver.

    Generates ESC/POS byte sequences for thermal printers.
    Supports USB (via file handle), network (TCP), and demo mode.
    """

    # ESC/POS commands
    ESC = b'\x1b'
    GS = b'\x1d'
    INIT = b'\x1b\x40'           # Initialize printer
    CUT = b'\x1d\x56\x00'       # Full cut
    PARTIAL_CUT = b'\x1d\x56\x01'
    BOLD_ON = b'\x1b\x45\x01'
    BOLD_OFF = b'\x1b\x45\x00'
    CENTER = b'\x1b\x61\x01'
    LEFT = b'\x1b\x61\x00'
    RIGHT = b'\x1b\x61\x02'
    DOUBLE_HEIGHT = b'\x1b\x21\x10'
    NORMAL_SIZE = b'\x1b\x21\x00'
    FEED = b'\x1b\x64\x03'      # Feed 3 lines
    SEPARATOR = b'-' * 32 + b'\n'

    def __init__(self):
        self.printer_type = os.environ.get("PRINTER_TYPE", "demo")  # usb | network | demo
        self.printer_path = os.environ.get("PRINTER_PATH", "/dev/usb/lp0")
        self.printer_host = os.environ.get("PRINTER_HOST", "192.168.1.100")
        self.printer_port = int(os.environ.get("PRINTER_PORT", "9100"))
        self.paper_width = int(os.environ.get("PRINTER_WIDTH", "32"))  # chars per line (32 for 58mm, 48 for 80mm)
        self._demo_log: list[dict] = []

    @property
    def is_configured(self) -> bool:
        return self.printer_type != "demo"

    def get_status(self) -> dict[str, Any]:
        return {
            "printer_type": self.printer_type,
            "configured": self.is_configured,
            "paper_width": self.paper_width,
            "connection": self.printer_path if self.printer_type == "usb" else f"{self.printer_host}:{self.printer_port}",
            "demo_receipts_printed": len(self._demo_log),
        }

    def generate_receipt(self, order: dict[str, Any], store: dict[str, Any] | None = None) -> bytes:
        """Generate ESC/POS receipt bytes for an order."""
        buf = bytearray()
        buf.extend(self.INIT)

        # Store header
        buf.extend(self.CENTER)
        buf.extend(self.DOUBLE_HEIGHT)
        store_name = (store or {}).get("store_name", "RetailOS Store")
        buf.extend(f"{store_name}\n".encode())
        buf.extend(self.NORMAL_SIZE)

        store_phone = (store or {}).get("phone", "")
        if store_phone:
            buf.extend(f"Ph: {store_phone}\n".encode())

        gstin = (store or {}).get("gstin", "")
        if gstin:
            buf.extend(f"GSTIN: {gstin}\n".encode())

        buf.extend(self.SEPARATOR)
        buf.extend(self.LEFT)

        # Order info
        order_id = order.get("order_id", "N/A")
        timestamp = order.get("timestamp", time.time())
        date_str = time.strftime("%d-%m-%Y %H:%M", time.localtime(timestamp))
        buf.extend(f"Bill: {order_id}\n".encode())
        buf.extend(f"Date: {date_str}\n".encode())

        customer = order.get("customer_name", "")
        if customer:
            buf.extend(f"Customer: {customer}\n".encode())

        buf.extend(self.SEPARATOR)

        # Column header
        w = self.paper_width
        buf.extend(self.BOLD_ON)
        buf.extend(f"{'Item':<{w-14}}{'Qty':>4}{'Amt':>10}\n".encode())
        buf.extend(self.BOLD_OFF)
        buf.extend(self.SEPARATOR)

        # Items
        for item in order.get("items", []):
            name = item.get("product_name", item.get("sku", "?"))[:w-14]
            qty = item.get("qty", 1)
            total = item.get("total", item.get("unit_price", 0) * qty)
            buf.extend(f"{name:<{w-14}}{qty:>4}{total:>10.2f}\n".encode())

        buf.extend(self.SEPARATOR)

        # Totals
        buf.extend(self.BOLD_ON)
        subtotal = order.get("total_amount", 0)
        gst = order.get("gst_amount", 0)
        discount = order.get("discount_amount", 0)

        if discount > 0:
            buf.extend(f"{'Discount:':<{w-10}}{-discount:>10.2f}\n".encode())
        if gst > 0:
            buf.extend(f"{'GST:':<{w-10}}{gst:>10.2f}\n".encode())

        buf.extend(self.DOUBLE_HEIGHT)
        buf.extend(f"{'TOTAL:':<{w-10}}{subtotal:>10.2f}\n".encode())
        buf.extend(self.NORMAL_SIZE)
        buf.extend(self.BOLD_OFF)

        # Payment method
        payment = order.get("payment_method", "Cash")
        buf.extend(f"\nPaid by: {payment}\n".encode())

        buf.extend(self.SEPARATOR)

        # Footer
        buf.extend(self.CENTER)
        buf.extend(b"Thank you! Visit again.\n")
        buf.extend(b"Powered by RetailOS\n")

        # Feed and cut
        buf.extend(self.FEED)
        buf.extend(self.CUT)

        return bytes(buf)

    def print_receipt(self, receipt_bytes: bytes) -> dict[str, Any]:
        """Send receipt bytes to the printer."""
        if self.printer_type == "demo":
            self._demo_log.append({
                "timestamp": time.time(),
                "size_bytes": len(receipt_bytes),
                "preview": receipt_bytes.decode("utf-8", errors="replace")[:500],
            })
            return {
                "status": "demo",
                "message": "Receipt generated (demo mode — no printer connected)",
                "size_bytes": len(receipt_bytes),
            }

        try:
            if self.printer_type == "usb":
                with open(self.printer_path, "wb") as f:
                    f.write(receipt_bytes)
            elif self.printer_type == "network":
                import socket
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(5)
                    s.connect((self.printer_host, self.printer_port))
                    s.sendall(receipt_bytes)

            return {"status": "printed", "size_bytes": len(receipt_bytes)}

        except Exception as e:
            logger.error("Print failed: %s", e)
            # Fall back to demo log
            self._demo_log.append({
                "timestamp": time.time(),
                "size_bytes": len(receipt_bytes),
                "error": str(e),
            })
            return {"status": "error", "error": str(e)}

    def get_print_log(self, limit: int = 20) -> list[dict]:
        return self._demo_log[-limit:]


class BarcodeScanner:
    """Barcode scanner configuration and utilities.

    Most USB barcode scanners operate in keyboard-wedge mode —
    they type the barcode into whatever input field is focused.
    This class handles barcode validation and lookup configuration.
    """

    # Common barcode formats used in Indian retail
    FORMATS = {
        "EAN-13": {"length": 13, "prefix": "890"},  # Indian products start with 890
        "EAN-8": {"length": 8},
        "UPC-A": {"length": 12},
        "CODE-128": {"min_length": 1, "max_length": 48},
    }

    @staticmethod
    def validate_ean13(barcode: str) -> bool:
        """Validate EAN-13 check digit."""
        if len(barcode) != 13 or not barcode.isdigit():
            return False
        total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(barcode[:12]))
        check = (10 - (total % 10)) % 10
        return int(barcode[12]) == check

    @staticmethod
    def detect_format(barcode: str) -> str:
        """Detect barcode format from the scanned string."""
        if not barcode.isdigit():
            return "CODE-128"
        if len(barcode) == 13:
            return "EAN-13"
        if len(barcode) == 8:
            return "EAN-8"
        if len(barcode) == 12:
            return "UPC-A"
        return "CODE-128"

    @staticmethod
    def get_scanner_config() -> dict[str, Any]:
        """Return scanner configuration for the frontend."""
        return {
            "mode": "keyboard_wedge",
            "instructions": (
                "USB barcode scanners work automatically in keyboard-wedge mode. "
                "Focus the search/barcode input field, then scan. "
                "The barcode will be typed into the field and auto-submitted."
            ),
            "supported_formats": list(BarcodeScanner.FORMATS.keys()),
            "auto_submit_on": "Enter",
            "input_selector": "#barcode-input",
        }


# Singletons
receipt_printer = ReceiptPrinter()
barcode_scanner = BarcodeScanner()
