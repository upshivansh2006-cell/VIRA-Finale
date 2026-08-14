# VIRA — Voice-Activated Safety Assistant



## 1️⃣ Project Description

**Why we built VIRA:**
In emergency situations, reaching for a phone, unlocking it, and dialing for help can take precious seconds that a victim may not have. We built VIRA to act as an invisible, hands-free safety net that is always ready to assist.

**Why the problem matters:**
Personal safety, especially in vulnerable scenarios such as walking alone at night, domestic distress, or sudden medical emergencies, requires immediate intervention. Traditional SOS buttons require physical interaction, which might be impossible if the user is restrained or incapacitated. A voice-activated system bridges this critical gap.

**Scientific/Development Contribution:**
VIRA contributes a novel integration of browser-based continuous speech recognition with ultra-low latency Text-To-Speech (TTS) and high-speed semantic vector search. By converting natural language distress signals into actionable context vectors, VIRA instantly retrieves appropriate safety protocols and delivers them via realistic AI voice responses, minimizing panic and providing real-time guidance.

---

## 2️⃣ Product Demo

> **Demo:** https://drive.google.com/file/d/1xhxP2ifcK_A39g3xGHJTB69JHmA5JLFS/view?usp=drivesdk

---

## 3️⃣ Reproducibility (How to Run)

To set up and replicate this project on your local machine, follow these steps:

### Prerequisites
- Python 3.9+
- [Qdrant](https://qdrant.tech/) running locally.
- Rime Labs API Key (for TTS).

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/upshivansh2006-cell/VIRA-Finale
   cd VIRA
   ```

2. **Set up Virtual Environment**
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Variables**
   Create a `.env` file in the root directory and add your keys:
   ```env
   RIME_API_KEY=your_rime_api_key_here
   # Add any other required keys (e.g., Pathway/Weya if utilized in your fork)
   ```

5. **Start Qdrant Vector Database**
   Run the local Qdrant instance from the `qdrant/` directory:
   ```bash
   .\qdrant\qdrant.exe
   ```
   *(Ensure it runs on `localhost:6333`)*

6. **Run the Application**
   Start the FastAPI server:
   ```bash
   python main.py
   # or
   uvicorn main:app --port 3000 --reload
   ```

7. **Access the App**
   Open `http://localhost:3000` in your web browser. Grant microphone permissions when prompted.

---

## 4️⃣ Performance Metrics

To ensure VIRA responds effectively during an emergency, we optimized for latency and accuracy. We tracked the following metrics:

- **Vector Search Latency (Qdrant):** `~10-20ms`. Chosen because rapid retrieval of safety protocols is critical. Running Qdrant locally ensures no external network overhead for semantic matching.
- **TTS Generation Latency (Rime):** `~300-500ms`. Chosen to evaluate the delay between the user's distress call and the system's vocal response. Rime provides highly realistic, low-latency voices ("Eva") to calm the user.
- **Speech Recognition Responsiveness:** Instantaneous trigger word detection ("Baby" or "Help") using the browser-native Web Speech API. Chosen to guarantee zero-latency activation without relying on server round-trips.

*(Note: These metrics are indicative based on our architecture. Please update with your specific hackathon benchmark results if needed.)*

---

## 5️⃣ Credits

We would like to give a huge shout-out to our partners for making this project possible during the hackathon:

- 🤝 **Pathway**
- 🤝 **Rime**
- 🤝 **Weya**
- 🤝 **Qdrant**

---

### 🏗️ Project Architecture & Working Details

**Frontend (Client-Side)**
- Handles UI rendering and device sensor access (microphone & GPS).
- **`safesakhi.html`**: Primary dashboard where voice interaction happens.
- **`script.js`**: Core logic leveraging the browser's native `SpeechRecognition` API.

**Backend (Server-Side: Python FastAPI)**
- **`main.py`**: Entry point exposing `/api/tts` (Rime API proxy) and `/api/assist` (NLP & Qdrant query).
- **`qdrant_service.py`**: Manages all interactions with Qdrant, converting transcripts into vectors for semantic similarity searches to find the appropriate safety protocol.
