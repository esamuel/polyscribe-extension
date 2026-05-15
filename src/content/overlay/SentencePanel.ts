/**
 * Wider, persistent panel for long suggestions (whole-sentence rewrites,
 * AI-tells with multi-word context, etc.). The hover tooltip works well
 * for "teh → the" but looks cramped for "what we have done for last times
 * ever → what we have done in the past" — the original and suggestion get
 * squeezed onto a 268px-wide bubble that auto-hides on mouseleave.
 *
 * This panel:
 *   - is wider (up to 480px) and persistent (doesn't auto-hide on hover-out),
 *   - stacks original above suggestion with clear visual separation,
 *   - closes on Apply / Dismiss / outside-click / Escape,
 *   - uses the same handlers contract as TooltipManager so BaseAdapter can
 *     route to either UI based on issue length.
 */

import type { UnderlineIssue } from '../../lib/types';

const TEAL = '#0d9488';

export class SentencePanel {
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private currentApplyButton: HTMLButtonElement | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly onDocDown = (e: MouseEvent): void => {
    // Close on click outside the panel host (composedPath crosses shadow DOM).
    const path = e.composedPath();
    if (!path.includes(this.host)) this.hide();
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.hide();
  };

  constructor() {
    this.host = document.createElement('div');
    this.host.setAttribute('data-polyscribe', 'sentence-panel');
    this.host.style.cssText =
      'position: fixed; z-index: 2147483647; pointer-events: none; display: none;';
    document.documentElement.appendChild(this.host);
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.injectStyles();
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .panel {
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #ffffff;
        color: #0f172a;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(15,23,42,0.20);
        width: min(480px, calc(100vw - 32px));
        animation: psc-panel-in 220ms cubic-bezier(.34,1.56,.64,1);
      }
      @keyframes psc-panel-in {
        0%   { transform: translateY(8px) scale(0.96); opacity: 0; }
        100% { transform: translateY(0)   scale(1);    opacity: 1; }
      }
      .header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid #f1f5f9;
      }
      .type-label { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; }
      .grammar { color: #2563eb; }
      .spelling { color: #dc2626; }
      .punctuation { color: #ea580c; }
      .style { color: #9333ea; }
      .ai-tell { color: ${TEAL}; }
      .close {
        all: unset; cursor: pointer; color: #94a3b8;
        font-size: 18px; line-height: 1; padding: 0 4px;
      }
      .close:hover { color: #475569; }
      .body { padding: 14px 16px 4px; }
      .row {
        margin-bottom: 10px;
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
      }
      .original {
        background: #fef2f2;
        color: #991b1b;
        text-decoration: line-through;
        text-decoration-color: #ef4444;
      }
      .arrow {
        text-align: center;
        color: #94a3b8;
        font-size: 16px;
        line-height: 1;
        margin: -2px 0 6px;
      }
      .suggestion {
        background: #ecfdf5;
        color: #065f46;
        font-weight: 500;
      }
      .why {
        font-size: 12.5px;
        color: #475569;
        font-style: italic;
        border-left: 3px solid #cbd5e1;
        padding: 4px 10px;
        margin: 8px 0 4px;
      }
      .actions {
        display: flex; gap: 8px; align-items: center;
        padding: 8px 16px 14px;
      }
      .btn-apply {
        flex: 1;
        background: ${TEAL};
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .btn-apply:hover { background: #0f766e; }
      .btn-apply:disabled { background: #047857; cursor: default; opacity: 0.95; }
      .btn-dismiss {
        background: transparent;
        color: #475569;
        border: none;
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 13px;
        cursor: pointer;
      }
      .btn-dismiss:hover { background: #f1f5f9; }
      [dir="rtl"] { direction: rtl; }
      @media (prefers-color-scheme: dark) {
        .panel { background: #1f2937; color: #f1f5f9; border-color: rgba(255,255,255,0.08); box-shadow: 0 16px 40px rgba(0,0,0,0.6); }
        .header { border-bottom-color: rgba(255,255,255,0.06); }
        .original { background: rgba(239,68,68,0.12); color: #fecaca; }
        .suggestion { background: rgba(13,148,136,0.18); color: #6ee7b7; }
        .why { border-left-color: rgba(255,255,255,0.16); color: #cbd5e1; }
        .btn-dismiss { color: #cbd5e1; }
        .btn-dismiss:hover { background: rgba(255,255,255,0.08); }
        .close { color: rgba(255,255,255,0.55); }
        .close:hover { color: rgba(255,255,255,0.9); }
      }
    `;
    this.shadow.appendChild(style);
  }

  show(
    issue: UnderlineIssue,
    anchorRect: DOMRect,
    handlers: {
      onApply: () => void;
      onDismiss: () => void;
      applyLabel?: string;
      appliedLabel?: string;
    },
  ): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    // Tear down any prior panel render.
    this.shadow.querySelector('.panel')?.remove();

    const applyLabel = handlers.applyLabel ?? 'Apply';
    const appliedLabel = handlers.appliedLabel ?? 'Applied';

    const isRTL = /[֐-׿؀-ۿ]/.test(
      issue.explanation + issue.original + issue.suggestion,
    );

    const panel = document.createElement('div');
    panel.className = 'panel';
    if (isRTL) panel.setAttribute('dir', 'rtl');
    panel.innerHTML = `
      <div class="header">
        <span class="type-label ${issue.type}">${escapeHtml(issue.type.toUpperCase())}</span>
        <button type="button" class="close" data-action="close" aria-label="Close">×</button>
      </div>
      <div class="body">
        <div class="row original">${escapeHtml(issue.original)}</div>
        <div class="arrow">↓</div>
        <div class="row suggestion">${escapeHtml(issue.suggestion)}</div>
        ${issue.explanation ? `<div class="why">${escapeHtml(issue.explanation)}</div>` : ''}
      </div>
      <div class="actions">
        <button type="button" class="btn-apply" data-action="apply">${escapeHtml(applyLabel)}</button>
        <button type="button" class="btn-dismiss" data-action="dismiss">Dismiss</button>
      </div>
    `;

    // Per-button mousedown.preventDefault to keep editor focus — same
    // pattern as TooltipManager / SummaryChip / StaleBanner.
    for (const btn of Array.from(panel.querySelectorAll<HTMLButtonElement>('button'))) {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.setAttribute('tabindex', '-1');
    }
    panel.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement)
        .closest('[data-action]')
        ?.getAttribute('data-action');
      if (action === 'apply') {
        handlers.onApply();
        // Flash the confirmation so the click visibly registers.
        const btn = panel.querySelector<HTMLButtonElement>('.btn-apply');
        if (btn) {
          btn.textContent = appliedLabel;
          btn.disabled = true;
          if (this.hideTimer) clearTimeout(this.hideTimer);
          this.hideTimer = window.setTimeout(() => this.hide(), 1100);
        }
      } else if (action === 'dismiss') {
        handlers.onDismiss();
        this.hide();
      } else if (action === 'close') {
        this.hide();
      }
    });

    this.shadow.appendChild(panel);
    this.currentApplyButton = panel.querySelector<HTMLButtonElement>('.btn-apply');

    this.position(panel, anchorRect);

    this.host.style.display = '';
    document.addEventListener('mousedown', this.onDocDown, true);
    window.addEventListener('keydown', this.onKey, true);
  }

  private position(panel: HTMLElement, anchorRect: DOMRect): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 16;
    // Read panel dims AFTER it's been appended.
    const rect = panel.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    // Prefer below the anchor; flip above if no room.
    let top = anchorRect.bottom + 8;
    if (top + h > vh - margin) {
      top = Math.max(margin, anchorRect.top - h - 8);
    }
    // Horizontally center on the anchor, then clamp.
    let left = anchorRect.left + anchorRect.width / 2 - w / 2;
    left = Math.max(margin, Math.min(left, vw - margin - w));
    this.host.style.top = `${Math.round(top)}px`;
    this.host.style.left = `${Math.round(left)}px`;
  }

  hide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.host.style.display = 'none';
    this.shadow.querySelector('.panel')?.remove();
    this.currentApplyButton = null;
    document.removeEventListener('mousedown', this.onDocDown, true);
    window.removeEventListener('keydown', this.onKey, true);
  }

  /** Force-flash the apply button into its confirmation state (used by the
   *  veto-fallback path in BaseAdapter, mirroring TooltipManager.flashApplied). */
  flashApplied(label: string): void {
    const btn = this.currentApplyButton;
    if (!btn) return;
    btn.textContent = label;
    btn.disabled = true;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), 1400);
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
