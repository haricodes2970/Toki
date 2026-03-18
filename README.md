# ⚡ Toki – AI Usage Monitor

> Real-time token usage tracker and smart prompt optimizer for ChatGPT, Gemini, Claude, and Grok.

![Toki Overlay](https://img.shields.io/badge/MV3-Chrome%20Extension-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4-06B6D4)

---

## What it does

AI tools like ChatGPT and Claude don't show you how close you are to your daily usage limit — until you hit it. Toki fixes that.

- 🔋 **Battery-style overlay** on every AI site showing % of daily limit used
- ⚡ **Live token counting** as you type — before you click send
- ⚠️ **Pre-send warnings** when a prompt would push you over 80%
- ✨ **Prompt optimizer** — detects filler phrases, verbose patterns, and more
- 📊 **Full dashboard** with weekly charts, streak counter, and CSV export
- 🔄 **Auto-reset** at midnight using `chrome.alarms`
- 🔒 **100% local** — no servers, no analytics, no data leaves your device

---

## Supported Sites

| Site | Input Detection | Submit Detection |
|---|---|---|
| [ChatGPT](https://chatgpt.com) | `#prompt-textarea` (textarea) | `[data-testid="send-button"]` |
| [Claude](https://claude.ai) | `.ProseMirror` (contenteditable) | `button[aria-label="Send Message"]` |
| [Gemini](https://gemini.google.com) | `.ql-editor` / `rich-textarea` | `button[aria-label="Send message"]` |
| [Grok](https://grok.x.ai) | `textarea` / contenteditable | `button[aria-label="Send"]` |

---

## Install (Development)

### Prerequisites

- Node.js 18+
- Chrome 120+

### Setup

```bash
git clone https://github.com/haricodes2970/Toki.git
cd Toki
npm install
```

### Build

```bash
# Development (watch mode)
npm run dev

# Production
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder

---

## Project Structure

```
src/
├── background.ts          # Service worker – storage, alarms, daily reset
├── content.ts             # Injected into AI sites – DOM observation, tracking
├── adapters/              # Per-site DOM adapters (ChatGPT, Claude, Gemini, Grok)
│   ├── base.ts
│   ├── chatgpt.ts
│   ├── claude.ts
│   ├── gemini.ts
│   └── grok.ts
├── overlay/               # Floating React overlay (Shadow DOM isolated)
│   ├── Overlay.tsx
│   ├── WarningToast.tsx
│   ├── PreSendWarning.tsx
│   ├── mountOverlay.ts
│   ├── tokenizer.ts       # js-tiktoken WASM + char/4 fallback
│   └── optimizer.ts       # Rule-based prompt analyzer
├── popup/                 # Toolbar popup (Usage + Settings tabs)
│   ├── popup.html
│   └── Popup.tsx
├── dashboard/             # Full-page dashboard (recharts, CSV export)
│   ├── dashboard.html
│   └── Dashboard.tsx
└── shared/
    ├── types.ts
    ├── constants.ts
    ├── logger.ts          # Dev-only logging (stripped in production)
    └── errors.ts
```

---

## Architecture

```
User types
  → content.ts (input listener)
    → tokenizer.ts (js-tiktoken WASM)
      → toki:prompt-update (CustomEvent)
        → Overlay.tsx (live battery bar update)

User clicks Send
  → content.ts (submit interceptor)
    → toki:pre-send (CustomEvent)
      → Overlay.tsx → PreSendWarning.tsx
        → user confirms → toki:pre-send-confirmed
          → background.ts (chrome.storage.local)
            → toki:usage-recorded → Overlay.tsx (counters updated)
```

---

## Storage

| Key | Store | Contents |
|---|---|---|
| `toki_settings` | `sync` + `local` mirror | Limits, threshold, overlay prefs |
| `toki_usage` | `local` | Today's `{ site::YYYY-MM-DD: UsageRecord }` |
| `toki_history` | `local` | Archived records (90-day rolling window) |

---

## Privacy

All data is stored locally on your device. No network requests are made. See [PRIVACY.md](./PRIVACY.md) for the full policy.

---

## Roadmap

- [ ] Cross-device sync via Supabase (opt-in)
- [ ] ML-based usage prediction ("you'll hit your limit by 3 PM")
- [ ] Best-time-to-prompt recommendations
- [ ] Firefox MV3 support
- [ ] Edge extension store listing

---

## License

MIT © Hari
