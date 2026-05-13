import {
  MSG,
  isPolyscribeError,
  type PolyscribeRequest,
  type PolyscribeResponse,
} from '../lib/messaging';
import type { CheckResponse, RewriteResponse, TranslateResponse } from '../lib/types';
import { getSettings } from '../lib/storage';
import {
  flagForLanguageCode,
  isRtlLanguageCode,
  LANGUAGE_CODES,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from '../lib/languages';
import { getSiteTranslatePrefs, setSiteTranslatePrefs } from '../lib/site-prefs';
import { applyTextToRange } from './apply-text';
import { iconSvg } from './icons';
import { contentNeedsRtl } from './selection-utils';

const HOST_ID = 'polyscribe-overlay-host';
const LONG_THRESHOLD = 3000;

function shadowStyles(): string {
  return `
    :host {
      all: initial;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #111827;
    }
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      background: transparent;
    }
    .card {
      position: fixed;
      z-index: 2147483647;
      width: min(360px, calc(100vw - 24px));
      max-height: min(500px, calc(100vh - 24px));
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: #ffffff;
      color: #111827;
      border-radius: 12px;
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.06);
    }
    .hdr {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      background: #fafafa;
    }
    .title { font-weight: 600; font-size: 13px; }
    .iconbtn {
      all: unset;
      cursor: pointer;
      display: inline-flex;
      padding: 4px;
      border-radius: 8px;
      color: #374151;
    }
    .iconbtn:hover { background: #e5e7eb; }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    .tab {
      all: unset;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
      color: #374151;
      background: #f3f4f6;
      border: 1px solid transparent;
    }
    .tab[data-active="true"] {
      background: #eef2ff;
      color: #3730a3;
      border-color: #c7d2fe;
    }
    .body {
      padding: 12px;
      overflow: auto;
      flex: 1;
      min-height: 0;
      min-width: 0;
    }
    .muted { color: #6b7280; font-size: 12px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .btn {
      all: unset;
      cursor: pointer;
      box-sizing: border-box;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      background: #4f46e5;
      color: #fff;
      text-align: center;
    }
    .btn.secondary { background: #e5e7eb; color: #111827; }
    .btn:disabled { opacity: 0.55; cursor: not-allowed; }
    textarea.input {
      width: 100%;
      min-height: 72px;
      resize: vertical;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 8px;
      font: inherit;
      box-sizing: border-box;
    }
    .issue {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 10px;
      margin-top: 10px;
      background: #fafafa;
    }
    .issue p { margin: 0 0 8px; }
    .dots {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding: 8px 0;
    }
    .dots i {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #6366f1;
      opacity: 0.25;
      animation: p 1s infinite ease-in-out;
    }
    .dots i:nth-child(2) { animation-delay: 0.15s; }
    .dots i:nth-child(3) { animation-delay: 0.3s; }
    @keyframes p {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.25; }
      40% { transform: translateY(-3px); opacity: 0.9; }
    }
    .toast {
      position: fixed;
      z-index: 2147483647;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      max-width: min(420px, calc(100vw - 24px));
      background: #111827;
      color: #fff;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 13px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.25);
    }
    .warn {
      border: 1px solid #f59e0b;
      background: #fffbeb;
      color: #92400e;
      border-radius: 10px;
      padding: 10px;
      font-size: 12px;
      margin-top: 10px;
    }
    pre.result {
      display: block;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
      margin: 0;
      padding: 10px;
      border-radius: 10px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .subhdr { padding: 0 12px 8px; border-bottom: 1px solid #e5e7eb; background: #fafafa; }
    .extlink { font-size: 11px; color: #4f46e5; text-decoration: none; cursor: pointer; }
    .extlink:hover { text-decoration: underline; }
    .langbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
    .select {
      font: inherit; font-size: 12px; padding: 6px 8px; border-radius: 8px;
      border: 1px solid #d1d5db; background: #fff; max-width: 140px;
    }
    .issue-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .fbadge { font-size: 14px; line-height: 1; }
  `;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function formatRuntimeError(message: string | undefined): string {
  const m = message ?? '';
  if (/context invalidated/i.test(m)) {
    return 'Polyscribe was reloaded. Refresh this page (⌘R or F5), then try again.';
  }
  return m || 'Extension messaging failed.';
}

async function sendRequest(req: PolyscribeRequest): Promise<PolyscribeResponse> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(req, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) {
          resolve({
            ok: false,
            error: formatRuntimeError(err.message),
            code: 'NETWORK',
          });
          return;
        }
        resolve(resp as PolyscribeResponse);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      resolve({
        ok: false,
        error: formatRuntimeError(msg),
        code: 'NETWORK',
      });
    }
  });
}

type OverlayCtx = {
  range: Range | null;
  text: string;
  googleDocsMode: boolean;
};

export class PolyscribeOverlay {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private ctx: OverlayCtx | null = null;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };
  private onDocDown = (e: MouseEvent) => {
    const path = e.composedPath();
    if (!path.includes(this.host)) this.close();
  };

  private el: {
    card: HTMLElement;
    body: HTMLElement;
    backdrop: HTMLElement;
    tabs: HTMLElement;
  };

  private activeTab: 'check' | 'ai-tells' | 'rewrite' | 'tone' | 'translate' = 'check';

  constructor() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      host.setAttribute('data-polyscribe', 'overlay');
      document.documentElement.appendChild(host);
    }
    this.host = host;
    this.shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });

    this.shadow.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = shadowStyles();
    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('dir', 'ltr');

    card.innerHTML = `
      <div class="hdr">
        <div class="title">Polyscribe</div>
        <button type="button" class="iconbtn" data-close aria-label="Close">${iconSvg.close}</button>
      </div>
      <div class="subhdr"><a class="extlink" data-app-link href="#" rel="noreferrer">Open in web app ↗</a></div>
      <div class="tabs"></div>
      <div class="body"></div>
    `;

    const tabs = card.querySelector('.tabs') as HTMLElement;
    const body = card.querySelector('.body') as HTMLElement;
    const closeBtn = card.querySelector('[data-close]') as HTMLButtonElement;
    const appLink = card.querySelector('[data-app-link]') as HTMLAnchorElement;
    appLink.addEventListener('click', (e) => {
      e.preventDefault();
      void this.openWebApp();
    });

    closeBtn.addEventListener('click', () => this.close());

    this.shadow.appendChild(style);
    this.shadow.appendChild(backdrop);
    this.shadow.appendChild(card);

    this.el = { card, body, backdrop, tabs };
    backdrop.addEventListener('mousedown', (e) => e.preventDefault());
  }

  open(
    ctx: OverlayCtx,
    anchorRect: DOMRect,
    options?: { startTab?: 'check' | 'ai-tells' | 'rewrite' | 'tone' | 'translate'; checkResult?: CheckResponse },
  ): void {
    this.ctx = ctx;
    const rtl = contentNeedsRtl(ctx.text);
    this.el.card.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    this.el.tabs.style.display = '';

    this.renderTabs();
    if (options?.checkResult) {
      this.activeTab = 'check';
      for (const b of Array.from(this.el.tabs.querySelectorAll('.tab'))) {
        const el = b as HTMLElement;
        el.dataset.active = el.dataset.mode === 'check' ? 'true' : 'false';
      }
      this.renderCheckResult(ctx.text, options.checkResult);
    } else {
      this.setMode(options?.startTab ?? 'check');
    }
    this.positionNear(anchorRect);

    this.host.style.display = '';
    window.addEventListener('keydown', this.onKey, true);
    document.addEventListener('mousedown', this.onDocDown, true);

    const closeBtn = this.el.card.querySelector('[data-close]') as HTMLButtonElement;
    closeBtn.innerHTML = iconSvg.close;
  }

  /** Context menu: open only the full translate UI (17 languages). */
  openTranslateChooser(ctx: OverlayCtx, anchorRect: DOMRect): void {
    this.open(ctx, anchorRect, { startTab: 'translate' });
  }

  private async openWebApp(): Promise<void> {
    const t = this.ctx?.text?.trim() ?? '';
    const s = await getSettings();
    const base = s.apiBaseUrl.replace(/\/$/, '') || 'https://polyscribe.app';
    const url = t
      ? `${base}/editor?text=${encodeURIComponent(t.slice(0, 50_000))}`
      : `${base}/editor`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /** Context menu: API was already called in the service worker — show the result immediately. */
  openWithPrefetch(
    ctx: OverlayCtx,
    anchorRect: DOMRect,
    req: PolyscribeRequest,
    resp: PolyscribeResponse,
  ): void {
    this.ctx = ctx;
    const rtl = contentNeedsRtl(ctx.text);
    this.el.card.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    this.el.tabs.style.display = 'none';
    this.positionNear(anchorRect);

    this.host.style.display = '';
    window.addEventListener('keydown', this.onKey, true);
    document.addEventListener('mousedown', this.onDocDown, true);

    const closeBtn = this.el.card.querySelector('[data-close]') as HTMLButtonElement;
    closeBtn.innerHTML = iconSvg.close;

    if (isPolyscribeError(resp)) {
      if (resp.code === 'UNAUTHORIZED') {
        this.toast('Your token was revoked. Update it in the popup settings.');
      } else {
        this.toast(resp.error);
      }
      this.el.body.innerHTML = `<div class="muted">Could not complete the request.</div>`;
      return;
    }

    if (req.type === MSG.HEALTH) {
      this.el.body.innerHTML = `<div class="muted">Unexpected health response.</div>`;
      return;
    }

    if (req.type === MSG.CHECK || req.type === MSG.AI_CHECK) {
      this.renderCheckResult(ctx.text, resp.data as CheckResponse);
      return;
    }
    if (req.type === MSG.REWRITE) {
      this.renderTextResult('Rewrite', ctx.text, (resp.data as RewriteResponse).text);
      return;
    }
    if (req.type === MSG.TONE) {
      this.renderTextResult('Tone', ctx.text, (resp.data as RewriteResponse).text);
      return;
    }
    if (req.type === MSG.TRANSLATE) {
      this.renderTranslateResult(
        resp.data as TranslateResponse,
        (req as { to: string }).to as LanguageCode,
      );
      return;
    }
  }

  close(): void {
    this.ctx = null;
    this.host.style.display = 'none';
    this.el.body.innerHTML = '';
    window.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('mousedown', this.onDocDown, true);
    this.onCloseCallback?.();
  }

  private onCloseCallback: (() => void) | null = null;
  onClose(handler: () => void): void {
    this.onCloseCallback = handler;
  }

  private positionNear(rect: DOMRect): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const cardW = Math.min(360, vw - 24);
    const cardH = 420;

    // If we somehow got a zero/garbage rect, center the card so it's at
    // least visible. Beats stranding it in a corner.
    const degenerate =
      !Number.isFinite(rect.left) ||
      !Number.isFinite(rect.top) ||
      (rect.width === 0 && rect.height === 0 && rect.left === 0 && rect.top === 0);
    if (degenerate) {
      const cx = Math.max(margin, (vw - cardW) / 2);
      const cy = Math.max(margin, (vh - cardH) / 2);
      this.el.card.style.left = `${Math.round(cx)}px`;
      this.el.card.style.top = `${Math.round(cy)}px`;
      return;
    }

    // Preferred: to the right of the anchor, top-aligned to anchor top.
    let left = rect.right + 8;
    let top = rect.top;

    // If overflows right edge, flip to the left side of the anchor.
    if (left + cardW > vw - margin) left = rect.left - cardW - 8;
    // If overflows left edge (anchor is far-left or flipped past 0), pin to margin.
    if (left < margin) left = margin;
    // If overflows bottom, push up so the full card stays in view.
    if (top + cardH > vh - margin) top = vh - margin - cardH;
    // If overflows top, pin to margin.
    if (top < margin) top = margin;

    this.el.card.style.left = `${Math.round(left)}px`;
    this.el.card.style.top = `${Math.round(top)}px`;
  }

  private renderTabs(): void {
    const tabs = this.el.tabs;
    tabs.innerHTML = '';
    const mk = (id: typeof this.activeTab, label: string, svg: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.dataset.mode = id;
      b.innerHTML = `${svg}<span>${label}</span>`;
      b.addEventListener('click', () => {
        this.setMode(id);
      });
      tabs.appendChild(b);
    };
    mk('check', 'Check', iconSvg.check);
    mk('ai-tells', 'AI tells', iconSvg.sparkles);
    mk('rewrite', 'Rewrite', iconSvg.pencil);
    mk('tone', 'Tone', iconSvg.palette);
    mk('translate', 'Translate', iconSvg.globe);
  }

  private setMode(mode: typeof this.activeTab): void {
    this.activeTab = mode;
    for (const b of Array.from(this.el.tabs.querySelectorAll('.tab'))) {
      const el = b as HTMLElement;
      el.dataset.active = el.dataset.mode === mode ? 'true' : 'false';
    }
    this.renderModeBody();
  }

  private renderModeBody(): void {
    const text = this.ctx?.text ?? '';
    const body = this.el.body;
    body.innerHTML = '';

    if (this.activeTab === 'check') {
      body.innerHTML = `<div class="muted">Grammar and style check for the selected text.</div>`;
      const row = document.createElement('div');
      row.className = 'row';
      const go = document.createElement('button');
      go.className = 'btn';
      go.textContent = 'Run check';
      go.addEventListener('click', () => void this.runCheck(text));
      row.appendChild(go);
      body.appendChild(row);
      return;
    }

    if (this.activeTab === 'ai-tells') {
      body.innerHTML = `<div class="muted">Flag stock phrases, generic openers, em-dash clusters, and other AI-tells.</div>`;
      const row = document.createElement('div');
      row.className = 'row';
      const go = document.createElement('button');
      go.className = 'btn';
      go.textContent = 'Find AI tells';
      go.addEventListener('click', () => void this.runAiCheck(text));
      row.appendChild(go);
      body.appendChild(row);
      return;
    }

    if (this.activeTab === 'rewrite') {
      body.innerHTML = `<div class="muted">Describe how you want this rewritten.</div>`;
      const ta = document.createElement('textarea');
      ta.className = 'input';
      ta.value = 'Improve clarity and flow while preserving meaning.';
      body.appendChild(ta);
      const row = document.createElement('div');
      row.className = 'row';
      const go = document.createElement('button');
      go.className = 'btn';
      go.textContent = 'Rewrite';
      go.addEventListener('click', () => void this.runRewrite(text, ta.value.trim()));
      row.appendChild(go);
      body.appendChild(row);
      return;
    }

    if (this.activeTab === 'tone') {
      body.innerHTML = `<div class="muted">Pick a tone.</div>`;
      const row = document.createElement('div');
      row.className = 'row';
      for (const tone of ['formal', 'casual', 'friendly', 'professional', 'concise'] as const) {
        const b = document.createElement('button');
        b.className = 'btn secondary';
        b.textContent = tone[0].toUpperCase() + tone.slice(1);
        b.addEventListener('click', () => void this.runTone(text, tone));
        row.appendChild(b);
      }
      body.appendChild(row);
      return;
    }

    void this.renderTranslatePanel(text).catch(() => undefined);
  }

  private async renderTranslatePanel(text: string): Promise<void> {
    const body = this.el.body;
    body.innerHTML = `<div class="muted">Set source and target, then translate.</div>`;
    const s = await getSettings();
    const site = await getSiteTranslatePrefs(location.hostname);
    const from0 = site?.from ?? s.defaultTranslateSource;
    const to0 = site?.to ?? s.defaultTranslateTarget;
    const bar = document.createElement('div');
    bar.className = 'langbar';
    const fromSel = document.createElement('select');
    fromSel.className = 'select';
    fromSel.setAttribute('aria-label', 'Source language');
    const optAuto = document.createElement('option');
    optAuto.value = 'auto';
    optAuto.textContent = '🌐 Auto-detect';
    fromSel.appendChild(optAuto);
    for (const code of LANGUAGE_CODES) {
      const o = document.createElement('option');
      o.value = code;
      o.textContent = `${SUPPORTED_LANGUAGES[code].flag} ${SUPPORTED_LANGUAGES[code].name}`;
      fromSel.appendChild(o);
    }
    fromSel.value = from0 === 'auto' ? 'auto' : (from0 in SUPPORTED_LANGUAGES ? from0 : 'auto');
    const swap = document.createElement('button');
    swap.type = 'button';
    swap.className = 'btn secondary';
    swap.textContent = '↔';
    swap.title = 'Swap';
    const toSel = document.createElement('select');
    toSel.className = 'select';
    toSel.setAttribute('aria-label', 'Target language');
    for (const code of LANGUAGE_CODES) {
      const o = document.createElement('option');
      o.value = code;
      o.textContent = `${SUPPORTED_LANGUAGES[code].flag} ${SUPPORTED_LANGUAGES[code].name}`;
      toSel.appendChild(o);
    }
    toSel.value = to0 in SUPPORTED_LANGUAGES ? to0 : 'en';
    bar.appendChild(fromSel);
    bar.appendChild(swap);
    bar.appendChild(toSel);
    body.appendChild(bar);
    const hint = document.createElement('div');
    hint.className = 'muted';
    hint.style.marginTop = '8px';
    hint.textContent = `Selected: ${text.length} characters.`;
    body.appendChild(hint);
    const row = document.createElement('div');
    row.className = 'row';
    const go = document.createElement('button');
    go.className = 'btn';
    go.textContent = 'Translate';
    go.addEventListener('click', () => {
      const from = fromSel.value;
      const to = toSel.value;
      if (from !== 'auto' && from === to) {
        this.toast('Source and target must differ (or use Auto-detect).');
        return;
      }
      void this.runTranslate(text, from, to);
    });
    row.appendChild(go);
    body.appendChild(row);
    swap.addEventListener('click', () => {
      if (fromSel.value === 'auto') {
        this.toast('Pick a source language before swapping, or keep Auto-detect.');
        return;
      }
      const a = fromSel.value;
      const b = toSel.value;
      if (a === b) return;
      fromSel.value = b;
      toSel.value = a;
    });
  }

  private renderTranslateResult(data: TranslateResponse, toCode: string): void {
    const result = data.text;
    const body = this.el.body;
    body.innerHTML = '';
    const meta = document.createElement('div');
    meta.className = 'muted';
    const bits: string[] = [];
    if (data.detected_from) {
      const code = data.detected_from;
      const name =
        code in SUPPORTED_LANGUAGES
          ? SUPPORTED_LANGUAGES[code as LanguageCode].name
          : code;
      bits.push(
        `Detected: ${flagForLanguageCode(code)} ${name}`,
      );
    }
    if (data.glossary_applied?.length) {
      bits.push(`Preserved: ${data.glossary_applied.join(', ')}`);
    }
    if (data.notes?.trim()) {
      bits.push(data.notes.trim());
    }
    meta.textContent = bits.length ? bits.join(' · ') : 'Translation';
    body.appendChild(meta);
    const pre = document.createElement('pre');
    pre.className = 'result';
    // Match target writing direction; do not inherit card dir (source may be Hebrew RTL
    // while translation is English LTR, or the reverse).
    pre.setAttribute('dir', isRtlLanguageCode(toCode) ? 'rtl' : 'ltr');
    pre.textContent = result;
    body.appendChild(pre);
    const row = document.createElement('div');
    row.className = 'row';
    const copy = document.createElement('button');
    copy.className = 'btn secondary';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => void navigator.clipboard.writeText(result));
    const rep = document.createElement('button');
    rep.className = 'btn';
    rep.textContent = 'Replace';
    rep.addEventListener('click', () => this.applyOutcome(result));
    row.appendChild(copy);
    row.appendChild(rep);
    body.appendChild(row);
    if (this.ctx?.googleDocsMode) {
      const note = document.createElement('div');
      note.className = 'warn';
      note.textContent =
        'Google Docs cannot be edited directly. Use Copy, then paste with ⌘V / Ctrl+V.';
      body.appendChild(note);
    }
  }

  private toast(msg: string): void {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    this.shadow.appendChild(t);
    window.setTimeout(() => t.remove(), 4200);
  }

  private maybeWarnLong(text: string): boolean {
    if (text.length <= LONG_THRESHOLD) return true;
    const est = estimateTokens(text);
    return window.confirm(
      `This selection is long (${text.length} characters). This may use roughly ${est} tokens. Continue?`,
    );
  }

  private setLoading(loading: boolean): void {
    if (!loading) return;
    this.el.body.innerHTML = `
      <div class="muted">Working…</div>
      <div class="dots" aria-label="Loading"><i></i><i></i><i></i></div>
    `;
  }

  private async runCheck(text: string): Promise<void> {
    if (!this.maybeWarnLong(text)) {
      this.setMode('check');
      return;
    }
    this.setLoading(true);
    const s = await getSettings();
    const language = s.defaultLanguage;
    const resp = await sendRequest({
      type: MSG.CHECK,
      text,
      language: language === 'auto' ? 'auto' : language,
    });
    if (!this.handleError(resp)) return;
    if (!resp.ok) return;
    const data = resp.data as CheckResponse;
    this.renderCheckResult(text, data);
  }

  private async runAiCheck(text: string): Promise<void> {
    if (!this.maybeWarnLong(text)) {
      this.setMode('ai-tells');
      return;
    }
    this.setLoading(true);
    const s = await getSettings();
    const language = s.defaultLanguage;
    const resp = await sendRequest({
      type: MSG.AI_CHECK,
      text,
      language: language === 'auto' ? 'auto' : language,
    });
    if (!this.handleError(resp)) return;
    if (!resp.ok) return;
    const data = resp.data as CheckResponse;
    this.renderCheckResult(text, data);
  }

  private async runRewrite(text: string, instruction: string): Promise<void> {
    if (!instruction) {
      this.toast('Add a rewrite instruction first.');
      return;
    }
    if (!this.maybeWarnLong(text)) {
      this.setMode('rewrite');
      return;
    }
    this.setLoading(true);
    const resp = await sendRequest({ type: MSG.REWRITE, text, instruction });
    if (!this.handleError(resp)) return;
    const data = (resp as { ok: true; data: RewriteResponse }).data;
    this.renderTextResult('Rewrite', text, data.text);
  }

  private async runTone(text: string, tone: string): Promise<void> {
    if (!this.maybeWarnLong(text)) {
      this.setMode('tone');
      return;
    }
    this.setLoading(true);
    const resp = await sendRequest({ type: MSG.TONE, text, tone });
    if (!this.handleError(resp)) return;
    const data = (resp as { ok: true; data: RewriteResponse }).data;
    this.renderTextResult('Tone', text, data.text);
  }

  private async runTranslate(
    text: string,
    from: string,
    to: string,
  ): Promise<void> {
    if (!this.maybeWarnLong(text)) {
      this.setMode('translate');
      return;
    }
    this.setLoading(true);
    const resp = await sendRequest({ type: MSG.TRANSLATE, text, from, to });
    if (!this.handleError(resp)) return;
    const data = (resp as { ok: true; data: TranslateResponse }).data;
    void setSiteTranslatePrefs(location.hostname, from, to);
    this.renderTranslateResult(data, to as LanguageCode);
  }

  private handleError(resp: PolyscribeResponse): boolean {
    if (!isPolyscribeError(resp)) return true;
    if (resp.code === 'UNAUTHORIZED') {
      this.toast('Your token was revoked. Update it in the popup settings.');
    } else {
      this.toast(resp.error);
    }
    this.setMode(this.activeTab);
    return false;
  }

  private renderCheckResult(_source: string, data: CheckResponse): void {
    const body = this.el.body;
    body.innerHTML = '';
    const issues = data.issues ?? [];
    const corrected = data.correctedText;
    const det = data.language_detected;
    const issueFlag = det ? flagForLanguageCode(det) : '🌐';

    if (issues.length === 0 && !corrected) {
      body.innerHTML = `<div class="muted">No issues returned.</div>`;
      return;
    }

    if (det) {
      const top = document.createElement('div');
      top.className = 'issue-head';
      const label =
        det in SUPPORTED_LANGUAGES
          ? SUPPORTED_LANGUAGES[det as LanguageCode].name
          : det;
      top.innerHTML = `<span class="fbadge" title="${label}">${flagForLanguageCode(
        det,
      )}</span><span class="muted" style="font-size:12px">Detected: ${label}</span>`;
      body.appendChild(top);
    }

    for (const issue of issues) {
      const div = document.createElement('div');
      div.className = 'issue';
      const head = document.createElement('div');
      head.className = 'issue-head';
      head.innerHTML = `<span class="fbadge">${issueFlag}</span>`;
      const p = document.createElement('p');
      p.textContent = issue.message;
      p.style.margin = '0';
      div.appendChild(head);
      div.appendChild(p);
      if (issues.length === 1 && issue.suggestion) {
        const row = document.createElement('div');
        row.className = 'row';
        const apply = document.createElement('button');
        apply.className = 'btn';
        apply.textContent = 'Apply';
        // `applyOutcome` replaces the user's entire selected range, so we
        // must pass the FULL corrected text — not the single-word suggestion,
        // which would obliterate the rest of the selection.
        apply.addEventListener('click', () => this.applyOutcome(corrected ?? issue.suggestion!));
        row.appendChild(apply);
        div.appendChild(row);
      }
      body.appendChild(div);
    }

    if (corrected) {
      const row = document.createElement('div');
      row.className = 'row';
      const all = document.createElement('button');
      all.className = 'btn';
      all.textContent = 'Apply all';
      all.addEventListener('click', () => this.applyOutcome(corrected));
      const copy = document.createElement('button');
      copy.className = 'btn secondary';
      copy.textContent = 'Copy';
      copy.addEventListener('click', () => void navigator.clipboard.writeText(corrected));
      row.appendChild(all);
      row.appendChild(copy);
      body.appendChild(row);

      const pre = document.createElement('pre');
      pre.className = 'result';
      pre.textContent = corrected;
      body.appendChild(pre);
    }
  }

  private renderTextResult(title: string, _source: string, result: string): void {
    const body = this.el.body;
    body.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'muted';
    h.textContent = title;
    body.appendChild(h);
    const pre = document.createElement('pre');
    pre.className = 'result';
    pre.textContent = result;
    body.appendChild(pre);
    const row = document.createElement('div');
    row.className = 'row';
    const copy = document.createElement('button');
    copy.className = 'btn secondary';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => void navigator.clipboard.writeText(result));
    const rep = document.createElement('button');
    rep.className = 'btn';
    rep.textContent = 'Replace';
    rep.addEventListener('click', () => this.applyOutcome(result));
    row.appendChild(copy);
    row.appendChild(rep);
    body.appendChild(row);

    if (this.ctx?.googleDocsMode) {
      const note = document.createElement('div');
      note.className = 'warn';
      note.textContent =
        'Google Docs cannot be edited directly. Text was copied — paste with ⌘V / Ctrl+V.';
      body.appendChild(note);
    }
  }

  private applyOutcome(text: string): void {
    const ctx = this.ctx;
    if (!ctx?.range) {
      void navigator.clipboard.writeText(text);
      this.toast(ctx?.googleDocsMode ? 'Copied — paste with ⌘V / Ctrl+V.' : 'Copied to clipboard.');
      return;
    }
    const mode = applyTextToRange(ctx.range, text, ctx.googleDocsMode);
    if (mode === 'clipboard' || ctx.googleDocsMode) {
      this.toast('Copied — paste with ⌘V / Ctrl+V.');
    }
    this.close();
  }
}
