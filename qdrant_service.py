# ============================================================================
# VIRA — Qdrant Vector Database Service (Python)
# Handles connection, collection initialization, protocol seeding & search.
# ============================================================================

import os
import math
import logging
from typing import List, Dict, Any, Optional

from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models
from qdrant_client.http.exceptions import UnexpectedResponse

logger = logging.getLogger("vira.qdrant")

QDRANT_PATH = os.getenv("QDRANT_PATH", "local_qdrant_db")

COLLECTION_NAME = "emergency_protocols"
VECTOR_SIZE = 1536  # Dimensions for OpenAI text-embedding-3-small


def _create_client() -> QdrantClient:
    """Create a Qdrant client instance."""
    return QdrantClient(
        path=QDRANT_PATH,
    )


# ---------------------------------------------------------------------------
# Default Safety Protocols Seed Data
# ---------------------------------------------------------------------------

DEFAULT_PROTOCOLS: List[Dict[str, Any]] = [
    {
        "id": 1,
        "category": "stalking_following",
        "title": "Suspicious Follower / Stalking Protocol",
        "text": (
            "If someone is following you: head towards a bright, crowded place "
            "such as a cafe, store, or gas station. Do not head directly home. "
            "Keep your phone in hand, stay alert, call your emergency contact "
            "or Safe Sakhi line, and speak loudly."
        ),
    },
    {
        "id": 2,
        "category": "medical_emergency",
        "title": "Medical Assistance Protocol",
        "text": (
            "In case of sudden injury, collapse, or severe chest pain: sit down "
            "immediately in a safe spot, notify bystanders, share live GPS "
            "coordinates with emergency contacts, and call local ambulance/"
            "emergency services (108 / 112)."
        ),
    },
    {
        "id": 3,
        "category": "domestic_panic",
        "title": "Immediate Panic / Threat Response",
        "text": (
            "When feeling unsafe in a private or public area: activate VIRA "
            "safety mode by saying the trigger word 'Baby' or 'Help'. Stay "
            "near an exit, keep a firm posture, and transmit live location "
            "coordinates immediately."
        ),
    },
    {
        "id": 4,
        "category": "bilingual_deescalation",
        "title": "Bilingual De-escalation & Assurance",
        "text": (
            "Aap surakshit hain. VIRA aapke saath hai. Stay in a lit area. "
            "Aapka live location aur alerts emergency contacts ko bhej diye "
            "gaye hain. Shanti banaye rakhein."
        ),
    },
    {
        "id": 5,
        "category": "fire_emergency",
        "title": "Fire Emergency Protocol",
        "text": (
            "If there is a fire or heavy smoke: evacuate the building immediately using the stairs, not the elevator. "
            "Stay low to avoid inhaling smoke. Call the fire brigade (101 or 112) as soon as you are safe."
        ),
    },
    {
        "id": 6,
        "category": "robbery_theft",
        "title": "Robbery or Mugging Protocol",
        "text": (
            "If you are being mugged or robbed: do not resist. Hand over your belongings and prioritize your physical safety. "
            "Observe the attacker's appearance if safely possible. Contact the police (100 or 112) immediately after they leave."
        ),
    },
    {
        "id": 7,
        "category": "harassment_public",
        "title": "Public Harassment Protocol",
        "text": (
            "If you are facing harassment in a public place or transport: loudly draw attention to the situation to alert bystanders. "
            "Move closer to authorities like a bus conductor or security guard, and call the Women's Helpline (1091)."
        ),
    },
]


# ---------------------------------------------------------------------------
# Vector Generation (deterministic hash-based — for offline / testing)
# ---------------------------------------------------------------------------

def generate_simple_vector(text: str, dimensions: int = VECTOR_SIZE) -> List[float]:
    """
    Generate a deterministic, normalized pseudo-embedding from text.
    Used as a fallback when no live embedding model (e.g. OpenAI) is available.
    """
    hash_val = 0
    for ch in text:
        hash_val = ((hash_val << 5) - hash_val + ord(ch)) & 0xFFFFFFFF
        # Keep within 32-bit integer range
        if hash_val >= 0x80000000:
            hash_val -= 0x100000000

    vector = [math.sin(hash_val + i) * 0.5 for i in range(dimensions)]

    # Normalize
    norm = math.sqrt(sum(v * v for v in vector))
    if norm > 0:
        vector = [v / norm for v in vector]

    return vector


# ---------------------------------------------------------------------------
# Collection Initialization
# ---------------------------------------------------------------------------

async def initialize_collection() -> None:
    """Create the emergency_protocols collection in Qdrant if it doesn't exist."""
    try:
        client = _create_client()
        collections = client.get_collections().collections
        exists = any(c.name == COLLECTION_NAME for c in collections)

        if not exists:
            logger.info("Creating collection '%s'...", COLLECTION_NAME)
            client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=qdrant_models.VectorParams(
                    size=VECTOR_SIZE,
                    distance=qdrant_models.Distance.COSINE,
                ),
            )
            logger.info("[OK] Collection '%s' created.", COLLECTION_NAME)

            # Seed default protocols
            await seed_default_protocols(client)
        else:
            logger.info("[OK] Collection '%s' ready.", COLLECTION_NAME)

        client.close()

    except Exception as exc:
        logger.warning(
            "[Warning] Could not connect to Qdrant at %s: %s", QDRANT_PATH, exc
        )
        logger.warning(
            "(Using local Qdrant folder at %s)", QDRANT_PATH
        )


# ---------------------------------------------------------------------------
# Seed Default Protocols
# ---------------------------------------------------------------------------

async def seed_default_protocols(client: Optional[QdrantClient] = None) -> None:
    """Insert the default safety protocol documents into Qdrant."""
    own_client = False
    try:
        if client is None:
            client = _create_client()
            own_client = True

        logger.info("Seeding %d default safety protocols...", len(DEFAULT_PROTOCOLS))

        points = []
        for proto in DEFAULT_PROTOCOLS:
            vector = generate_simple_vector(proto["text"], VECTOR_SIZE)
            points.append(
                qdrant_models.PointStruct(
                    id=proto["id"],
                    vector=vector,
                    payload={
                        "category": proto["category"],
                        "title": proto["title"],
                        "text": proto["text"],
                    },
                )
            )

        client.upsert(collection_name=COLLECTION_NAME, wait=True, points=points)
        logger.info("[OK] Default safety protocols seeded into vector store.")

    except Exception as exc:
        logger.error("Error seeding protocols: %s", exc)
    finally:
        if own_client and client:
            client.close()


# ---------------------------------------------------------------------------
# Semantic Search
# ---------------------------------------------------------------------------

async def search_safety_protocols(
    query_vector: List[float], top_k: int = 2
) -> List[Dict[str, Any]]:
    """
    Search Qdrant for semantically matching emergency protocols.
    Falls back to static default protocols if Qdrant is unreachable.
    """
    try:
        client = _create_client()
        results = client.search(
            collection_name=COLLECTION_NAME,
            query_vector=query_vector,
            limit=top_k,
            with_payload=True,
        )
        client.close()

        return [
            {
                "score": hit.score,
                "title": hit.payload.get("title", "Safety Protocol"),
                "text": hit.payload.get("text", ""),
                "category": hit.payload.get("category", "general"),
            }
            for hit in results
        ]

    except Exception as exc:
        logger.warning("Vector search fallback triggered: %s", exc)
        # Fallback: return the first default protocol
        proto = DEFAULT_PROTOCOLS[0]
        return [
            {
                "score": 1.0,
                "title": proto["title"],
                "text": proto["text"],
                "category": proto["category"],
            }
        ]
