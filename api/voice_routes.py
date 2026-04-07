"""Voice input API — speech-to-text and command parsing for stock operations."""

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel, ConfigDict

from brain.voice_input import voice_processor

router = APIRouter(prefix="/api/voice-input", tags=["voice"])


class VoiceParseRequest(BaseModel):
    text: str
    model_config = ConfigDict(json_schema_extra={"examples": [
        {"text": "update stock of rice to 50"},
        {"text": "चावल का स्टॉक बताओ"},
    ]})


@router.get("/status")
async def voice_status():
    """Get voice input service status and supported intents."""
    return voice_processor.get_status()


@router.post("/parse")
async def parse_voice_text(body: VoiceParseRequest):
    """Parse transcribed text into a structured command.

    Supports English and Hindi commands for stock updates,
    price checks, sale recording, and daily summaries.
    """
    result = voice_processor.parse_command(body.text)
    return result


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str = "hi-IN",
):
    """Transcribe audio file to text using Google Speech-to-Text.

    Accepts WAV/PCM audio. Falls back to demo info if STT not configured.
    """
    audio_bytes = await audio.read()
    transcription = await voice_processor.transcribe_audio(audio_bytes, language)

    # If transcription succeeded, also parse the command
    if transcription.get("text"):
        command = voice_processor.parse_command(transcription["text"])
        transcription["parsed_command"] = command

    return transcription


@router.post("/command")
async def voice_command_pipeline(body: VoiceParseRequest):
    """Full voice command pipeline: parse text and return actionable result.

    This is the main endpoint for the mobile app voice button.
    Takes text (from device STT) and returns the parsed intent + confirmation prompt.
    """
    parsed = voice_processor.parse_command(body.text)

    if parsed["intent"] == "unknown":
        return {
            "status": "unrecognized",
            "message": "Could not understand the command. Please try again.",
            **parsed,
        }

    return {
        "status": "parsed",
        "message": f"Ready to execute: {parsed['action_description']}",
        "requires_confirmation": parsed["intent"] in ("stock_update", "record_sale"),
        **parsed,
    }
