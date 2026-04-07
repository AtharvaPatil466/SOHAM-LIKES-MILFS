"""Voice-to-text input for stock updates and commands.

Supports:
- Google Cloud Speech-to-Text API (when configured)
- Demo mode with keyword-based intent parsing
- Hindi + English bilingual command recognition

Staff with limited literacy can update stock, check prices, or
log sales by speaking into their phone.
"""

import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

# Hindi-English command patterns
INTENT_PATTERNS = {
    "stock_update": [
        r"(?:update|add|set)\s+(?:stock|inventory)\s+(?:of\s+)?(.+?)\s+(?:to|by|=)\s+(\d+)",
        r"(.+?)\s+(?:ka|का)\s+(?:stock|स्टॉक)\s+(\d+)\s+(?:karo|करो|set|रखो)",
        r"(\d+)\s+(?:unit|units|piece|pieces)\s+(?:of\s+)?(.+?)\s+(?:add|added|jodo|जोड़ो)",
    ],
    "stock_check": [
        r"(?:check|show|kitna|कितना)\s+(?:stock|inventory|स्टॉक)\s+(?:of\s+|ka\s+|का\s+)?(.+)",
        r"(.+?)\s+(?:ka|का)\s+(?:stock|स्टॉक)\s+(?:batao|बताओ|dikhao|दिखाओ|check)",
        r"(?:how much|kitna|कितना)\s+(.+?)\s+(?:is|hai|है)\s+(?:left|available|bacha)",
    ],
    "price_check": [
        r"(?:price|rate|daam|दाम|kimat|कीमत)\s+(?:of\s+|ka\s+|का\s+)?(.+)",
        r"(.+?)\s+(?:ka|का)\s+(?:price|rate|daam|दाम|kimat|कीमत)\s*(?:kya hai|क्या है|batao|बताओ)?",
        r"(?:what is|kya hai)\s+(?:the\s+)?(?:price|rate)\s+(?:of\s+)?(.+)",
    ],
    "record_sale": [
        r"(?:sold|becha|बेचा|sale)\s+(\d+)\s+(?:unit|units|piece|pieces)?\s*(?:of\s+)?(.+)",
        r"(.+?)\s+(\d+)\s+(?:becha|बेचा|sold|sale)",
    ],
    "low_stock_check": [
        r"(?:show|dikhao|दिखाओ|list)\s+(?:low|kam|कम)\s+(?:stock|inventory|स्टॉक)",
        r"(?:kya|क्या)\s+(?:kam|कम)\s+(?:hai|है)\s*(?:stock|स्टॉक)?",
        r"(?:low stock|out of stock|stock alert|stock warning)",
    ],
    "daily_summary": [
        r"(?:aaj|आज|today)\s*(?:ka|का|ki|की)?\s*(?:summary|report|hisab|हिसाब)",
        r"(?:daily|dainik|दैनिक)\s+(?:summary|report|hisab|हिसाब)",
        r"(?:show|dikhao)\s+(?:today|aaj).*(?:summary|report|sales)",
    ],
}


class VoiceInputProcessor:
    """Process voice input (transcribed text) into actionable commands."""

    def __init__(self):
        self.google_api_key = os.environ.get("GOOGLE_SPEECH_API_KEY", "")
        self.is_configured = bool(self.google_api_key)

    def get_status(self) -> dict[str, Any]:
        return {
            "stt_provider": "google" if self.is_configured else "demo",
            "configured": self.is_configured,
            "supported_languages": ["en-IN", "hi-IN"],
            "supported_intents": list(INTENT_PATTERNS.keys()),
        }

    def parse_command(self, text: str) -> dict[str, Any]:
        """Parse transcribed text into a structured command.

        Returns:
            {
                "intent": "stock_update" | "stock_check" | "price_check" | ...,
                "entities": {"product": "...", "quantity": 10, ...},
                "confidence": 0.0-1.0,
                "original_text": "...",
            }
        """
        text_lower = text.lower().strip()

        for intent, patterns in INTENT_PATTERNS.items():
            for pattern in patterns:
                match = re.search(pattern, text_lower, re.IGNORECASE)
                if match:
                    entities = self._extract_entities(intent, match)
                    return {
                        "intent": intent,
                        "entities": entities,
                        "confidence": 0.85,
                        "original_text": text,
                        "action_description": self._describe_action(intent, entities),
                    }

        # Fallback: try to extract product names and numbers
        numbers = re.findall(r"\d+", text_lower)
        words = re.sub(r"[^\w\s]", "", text_lower).split()

        return {
            "intent": "unknown",
            "entities": {
                "raw_text": text,
                "detected_numbers": [int(n) for n in numbers],
                "words": words,
            },
            "confidence": 0.0,
            "original_text": text,
            "suggestions": [
                "Try: 'update stock of rice to 50'",
                "Try: 'चावल का स्टॉक बताओ'",
                "Try: 'sold 5 units of dal'",
            ],
        }

    def _extract_entities(self, intent: str, match: re.Match) -> dict[str, Any]:
        groups = match.groups()

        if intent == "stock_update":
            if len(groups) >= 2:
                # Check if first group is a number (quantity first pattern)
                if groups[0].isdigit():
                    return {"product": groups[1].strip(), "quantity": int(groups[0])}
                return {"product": groups[0].strip(), "quantity": int(groups[1])}

        elif intent == "stock_check":
            return {"product": groups[0].strip() if groups else ""}

        elif intent == "price_check":
            return {"product": groups[0].strip() if groups else ""}

        elif intent == "record_sale":
            if len(groups) >= 2:
                if groups[0].isdigit():
                    return {"quantity": int(groups[0]), "product": groups[1].strip()}
                return {"product": groups[0].strip(), "quantity": int(groups[1])}

        elif intent in ("low_stock_check", "daily_summary"):
            return {}

        return {"raw": groups}

    def _describe_action(self, intent: str, entities: dict) -> str:
        if intent == "stock_update":
            return f"Update stock of '{entities.get('product', '?')}' to {entities.get('quantity', '?')} units"
        elif intent == "stock_check":
            return f"Check current stock of '{entities.get('product', '?')}'"
        elif intent == "price_check":
            return f"Look up price of '{entities.get('product', '?')}'"
        elif intent == "record_sale":
            return f"Record sale of {entities.get('quantity', '?')} units of '{entities.get('product', '?')}'"
        elif intent == "low_stock_check":
            return "Show all products with low stock levels"
        elif intent == "daily_summary":
            return "Show today's sales summary"
        return "Unknown action"

    async def transcribe_audio(self, audio_bytes: bytes, language: str = "hi-IN") -> dict[str, Any]:
        """Transcribe audio to text using Google Speech-to-Text.

        Falls back to demo mode if not configured.
        """
        if not self.is_configured:
            return {
                "text": "",
                "language": language,
                "mode": "demo",
                "message": "STT not configured. Set GOOGLE_SPEECH_API_KEY. Use /api/voice/parse with text instead.",
            }

        try:
            import httpx
            import base64

            encoded = base64.b64encode(audio_bytes).decode("utf-8")
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"https://speech.googleapis.com/v1/speech:recognize?key={self.google_api_key}",
                    json={
                        "config": {
                            "encoding": "LINEAR16",
                            "sampleRateHertz": 16000,
                            "languageCode": language,
                            "alternativeLanguageCodes": ["en-IN"],
                        },
                        "audio": {"content": encoded},
                    },
                    timeout=10,
                )

            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                if results:
                    transcript = results[0]["alternatives"][0]["transcript"]
                    confidence = results[0]["alternatives"][0].get("confidence", 0)
                    return {
                        "text": transcript,
                        "confidence": confidence,
                        "language": language,
                        "mode": "live",
                    }

            return {"text": "", "language": language, "mode": "live", "error": "No speech detected"}
        except Exception as e:
            logger.error("STT transcription failed: %s", e)
            return {"text": "", "language": language, "mode": "live", "error": str(e)}


# Singleton
voice_processor = VoiceInputProcessor()
