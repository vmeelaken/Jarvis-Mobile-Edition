# J.A.R.V.I.S — Personal AI Assistant

A mobile-friendly, installable (PWA) personal AI assistant that runs entirely in the browser. It chats using Google Gemini, speaks and listens in English and Telugu, and handles everyday tasks (time, weather, news, timers, translation and more) with built-in tools.

There is no backend or build step: it is plain HTML, CSS and JavaScript.

## Features

- **Chat with Gemini** with conversation memory (replies in a warm Telugu-English mix by default).
- **Automatic model fallback**: tries fast Flash-Lite models first, remembers the one that works, skips a model whose free-tier quota is used up, and times out slow ones.
- **Voice input and spoken replies** using the browser's speech recognition and speech synthesis.
- **"Hey Jarvis" wake word** for hands-free use (toggle in the top bar).
- **Image analysis**: attach a photo and ask about it.
- **Built-in tools** (no AI call needed): see [Tools](#tools).
- **Agent mode**: multi-tool briefings such as "give me my morning briefing".
- **Conversation history** sidebar (up to 30 chats, 120 messages each), light and dark themes.
- **Installable PWA** with offline app shell.

## Quick start

1. Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Serve the folder over HTTP (service workers and the microphone need `https://` or `localhost`):

   ```bash
   python -m http.server 8000
   ```

   Then open <http://localhost:8000/index.html>.
3. On first load the app asks for your Gemini API key. It is stored only in your browser's `localStorage` (`jarvis_key`).

Opening `index.html` directly from disk also works for chat, but the service worker and install prompt only work over `http(s)`.

> **Sharing the app with other people?** Don't ask them for keys and don't put yours in the code. Use the [Cloudflare Worker proxy](#share-it-without-exposing-your-api-key-cloudflare-worker) below: your key stays on the server and visitors are never prompted.

## Share it without exposing your API key (Cloudflare Worker)

A tiny Worker in [worker/](worker) holds your Gemini key as a server-side secret. The web app calls the Worker instead of Google, so anyone with your GitHub Pages link can use it without a key, and the key never appears in the repo or the browser.

```
Browser (GitHub Pages)  ──►  Cloudflare Worker (holds GEMINI_API_KEY)  ──►  Gemini API
```

**Deploy it (about 5 minutes, free Cloudflare account):**

1. Install [Node.js](https://nodejs.org) 18 or newer, then sign in:

   ```bash
   cd worker
   npx wrangler login
   ```
2. Open [worker/wrangler.toml](worker/wrangler.toml) and set `ALLOWED_ORIGINS` to your site, for example `https://<your-user>.github.io` (exact origin, no path or trailing slash).
3. Store your key as a secret (it is prompted for, never written to a file):

   ```bash
   npx wrangler secret put GEMINI_API_KEY
   ```
4. Deploy and copy the URL it prints (like `https://jarvis-proxy.<subdomain>.workers.dev`):

   ```bash
   npx wrangler deploy
   ```
5. Put that URL in [config.js](config.js) and push:

   ```js
   window.JARVIS_CONFIG = { proxyUrl: 'https://jarvis-proxy.<subdomain>.workers.dev' };
   ```

When `proxyUrl` is empty the app falls back to asking each user for their own key.

**What the Worker enforces:** only your allowed site origins can call it; only the models listed in the Worker are accepted; only `model`, `input` and `system_instruction` are forwarded (no tools, no stored interactions); request size is capped at 8 MB; and each IP is limited to 10 requests per minute per Cloudflare location (change `limit` in `wrangler.toml`).

**Be aware of cost and quota:** everyone shares your key. On the free Gemini tier (for example 20 requests per day per model at the time of writing) a few visitors can use it up, and the app then shows a "quota used up" message. For a public link, enable billing in Google AI Studio and set a budget alert or quota cap, or keep the link private. The origin check stops other *websites* from using your Worker but cannot stop someone calling it from a script, so the rate limit and a budget cap are your real protection.

## Usage

| Action | How |
|---|---|
| Send a message | Type and press **Enter** (**Shift+Enter** for a new line) |
| One-time voice input | Click the microphone button |
| Hands-free mode | Toggle the wake word, then say "Hey Jarvis, ..." |
| Analyze an image | Click the image button, pick a photo, add an optional question |
| New chat / history | Sidebar → **New chat** or pick a recent conversation |
| Clear memory, change theme | Settings |

### Tools

| Say something like | Result |
|---|---|
| "open youtube", "open google", "open https://example.com" | Opens the site |
| "google search cats", "play <song>", "youtube <query>" | Opens search results |
| "search <topic>" | Wikipedia summary |
| "what time is it" | Current time (IST) |
| "weather" | Local temperature (asks for location permission) |
| "timer 5 minutes" | Spoken alert when done (max 24 hours) |
| "roll the dice", "flip a coin" | Random result |
| "joke", "quote" | Random joke or quote |
| "news" | Top tech headlines |
| "translate <text>" | English to Telugu |
| "100 dollars in rupees" | USD to INR |
| "meaning of <word>" | Dictionary definition |
| "generate a password" | Strong password (shown on screen, never spoken or saved) |
| "bitcoin price" | BTC in USD and INR |

Words like **agent**, **briefing**, **research** or **analyze** start agent mode, which plans which of the time, weather, news and crypto tools to run and summarizes the results.

## Project structure

```
index.html        App markup, sidebar, settings, PWA tags
style.css         Styling (dark and light themes)
script.js         Chat, tools, agent mode, vision, voice, memory
config.js         Public settings (Cloudflare Worker URL; never a key)
sw.js             Service worker (offline app shell, PWA install)
manifest.json     PWA manifest
assets/           App icons (192x192 and 512x512)
worker/           Cloudflare Worker proxy that keeps the API key secret
Jarvis-test.html  Standalone Gemini connection test page
mic-button.html   Scratch snippet of the button markup
```

## Configuration

Edit the constants at the top of [script.js](script.js):

| Constant | Purpose |
|---|---|
| `GEMINI_MODELS` | Models to try, in order |
| `GEMINI_REQUEST_TIMEOUT_MS` | Per-model timeout (default 10 s) |
| `GEMINI_SYSTEM_INSTRUCTION` | The assistant's personality and language style |

Free-tier Gemini limits are small (for example 20 requests per day per model at the time of writing). When a model returns a quota error the app skips it until it resets and uses the next one. If all are exhausted, wait or use a key with billing enabled.

## Install as an app (PWA)

1. Deploy over HTTPS (for example GitHub Pages) with `index.html`, `manifest.json`, `sw.js` and `assets/` **in the same folder**.
2. Open the site in Chrome on Android, reload once, then use the menu → **Install app**.
3. On iPhone, use Safari → Share → **Add to Home Screen**.

When you change `script.js` or `style.css`, bump the `?v=` value on their tags in `index.html` so browsers fetch the new files.

## Browser support

- Chat, tools and history work in any modern browser.
- Voice input and the wake word need the Web Speech API (Chrome and Edge, including Android).
- Weather needs location permission.

## Security notes

- Without the Worker, the API key lives in the visitor's browser, so anyone with access to that device or profile can read it. With the Worker, the key exists only as a Cloudflare secret.
- **Never commit an API key.** `Jarvis-test.html` hard-codes one for testing; remove the key (or delete the file) before committing or deploying, and rotate any key that has ever been in a public repo or shared in chat.
- Never put secrets such as bot tokens in client-side code (`config.js` is public).

## Known issues

- `index.html` loads an `orbs` script and stylesheet from a CDN URL that currently returns 404, so the animated orb is not shown. The app works without it.
