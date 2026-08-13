# ============================================================================
# VIRA — FastAPI Backend
# Replaces server.js (Node.js/Express) with Python FastAPI.
# Serves static frontend (HTML/CSS/JS) and proxies Rime TTS + Qdrant search.
# ============================================================================

import os
import logging
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import (
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
    Response,
)
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from qdrant_service import (
    initialize_collection,
    search_safety_protocols,
    generate_simple_vector,
    COLLECTION_NAME,
)

# ---------------------------------------------------------------------------
# Load environment variables
# ---------------------------------------------------------------------------
load_dotenv()

PORT = int(os.getenv("PORT", "3000"))
RIME_API_KEY    = os.getenv("RIME_API_KEY", "")
RIME_SPEAKER    = os.getenv("RIME_SPEAKER", "eva")
RIME_MODEL      = os.getenv("RIME_MODEL", "mist")
GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY", "")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-18s  %(levelname)-7s  %(message)s",
)
logger = logging.getLogger("vira")


# ---------------------------------------------------------------------------
# Lifespan — runs on startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──
    print()
    print("===========================================")
    print("  [VIRA] VIRA Server Running (FastAPI)")
    print("===========================================")
    print(f"  URL:     http://localhost:{PORT}")
    print(f"  Open:    http://localhost:{PORT}/safesakhi.html")
    rime_ok    = RIME_API_KEY and RIME_API_KEY != "YOUR_RIME_API_KEY"
    gemini_ok  = bool(GEMINI_API_KEY)
    print(f"  Rime:    {'[OK] API key configured' if rime_ok else '[Error] Set RIME_API_KEY in .env'}")
    print(f"  Qdrant:  Local DB at {os.getenv('QDRANT_PATH', 'local_qdrant_db')}")
    print(f"  Gemini:  {'[OK] RAG refinement active' if gemini_ok else '[Warn] Set GEMINI_API_KEY in .env (optional)'}")
    print(f"  Speaker: {RIME_SPEAKER}")
    print(f"  Model:   {RIME_MODEL}")
    print("===========================================")
    print()

    # Initialize Qdrant collection
    await initialize_collection()

    yield  # ── App is running ──

    # ── Shutdown ──
    logger.info("VIRA server shutting down.")


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="VIRA — Voice-Activated Safety Assistant",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — allow browser requests during local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Gemini RAG Refinement Helper
# ============================================================================

GEMINI_REFINE_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    "models/gemini-3.5-flash:generateContent"
)


async def gemini_refine(transcript: str, qdrant_text: str) -> str | None:
    """
    Send the Qdrant-retrieved protocol text + the user's transcript to Gemini.
    Gemini assesses urgency and rewrites the text into a short, natural
    spoken response (1-2 sentences, TTS-ready).

    Returns the refined string, or None if Gemini is unavailable / fails.
    """
    if not GEMINI_API_KEY:
        return None

    prompt = f"""You are VIRA, a highly advanced personal safety assistant embedded in a wearable device. This is a critical security system dedicated to women's safety. The situations you handle are serious, high-stakes, and potentially life-threatening.

Your knowledge base (acting as a RAG system) has retrieved the following mandatory safety protocol based on the user's situation:

--- QDRANT RETRIEVED CONTEXT ---
{qdrant_text}
--- END CONTEXT ---

The user just reported: "{transcript}"

Your task:
1. Assess the URGENCY of the situation:
   - CRITICAL: immediate physical danger, medical emergency, violence, assault
   - HIGH: being actively followed, escalating threat, panic
   - MEDIUM: suspicious behaviour, mild distress, uncertainty
   - LOW: general safety question, calm inquiry

2. Generate a comprehensive, spoken response that:
   - Takes the situation extremely seriously and prioritizes the user's immediate safety.
   - Strictly uses the instructions from the QDRANT RETRIEVED CONTEXT to guide the user.
   - Provides clear, step-by-step actionable instructions so the user knows exactly what to do.
   - Is detailed enough to be genuinely helpful, but remains easy to understand when spoken aloud via text-to-speech.
   - Matches the urgency tone: CRITICAL/HIGH = direct, firm, and fast; MEDIUM/LOW = reassuring and calm.
   - Never says "I am an AI" or references the "database" or "Qdrant".
   - Speaks as VIRA — confident, vigilant, and fiercely protective.
   - Sounds natural when read aloud (avoid complex formatting or bullet points).

Respond with ONLY the spoken response text. No labels, no markdown, no explanations."""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 4096,
            "topP": 0.9,
        },
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT",        "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH",       "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{GEMINI_REFINE_URL}?key={GEMINI_API_KEY}",
                json=payload,
                headers={"Content-Type": "application/json"},
            )

        if resp.status_code != 200:
            logger.warning("[Gemini] API error %d: %s", resp.status_code, resp.text[:200])
            return None

        data = resp.json()
        refined = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
            .strip()
        )
        if not refined:
            logger.warning("[Gemini] Empty response body.")
            return None

        logger.info("[Gemini] Refined: %r", refined[:120])
        return refined

    except Exception as exc:
        logger.warning("[Gemini] Request failed: %s", exc)
        return None



class TTSRequest(BaseModel):
    text: str
    speaker: Optional[str] = None
    modelId: Optional[str] = None


class AssistRequest(BaseModel):
    transcript: str
    location: Optional[dict] = None


# ============================================================================
# ROUTES
# ============================================================================

# ── Root redirect ──────────────────────────────────────────────────────────
@app.get("/", response_class=RedirectResponse)
async def root():
    return RedirectResponse(url="/safesakhi.html")


# ── Qdrant Health Check ────────────────────────────────────────────────────
@app.get("/api/qdrant/status")
async def qdrant_status():
    return {
        "collection": COLLECTION_NAME,
        "qdrantPath": os.getenv("QDRANT_PATH", "local_qdrant_db"),
        "status": "initialized",
    }


# ── POST /api/tts — Rime TTS Proxy ────────────────────────────────────────
@app.post("/api/tts")
async def tts_proxy(body: TTSRequest):
    # Validate API key
    if not RIME_API_KEY or RIME_API_KEY == "YOUR_RIME_API_KEY":
        logger.error("RIME_API_KEY is not set in .env")
        return JSONResponse(
            status_code=500,
            content={"error": "Rime API key is not configured. Set RIME_API_KEY in .env file."},
        )

    text = body.text.strip()
    if not text:
        return JSONResponse(
            status_code=400,
            content={"error": "Text is required."},
        )

    speaker = body.speaker or RIME_SPEAKER
    model_id = body.modelId or RIME_MODEL

    rime_payload = {
        "text": text,
        "speaker": speaker,
        "modelId": model_id,
        "samplingRate": 22050,
        "speedAlpha": 1.0,
        "reduceLatency": True,
    }

    logger.info(
        "Rime TTS request: text=%r speaker=%s model=%s",
        text[:80], speaker, model_id,
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            rime_response = await client.post(
                "https://users.rime.ai/v1/rime-tts",
                headers={
                    "Authorization": f"Bearer {RIME_API_KEY}",
                    "Content-Type": "application/json",
                    "Accept": "audio/mp3",
                },
                json=rime_payload,
            )

        if rime_response.status_code != 200:
            error_msg = f"Rime API error: {rime_response.status_code} — {rime_response.text}"
            logger.error(error_msg)
            return JSONResponse(
                status_code=rime_response.status_code,
                content={"error": error_msg},
            )

        audio_bytes = rime_response.content

        if not audio_bytes:
            logger.error("Rime returned empty audio")
            return JSONResponse(
                status_code=502,
                content={"error": "Rime returned empty audio response."},
            )

        logger.info("Rime TTS success: %d KB", len(audio_bytes) // 1024)

        content_type = rime_response.headers.get("content-type", "audio/mp3")
        return Response(
            content=audio_bytes,
            media_type=content_type,
            headers={"Cache-Control": "no-cache"},
        )

    except httpx.TimeoutException:
        logger.error("Rime TTS request timed out")
        return JSONResponse(
            status_code=504,
            content={"error": "Rime TTS request timed out."},
        )
    except Exception as exc:
        logger.error("TTS proxy error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": f"Internal server error: {exc}"},
        )


# ── POST /api/v1/assist — Qdrant Search + Gemini Refinement ───────────────
@app.post("/api/v1/assist")
async def assist_pipeline(body: AssistRequest):
    transcript = body.transcript.strip()
    if not transcript:
        return JSONResponse(
            status_code=400,
            content={"error": "Voice transcript is required."},
        )

    logger.info('[Assist] Transcript: "%s"', transcript)

    # ── Step 1: Qdrant semantic search ────────────────────────────────────
    query_vector = generate_simple_vector(transcript, 1536)
    protocols    = await search_safety_protocols(query_vector, top_k=3)
    logger.info("[Assist] Qdrant returned %d protocol(s).", len(protocols))

    raw_text = (
        protocols[0]["text"]
        if protocols
        else "Stay calm. Move to a safe public space and share your live location."
    )

    # ── Step 2: Gemini refines the Qdrant text ────────────────────────────
    refined = await gemini_refine(transcript, raw_text)

    if refined:
        logger.info("[Assist] Using Gemini-refined response.")
        response_text = refined
    else:
        logger.info("[Assist] Gemini unavailable — using raw Qdrant text.")
        response_text = raw_text

    # ── Step 3: Return to frontend ────────────────────────────────────────
    return {
        "success": True,
        "transcript": transcript,
        "responseText": response_text,
        "protocols": protocols,
        "geminiUsed": refined is not None,
        "locationReceived": body.location is not None,
    }


# ============================================================================
# Static Files — MUST be mounted LAST (catch-all)
# ============================================================================
app.mount("/", StaticFiles(directory=".", html=True), name="static")


# ============================================================================
# Run with: uvicorn main:app --port 3000 --reload
# Or:       python main.py
# ============================================================================
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
