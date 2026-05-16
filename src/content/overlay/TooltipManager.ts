import type { UnderlineIssue } from '../../lib/types';

export class TooltipManager {
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.host = document.createElement('div');
    this.host.setAttribute('data-polyscribe', 'tooltip-host');
    this.host.style.cssText = 'position: fixed; z-index: 2147483646; pointer-events: none;';
    document.documentElement.appendChild(this.host);
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.injectStyles();
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .tooltip {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        /** Stacked Grammarly-style card: category → suggestion → actions.
         *  Narrow + side-placed so page text stays visible. */
        padding: 14px 16px;
        width: 248px;
        pointer-events: auto;
        animation: fadeIn 150ms ease-out;
        position: relative;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      /* padding-right reserves room so a long word never runs under the
         absolutely-positioned close (×). Mirrored for RTL below. */
      .cat { font-size: 12px; color: #6b7280; font-weight: 500; margin-bottom: 8px; padding-right: 16px; }
      /* The suggestion IS the primary action — click it to apply (Grammarly
         pattern). Colored by issue type; our palette, not Grammarly's. */
      .suggest {
        display: block; width: 100%; text-align: left;
        background: transparent; border: none; padding: 0;
        font-size: 19px; font-weight: 700; line-height: 1.25;
        cursor: pointer; word-break: break-word;
      }
      .suggest:hover { opacity: 0.78; }
      .suggest:disabled { cursor: default; opacity: 1; }
      .suggest.grammar { color: #2563eb; }
      .suggest.spelling { color: #dc2626; }
      .suggest.punctuation { color: #ea580c; }
      .suggest.style { color: #9333ea; }
      .suggest.ai-tell { color: #0d9488; }
      .suggest.deletion { color: #b45309; font-style: italic; font-size: 16px; }
      .suggest.done { color: #047857; font-size: 16px; font-style: normal; }
      .hint { font-size: 11px; color: #9ca3af; margin-top: 5px; }
      .why {
        font-size: 12px; color: #6b7280; font-style: italic;
        border-left: 2px solid #e5e7eb; padding-left: 10px;
        margin: 10px 0 0; line-height: 1.4;
      }
      .actions { display: flex; align-items: center; gap: 16px; margin-top: 14px; }
      .row-btn {
        display: flex; align-items: center; gap: 6px;
        background: transparent; border: none; padding: 0;
        color: #6b7280; font-size: 13px; cursor: pointer;
      }
      .row-btn:hover { color: #374151; }
      .row-btn svg { width: 14px; height: 14px; flex: none; }
      .close {
        position: absolute; top: 8px; right: 10px;
        background: transparent; border: none; color: #d1d5db;
        cursor: pointer; font-size: 15px; line-height: 1; padding: 2px;
      }
      .close:hover { color: #6b7280; }
      [dir="rtl"] { direction: rtl; }
      [dir="rtl"] .suggest { text-align: right; }
      [dir="rtl"] .cat { padding-right: 0; padding-left: 16px; }
      [dir="rtl"] .close { right: auto; left: 10px; }
    `;
    this.shadow.appendChild(style);
  }

  show(
    issue: UnderlineIssue,
    anchorRect: DOMRect,
    handlers: {
      onApply: () => void;
      onDismiss: () => void;
      /**
       * Override the primary action's label and post-click confirmation text.
       * Read-only contexts pass `applyLabel: 'Copy'` / `appliedLabel: 'Copied!'`
       * because they can't replace the source text — they put the suggestion
       * on the clipboard instead, and the button label should say so.
       */
      applyLabel?: string;
      appliedLabel?: string;
    },
  ): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.shadow.querySelector('.tooltip')?.remove();

    // Empty suggestion = "delete this." Distinct visual + button label so
    // an empty green chip doesn't look like a render bug.
    const isDeletion = issue.suggestion === '';
    const applyLabel = handlers.applyLabel ?? (isDeletion ? 'Delete' : 'Apply');
    const appliedLabel = handlers.appliedLabel ?? (isDeletion ? 'Deleted' : 'Applied');

    const isRTL = /[\u0590-\u05FF\u0600-\u06FF]/.test(issue.explanation + issue.original + issue.suggestion);
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    if (isRTL) tooltip.setAttribute('dir', 'rtl');
    // Friendly category line (Grammarly's "Fix capitalization" slot). We only
    // have a coarse type, so map it to a readable phrase.
    const CAT_LABELS: Record<string, string> = {
      grammar: 'Fix grammar',
      spelling: 'Fix spelling',
      punctuation: 'Fix punctuation',
      style: 'Improve wording',
      'ai-tell': 'Sounds AI-written',
    };
    const catLabel = isDeletion
      ? 'Remove this text'
      : CAT_LABELS[issue.type] ?? 'Suggestion';

    // The suggestion itself is the click target — tell the user what the
    // click does (copy in read-only contexts, otherwise apply/delete).
    const hintText =
      applyLabel === 'Apply'
        ? 'Click to apply'
        : applyLabel === 'Delete'
          ? 'Click to delete'
          : `Click to ${applyLabel.toLowerCase()}`;

    tooltip.innerHTML = `
      <button type="button" class="close" data-action="close" aria-label="Close">×</button>
      <div class="cat">${escapeHtml(catLabel)}</div>
      <button type="button" class="suggest ${issue.type}${isDeletion ? ' deletion' : ''}" data-action="apply">${isDeletion ? '⌫ Delete this text' : escapeHtml(issue.suggestion)}</button>
      <div class="hint">${escapeHtml(hintText)}</div>
      <div class="why" style="display:none">${escapeHtml(issue.explanation)}</div>
      <div class="actions">
        <button type="button" class="row-btn" data-action="dismiss">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>Dismiss</span>
        </button>
        <button type="button" class="row-btn" data-action="why">Why?</button>
      </div>
    `;
    // CRITICAL: prevent focus theft on mousedown — directly on EACH button.
    // A container-level mousedown listener doesn't work reliably across
    // shadow-DOM boundaries: by the time the event bubbles up, the browser
    // may already have started shifting focus to the button. Per-button
    // listeners run synchronously with the focus-shift default action and
    // reliably cancel it. Same pattern as SummaryChip.
    for (const btn of Array.from(
      tooltip.querySelectorAll<HTMLButtonElement>('button'),
    )) {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      // Belt-and-suspenders: tabindex=-1 ALSO prevents focus on click for
      // browsers / shadow-DOM quirks where mousedown.preventDefault drifts.
      btn.setAttribute('tabindex', '-1');
    }
    tooltip.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const action = t.closest('[data-action]')?.getAttribute('data-action');
      if (action === 'apply') {
        handlers.onApply();
        // Briefly flash the post-click confirmation so the user knows their
        // click landed — especially important for read-only Copy mode where
        // nothing in the source text changes visibly.
        const btn = tooltip.querySelector<HTMLButtonElement>('.suggest');
        if (btn) {
          btn.textContent = `✓ ${appliedLabel}`;
          btn.classList.add('done');
          btn.disabled = true;
          // Assign to this.hideTimer so the existing mouseenter listener
          // can cancel it — otherwise the tooltip vanishes mid-hover even
          // when the user is trying to read the confirmation.
          if (this.hideTimer) clearTimeout(this.hideTimer);
          this.hideTimer = window.setTimeout(() => this.hide(), 1000);
        }
      } else if (action === 'dismiss') handlers.onDismiss();
      else if (action === 'close') this.hide();
      else if (action === 'why') {
        const why = tooltip.querySelector('.why') as HTMLElement;
        why.style.display = why.style.display === 'none' ? 'block' : 'none';
      }
    });
    tooltip.addEventListener('mouseenter', () => {
      if (this.hideTimer) {
        clearTimeout(this.hideTimer);
        this.hideTimer = null;
      }
    });
    tooltip.addEventListener('mouseleave', () => this.scheduleHide());
    this.shadow.appendChild(tooltip);

    // Place the tooltip relative to the underlined word, **preferring sides**
    // (right of the anchor first, then left), and only falling back to
    // below/above when there's no horizontal room. Grammarly's pattern.
    // Why: when the tooltip is centered below the anchor it covers the next
    // five lines of paragraph text — the user can't compare the original
    // (in the page) with the suggestion (in the tooltip) without scrolling.
    // A side placement keeps the line of text visible.
    const tooltipRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const gap = 8;
    const w = tooltipRect.width;
    const h = tooltipRect.height;

    const horizCentered = Math.max(
      margin,
      Math.min(anchorRect.left + anchorRect.width / 2 - w / 2, vw - margin - w),
    );
    const sideTop = Math.max(
      margin,
      Math.min(anchorRect.top + anchorRect.height / 2 - h / 2, vh - margin - h),
    );

    type Pos = { left: number; top: number };
    const candidates: Pos[] = [
      // 1. Right of the anchor, vertically centered on it.
      { left: anchorRect.right + gap, top: sideTop },
      // 2. Left of the anchor (for right-margin selections).
      { left: anchorRect.left - w - gap, top: sideTop },
      // 3. Below the anchor (current default — covers paragraph text).
      { left: horizCentered, top: anchorRect.bottom + gap },
      // 4. Above the anchor.
      { left: horizCentered, top: anchorRect.top - h - gap },
    ];

    const fits = (p: Pos): boolean =>
      p.left >= margin &&
      p.left + w <= vw - margin &&
      p.top >= margin &&
      p.top + h <= vh - margin;

    const chosen =
      candidates.find(fits) ??
      // Nothing fits cleanly — clamp the "below" option into the viewport.
      {
        left: horizCentered,
        top: Math.max(margin, Math.min(anchorRect.bottom + gap, vh - margin - h)),
      };

    this.host.style.top = `${Math.round(chosen.top)}px`;
    this.host.style.left = `${Math.round(chosen.left)}px`;
  }

  /**
   * Force the currently-shown tooltip's primary button into its confirmation
   * state and auto-hide. Used by the veto-fallback path so users see a
   * clear "Copied to clipboard" cue when the editor refused our inline edit.
   * No-op if the tooltip isn't open.
   */
  flashApplied(label: string): void {
    const btn = this.shadow.querySelector<HTMLButtonElement>('.tooltip .suggest');
    if (!btn) return;
    btn.textContent = `✓ ${label}`;
    btn.classList.add('done');
    btn.disabled = true;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), 1200);
  }

  scheduleHide(): void {
    this.hideTimer = window.setTimeout(() => this.hide(), 200);
  }

  hide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.shadow.querySelector('.tooltip')?.remove();
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
