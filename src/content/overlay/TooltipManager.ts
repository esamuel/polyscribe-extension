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
        box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        padding: 16px;
        width: 320px;
        pointer-events: auto;
        animation: fadeIn 150ms ease-out;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
      .type-label { font-size: 13px; font-weight: 500; }
      .grammar { color: #2563eb; }
      .spelling { color: #dc2626; }
      .punctuation { color: #ea580c; }
      .style { color: #9333ea; }
      .change { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; font-size: 15px; }
      .original { text-decoration: line-through; color: #ef4444; background: #fef2f2; padding: 2px 6px; border-radius: 4px; }
      .arrow { color: #9ca3af; }
      .suggestion { color: #047857; background: #ecfdf5; padding: 2px 6px; border-radius: 4px; font-weight: 500; }
      .why { font-size: 13px; color: #6b7280; font-style: italic; border-left: 2px solid #e5e7eb; padding-left: 12px; margin-bottom: 12px; }
      .actions { display: flex; gap: 8px; align-items: center; }
      .btn-apply {
        flex: 1; background: #0d9488; color: white;
        padding: 8px 12px; border: none; border-radius: 8px;
        font-size: 13px; font-weight: 500; cursor: pointer;
      }
      .btn-apply:hover { background: #0f766e; }
      .btn-apply:disabled { background: #047857; cursor: default; opacity: 0.95; }
      .btn-dismiss {
        background: transparent; color: #4b5563;
        padding: 8px 12px; border: none; border-radius: 8px;
        font-size: 13px; cursor: pointer;
      }
      .btn-dismiss:hover { background: #f3f4f6; }
      .btn-why { background: transparent; color: #9ca3af; border: none; padding: 8px; cursor: pointer; }
      .close { background: transparent; border: none; color: #9ca3af; cursor: pointer; }
      [dir="rtl"] { direction: rtl; }
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

    const applyLabel = handlers.applyLabel ?? 'Apply';
    const appliedLabel = handlers.appliedLabel ?? 'Applied';

    const isRTL = /[\u0590-\u05FF\u0600-\u06FF]/.test(issue.explanation + issue.original + issue.suggestion);
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    if (isRTL) tooltip.setAttribute('dir', 'rtl');
    tooltip.innerHTML = `
      <div class="header">
        <span class="type-label ${issue.type}">${issue.type.toUpperCase()}</span>
        <button type="button" class="close" data-action="close">×</button>
      </div>
      <div class="change">
        <span class="original">${escapeHtml(issue.original)}</span>
        <span class="arrow">→</span>
        <span class="suggestion">${escapeHtml(issue.suggestion)}</span>
      </div>
      <div class="why" style="display:none">${escapeHtml(issue.explanation)}</div>
      <div class="actions">
        <button type="button" class="btn-apply" data-action="apply">${escapeHtml(applyLabel)}</button>
        <button type="button" class="btn-dismiss" data-action="dismiss">Dismiss</button>
        <button type="button" class="btn-why" data-action="why" title="Why?">?</button>
      </div>
    `;
    tooltip.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const action = t.closest('[data-action]')?.getAttribute('data-action');
      if (action === 'apply') {
        handlers.onApply();
        // Briefly flash the post-click confirmation so the user knows their
        // click landed — especially important for read-only Copy mode where
        // nothing in the source text changes visibly.
        const btn = tooltip.querySelector<HTMLButtonElement>('.btn-apply');
        if (btn) {
          btn.textContent = appliedLabel;
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

    const tooltipRect = tooltip.getBoundingClientRect();
    let top = anchorRect.bottom + 8;
    if (top + tooltipRect.height > window.innerHeight - 16) {
      top = anchorRect.top - tooltipRect.height - 8;
    }
    let left = anchorRect.left + anchorRect.width / 2 - 160;
    left = Math.max(16, Math.min(left, window.innerWidth - 336));
    this.host.style.top = `${top}px`;
    this.host.style.left = `${left}px`;
  }

  /**
   * Force the currently-shown tooltip's primary button into its confirmation
   * state and auto-hide. Used by the veto-fallback path so users see a
   * clear "Copied to clipboard" cue when the editor refused our inline edit.
   * No-op if the tooltip isn't open.
   */
  flashApplied(label: string): void {
    const btn = this.shadow.querySelector<HTMLButtonElement>('.tooltip .btn-apply');
    if (!btn) return;
    btn.textContent = label;
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
