/**
 * Persistent "Fix all (N)" chip rendered when the active editor has 2+
 * Polyscribe suggestions. Sits in the bottom-right of the viewport so it's
 * always discoverable — Grammarly users expect a one-click "fix everything"
 * affordance.
 *
 * Hidden when count < 2 (the per-issue hover-tooltip Apply is enough for a
 * single issue; the chip would be noise).
 *
 * Lives in its own shadow DOM, separate from the FAB and from the inline
 * underline overlay, so it survives across focus changes within the same
 * editor and doesn't compete with the selection FAB.
 */

const HOST_ID = 'polyscribe-summary-host';
const TEAL = '#0d9488';

function ensureHost(): { host: HTMLElement; shadow: ShadowRoot } {
  let host = document.getElementById(HOST_ID) as HTMLElement | null;
  if (host) {
    const shadow = host.shadowRoot;
    if (shadow) return { host, shadow };
  }
  host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-polyscribe', 'summary');
  host.style.cssText =
    'position: fixed; right: 20px; bottom: 20px; z-index: 2147483645; pointer-events: none;';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .chip {
      all: unset;
      pointer-events: auto;
      display: none;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      line-height: 1;
      padding: 10px 14px;
      border-radius: 999px;
      background: ${TEAL};
      color: #ffffff;
      box-shadow: 0 0 0 2px #ffffff, 0 8px 20px rgba(15, 23, 42, 0.25);
      animation: psc-summary-in 220ms cubic-bezier(.34,1.56,.64,1);
    }
    .chip.show { display: inline-flex; }
    .chip:hover { transform: translateY(-1px); }
    .chip:active { transform: scale(0.97); }
    .chip[disabled] { opacity: 0.7; cursor: progress; }
    .count {
      background: rgba(255,255,255,0.22);
      border-radius: 999px;
      padding: 2px 7px;
      font-size: 12px;
      font-weight: 700;
    }
    .icon { font-size: 14px; line-height: 1; }
    @media (prefers-color-scheme: dark) {
      .chip { box-shadow: 0 0 0 2px rgba(255,255,255,0.85), 0 10px 24px rgba(0,0,0,0.55); }
    }
    @keyframes psc-summary-in {
      0%   { transform: translateY(8px) scale(0.96); opacity: 0; }
      100% { transform: translateY(0)   scale(1);    opacity: 1; }
    }
  `;
  shadow.appendChild(style);
  return { host, shadow };
}

export class SummaryChip {
  private chip: HTMLButtonElement | null = null;
  private handler: (() => void) | null = null;
  private lastN = -1;
  /** Epoch ms — `update()` is a no-op until this passes. Set by `showResult`
   *  so the "Fixed N" confirmation isn't immediately overwritten by the
   *  re-render that runs right after Fix all completes. */
  private lockedUntil = 0;

  private ensureChip(): HTMLButtonElement {
    if (this.chip) return this.chip;
    const { shadow } = ensureHost();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.setAttribute('aria-label', 'Fix all Polyscribe suggestions');
    // Single unambiguous label — was "Fix all (N)" with a count bubble which
    // users read as ambiguous ("does (5) mean 5 fixed or 5 to fix?").
    btn.innerHTML = `<span class="icon">✓</span><span class="label">Fix 0 issues</span>`;
    // mousedown.preventDefault keeps focus on the editor — otherwise the
    // click steals focus, the editor blurs, our blur handler calls hide(),
    // and `setLoading(true)` lands on an already-hidden chip mid-action.
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handler?.();
    });
    shadow.appendChild(btn);
    this.chip = btn;
    return btn;
  }

  private setLabel(text: string): void {
    const label = this.chip?.querySelector<HTMLElement>('.label');
    if (label) label.textContent = text;
  }

  /** Update visibility + count + click handler. n < 2 hides the chip. */
  update(n: number, onFixAll: () => void): void {
    // Always keep the handler fresh, regardless of lock state — the lock
    // only protects the LABEL from being overwritten during the success
    // flash, not the click target.
    this.handler = onFixAll;
    if (Date.now() < this.lockedUntil) return;
    if (n < 2) {
      this.hide();
      return;
    }
    if (n === this.lastN && this.chip?.classList.contains('show')) return;
    const chip = this.ensureChip();
    this.setLabel(`Fix ${n} issue${n === 1 ? '' : 's'}`);
    chip.classList.add('show');
    chip.disabled = false;
    this.lastN = n;
  }

  setLoading(loading: boolean): void {
    if (!this.chip) return;
    this.chip.disabled = loading;
    if (loading) this.setLabel('Fixing…');
    // Caller decides what to show on completion — call showResult or update.
  }

  /**
   * Briefly show the post-fix outcome before the next `update()` overwrites
   * the label. `applied` is the count that landed; `total` is what we tried.
   * Equal → "✓ Fixed N". Less than → "Fixed M of N — try the rest manually".
   * Zero → "Couldn't apply — see console" (rare; editor vetoed everything).
   */
  showResult(applied: number, total: number, copiedToClipboard = false): void {
    if (!this.chip) return;
    this.chip.disabled = true;
    // Failures linger longer (user needs to read the message); successes
    // are brief because the underlines disappearing is the real feedback.
    const lockMs = applied === total ? 1000 : 2500;
    this.lockedUntil = Date.now() + lockMs;
    if (applied === 0) {
      this.setLabel(
        copiedToClipboard
          ? "Copied corrected text — paste with ⌘V"
          : "Couldn't apply — check console",
      );
    } else if (applied < total) {
      this.setLabel(`✓ Fixed ${applied} of ${total}`);
    } else {
      this.setLabel(`✓ Fixed ${applied} issue${applied === 1 ? '' : 's'}`);
    }
  }

  hide(): void {
    if (!this.chip) return;
    this.chip.classList.remove('show');
    this.handler = null;
    this.lastN = -1;
    this.lockedUntil = 0;
  }
}
