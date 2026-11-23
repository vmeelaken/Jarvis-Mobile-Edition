// ===== 1. API KEY (Safe: browser లో మాతమ్ర ే) =====
let API_KEY = localStorage.getItem("jarvis_key");
if (!API_KEY) {
  API_KEY = prompt("Enter your Gemini API Key:");
  if (API_KEY) localStorage.setItem("jarvis_key", API_KEY);
}
// ===== 2. SMART MODELS (fastest first; next one is tried if a model fails or is slow) =====
const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3-flash-preview",
];
const REQUEST_TIMEOUT_MS = 8000;
const LAST_MODEL_KEY = "jarvis_model";
const QUOTA_KEY = "jarvis_quota_until_";
const DEFAULT_QUOTA_COOLDOWN_MS = 60 * 60 * 1000;

// Free-tier quotas are per model, so a model that hit its limit is skipped until it resets.
function isOutOfQuota(m) {
  return Number(localStorage.getItem(QUOTA_KEY + m)) > Date.now();
}
function markOutOfQuota(m, message) {
  const [, h, min, sec] =
    /retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(message || "") || [];
  const ms =
    ((Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(sec) || 0)) *
    1000;
  localStorage.setItem(QUOTA_KEY + m, Date.now() + (ms || DEFAULT_QUOTA_COOLDOWN_MS));
}
const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const micBtn = document.getElementById("mic-btn");
// const input = document.getElementById("msg");
// ===== 3. GEMINI BRAIN (auto-fallback) =====
async function callGemini(p) {
  // Try the last model that worked first so a healthy model costs one call.
  const last = localStorage.getItem(LAST_MODEL_KEY);
  const order = (last ? [last, ...MODELS.filter((m) => m !== last)] : MODELS).filter(
    (m) => !isOutOfQuota(m),
  );
  if (!order.length) {
    throw new Error(
      "Daily free-tier quota is used up on all models. Try again later or use a key with billing enabled.",
    );
  }
  let lastErr;
  for (const m of order) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" +
          m +
          ":generateContent?key=" +
          API_KEY,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: "You are J.A.R.V.I.S. Reply concisely in 1-3 sentences unless asked for detail.",
                },
              ],
            },
            contents: [{ parts: [{ text: p }] }],
          }),
        },
      );
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!res.ok || !text) {
        if (res.status === 429) markOutOfQuota(m, data.error?.message);
        throw new Error(data.error?.message || m + ": empty response");
      }
      localStorage.setItem(LAST_MODEL_KEY, m);
      return text;
    } catch (e) {
      lastErr =
        e.name === "AbortError" ? new Error(m + ": request timed out") : e;
      if (m === last) localStorage.removeItem(LAST_MODEL_KEY);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
async function askGemini(p) {
  add("J.A.R.V.I.S: Thinking...", "ai");
  try {
    const reply = await callGemini(p);
    chat.lastChild.innerText = "J.A.R.V.I.S: " + reply;
    speak(reply); // reply వచ్చి న వెంటనేVOICE
  } catch (e) {
    chat.lastChild.innerText = "J.A.R.V.I.S: ERROR - " + e.message;
  }
}
// ===== 4. SPEECH RECOGNITION (వినడం) =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const rec = new SR();
rec.lang = "en-US"; // Telugu కి'te-IN'
rec.onresult = (e) => {
  const t = e.results[0][0].transcript;
  add("YOU: " + t, "user");
  askGemini(t);
};
micBtn.onclick = () => {
  rec.start();
  micBtn.innerText = "LISTENING...";
};
rec.onend = () => {
  micBtn.innerText = "️";
};
// ===== 5. TEXT-TO-SPEECH (మాట్లాడటం) =====
let voices = [];
function loadVoices() {
  voices = speechSynthesis.getVoices();
}
loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;
function speak(t) {
  const u = new SpeechSynthesisUtterance(t);

  u.rate = 1.05;
  u.pitch = 0.85;
  const v = voices.find((v) => v.lang.startsWith("en"));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
// ===== 6. TEXT SEND BUTTON =====
document.getElementById("send").onclick = () => {
  const t = input.value.trim();
  if (!t) return;
  add("YOU: " + t, "user");
  input.value = "";
  askGemini(t);
};
function add(t, w) {
  const d = document.createElement("div");
  d.className = "msg " + w;
  d.innerText = t;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
}
