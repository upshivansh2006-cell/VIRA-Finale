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
    if (!safetyMode && status) {
      status.innerText = "🎙️ Listening for 'Baby'...";
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

    transcript = transcript.toLowerCase().trim();

    if (heard) heard.innerText = "Heard: " + transcript;

    // ------------------------------------
    // Wait for final result before processing commands
    // This prevents the same command from executing 
    // multiple times during interim guesses.
    // ------------------------------------
    if (!isFinal) return;

    // =====================================
    // ACTIVATE SAFETY MODE
    // Say: "Baby"
    // =====================================

    if (transcript.includes("baby") && !safetyMode) {
      safetyMode = true;
      console.log("[WAKE] Baby detected");
      console.log("[SAFETY] Safety mode ON");
      console.log("[VOICE] Listening for safety response");

      if (status) status.innerText = "🚨 SAFETY MODE ACTIVATED";

      document.body.style.backgroundColor = "#ffe5e5";

      speakText("I'm listening. Are you safe?");
    }

    const command = transcript.toLowerCase().trim();
    const isContactPage = window.location.pathname.endsWith("contact.html");

    // =====================================
    // HELP COMMAND
    // Say: "HELP", "Help", "help me"
    // =====================================

    if (
      (command === "help" || command.includes("help me") || command.includes("help")) &&
      !isContactPage &&
      !window.helpTriggered
    ) {
      window.helpTriggered = true;
      if (status) status.innerText = "🚨 HELP DETECTED - Opening emergency contacts...";

      speakText("Opening your emergency contacts.");

      window.open("contact.html", "_blank");
    }

    // =====================================
    // GET LOCATION
    // Say: "Location"
    // =====================================

    if (command.includes("location") && !window.locationTriggered) {
      window.locationTriggered = true;
      if (status) status.innerText = "📍 Getting your location...";

      getLocation();
    }

    // =====================================
    // BACK / HOME COMMAND
    // Say: "BACK", "back", "go back", "home", "go home"
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

          // Reset triggers so commands can be used again
          window.locationTriggered = false;
          navigationTriggered = false;
          window.helpTriggered = false;
          window.backTriggered = false;

          // Return/open the VIRA START/HOME page in the original VIRA tab
          window.location.href = "safesakhi.html";
        }
      }
    }

    console.log("[TEST] Raw transcript:", transcript);
    const normalized = command;

    // =====================================
    // UNSAFE COMMAND (SAFETY NAVIGATION)
    // =====================================

    if (
      (normalized === "no" || 
       normalized.includes("no") || 
       normalized.includes("nahi") || 
       normalized.includes("nahin") || 
       normalized.includes("i'm not safe")) && 
      safetyMode && 
      !navigationTriggered
    ) {
      console.log("[SAFETY] NO DETECTED");
      navigationTriggered = true;
      console.log("[VOICE] Heard: NO");
      console.log("[SAFETY] Unsafe response detected");
      
      if (status) status.innerText = "🚨 Accessing location for nearest police station...";
      speakText("Finding the nearest police station.");
      
      findSafeNavigation();
    }

    // =====================================
    // DEACTIVATE SAFETY MODE
    // Say: "Safe"
    // =====================================

    if (transcript.includes("safe")) {
      safetyMode = false;
      window.helpTriggered = false;
      window.locationTriggered = false;
      navigationTriggered = false;
      window.backTriggered = false;
      locationFound = false;

      if (status) status.innerText = "🎙️ Listening for 'Baby'...";

      document.body.style.backgroundColor = "#f5f5f5";

      if (heard) heard.innerText = "";

      window.speechSynthesis.cancel();
    }
  };
  // =====================================
  // FIND SAFE NAVIGATION (AUTO-LOCATION)
  // =====================================

  function findSafeNavigation() {
    if (!navigator.geolocation) {
      if (status) status.innerText = "❌ Location is not supported by this browser.";
      speakText("I need your location permission to find the nearest police station.");
      return;
    }

    console.log("[LOCATION] Getting current GPS");

    navigator.geolocation.getCurrentPosition(
      function (position) {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        currentLatitude = latitude;
        currentLongitude = longitude;
        locationFound = true;

        console.log("[LOCATION] Latitude:", latitude);
        console.log("[LOCATION] Longitude:", longitude);

        findNearestPoliceStation(latitude, longitude);
      },
      function (error) {
        window.policeTriggered = false; // Allow retry
        if (status) status.innerText = "❌ Unable to get your location.";
        console.log("[LOCATION] Error:", error.message);
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
  // GET LOCATION
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

        // Save coordinates

        currentLatitude = latitude;

        currentLongitude = longitude;

        try {
          // =====================================
          // REVERSE GEOCODING
          // GPS → ADDRESS
          // =====================================

          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`,
          );

          if (!response.ok) {
            throw new Error("Address lookup failed");
          }

          const data = await response.json();

          const address = data.display_name;

          // Location successfully found

          locationFound = true;

          // =====================================
          // SHOW LOCATION
          // =====================================

          if (status) status.innerText = "📍 Location detected!";

          if (heard) heard.innerHTML = "📍 <strong>Your location:</strong><br>" + address;

          // =====================================
          // SPEAK LOCATION
          // =====================================

          speakText("Your current location is " + address);

          console.log("Latitude:", latitude);

          console.log("Longitude:", longitude);

          console.log("Address:", address);

          // =====================================
          // OPEN EXTERNAL MAPS TAB
          // =====================================

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
      },
    );
  }

  // =====================================
  // FIND NEAREST POLICE STATION
  // =====================================

  async function findNearestPoliceStation(latitude, longitude) {
    try {
      if (status) status.innerText = "👮 Finding nearest police station...";
      console.log("[POLICE] Searching nearby police stations");

      // Search within 5 km

      const radius = 5000;

      // =====================================
      // OVERPASS QUERY
      // =====================================

      const query = `

                [out:json];

                (

                    node["amenity"="police"]
                    (around:${radius},${latitude},${longitude});

                    way["amenity"="police"]
                    (around:${radius},${latitude},${longitude});

                    relation["amenity"="police"]
                    (around:${radius},${latitude},${longitude});

                );

                out center;

            `;

      const response = await fetch(
        "https://overpass-api.de/api/interpreter",

        {
          method: "POST",

          body: query,
        },
      );

      if (!response.ok) {
        throw new Error("Police station search failed");
      }

      const data = await response.json();
      console.log("[POLICE] Results:", data.elements ? data.elements.length : 0);

      // =====================================
      // NO POLICE STATION
      // =====================================

      if (!data.elements || data.elements.length === 0) {
        if (status) status.innerText = "❌ No nearby police station found.";

        speakText("I couldn't find a nearby police station.");

        return;
      }

      // =====================================
      // FIND CLOSEST STATION
      // =====================================

      let nearestStation = null;

      let shortestDistance = Infinity;

      data.elements.forEach(function (station) {
        let stationLat;
        let stationLon;

        // Node

        if (station.type === "node") {
          stationLat = station.lat;

          stationLon = station.lon;
        }

        // Way / Relation
        else if (station.center) {
          stationLat = station.center.lat;

          stationLon = station.center.lon;
        }

        // Ignore invalid locations

        if (stationLat === undefined || stationLon === undefined) {
          return;
        }

        // Calculate distance

        const distance = calculateDistance(
          latitude,
          longitude,

          stationLat,
          stationLon,
        );

        // Check nearest

        if (distance < shortestDistance) {
          shortestDistance = distance;

          nearestStation = {
            lat: stationLat,
            lon: stationLon,
            name: station.tags?.name || "Nearest Police Station",
          };
        }
      });
      
      if (nearestStation) {
        console.log("[POLICE] Selected station:", nearestStation);
      }

      // =====================================
      // CHECK RESULT
      // =====================================

      if (!nearestStation) {
        if (status) status.innerText = "❌ Could not identify the nearest police station.";

        speakText("I couldn't find a nearby police station.");

        return;
      }

      // =====================================
      // DISTANCE
      // =====================================

      let distanceText;

      if (shortestDistance < 1) {
        distanceText = Math.round(shortestDistance * 1000) + " meters";
      } else {
        distanceText = shortestDistance.toFixed(2) + " kilometers";
      }

      // =====================================
      // SHOW POLICE STATION
      // =====================================

      if (status) status.innerText = "👮 Nearest Police Station Found";

      if (heard) {
        heard.innerHTML +=
          "<br><br>" +
          "🚨 <strong>Nearest Police Station:</strong><br>" +
          "👮 " +
          nearestStation.name +
          "<br>" +
          "📏 " +
          distanceText;
      }

      // =====================================
      // CREATE NAVIGATION URL
      // =====================================

      const mapsURL = `https://www.google.com/maps/dir/?api=1&destination=${nearestStation.lat},${nearestStation.lon}`;

      console.log("[NAVIGATION] URL:", mapsURL);

      // =====================================
      // SPEAK STATION + NAVIGATION
      // =====================================

      speakText("Opening directions to the nearest police station.");
      
      console.log("[NAVIGATION] ABOUT TO OPEN NEW TAB");
      
      // Open navigation in a NEW tab, keep VIRA running in the original tab
      window.externalTab = window.open(mapsURL, "_blank");

    } catch (error) {
      console.log("Police station error:", error);
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

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),

        Math.sqrt(1 - a),
      );

    return R * c;
  }

  // =====================================
  // TEXT TO SPEECH — RIME API + FALLBACK
  // =====================================

  // Track currently playing audio for interrupt support
  let currentAudio = null;
  let ttsRequestId = 0; // Track requests to prevent async race conditions

  // ------------------------------------
  // FALLBACK: Browser SpeechSynthesis
  // ------------------------------------

  function speakTextFallback(text) {
    const speech = new SpeechSynthesisUtterance();

    speech.text = text;

    speech.lang = "en-IN";

    speech.rate = 0.9;

    speech.pitch = 1;

    window.speechSynthesis.cancel();

    window.speechSynthesis.speak(speech);
  }

  // ------------------------------------
  // RIME: High-quality AI voice
  // ------------------------------------

  async function speakWithRime(text) {
    ttsRequestId++;
    const currentRequestId = ttsRequestId;

    // Stop any currently playing audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }

    // Also cancel any browser speech that might be playing
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

      // Prevent duplicate audio if a newer TTS request was started while waiting for the network
      if (currentRequestId !== ttsRequestId) {
        URL.revokeObjectURL(audioUrl);
        return;
      }

      currentAudio = audio;

      // Clean up object URL after playback
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

  // ------------------------------------
  // MAIN: speakText (same signature)
  // ------------------------------------

  function speakText(text) {
    speakWithRime(text);
  }

  // =====================================
  // SPEECH ERROR
  // =====================================

  recognition.onerror = function (event) {
    console.log("Speech recognition error:", event.error);
  };

  // =====================================
  // KEEP LISTENING
  // =====================================

  recognition.onend = function () {
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
