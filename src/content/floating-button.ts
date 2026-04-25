const HOST_ID = 'polyscribe-fab-host';
export type FabMode = 'hidden' | 'idle' | 'issues' | 'ok';

const SIZE_IDLE = 20;
const SIZE_ISSUE = 24;
const TEAL = '#0d9488';

function ensureHost(): HTMLElement {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-polyscribe', 'fab');
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .wrap {
        position: fixed; z-index: 2147483645; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        transition: opacity 0.2s;
      }
      button.fab {
        all: unset;
        box-sizing: border-box;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: ${TEAL};
        color: #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        opacity: 0.85;
        position: relative;
        font-size: 11px;
        font-weight: 700;
      }
      button.fab:hover { opacity: 1; }
      button.fab:active { transform: scale(0.96); }
      .badge {
        position: absolute; top: -4px; right: -4px;
        min-width: 14px; height: 14px; padding: 0 3px; border-radius: 999px;
        background: #dc2626; color: #fff; font-size: 9px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        line-height: 1; border: 1px solid #fff;
      }
    `;
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fab';
    btn.setAttribute('aria-label', 'Polyscribe');
    wrap.appendChild(btn);
    shadow.appendChild(style);
    shadow.appendChild(wrap);
    (host as HTMLElement & { __btn?: HTMLButtonElement }).__btn = btn;
    (host as HTMLElement & { __wrap?: HTMLElement }).__wrap = wrap;
  }
  return host;
}

function applySize(btn: HTMLButtonElement, w: number): void {
  btn.style.width = `${w}px`;
  btn.style.height = `${w}px`;
}

export function setFabMode(
  mode: FabMode,
  options?: { issueCount?: number },
): void {
  const host = ensureHost() as HTMLElement & {
    __btn?: HTMLButtonElement;
    __wrap?: HTMLElement;
  };
  const btn = host.__btn;
  if (!btn) return;

  for (const ch of Array.from(btn.querySelectorAll('.badge'))) {
    ch.remove();
  }

  if (mode === 'hidden') {
    host.style.display = 'none';
    return;
  }
  host.style.display = '';
  if (mode === 'idle') {
    applySize(btn, SIZE_IDLE);
    btn.innerHTML = '<span style="font-size:10px;font-weight:800;letter-spacing:-0.02em">P</span>';
    return;
  }
  if (mode === 'ok') {
    applySize(btn, SIZE_IDLE);
    btn.textContent = '✓';
    return;
  }
  if (mode === 'issues') {
    const n = options?.issueCount ?? 0;
    applySize(btn, SIZE_ISSUE);
    btn.innerHTML = '⚠';
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = String(n);
    btn.appendChild(b);
  }
}

export function setFloatingButtonPosition(left: number, top: number): void {
  const host = ensureHost() as HTMLElement & { __wrap?: HTMLElement };
  const wrap = host.__wrap;
  if (wrap) {
    wrap.style.left = `${Math.round(left)}px`;
    wrap.style.top = `${Math.round(top)}px`;
  }
}

export function hideFloatingButton(): void {
  setFabMode('hidden');
}

export function showFloatingButtonIdle(): void {
  const host = ensureHost();
  host.style.display = '';
  setFabMode('idle');
}

export function onFloatingButtonClick(cb: () => void): () => void {
  const host = ensureHost();
  const btn = (host as HTMLElement & { __btn?: HTMLButtonElement }).__btn;
  if (!btn) return () => {};
  const h = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cb();
  };
  btn.addEventListener('click', h);
  return () => btn.removeEventListener('click', h);
}
