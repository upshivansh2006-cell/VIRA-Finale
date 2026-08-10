// =====================================
// VIRA — Backend Proxy for Rime TTS
// =====================================

require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// =====================================
// MIDDLEWARE
// =====================================

app.use(express.json());

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// =====================================
// ROOT ROUTE — Redirect "/" to main page
// =====================================

app.get("/", (req, res) => {
  res.redirect("/safesakhi.html");
});

// =====================================
// POST /api/tts — Rime TTS Proxy
// =====================================

app.post("/api/tts", async (req, res) => {
  try {
    // ------------------------------------
    // Validate API key
    // ------------------------------------

    const apiKey = process.env.RIME_API_KEY;

    if (!apiKey || apiKey === "YOUR_API_KEY") {
      console.error("RIME_API_KEY is not set in .env");

      return res.status(500).json({
        error: "Rime API key is not configured. Set RIME_API_KEY in .env file.",
      });
    }

    // ------------------------------------
    // Validate request body
    // ------------------------------------

    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: "Text is required.",
      });
    }

    // ------------------------------------
    // Build Rime API request
    // ------------------------------------

    const speaker = process.env.RIME_SPEAKER || "eva";
    const modelId = process.env.RIME_MODEL || "mist";

    const rimePayload = {
      text: text.trim(),
      speaker: speaker,
      modelId: modelId,
      samplingRate: 22050,
      speedAlpha: 1.0,
      reduceLatency: true,
    };

    console.log(
      "Rime TTS request:",
      JSON.stringify({ text: rimePayload.text, speaker, modelId })
    );

    // ------------------------------------
    // Call Rime API
    // ------------------------------------

    const rimeResponse = await fetch("https://users.rime.ai/v1/rime-tts", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mp3",
      },
      body: JSON.stringify(rimePayload),
    });

    // ------------------------------------
    // Handle Rime errors
    // ------------------------------------

    if (!rimeResponse.ok) {
      let errorMessage = "Rime API error: " + rimeResponse.status;

      try {
        const errorBody = await rimeResponse.text();
        errorMessage += " — " + errorBody;
      } catch (_) {
        // Ignore parse errors
      }

      console.error(errorMessage);

      return res.status(rimeResponse.status).json({
        error: errorMessage,
      });
    }

    // ------------------------------------
    // Stream audio back to browser
    // ------------------------------------

    const contentType =
      rimeResponse.headers.get("content-type") || "audio/mp3";

    res.setHeader("Content-Type", contentType);

    const audioBuffer = await rimeResponse.arrayBuffer();

    if (!audioBuffer || audioBuffer.byteLength === 0) {
      console.error("Rime returned empty audio");

      return res.status(502).json({
        error: "Rime returned empty audio response.",
      });
    }

    console.log(
      "Rime TTS success:",
      Math.round(audioBuffer.byteLength / 1024) + " KB"
    );

    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error("TTS proxy error:", error.message);

    res.status(500).json({
      error: "Internal server error: " + error.message,
    });
  }
});

// =====================================
// START SERVER
// =====================================

app.listen(PORT, () => {
  console.log("");
  console.log("===========================================");
  console.log("  🛡️  VIRA Server Running");
  console.log("===========================================");
  console.log("  URL:     http://localhost:" + PORT);
  console.log("  Open:    http://localhost:" + PORT + "/safesakhi.html");
  console.log("  Rime:    " + (process.env.RIME_API_KEY && process.env.RIME_API_KEY !== "YOUR_API_KEY" ? "✅ API key configured" : "❌ Set RIME_API_KEY in .env"));
  console.log("  Speaker: " + (process.env.RIME_SPEAKER || "eva"));
  console.log("  Model:   " + (process.env.RIME_MODEL || "mist"));
  console.log("===========================================");
  console.log("");
});
