/**
 * When a Chrome extension reloads (developer toggle, auto-update, etc.) the
 * content scripts already injected into open tabs are orphaned — their
 * `chrome.runtime.sendMessage` calls throw "Extension context invalidated"
 * forever, until the tab itself is refreshed. The page has no way to know
 * this from DevTools alone.
 *
 * This banner appears once per orphaned tab so the user understands what
 * happened and can fix it with one click.
 */

const HOST_ID = 'polyscribe-stale-host';
const TEAL = '#0d9488';

let shown = false;

export function showStaleBanner(): void {
  if (shown) return;
  shown = true;

  // Defer to a microtask so this can be called from inside an error handler
  // without surprising the caller.
  queueMicrotask(() => {
    try {
      mount();
    } catch {
      // If even mounting fails (page CSP / sandbox), we've at least logged.
    }
  });
}

function mount(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-polyscribe', 'stale-banner');
  host.style.cssText =
    'position: fixed; top: 16px; right: 16px; z-index: 2147483647; pointer-events: none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .banner {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #ffffff;
      color: #0f172a;
      border-radius: 10px;
      padding: 10px 12px;
      max-width: 360px;
      box-shadow: 0 0 0 1px rgba(15,23,42,0.08), 0 12px 32px rgba(15,23,42,0.18);
      animation: psc-stale-in 220ms cubic-bezier(.34,1.56,.64,1);
    }
    @keyframes psc-stale-in {
      0%   { transform: translateY(-8px); opacity: 0; }
      100% { transform: translateY(0);    opacity: 1; }
    }
    .dot {
      flex: 0 0 10px;
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #f59e0b;
      box-shadow: 0 0 0 3px rgba(245,158,11,0.18);
    }
    .text { font-size: 12.5px; line-height: 1.35; flex: 1; }
    .text b { color: ${TEAL}; }
    .btn {
      all: unset;
      cursor: pointer;
      background: ${TEAL};
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 10px;
      border-radius: 6px;
      white-space: nowrap;
    }
    .btn:hover { background: #0f766e; }
    .close {
      all: unset;
      cursor: pointer;
      color: #94a3b8;
      font-size: 16px;
      line-height: 1;
      padding: 2px 4px;
    }
    .close:hover { color: #475569; }
    @media (prefers-color-scheme: dark) {
      .banner { background: #1f2937; color: #f1f5f9; box-shadow: 0 0 0 1px rgba(255,255,255,0.12), 0 12px 32px rgba(0,0,0,0.55); }
      .text b { color: #5eead4; }
    }
  `;
  shadow.appendChild(style);

  const banner = document.createElement('div');
  banner.className = 'banner';
  banner.innerHTML = `
    <span class="dot" aria-hidden="true"></span>
    <span class="text"><b>Polyscribe</b> was reloaded — refresh this tab to reconnect.</span>
    <button type="button" class="btn" data-action="reload">Refresh</button>
    <button type="button" class="close" data-action="close" aria-label="Dismiss">×</button>
  `;
  // mousedown.preventDefault so clicking the button doesn't steal focus from
  // a focused editor mid-edit (consistent with the SummaryChip pattern).
  banner.addEventListener('mousedown', (e) => e.preventDefault());
  banner.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');
    if (action === 'reload') {
      location.reload();
    } else if (action === 'close') {
      host.remove();
    }
  });
  shadow.appendChild(banner);
}
