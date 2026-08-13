// =====================================
// VIRA — Unified Frontend Script
// =====================================

const UI = {
  status: document.getElementById("status"),
  heard: document.getElementById("heard")
};

// =====================================
// STATE MANAGEMENT
// =====================================
const AppState = {
  safetyMode: false,
  location: { lat: null, lng: null },
  isProcessing: false,   // Prevents double-firing the assist pipeline
  activeWorkflows: {
    help: false,
    navigation: false,
    location: false,
    doctor: false,
    back: false
  },
  resetWorkflows() {
    this.activeWorkflows.help = false;
    this.activeWorkflows.navigation = false;
    this.activeWorkflows.location = false;
    this.activeWorkflows.doctor = false;
    this.activeWorkflows.back = false;
  }
};

// =====================================
// TEXT-TO-SPEECH (TTS) SYSTEM
// =====================================
const TTS = {
  currentAudio: null,
  requestId: 0,

  fallback(text) {
    return new Promise((resolve) => {
      const speech = new SpeechSynthesisUtterance(text);
      speech.lang = "en-IN";
      speech.rate = 0.9;
      speech.onend = resolve;
      speech.onerror = resolve;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(speech);
    });
  },

  async speak(text) {
    this.requestId++;
    const reqId = this.requestId;

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    window.speechSynthesis.cancel();

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      if (!response.ok) throw new Error("Rime API Error");

      const blob = await response.blob();
      if (!blob || blob.size === 0) throw new Error("Empty audio");

      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      if (reqId !== this.requestId) return;
      this.currentAudio = audio;

      await new Promise((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = async () => {
          URL.revokeObjectURL(audioUrl);
          console.warn("[TTS] Audio play failed. Using fallback.");
          await this.fallback(text);
          resolve();
        };
        audio.play().catch(async (err) => {
          console.warn("[TTS] Audio play promise failed:", err);
          await this.fallback(text);
          resolve();
        });
      });
    } catch (err) {
      console.warn("[TTS] Rime failed:", err.message, "Using fallback.");
      await this.fallback(text);
    }
  }
};

// =====================================
// BACKEND API SERVICE
// =====================================
const BackendAPI = {
  getBaseUrl() {
    if (window.location.protocol === 'file:') {
      return 'http://localhost:3000';
    }
    return '';
  },

  async getAssistance(transcript, location) {
    console.log("[BackendAPI] → /api/v1/assist:", transcript);
    try {
      const response = await fetch(`${this.getBaseUrl()}/api/v1/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          location: location.lat ? { lat: location.lat, lng: location.lng } : null
        })
      });
      if (!response.ok) throw new Error("Assist API returned " + response.status);
      const data = await response.json();
      console.log("[BackendAPI] Response:", data.responseText);
      return data.responseText;
    } catch (error) {
      console.error("[BackendAPI] Error:", error);
      return null;
    }
  }
};

// =====================================
// LOCATION & MAPS SERVICES
// =====================================
const LocationService = {
  async getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("No geolocation support"));

      navigator.geolocation.getCurrentPosition(
        pos => {
          AppState.location.lat = pos.coords.latitude;
          AppState.location.lng = pos.coords.longitude;
          resolve(pos.coords);
        },
        err => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  },

  async handleLocationCommand() {
    if (UI.status) UI.status.innerText = "📍 Getting your location...";
    try {
      const coords = await this.getCurrentLocation();
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}&addressdetails=1`);
      const data = await response.json();

      if (UI.status) UI.status.innerText = "📍 Location detected!";
      if (UI.heard) UI.heard.innerHTML = `📍 <strong>Your location:</strong><br>${data.display_name}`;

      TTS.speak("Your current location is " + data.display_name);

      const mapsURL = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
      window.open(mapsURL, "_blank");
    } catch (error) {
      if (UI.status) UI.status.innerText = "❌ Unable to get location.";
      TTS.speak("I was unable to get your location.");
    }
  },

  async handleDoctorCommand() {
    if (UI.status) UI.status.innerText = "🏥 Finding nearest hospital...";
    TTS.speak("Finding the nearest hospital.");

    try {
      const coords = await this.getCurrentLocation();
      const mapsURL = `https://www.google.com/maps/search/hospital+near+me/@${coords.latitude},${coords.longitude},14z`;
      window.open(mapsURL, "_blank");
    } catch (error) {
      if (UI.status) UI.status.innerText = "❌ Please enable location permission.";
      TTS.speak("I couldn't access your location.");
    }
  },

  async handlePoliceCommand() {
    if (UI.status) UI.status.innerText = "🚨 Accessing location for police station...";
    TTS.speak("Finding the nearest police station.");

    try {
      const coords = await this.getCurrentLocation();
      const mapsUrl = `https://www.google.com/maps/search/police+station/@${coords.latitude},${coords.longitude},14z`;
      window.open(mapsUrl, "_blank");
    } catch (error) {
      TTS.speak("I need your location permission to find the nearest police station.");
    }
  }
};

// =====================================
// SILENCE-BASED PHRASE PIPELINE
// Collects interim words. After 1 second of
// no new speech input, fires the Qdrant assist
// endpoint with the buffered phrase.
// =====================================
const PhrasePipeline = {
  buffer: "",           // Accumulated transcript text
  silenceTimer: null,   // Timeout handle for silence detection
  SILENCE_MS: 1000,     // 1 second of silence triggers processing
  MIN_WORDS: 2,         // Minimum word count before triggering

  /** Feed new partial/final transcript text into the buffer. */
  feed(text) {
    const cleaned = text.trim();
    if (!cleaned) return;
    this.buffer = cleaned;   // Always use the latest full transcript snapshot
    this._resetTimer();
  },

  /** Reset the 1-second silence countdown. */
  _resetTimer() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this._flush(), this.SILENCE_MS);
  },

  /** Flush the buffer to the command processor after silence. */
  async _flush() {
    const phrase = this.buffer.trim();
    this.buffer = "";
    this.silenceTimer = null;

    if (!phrase) return;

    const wordCount = phrase.split(/\s+/).filter(Boolean).length;
    if (wordCount < this.MIN_WORDS) {
      console.log("[PhrasePipeline] Phrase too short, skipping:", phrase);
      return;
    }

    if (AppState.isProcessing) {
      console.log("[PhrasePipeline] Already processing, queued phrase dropped:", phrase);
      return;
    }

    console.log("[PhrasePipeline] 🔥 1s silence — flushing phrase to pipeline:", phrase);
    await processCommand(phrase);
  },

  /** Immediately cancel any pending timer (used by instant triggers). */
  cancel() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
    this.buffer = "";
  }
};

// =====================================
// CENTRAL COMMAND PROCESSOR
// All speech flows through here.
// Critical triggers fire instantly; everything
// else reaches the Qdrant semantic backend.
// =====================================
async function processCommand(transcript) {
  if (!transcript) return;

  if (UI.heard) UI.heard.innerText = "Heard: " + transcript;

  const command = transcript.toLowerCase().trim().replace(/[.,!?]/g, "");
  const isContactPage = window.location.pathname.endsWith("contact.html");

  // =====================================
  // PHASE 1: CRITICAL TRIGGERS (instant)
  // =====================================

  // -> ACTIVATE SAFETY MODE
  if ((command.includes("baby") || command === "baby") && !AppState.safetyMode) {
    PhrasePipeline.cancel();
    AppState.safetyMode = true;
    AppState.resetWorkflows();
    if (UI.status) UI.status.innerText = "🚨 SAFETY MODE ACTIVATED";
    document.body.style.backgroundColor = "#ffe5e5";
    TTS.speak("Safety mode is on. I'm listening.");
    return;
  }

  // -> DEACTIVATE SAFETY MODE
  const isSafe = (
    command === "safe" ||
    command.includes("i am safe") ||
    command.includes("main safe hoon") ||
    command.includes("ab safe hoon")
  );
  const isUnsafe = (
    command.includes("nahi") ||
    command.includes("nhi") ||
    command.includes("not safe") ||
    command.includes("nahin")
  );

  if (isSafe && !isUnsafe) {
    PhrasePipeline.cancel();
    AppState.safetyMode = false;
    AppState.resetWorkflows();
    document.body.style.backgroundColor = "#f5f5f5";
    if (UI.status) UI.status.innerText = "🎙️ Listening for 'Baby'...";
    if (UI.heard) UI.heard.innerText = "";
    TTS.speak("Okay, going back to Safe Sakhi.");
    setTimeout(() => window.location.href = "safesakhi.html", 500);
    return;
  }

  // -> EXPLICIT UNSAFE / POLICE TRIGGER
  if (AppState.safetyMode && isUnsafe && !AppState.activeWorkflows.navigation) {
    PhrasePipeline.cancel();
    AppState.activeWorkflows.navigation = true;
    LocationService.handlePoliceCommand();
    return;
  }

  // -> HELP TRIGGER
  if (
    (command.includes("help") || command === "help me") &&
    AppState.safetyMode &&
    !isContactPage &&
    !AppState.activeWorkflows.help
  ) {
    PhrasePipeline.cancel();
    AppState.activeWorkflows.help = true;
    if (UI.status) UI.status.innerText = "🚨 HELP DETECTED — Opening emergency contacts...";
    TTS.speak("Opening your emergency contacts.");
    window.open("contact.html", "_blank");
    return;
  }

  // =====================================
  // PHASE 2: ACTION TRIGGERS
  // =====================================

  if (command.includes("location") && !AppState.activeWorkflows.location) {
    PhrasePipeline.cancel();
    AppState.activeWorkflows.location = true;
    LocationService.handleLocationCommand();
    return;
  }

  const doctorKeywords = ["doctor", "hospital", "medical emergency", "ambulance"];
  if (doctorKeywords.some(kw => command.includes(kw)) && !AppState.activeWorkflows.doctor) {
    PhrasePipeline.cancel();
    AppState.activeWorkflows.doctor = true;
    LocationService.handleDoctorCommand();
    return;
  }

  if (command.includes("go home") || command.includes("go home") || command === "home") {
    if (!AppState.activeWorkflows.back) {
      PhrasePipeline.cancel();
      AppState.activeWorkflows.back = true;
      TTS.speak("Returning to Safe Sakhi.");
      AppState.safetyMode = false;
      setTimeout(() => window.location.href = "safesakhi.html", 800);
    }
    return;
  }

  // =====================================
  // KEYWORD FIREWALL — Phase 2.5
  // Hard-coded trigger words must NEVER reach Qdrant,
  // even when their action conditions weren't met
  // (e.g. "help" outside safety mode, "location" after
  // workflow already fired, "nahi" when safetyMode=false).
  // =====================================
  const HARDCODED_KEYWORDS = [
    "baby", "help", "safe",
    "nahi", "nhi", "nahin", "not safe",
    "i am safe", "main safe hoon", "ab safe hoon",
    "location", "doctor", "hospital", "medical emergency", "ambulance", "back", "go home", "police"
  ];
  if (HARDCODED_KEYWORDS.some(kw => command.includes(kw))) {
    console.log("[PIPELINE] Hardcoded keyword — blocked from Qdrant:", transcript);
    // Reset the workflow flag so the same command can fire again next time
    AppState.resetWorkflows();
    return;
  }

  // =====================================
  // PHASE 3: SEMANTIC QDRANT + GEMINI BACKEND
  // /api/v1/assist handles Qdrant search and
  // Gemini refinement internally — returns
  // the final spoken response directly.
  // =====================================

  AppState.isProcessing = true;
  if (UI.status) UI.status.innerText = "🔍 Searching knowledge base...";
  console.log("[PIPELINE] → /api/v1/assist:", transcript);

  try {
    const response = await BackendAPI.getAssistance(transcript, AppState.location);

    const finalText = response || "Stay calm. Move to a safe, well-lit public area and call for help.";

    if (UI.status) UI.status.innerText = "🤖 " + finalText;
    if (UI.heard) UI.heard.innerText = "Last response: " + finalText;
    await TTS.speak(finalText);

  } catch (err) {
    console.error("[PIPELINE] Phase 3 error:", err);
  } finally {
    AppState.isProcessing = false;
    // Mic restarts — response stays on screen until next word
    try { recognition.start(); } catch (e) { }
  }
}

// =====================================
// VOICE PIPELINE
// =====================================
const SpeechRecognitionEngine = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognitionEngine) {
  if (UI.status) UI.status.innerText = "❌ Speech recognition is not supported.";
} else {
  const recognition = new SpeechRecognitionEngine();
  recognition.continuous = true;
  recognition.interimResults = true;   // Capture partial results for real-time buffer
  recognition.lang = "en-IN";

  recognition.onstart = () => {
    if (UI.status && !AppState.safetyMode) {
      UI.status.innerText = "🎙️ Listening...";
    }
  };

  recognition.onresult = (event) => {
    // ✅ Drop all events while Qdrant fetch / TTS is running.
    // This prevents mic bleed from the speaker re-triggering the pipeline.
    if (AppState.isProcessing) return;

    // Build the full transcript from the current event batch
    let interimTranscript = "";
    let finalTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += text;
      } else {
        interimTranscript += text;
      }
    }

    const latestText = (finalTranscript || interimTranscript).trim();
    if (!latestText) return;

    // ✅ User spoke — clear last AI response and show what we heard
    if (UI.heard) UI.heard.innerText = "Heard: " + latestText;
    if (UI.status) {
      UI.status.innerText = AppState.safetyMode
        ? "🚨 SAFETY MODE — Listening..."
        : "🎙️ Listening...";
    }

    // ----------------------------------------------------------
    // INSTANT CRITICAL-TRIGGER CHECK
    // For safety-critical keywords, act immediately without
    // waiting for the 1-second silence buffer to expire.
    // ----------------------------------------------------------
    const cmdQuick = latestText.toLowerCase().trim().replace(/[.,!?]/g, "");
    const isInstantTrigger =
      cmdQuick.includes("baby") ||
      cmdQuick.includes("help") ||
      cmdQuick === "safe" ||
      cmdQuick.includes("i am safe") ||
      cmdQuick.includes("not safe") ||
      cmdQuick.includes("nahi") ||
      cmdQuick.includes("nhi") ||
      cmdQuick === "back" ||
      cmdQuick.includes("go back") ||
      cmdQuick === "home" ||
      cmdQuick.includes("go home");

    if (isInstantTrigger) {
      PhrasePipeline.cancel();
      processCommand(latestText);
      return;
    }

    // ----------------------------------------------------------
    // SILENCE-BASED PIPELINE
    // Feed interim text into the buffer. After 1 second of no
    // new speech, the accumulated phrase is sent to Qdrant.
    // ----------------------------------------------------------
    PhrasePipeline.feed(latestText);
  };

  recognition.onerror = (e) => {
    if (e.error === 'no-speech') return; // Ignore 'no-speech' to prevent console spam
    console.warn("[Speech] Error:", e.error);
  };

  recognition.onend = () => {
    // Auto-restart only when NOT mid-processing.
    // Phase 3's finally{} block handles the restart after TTS ends.
    if (!AppState.isProcessing) {
      try { recognition.start(); } catch (e) { }
    }
  };

  // Start automatically
  recognition.start();
}
