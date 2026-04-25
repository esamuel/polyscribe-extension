# Polyscribe (Chrome Extension, MV3)

Private AI writing assistant for the browser: grammar check, tone adjustment, rewrite, and **translation across 17 languages** (see `src/lib/languages.ts`, aligned with the web app). Optional **auto-check on text selection** (debounced) shows a small teal floating button with a red issue badge when the API finds problems. The extension calls your deployed Polyscribe Next.js API using a long-lived token.

## What it is

- **Manifest V3** extension built with **Vite** + **@crxjs/vite-plugin**
- **React 18 + Tailwind** popup; **vanilla TypeScript** content script for maximum site compatibility
- **Shadow DOM** in-page overlay so host CSS cannot break the UI
- **RTL** when Hebrew or Arabic is detected in the selection
- **Google Docs** is detected (`docs.google.com/document`) and uses clipboard-first replacement with clear messaging

## Build

```bash
npm install
npm run build
```

This generates a loadable extension in `dist/`.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder from this project

After rebuilding, open `chrome://extensions` and click **Reload** on Polyscribe.

## Configure

1. Click the Polyscribe toolbar icon
2. Open **Settings**
3. **API base URL** defaults to `https://polyscribe.app` — set your own (e.g. Vercel) if needed
4. Paste your **API token** from the web app (required)
5. Use **Test connection** (`GET /api/health`) then **Save**
6. Adjust **automation** (auto-check, floating button, quota) and **language defaults** (17 languages) as needed

## Use

- Select text on any page (Gmail, ChatGPT, LinkedIn, WhatsApp Web, etc.)
- Click the **floating button** near the selection (optional — can be disabled in Settings), **or**
- Right-click → **Polyscribe** → e.g. **Check grammar**, **Translate** (with quick targets + **Choose language…** for all 17)
- Copy results or use **Replace** where the page allows direct editing

## Troubleshooting

- **Google Docs**: Docs renders on a canvas; the extension cannot reliably insert text. Use **Copy** and paste with ⌘V / Ctrl+V.
- **Strict CSP / odd styling**: The overlay uses Shadow DOM and bundled styles; if a site interferes, use the popup **Quick check** flow or copy/paste.
- **401 / token errors**: Regenerate your token in the web app and update **Settings**.
- **Some pages (e.g. `chrome://`)**: Extensions cannot inject content scripts there; use the popup fallback.

## Repo

Replace the placeholder GitHub link in the popup **About** tab with your repository URL when you publish.
