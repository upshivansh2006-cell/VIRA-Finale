# VIRA — Voice-Activated Safety Assistant

VIRA is an intelligent, voice-activated safety web application designed to help users in emergency situations. It uses speech recognition, natural language processing, vector search (Qdrant), and Text-To-Speech (Rime Labs) to provide real-time, context-aware safety protocols and assistance.

## 🏗️ Project Architecture & Working

### 1. Frontend (Client-Side)
The frontend is built using standard web technologies and handles user interaction, UI rendering, and device sensor access (microphone & GPS).

- **`safesakhi.html` / `contact.html` / `location.html`**: The UI views. `safesakhi.html` is the primary dashboard where voice interaction happens.
- **`style.css`**: Contains all styling for the web application.
- **`script.js`**: The core frontend logic. It leverages the browser's native `SpeechRecognition` API (Web Speech API) to continuously listen for the trigger word (e.g., "Baby"). Once activated, it transcribes the user's speech and sends it to the backend for processing. It also manages location sharing and plays back audio responses.

### 2. Backend (Server-Side)
The backend was recently migrated from Node.js to a modern **Python FastAPI** architecture. It serves the static frontend files and provides API endpoints for the client.

- **`main.py`**: The entry point of the FastAPI application. It mounts the static files, initializes the Qdrant connection on startup, and exposes two main endpoints:
  - `POST /api/tts`: Proxies requests to the Rime Text-To-Speech API to convert text responses into audio.
  - `POST /api/assist`: Analyzes the user's voice transcript, searches the Qdrant vector database for relevant safety protocols, and generates an appropriate response.
- **`qdrant_service.py`**: Manages all interactions with the Qdrant Vector Database. It handles collection creation, seeding default emergency protocols (like Stalking, Medical Emergency, Domestic Panic), and querying the database using vector similarity search to find the most relevant protocol based on the user's transcript.

*Note: `server.js` and `qdrantService.js` are deprecated files from the older Node.js implementation.*

### 3. Database (Vector Storage)
- **Qdrant**: A high-performance vector database used to store and retrieve emergency safety protocols based on semantic similarity. It runs locally as a standalone executable in the `qdrant/` directory, listening on ports 6333 (HTTP) and 6334 (gRPC).

### 4. External Services
- **Rime TTS API**: Used to generate realistic voice responses (using the speaker "Eva") to communicate with the user during an emergency.

## 🔄 Workflow / User Journey
1. **Idle State**: The browser's speech recognition runs continuously in the background, listening for the trigger word ("Baby" or "Help").
2. **Trigger**: When the trigger word is detected, the frontend goes into "Safety Mode" (visualized by a red background).
3. **Command Detection**: The user speaks their emergency or command (e.g., "I am not safe" or "nahi").
4. **Processing**: The frontend sends this transcript (along with GPS coordinates if available) to the FastAPI backend (`/api/assist`).
5. **Retrieval**: `qdrant_service.py` converts the transcript into a vector and queries Qdrant for the most relevant safety protocol.
6. **Response Generation**: The backend formats a response and sends the text to the Rime TTS API (`/api/tts`) to get an audio stream.
7. **Action**: The frontend plays the audio response and displays the safety instructions on the screen.

## 🚀 How to Run Locally

1. **Start Qdrant**: Run `.\qdrant\qdrant.exe` to start the vector database on `localhost:6333`.
2. **Start FastAPI**: Run `python main.py` or `uvicorn main:app --port 3000 --reload`.
3. **Access App**: Open `http://localhost:3000` in your web browser.
