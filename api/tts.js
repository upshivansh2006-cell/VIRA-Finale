// =====================================
// Vercel Serverless Function — Rime TTS API
// =====================================

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.RIME_API_KEY;

    if (!apiKey || apiKey === "YOUR_API_KEY") {
      console.error("RIME_API_KEY is not set in environment variables");
      return res.status(500).json({
        error: "Rime API key is not configured. Set RIME_API_KEY in Vercel settings.",
      });
    }

    const { text } = req.body || {};

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({
        error: "Text is required.",
      });
    }

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

    const rimeResponse = await fetch("https://users.rime.ai/v1/rime-tts", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mp3",
      },
      body: JSON.stringify(rimePayload),
    });

    if (!rimeResponse.ok) {
      let errorMessage = "Rime API error: " + rimeResponse.status;
      try {
        const errorBody = await rimeResponse.text();
        errorMessage += " — " + errorBody;
      } catch (_) {}

      console.error(errorMessage);
      return res.status(rimeResponse.status).json({
        error: errorMessage,
      });
    }

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

    return res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error("TTS proxy error:", error.message);
    return res.status(500).json({
      error: "Internal server error: " + error.message,
    });
  }
};
