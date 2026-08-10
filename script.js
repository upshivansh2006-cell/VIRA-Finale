const status = document.getElementById("status");
const heard = document.getElementById("heard");

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

// =====================================
// GLOBAL VARIABLES
// =====================================

let currentLatitude = null;
let currentLongitude = null;

let safetyMode = false;
let locationFound = false;
let navigationTriggered = false;

// =====================================
// SPEECH RECOGNITION SUPPORT
// =====================================

if (!SpeechRecognition) {
  if (status) status.innerText = "❌ Speech recognition is not supported.";
} else {
  const recognition = new SpeechRecognition();

  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-IN";

  // =====================================
  // START LISTENING
  // =====================================

  recognition.onstart = function () {
    console.log("[3] LISTENING");
    if (!safetyMode && status) {
      status.innerText = "🎙️ Listening for 'Code Word'...";
    }
  };

  // =====================================
  // VOICE RESULT
  // =====================================

  recognition.onresult = function (event) {
    let transcript = "";
    let isFinal = false;

    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        isFinal = true;
      }
    }

    if (!transcript) return;

    if (heard) heard.innerText = "Heard: " + transcript;

    const rawTranscript = transcript;
    const command = rawTranscript
      .toLowerCase()
      .trim()
      .replace(/[.,!?]/g, "");

    console.log("[4] RAW TRANSCRIPT", rawTranscript);

    // =====================================
    // 1. ACTIVATE SAFETY MODE ("Baby")
    // =====================================
    if ((command.includes("baby") || command === "baby") && !safetyMode) {
      safetyMode = true;
      window.helpTriggered = false; // Reset help guard for new session
      console.log("[1] BABY DETECTED");
      console.log("[2] SAFETY MODE ON");
      console.log("[SAFETY] Safety Mode ON");
      console.log("[VOICE] Listening for safety response");

      if (status) status.innerText = "🚨 SAFETY MODE ACTIVATED";
      document.body.style.backgroundColor = "#ffe5e5";

      speakText("Safety mode is on. I'm listening.");
      return;
    }

    // =====================================
    // 2. UNSAFE COMMAND / NAHI DETECTION
    // =====================================
    const isUnsafeResponse =
      command === "nahi" ||
      command.includes("nahi") ||
      command === "nahin" ||
      command.includes("nahin") ||
      command.includes("nahi hai") ||
      command.includes("main safe nahi hoon") ||
      command.includes("safe nahi") ||
      command === "no" ||
      command.includes("no") ||
      command.includes("nope") ||
      command.includes("i'm not safe") ||
      command.includes("nhi");

    if (safetyMode && !navigationTriggered && isUnsafeResponse) {
      console.log("[5] NAHI DETECTED", command);
      console.log("[SAFETY] UNSAFE RESPONSE DETECTED:", command);
      handleUnsafeResponse();
      return;
    }

    // =====================================
    // 3. SAFE COMMAND
    // Say: "safe", "I am safe", "main safe hoon", "ab safe hoon"
    // =====================================
    const isSafe =
      (command === "safe" ||
        command.includes("i am safe") ||
        command.includes("main safe hoon") ||
        command.includes("ab safe hoon")) &&
      !isUnsafeResponse;

    if (isSafe) {
      console.log("[SAFETY] SAFE DETECTED");

      safetyMode = false;
      window.helpTriggered = false;
      window.locationTriggered = false;
      navigationTriggered = false;
      window.backTriggered = false;
      locationFound = false;

      // Close external tab if opened
      if (window.externalTab && !window.externalTab.closed) {
        try {
          window.externalTab.close();
        } catch (e) { }
      }
      window.externalTab = null;

      speakText("Okay, going back to Safe Sakhi.");

      if (status) status.innerText = "🎙️ Listening for 'Baby'...";
      document.body.style.backgroundColor = "#f5f5f5";
      if (heard) heard.innerText = "";

      setTimeout(function () {
        window.location.href = "safesakhi.html";
      }, 500);

      return;
    }

    const isContactPage = window.location.pathname.endsWith("contact.html");

    // =====================================
    // 4. HELP COMMAND (STRICTLY REQUIRES SAFETY MODE ON)
    // =====================================
    if (command === "help" || command.includes("help me") || command === "help me") {
      if (!safetyMode) {
        console.log("[HELP] Ignored because Safety Mode is OFF");
        return;
      } else if (!isContactPage && !window.helpTriggered) {
        openContactPage();
        return;
      }
    }

    // ------------------------------------
    // Wait for final result for other menu commands
    // ------------------------------------
    if (!isFinal) return;

    // =====================================
    // GET LOCATION COMMAND
    // =====================================
    if (command.includes("location") && !window.locationTriggered) {
      window.locationTriggered = true;
      if (status) status.innerText = "📍 Getting your location...";
      getLocation();
    }

    // =====================================
    // BACK / HOME COMMAND
    // =====================================
    if (
      command === "back" ||
      command.includes("go back") ||
      command.includes("go home") ||
      command === "home"
    ) {
      if (!window.backTriggered) {
        window.backTriggered = true;
        console.log("[COMMAND] Back/Home detected");

        if (isContactPage) {
          speakText("Going back to Safe Sakhi.");
          setTimeout(function () {
            window.location.href = "safesakhi.html";
          }, 1000);
        } else {
          if (window.externalTab && !window.externalTab.closed) {
            window.externalTab.close();
          }
          window.externalTab = null;

          window.locationTriggered = false;
          navigationTriggered = false;
          window.helpTriggered = false;
          window.backTriggered = false;

          window.location.href = "safesakhi.html";
        }
      }
    }
  };

  // =====================================
  // OPEN CONTACT PAGE
  // =====================================

  function openContactPage() {
    if (window.helpTriggered) return;
    window.helpTriggered = true;

    console.log("[HELP] Opening contact.html");
    if (status) status.innerText = "🚨 HELP DETECTED - Opening emergency contacts...";

    speakText("Opening your emergency contacts.");

    window.open("contact.html", "_blank");
  }

  // =====================================
  // HANDLE UNSAFE RESPONSE
  // =====================================

  function handleUnsafeResponse() {
    if (navigationTriggered) return;
    navigationTriggered = true;

    console.log("[SAFETY] Starting police station workflow");
    if (status) status.innerText = "🚨 Accessing location for nearest police station...";

    // Non-blocking voice notification
    speakText("Finding the nearest police station.");

    // Immediately trigger GPS & navigation workflow
    findSafeNavigation();
  }

  // =====================================
  // FIND SAFE NAVIGATION (GPS)
  // =====================================

  function findSafeNavigation() {
    console.log("[6] GETTING LOCATION");
    if (!navigator.geolocation) {
      console.error("[LOCATION ERROR] Location is not supported by this browser.");
      if (status) status.innerText = "❌ Location is not supported by this browser.";
      speakText("I need your location permission to find the nearest police station.");
      return;
    }

    console.log("[LOCATION] Getting current location...");

    navigator.geolocation.getCurrentPosition(
      function (position) {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        currentLatitude = latitude;
        currentLongitude = longitude;
        locationFound = true;

        console.log("[7] LOCATION RECEIVED");
        console.log("[LOCATION] Latitude:", latitude);
        console.log("[LOCATION] Longitude:", longitude);

        findNearestPoliceStation(latitude, longitude);
      },
      function (error) {
        navigationTriggered = false; // Allow retry on failure
        if (status) status.innerText = "❌ Unable to get your location.";
        console.error("[LOCATION ERROR]", error);
        speakText("I need your location permission to find the nearest police station.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }

  // =====================================
  // GET LOCATION (Manual "Location" command)
  // =====================================

  function getLocation() {
    if (!navigator.geolocation) {
      if (status) status.innerText = "❌ Location is not supported by this browser.";
      speakText("Location is not supported by this browser.");
      return;
    }

    if (status) status.innerText = "📍 Getting your exact location...";

    navigator.geolocation.getCurrentPosition(
      async function (position) {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        currentLatitude = latitude;
        currentLongitude = longitude;

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`
          );

          if (!response.ok) {
            throw new Error("Address lookup failed");
          }

          const data = await response.json();
          const address = data.display_name;

          locationFound = true;

          if (status) status.innerText = "📍 Location detected!";
          if (heard) heard.innerHTML = "📍 <strong>Your location:</strong><br>" + address;

          speakText("Your current location is " + address);

          console.log("Latitude:", latitude);
          console.log("Longitude:", longitude);
          console.log("Address:", address);

          const mapsURL = `https://www.google.com/maps?q=${latitude},${longitude}`;
          window.externalTab = window.open(mapsURL, "_blank");
        } catch (error) {
          locationFound = false;
          if (status) status.innerText = "❌ Could not find your address.";
          console.log("Address error:", error);
          speakText("I could not find your address.");
        }
      },
      function (error) {
        locationFound = false;
        if (status) status.innerText = "❌ Unable to get your location.";
        console.log("Location error:", error.message);
        speakText("I was unable to get your location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }

  // =====================================
  // FIND NEAREST POLICE STATION
  // =====================================

  async function findNearestPoliceStation(latitude, longitude) {
    console.log("[8] SEARCHING POLICE STATIONS");
    if (status) status.innerText = "👮 Finding nearest police station...";

    let mapsUrl = "";

    try {
      const radius = 5000;
      const query = `
        [out:json];
        (
          node["amenity"="police"](around:${radius},${latitude},${longitude});
          way["amenity"="police"](around:${radius},${latitude},${longitude});
          relation["amenity"="police"](around:${radius},${latitude},${longitude});
        );
        out center;
      `;

      const response = await fetch(
        "https://overpass-api.de/api/interpreter",
        {
          method: "POST",
          body: query,
        }
      );

      if (!response.ok) {
        throw new Error("Police station search HTTP error: " + response.status);
      }

      const data = await response.json();
      console.log("[POLICE] Search results:", data.elements ? data.elements.length : 0);

      let nearestStation = null;
      let shortestDistance = Infinity;

      if (data.elements && data.elements.length > 0) {
        console.log("[9] POLICE STATION FOUND");

        data.elements.forEach(function (station) {
          let stationLat;
          let stationLon;

          if (station.type === "node") {
            stationLat = station.lat;
            stationLon = station.lon;
          } else if (station.center) {
            stationLat = station.center.lat;
            stationLon = station.center.lon;
          }

          if (stationLat === undefined || stationLon === undefined) return;

          const distance = calculateDistance(latitude, longitude, stationLat, stationLon);

          if (distance < shortestDistance) {
            shortestDistance = distance;
            nearestStation = {
              latitude: stationLat,
              longitude: stationLon,
              name: station.tags?.name || "Nearest Police Station",
            };
          }
        });
      }

      if (nearestStation) {
        console.log("[10] NEAREST POLICE STATION SELECTED", nearestStation);

        let distanceText = shortestDistance < 1
          ? Math.round(shortestDistance * 1000) + " meters"
          : shortestDistance.toFixed(2) + " kilometers";

        if (status) status.innerText = "👮 Nearest Police Station Found";
        if (heard) {
          heard.innerHTML +=
            "<br><br>" +
            "🚨 <strong>Nearest Police Station:</strong><br>" +
            "👮 " + nearestStation.name + "<br>" +
            "📏 " + distanceText;
        }

        mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${nearestStation.latitude},${nearestStation.longitude}`;
      } else {
        console.log("[POLICE] No specific station found via API, falling back to Google Maps search");
        mapsUrl = `https://www.google.com/maps/search/police+station/@${latitude},${longitude},14z`;
      }
    } catch (error) {
      console.error("[POLICE ERROR]", error);
      mapsUrl = `https://www.google.com/maps/search/police+station/@${latitude},${longitude},14z`;
    }

    console.log("[11] GOOGLE MAPS URL CREATED");
    console.log("[NAVIGATION] Google Maps URL:", mapsUrl);

    console.log("[12] OPENING GOOGLE MAPS");

    // Open Google Maps
    const newTab = window.open(mapsUrl, "_blank");
    if (!newTab || newTab.closed || typeof newTab.closed === "undefined") {
      console.log("[NAVIGATION] Popup blocked, using window.location.assign");
      window.location.assign(mapsUrl);
    }
  }

  // =====================================
  // DISTANCE CALCULATOR
  // =====================================

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // =====================================
  // TEXT TO SPEECH — RIME API + FALLBACK
  // =====================================

  let currentAudio = null;
  let ttsRequestId = 0;

  function speakTextFallback(text) {
    const speech = new SpeechSynthesisUtterance();
    speech.text = text;
    speech.lang = "en-IN";
    speech.rate = 0.9;
    speech.pitch = 1;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
  }

  async function speakWithRime(text) {
    ttsRequestId++;
    const currentRequestId = ttsRequestId;

    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }

    window.speechSynthesis.cancel();

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: text }),
      });

      if (!response.ok) {
        throw new Error("Rime API returned " + response.status);
      }

      const audioBlob = await response.blob();

      if (!audioBlob || audioBlob.size === 0) {
        throw new Error("Rime returned empty audio");
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      if (currentRequestId !== ttsRequestId) {
        URL.revokeObjectURL(audioUrl);
        return;
      }

      currentAudio = audio;

      audio.onended = function () {
        URL.revokeObjectURL(audioUrl);
        if (currentAudio === audio) {
          currentAudio = null;
        }
      };

      audio.onerror = function () {
        URL.revokeObjectURL(audioUrl);
        if (currentAudio === audio) {
          currentAudio = null;
        }
        console.log("Audio playback failed, using fallback.");
        speakTextFallback(text);
      };

      await audio.play();
    } catch (error) {
      console.log("Rime TTS error:", error.message, "— using fallback.");
      speakTextFallback(text);
    }
  }

  function speakText(text) {
    speakWithRime(text);
  }

  // =====================================
  // SPEECH ERROR & AUTO-RESTART
  // =====================================

  recognition.onerror = function (event) {
    console.log("Speech recognition error:", event.error);
  };

  recognition.onend = function () {
    console.log("[3] LISTENING");
    try {
      recognition.start();
    } catch (error) {
      console.log("Recognition restart error:", error);
    }
  };

  // =====================================
  // START AUTOMATICALLY
  // =====================================

  recognition.start();
}
