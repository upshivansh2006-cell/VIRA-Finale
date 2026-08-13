// ============================================================================
// VIRA — Qdrant Vector Database Service
// Handles connection, collection initialization, protocol seeding & search.
// ============================================================================

const { QdrantClient } = require("@qdrant/js-client-rest");

const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;

const client = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
});

const COLLECTION_NAME = "emergency_protocols";
const VECTOR_SIZE = 1536; // Dimensions for OpenAI text-embedding-3-small

/**
 * Initialize Qdrant Collection for Emergency Safety Protocols
 */
async function initializeCollection() {
  try {
    const result = await client.getCollections();
    const exists = result.collections.some((c) => c.name === COLLECTION_NAME);

    if (!exists) {
      console.log(`[Qdrant] Creating collection '${COLLECTION_NAME}'...`);
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: VECTOR_SIZE,
          distance: "Cosine",
        },
      });
      console.log(`[Qdrant] ✅ Collection '${COLLECTION_NAME}' created successfully.`);
      
      // Seed default emergency protocols
      await seedDefaultProtocols();
    } else {
      console.log(`[Qdrant] ✅ Collection '${COLLECTION_NAME}' ready.`);
    }
  } catch (error) {
    console.warn(`[Qdrant] ⚠️ Warning: Could not connect or initialize Qdrant at ${QDRANT_URL}.`);
    console.warn(`[Qdrant] Error detail: ${error.message}`);
    console.warn(`[Qdrant] (Set valid QDRANT_URL / QDRANT_API_KEY in .env to use remote Qdrant Cloud or local Docker container)`);
  }
}

/**
 * Default Safety Protocols Seed Data
 */
const DEFAULT_PROTOCOLS = [
  {
    id: 1,
    category: "stalking_following",
    title: "Suspicious Follower / Stalking Protocol",
    text: "If someone is following you: head towards a bright, crowded place such as a cafe, store, or gas station. Do not head directly home. Keep your phone in hand, stay alert, call your emergency contact or Safe Sakhi line, and speak loudly.",
  },
  {
    id: 2,
    category: "medical_emergency",
    title: "Medical Assistance Protocol",
    text: "In case of sudden injury, collapse, or severe chest pain: sit down immediately in a safe spot, notify bystanders, share live GPS coordinates with emergency contacts, and call local ambulance/emergency services (108 / 112).",
  },
  {
    id: 3,
    category: "domestic_panic",
    title: "Immediate Panic / Threat Response",
    text: "When feeling unsafe in a private or public area: activate VIRA safety mode by saying the trigger word 'Baby' or 'Help'. Stay near an exit, keep a firm posture, and transmit live location coordinates immediately.",
  },
  {
    id: 4,
    category: "bilingual_deescalation",
    title: "Bilingual De-escalation & Assurance",
    text: "Aap surakshit hain. VIRA aapke saath hai. Stay in a lit area. Aapka live location aur alerts emergency contacts ko bhej diye gaye hain. Shanti banaye rakhein.",
  },
  {
    id: 5,
    category: "harassment_public_transport",
    title: "Harassment on Public Transport Protocol",
    text: "If facing harassment on a bus or train: Move closer to the driver or conductor immediately. Speak loudly to draw attention. Use your phone to record if safe, and trigger the VIRA SOS alert to share your live location.",
  },
  {
    id: 6,
    category: "lost_unfamiliar_area",
    title: "Lost in Unfamiliar or Dark Area",
    text: "If you are lost in an unfamiliar or poorly lit area: Do not look confused. Walk purposefully towards a well-lit, populated area. Pretend to be on a call if you are alone, and use the VIRA app to navigate to the nearest Safe Zone while sharing your live location.",
  },
  {
    id: 7,
    category: "cyber_bullying_threat",
    title: "Cyber Threat / Blackmail Response",
    text: "If you receive threats or blackmail online: Do not delete the messages. Take screenshots immediately. Do not engage or pay. Report the account, block the user, and contact the cyber crime helpline (1930) or local authorities.",
  },
  {
    id: 8,
    category: "domestic_violence",
    title: "Domestic Violence / Abuse Protocol",
    text: "If you are in immediate danger at home: Try to move to a room with an exit and no weapons (avoid kitchens). Call women's helpline (1091) or domestic abuse hotline. Trigger VIRA stealth mode to silently alert your trusted contacts.",
  },
  {
    id: 9,
    category: "cab_auto_unsafe",
    title: "Unsafe Cab or Auto Ride",
    text: "If your cab or auto is taking a wrong route or the driver is acting suspiciously: Share your ride details with a trusted contact immediately. Call someone and mention your location loudly. If necessary, demand to stop the vehicle at a crowded place and exit immediately. Trigger VIRA SOS.",
  }
];

/**
 * Seed default emergency protocols into Qdrant collection
 */
async function seedDefaultProtocols() {
  try {
    console.log(`[Qdrant] Seeding ${DEFAULT_PROTOCOLS.length} default safety protocols...`);
    const points = DEFAULT_PROTOCOLS.map((proto) => {
      const vector = generateSimpleVector(proto.text, VECTOR_SIZE);
      return {
        id: proto.id,
        vector: vector,
        payload: {
          category: proto.category,
          title: proto.title,
          text: proto.text,
        },
      };
    });

    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: points,
    });
    console.log(`[Qdrant] ✅ Default safety protocols seeded into vector store.`);
  } catch (err) {
    console.error(`[Qdrant] Error seeding protocols: ${err.message}`);
  }
}

/**
 * Search Qdrant Collection for Context Matches
 * @param {Array<number>} queryVector - The embedding vector of user query
 * @param {number} topK - Number of top protocol matches to return
 */
async function searchSafetyProtocols(queryVector, topK = 2) {
  try {
    const searchResults = await client.search(COLLECTION_NAME, {
      vector: queryVector,
      limit: topK,
      with_payload: true,
    });

    return searchResults.map((hit) => ({
      score: hit.score,
      title: hit.payload?.title || "Safety Protocol",
      text: hit.payload?.text || "",
      category: hit.payload?.category || "general",
    }));
  } catch (error) {
    console.warn(`[Qdrant] Vector search fallback triggered: ${error.message}`);
    // Fallback static protocols if vector DB is offline
    return [
      {
        score: 1.0,
        title: DEFAULT_PROTOCOLS[0].title,
        text: DEFAULT_PROTOCOLS[0].text,
        category: DEFAULT_PROTOCOLS[0].category,
      },
    ];
  }
}

/**
 * Helper to construct simple normalized vector for offline/testing scenarios
 */
function generateSimpleVector(text, dimensions = VECTOR_SIZE) {
  const vector = new Array(dimensions).fill(0);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  for (let i = 0; i < dimensions; i++) {
    vector[i] = Math.sin(hash + i) * 0.5;
  }
  // Normalize vector
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map((val) => (norm > 0 ? val / norm : 0));
}

module.exports = {
  initializeCollection,
  seedDefaultProtocols,
  searchSafetyProtocols,
  generateSimpleVector,
  COLLECTION_NAME,
};
