# Cursor Prompt — Polyscribe Chrome Extension

> **How to use this file:**
> 1. **First**, finish building and deploying the web app (use `CURSOR_PROMPT_WEBAPP.md`)
> 2. Generate an extension token at `https://your-deployed-domain.com/settings`
> 3. In Cursor, create a new project folder called `polyscribe-extension`
> 4. Open Cursor Composer / Agent mode (Cmd+I)
> 5. Copy EVERYTHING below the `=== PASTE FROM HERE ===` line into Cursor
> 6. Follow `SETUP_GUIDE.md` for installation in Chrome

---

=== PASTE FROM HERE ===

# Build: Polyscribe Chrome Extension (Manifest V3)

## Overview

Build a Chrome browser extension that adds AI-powered writing assistance (grammar check, tone adjustment, rewrite, Hebrew↔English translation) to ANY website where text can be entered. Hebrew RTL must work correctly. The extension talks to a backend API I've already built and deployed (a Next.js app).

The user selects text on any webpage (Gmail, ChatGPT, LinkedIn, WhatsApp Web, Google Docs, etc.), clicks the extension icon (or right-clicks → Polyscribe), and gets a popup with corrections, tone adjustments, rewrites, or translations they can copy back.

## Tech Stack

- **Manifest V3**
- **Vite** + `@crxjs/vite-plugin` for build tooling (handles MV3 manifest, hot reload)
- **TypeScript**
- **React 18** for the popup UI
- **Tailwind CSS** for popup styling
- Vanilla TS for the content script (max compatibility)
- `lucide-react` for icons

## File Structure

```
polyscribe-extension/
├── public/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
├── src/
│   ├── manifest.ts                # MV3 manifest as TS (crxjs reads this)
│   ├── background/
│   │   └── service-worker.ts      # context menus, message routing
│   ├── content/
│   │   ├── content-script.ts      # injected into every page
│   │   ├── floating-button.ts     # the small floating action button on text selection
│   │   └── result-overlay.ts      # the in-page popup showing AI results
│   ├── popup/
│   │   ├── index.html
│   │   ├── popup.tsx              # React entry
│   │   ├── App.tsx                # main popup component
│   │   ├── SettingsView.tsx       # settings (token, endpoint)
│   │   └── ManualCheckView.tsx    # paste-text-and-check fallback
│   ├── lib/
│   │   ├── api.ts                 # fetch wrappers for /api/check, /api/rewrite, etc.
│   │   ├── storage.ts             # chrome.storage.local helpers
│   │   ├── messaging.ts           # typed message passing between content/background/popup
│   │   └── types.ts
│   └── styles/
│       └── popup.css              # tailwind imports
├── vite.config.ts
├── tailwind.config.ts
├── package.json
└── README.md
```

## Manifest (MV3)

```ts
// src/manifest.ts
import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Polyscribe',
  version: pkg.version,
  description: 'Private AI writing assistant — grammar, tone, rewrite, translation across 17 languages. Powered by Claude.',
  icons: {
    16: 'public/icon-16.png',
    32: 'public/icon-32.png',
    48: 'public/icon-48.png',
    128: 'public/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: 'public/icon-32.png',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content-script.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'contextMenus', 'activeTab', 'scripting'],
  host_permissions: ['<all_urls>'],
});
```

## Storage Schema (chrome.storage.local)

```ts
// src/lib/types.ts
import type { LanguageCode } from './languages';

export type Settings = {
  apiBaseUrl: string;              // e.g. "https://polyscribe.app"
  apiToken: string;                // long-lived extension token from web app /settings
  defaultLanguage: 'auto' | LanguageCode;        // for grammar-check
  defaultTranslateSource: 'auto' | LanguageCode; // for translation source
  defaultTranslateTarget: LanguageCode;          // for translation target
  enableFloatingButton: boolean;
  autoCheckOnSelection: boolean;   // NEW: auto-run grammar check when user selects text
  defaultTone: 'formal' | 'casual' | 'friendly' | 'professional' | 'concise';
};

export const DEFAULT_SETTINGS: Settings = {
  apiBaseUrl: 'https://polyscribe.app',
  apiToken: '',
  defaultLanguage: 'auto',
  defaultTranslateSource: 'auto',
  defaultTranslateTarget: 'en',
  enableFloatingButton: true,
  autoCheckOnSelection: true,      // ON by default — this is our automation edge
  defaultTone: 'professional',
};
```

The glossary is managed in the web app (`/glossary`), not the extension. Extension-initiated translations automatically inherit the glossary because the backend loads it server-side from the authenticated user's Supabase row. No duplication, no sync needed.

## Content Script Behavior

### The floating action button (FAB)

1. On page load, inject minimal CSS into a Shadow DOM (isolated from host page styles). Use very high z-index.
2. Listen for `mouseup` and `selectionchange` events on the page. When the user selects text (>= 3 characters):
   - Show a small, subtle floating button near the top-right corner of the selection rect
   - **Button size: 20×20px** (smaller than Phase 1's 28px — less intrusive)
   - Uses the Polyscribe P mark in a subtle teal circle
   - Slight drop shadow for visibility; 85% opacity, 100% on hover
   - Disappears immediately when selection is cleared or user clicks elsewhere
3. On click → opens the in-page overlay with action buttons: Check / Rewrite / Tone / Translate (the overlay shows where the FAB was)

### Auto-check mode (opt-in, default ON)

When `autoCheckOnSelection` is enabled in settings (default: true):

1. When the user selects text (>= 10 characters), automatically run `/api/check` in the background after a 600ms debounce. This prevents spamming the API while the user is actively selecting/resizing.
2. If issues are found:
   - The floating button changes from its neutral P mark to a **small red badge showing issue count** (e.g., ⚠ 3)
   - Clicking it directly opens the overlay with check results already loaded — no extra step
3. If zero issues:
   - The button briefly shows a green checkmark for 1 second ("looks good"), then disappears
   - Reduces noise — user only sees the button when they need it
4. User can disable auto-check in settings if preferred; then the FAB appears on any selection and requires explicit click → action choice.

**Cost control:** auto-check has a per-page limit (20 auto-checks per page-load) to prevent runaway API usage. After limit, falls back to manual mode with a small "quota reached on this page — click to check manually" tooltip. Resets on page reload.

**Privacy boundary:** auto-check ONLY runs when user actively selects text. Never on keystrokes, never on page content the user hasn't touched. Nothing is sent to the backend without an active user selection.

### Overlay behavior

4. When an action is clicked (or auto-check completes), send a message to the service worker with the text + action. Service worker calls the API and returns the result.
5. Show results in the overlay:
   - For Check: list of issues with Apply buttons (apply re-inserts the corrected text into the originating element via `document.execCommand('insertText')` for compatibility, with fallback to clipboard copy). **Each issue also shows a small flag badge (🇮🇱 / 🇺🇸 / etc.) indicating detected language.**
   - For Rewrite/Tone/Translate: show result with Copy and Replace buttons
6. RTL handling: detect if the selected text contains Hebrew or Arabic chars; if so, render the overlay content with `dir="rtl"`. UI chrome of the overlay (close button, tabs) stays LTR.

### Site-specific handling

7. Special-case handling:
   - **Gmail compose:** uses contenteditable divs, `execCommand('insertText')` works
   - **Google Docs:** has a custom canvas-based renderer — can't directly inject text. Fallback: copy to clipboard + show "Copied — paste with ⌘V"
   - **ChatGPT:** uses textarea, easy
   - **LinkedIn / X / Facebook:** contenteditable, works
   - **WhatsApp Web:** contenteditable, works
   - **Twitter/X compose:** avoid auto-check on very short text (tweets are often intentionally casual and we don't want to nag)

   Detect Google Docs by URL (`docs.google.com/document`) and switch to clipboard-only mode automatically.

8. The floating button AND auto-check can each be disabled independently in settings. If both are off, the user must use the right-click context menu or the extension popup as entry points.

## Service Worker

- Sets up context menu items on install:
  - "Polyscribe: Check grammar"
  - "Polyscribe: Rewrite"
  - "Polyscribe: Adjust tone" (submenu with 5 tones)
  - "Polyscribe: Translate" (submenu — see Translation Menu below)
- Handles messages from content script and popup
- Calls the API with the user's stored token

### Translation Menu (context menu submenu)

Rather than cramming 17 "Translate to X" items into the right-click menu, use a **smart two-tier approach**:

**Tier 1 — always visible in the submenu (top 4 quick actions):**
- "→ English"
- "→ Hebrew"
- "→ [user's default target language from settings]" (hidden if already one of the above)
- "Choose language…" — opens the in-page overlay's translation panel with all 17 options

**Tier 2 — the overlay's translate panel** shows all 17 languages with a `<LanguageSelect>` dropdown, swap button, and auto-detect, matching the web app's `<TranslatePanel>`. This is the full-featured entry point.

Source language is always auto-detected for the quick actions (Tier 1). Target is explicit.

```ts
// src/lib/languages.ts — mirror of the web app's SUPPORTED_LANGUAGES
export const SUPPORTED_LANGUAGES = {
  en: { name: 'English', flag: '🇺🇸', rtl: false },
  he: { name: 'Hebrew',  flag: '🇮🇱', rtl: true  },
  es: { name: 'Spanish', flag: '🇪🇸', rtl: false },
  ar: { name: 'Arabic',  flag: '🇸🇦', rtl: true  },
  fr: { name: 'French',  flag: '🇫🇷', rtl: false },
  de: { name: 'German',  flag: '🇩🇪', rtl: false },
  it: { name: 'Italian', flag: '🇮🇹', rtl: false },
  ru: { name: 'Russian', flag: '🇷🇺', rtl: false },
  zh: { name: 'Chinese', flag: '🇨🇳', rtl: false },
  ja: { name: 'Japanese',flag: '🇯🇵', rtl: false },
  pt: { name: 'Portuguese', flag: '🇵🇹', rtl: false },
  nl: { name: 'Dutch',   flag: '🇳🇱', rtl: false },
  pl: { name: 'Polish',  flag: '🇵🇱', rtl: false },
  tr: { name: 'Turkish', flag: '🇹🇷', rtl: false },
  ko: { name: 'Korean',  flag: '🇰🇷', rtl: false },
  el: { name: 'Greek',   flag: '🇬🇷', rtl: false },
  ro: { name: 'Romanian',flag: '🇷🇴', rtl: false },
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;
export const RTL_CODES: LanguageCode[] = ['he', 'ar'];
```

## API Client (`src/lib/api.ts`)

```ts
import { getSettings } from './storage';
import type { LanguageCode } from './languages';

async function apiCall<T>(path: string, body: unknown): Promise<T> {
  const { apiBaseUrl, apiToken } = await getSettings();
  if (!apiBaseUrl || !apiToken) {
    throw new Error('Polyscribe is not configured. Open the extension popup and add your API URL and token.');
  }
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error ${res.status}: ${errText}`);
  }
  return res.json();
}

export const checkText = (text: string, language = 'auto') =>
  apiCall<CheckResponse>('/api/check', { text, language });
export const rewriteText = (text: string, instruction: string) =>
  apiCall<RewriteResponse>('/api/rewrite', { text, instruction });
export const adjustTone = (text: string, tone: string) =>
  apiCall<RewriteResponse>('/api/tone', { text, tone });
export const translateText = (
  text: string,
  from: LanguageCode | 'auto',
  to: LanguageCode
) => apiCall<TranslateResponse>('/api/translate', { text, from, to });
```

### In-page Translate Panel (overlay)

When the user clicks "🌐 Translate" in the action buttons, or "Choose language…" from the context menu, the overlay switches to translation mode:

```
┌─────────────────────────────────────┐
│ [🌐 Auto-detect ▼]  [↔]  [🇺🇸 EN ▼] │
├─────────────────────────────────────┤
│ <selected text, editable>           │
│ Detected: 🇪🇸 Spanish  •  47 words   │
├─────────────────────────────────────┤
│           [Translate]               │
├─────────────────────────────────────┤
│ <translation result>                │
│ [Copy] [Replace on page] [Insert]   │
│ Preserved: ProvenVA, Polyscribe     │
└─────────────────────────────────────┘
```

- Default target = user's setting (`defaultTargetLanguage`, fallback English)
- Default source = `auto`
- Swap button works exactly like in the web app
- RTL target (Hebrew, Arabic) → result pane flips to `dir="rtl"`
- "Replace on page" re-inserts translation via `execCommand('insertText')`; on Google Docs falls back to clipboard-only
- Remembers last-used source/target in `chrome.storage.local` per site (so translating on Gmail can default differently than on ChatGPT)

## Popup UI (React)

### Header bar (persistent, visible on all tabs)

At the top of the popup, always visible:

```
┌─────────────────────────────────────┐
│ 🅿 Polyscribe          [⚙] [↗ Open] │
└─────────────────────────────────────┘
```

- **`↗ Open` button** — a prominent button that opens `{apiBaseUrl}` (default `https://polyscribe.app`) in a new tab. This is the **web-app shortcut** — one click from anywhere to the full editor.
- **`⚙` button** — jumps to Settings tab
- **Logo+name** — clicking returns to the Quick Check tab

### Three-tab interface

1. **Quick Check** (default tab)
   - Large textarea for pasting text (auto-focused)
   - Big "Check" button (Cmd+Enter shortcut)
   - Dropdown to switch action: Check / Rewrite / Adjust Tone / Translate
   - Results below with Apply All / Copy buttons
   - "Open this in polyscribe.app →" link below results, which passes the text via URL query param to the web editor for full-document work

2. **Settings**
   - **API & Auth section:**
     - API Base URL input (default `https://polyscribe.app`)
     - API Token input (paste from the web app `/settings` page)
     - "Test connection" button (calls a `/api/health` endpoint that returns user identity)
   - **Automation section (NEW):**
     - ☑️ **Auto-check on selection** (default ON) — "When I select text, check grammar automatically and show a badge if issues are found. Turn off for manual-only mode."
     - ☑️ **Enable floating button** (default ON) — "Show the small Polyscribe button when I select text."
     - Number input: **Auto-check quota per page** (default 20, range 5-100) — "Prevents runaway checks while scrolling."
   - **Language defaults section:**
     - Default grammar-check language dropdown (auto-detect + 17 languages)
     - Default translation source dropdown (Auto-detect + 17 languages)
     - Default translation target dropdown (17 languages)
   - **Preferences section:**
     - Default tone dropdown
     - Link: "Manage glossary on polyscribe.app ↗"
   - Save button (sticky at bottom)

3. **About**
   - Version number, tagline ("Writing assistant for the other 94% of the world's languages")
   - Big button: **"Open polyscribe.app →"** (prominent, full-width)
   - Links: Support, Privacy Policy, Terms, GitHub
   - Brief keyboard shortcut reference

Show a setup banner at the top if API token is missing. The API URL has a sensible default (`https://polyscribe.app`) so users don't need to configure it — only the token is required.

## In-Page Overlay Styling

### Floating Action Button (FAB) — small and subtle

- **Size: 20×20px** (smaller than typical — less intrusive)
- Circular, teal background `#0d9488` (matches web app accent)
- White "P" mark in the center (or a simplified logo SVG)
- **Opacity: 85% at rest, 100% on hover**
- Drop shadow: `0 2px 8px rgba(0,0,0,0.15)` for subtle elevation
- Position: 8px offset from top-right of selection bounding box
- Auto-hides when selection clears or user clicks elsewhere
- **When auto-check finds issues:** button grows to 24×24px and shows a small red number badge (`⚠ 3`) in the top-right corner. Total visual footprint stays under 30px.
- **When auto-check finds no issues:** button briefly shows a green checkmark for 1 second, then fades out.

### Overlay card — shown on FAB click

A small floating card (~360px wide, max 500px tall, scrollable):
- White background, near-black text, soft shadow
- Top-right close button (×)
- Top-left: compact Polyscribe logo + small "Open in web app ↗" link that transfers the current text to polyscribe.app
- Action buttons across top: ✓ Check / ✎ Rewrite / 🎨 Tone / 🌐 Translate (use lucide-react SVG inlined for content script)
- Loading state: subtle pulsing dots
- Position: anchored to the selection, flips above/below/left/right based on viewport space
- Click outside or press Escape to close

CRITICAL: Use Shadow DOM for the overlay so the host page's CSS can't break our styles. Use a single root element with a Shadow DOM and inject all styles inside.

## Build & Distribution

- `npm run build` produces `dist/` folder
- User loads `dist/` as an unpacked extension in `chrome://extensions/` with Developer Mode on
- Include in README: how to load unpacked, how to update after rebuilds (just hit refresh on the extensions page)

## Edge Cases

- Selection inside an iframe — the content script is injected into iframes by default, but make sure overlay positioning accounts for it
- Selection on a PDF in the browser — gracefully fail or skip
- User selects text in our own popup — ignore (the popup is a different context)
- Token revoked: API returns 401 → show toast "Your token was revoked. Update it in the popup settings."
- Long text (>3000 chars) sent: show warning before sending, "This will use ~X tokens"
- The site uses CSP that blocks our overlay styles → fallback to inline styles

## README.md

Include:
1. What it is
2. How to build (`npm install`, `npm run build`)
3. How to load in Chrome (chrome://extensions → Developer mode → Load unpacked → select `dist/`)
4. How to configure (open popup → Settings → paste URL and token from web app)
5. How to use (select text on any page → click floating button OR right-click → Polyscribe → choose action)
6. Troubleshooting (Google Docs limitation, CSP issues, token errors)

---

After scaffolding, run `npm install` and `npm run build`. Report any TypeScript errors. Confirm the dist/ folder produces a loadable Chrome extension.

=== END OF PROMPT ===
