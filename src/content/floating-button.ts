const HOST_ID = 'polyscribe-fab-host';
export type FabMode = 'hidden' | 'idle' | 'issues' | 'ok' | 'checking';

// Larger + higher-contrast than the original 20/24 pair — busy pages
// (ChatGPT prompt box, Grammarly-augmented editors) made the smaller FAB
// blend in. Sizes here strike a balance between visibility and not feeling
// shouty next to the user's text.
const SIZE_IDLE = 28;
const SIZE_ISSUE = 32;
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
        /** FAB sits at the top; chips stack vertically below it so they
         *  don't run off the right edge of the page or overlap the text. */
        display: flex; align-items: flex-start; gap: 6px;
        /** Brief pulse on appearance so the eye catches it. */
        animation: psc-fab-in 220ms cubic-bezier(.34,1.56,.64,1);
      }
      .quick { display: none; flex-direction: column; gap: 4px; align-items: stretch; }
      .quick.show { display: flex; }
      .chip {
        all: unset;
        cursor: pointer;
        background: #ffffff;
        color: #0f172a;
        border-radius: 999px;
        padding: 5px 14px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1;
        box-shadow: 0 0 0 1px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.10);
        white-space: nowrap;
        text-align: center;
      }
      .chip:hover { background: ${TEAL}; color: #fff; box-shadow: 0 0 0 1px ${TEAL}, 0 4px 10px rgba(15,23,42,0.16); }
      .chip:active { transform: scale(0.96); }
      .chip[disabled] { opacity: 0.6; cursor: progress; }
      @media (prefers-color-scheme: dark) {
        .chip { background: #1f2937; color: #f1f5f9; box-shadow: 0 0 0 1px rgba(255,255,255,0.2), 0 2px 6px rgba(0,0,0,0.45); }
        .chip:hover { background: ${TEAL}; color: #fff; }
      }
      @keyframes psc-fab-in {
        0%   { transform: scale(0.4); opacity: 0; }
        100% { transform: scale(1);   opacity: 1; }
      }
      @keyframes psc-fab-pulse {
        0%   { box-shadow: 0 0 0 2px #ffffff, 0 4px 14px rgba(15,23,42,0.30), 0 0 0 0 rgba(13,148,136,0.6); }
        100% { box-shadow: 0 0 0 2px #ffffff, 0 4px 14px rgba(15,23,42,0.30), 0 0 0 10px rgba(13,148,136,0); }
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
        /** White ring + shadow keeps the FAB visible on any page colour. */
        box-shadow: 0 0 0 2px #ffffff, 0 4px 14px rgba(15,23,42,0.30);
        opacity: 1;
        position: relative;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: -0.02em;
      }
      @media (prefers-color-scheme: dark) {
        button.fab {
          box-shadow: 0 0 0 2px rgba(255,255,255,0.85), 0 6px 18px rgba(0,0,0,0.55);
        }
      }
      button.fab:hover { transform: scale(1.06); }
      button.fab:active { transform: scale(0.96); }
      .badge {
        position: absolute; top: -4px; right: -4px;
        min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px;
        background: #dc2626; color: #fff; font-size: 10px; font-weight: 800;
        display: flex; align-items: center; justify-content: center;
        line-height: 1; border: 2px solid #fff;
      }
    `;
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fab';
    btn.setAttribute('aria-label', 'Polyscribe');
    const quick = document.createElement('div');
    quick.className = 'quick';
    quick.setAttribute('role', 'toolbar');
    quick.setAttribute('aria-label', 'Quick actions');
    wrap.appendChild(btn);
    wrap.appendChild(quick);
    shadow.appendChild(style);
    shadow.appendChild(wrap);
    (host as HTMLElement & { __btn?: HTMLButtonElement }).__btn = btn;
    (host as HTMLElement & { __wrap?: HTMLElement }).__wrap = wrap;
    (host as HTMLElement & { __quick?: HTMLElement }).__quick = quick;
  }
  return host;
}

export type QuickActionId = 'rephrase' | 'shorter' | 'formal' | 'casual';

const QUICK_ACTIONS: { id: QuickActionId; label: string }[] = [
  { id: 'rephrase', label: 'Rephrase' },
  { id: 'shorter', label: 'Shorter' },
  { id: 'formal', label: 'Formal' },
  { id: 'casual', label: 'Casual' },
];

let quickActionHandler: ((id: QuickActionId) => void) | null = null;

export function onQuickAction(handler: (id: QuickActionId) => void): void {
  quickActionHandler = handler;
}

export function setQuickActionsVisible(visible: boolean): void {
  const host = ensureHost() as HTMLElement & { __quick?: HTMLElement };
  const quick = host.__quick;
  if (!quick) return;
  if (!visible) {
    quick.classList.remove('show');
    quick.innerHTML = '';
    return;
  }
  if (quick.childElementCount === 0) {
    for (const action of QUICK_ACTIONS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.action = action.id;
      chip.textContent = action.label;
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        quickActionHandler?.(action.id);
      });
      quick.appendChild(chip);
    }
  }
  quick.classList.add('show');
}

export function setQuickActionLoading(id: QuickActionId | null): void {
  const host = ensureHost() as HTMLElement & { __quick?: HTMLElement };
  const quick = host.__quick;
  if (!quick) return;
  for (const el of Array.from(quick.querySelectorAll<HTMLButtonElement>('.chip'))) {
    if (id && el.dataset.action === id) {
      el.disabled = true;
      el.textContent = '…';
    } else {
      el.disabled = !!id;
      // Restore label for non-active chips.
      if (!id) {
        const action = QUICK_ACTIONS.find((a) => a.id === el.dataset.action);
        if (action) el.textContent = action.label;
      }
    }
  }
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
    setQuickActionsVisible(false);
    return;
  }
  host.style.display = '';
  if (mode === 'idle') {
    applySize(btn, SIZE_IDLE);
    btn.innerHTML = '<span style="font-size:14px;font-weight:800;letter-spacing:-0.02em">P</span>';
    btn.style.animation = '';
    return;
  }
  if (mode === 'checking') {
    // Pulse softly while a cloud check is in-flight. The user sees: local
    // underlines arrived instantly, AND something is happening upstream
    // (so they're not wondering whether more suggestions are coming).
    applySize(btn, SIZE_IDLE);
    btn.innerHTML =
      '<span style="font-size:14px;font-weight:800;letter-spacing:-0.02em">P</span>';
    btn.style.animation = 'psc-fab-pulse 900ms ease-in-out infinite alternate';
    return;
  }
  if (mode === 'ok') {
    applySize(btn, SIZE_IDLE);
    btn.textContent = '✓';
    btn.style.animation = '';
    return;
  }
  if (mode === 'issues') {
    const n = options?.issueCount ?? 0;
    applySize(btn, SIZE_ISSUE);
    btn.innerHTML = '⚠';
    btn.style.animation = '';
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = String(n);
    btn.appendChild(b);
  }
}

export function setFloatingButtonPosition(left: number, top: number): void {
  const host = ensureHost() as HTMLElement & { __wrap?: HTMLElement };
  const wrap = host.__wrap;
  if (!wrap) return;
  // Clamp into viewport — selections near a page edge would otherwise put
  // the FAB off-screen (a frequent cause of "I selected text but no FAB").
  // Reserve enough room for the FAB itself + the issue badge that sticks
  // out top-right (badge is ~16px wide, offset right:-4px → +20).
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const reserve = SIZE_ISSUE + 20;
  const clampedLeft = Math.max(8, Math.min(left, vw - reserve));
  const clampedTop = Math.max(8, Math.min(top, vh - reserve));
  wrap.style.left = `${Math.round(clampedLeft)}px`;
  wrap.style.top = `${Math.round(clampedTop)}px`;
  // Re-trigger the appearance pulse if the FAB is being repositioned to a
  // new selection — useful when the user makes multiple selections in a row.
  wrap.style.animation = 'none';
  // Force reflow so the animation restarts.
  void wrap.offsetWidth;
  wrap.style.animation = '';
}

/**
 * Live screen rect of the floating button. Used as a fallback anchor when
 * the source selection's range has gone stale (Gmail/LinkedIn etc. sometimes
 * collapse the native selection out from under us between FAB show and click).
 */
export function getFloatingButtonRect(): DOMRect | null {
  const host = ensureHost() as HTMLElement & { __wrap?: HTMLElement };
  const wrap = host.__wrap;
  if (!wrap) return null;
  const rect = wrap.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
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
