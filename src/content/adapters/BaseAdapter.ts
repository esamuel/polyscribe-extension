import { getSettings } from '../../lib/storage';
import { requestAiCheckFromSw, requestCheckFromSw } from '../lib/sw-check';
import type { CheckIssue, UnderlineIssue, UnderlineIssueType } from '../../lib/types';
import { Debouncer } from '../lib/debouncer';
import { UnderlineOverlay } from '../overlay/UnderlineOverlay';
import { TooltipManager } from '../overlay/TooltipManager';
import { SummaryChip } from '../overlay/SummaryChip';

function parseIssueCategory(raw?: string): UnderlineIssueType {
  if (!raw) return 'grammar';
  const k = raw.toLowerCase();
  if (k === 'ai-tell' || k.includes('ai-tell') || k.includes('ai tell')) return 'ai-tell';
  if (k.includes('spell')) return 'spelling';
  if (k.includes('punct')) return 'punctuation';
  if (k.includes('style')) return 'style';
  if (k === 'grammar' || k === 'spelling' || k === 'punctuation' || k === 'style') {
    return k;
  }
  return 'grammar';
}

/**
 * Detect another grammar extension painting on this same element (Grammarly
 * is by far the most common). Two grammar extensions on one contenteditable
 * collide visually — the user gets a salad of underlines and can't tell which
 * is which. When we detect a competitor, we skip our inline-underline pass
 * for that element; the FAB selection flow still works.
 */
function hasCompetingExtension(element: HTMLElement): boolean {
  // Grammarly attribute markers on the editable, its parents, or anywhere
  // in the document (Grammarly drops `<grammarly-extension>` as a sibling).
  if (
    element.hasAttribute('data-gramm') ||
    element.hasAttribute('data-gramm_editor') ||
    element.closest('[data-gramm="true"], [data-gramm_editor="true"]')
  ) {
    return true;
  }
  if (document.querySelector('grammarly-extension, grammarly-desktop-integration')) {
    return true;
  }
  // LanguageTool's contenteditable marker.
  if (element.hasAttribute('data-lt-tmp-id')) return true;
  return false;
}

function issuesToUnderline(issues: CheckIssue[] | undefined, fullText: string): UnderlineIssue[] {
  if (!issues?.length) return [];
  const out: UnderlineIssue[] = [];
  const t0 = Date.now();
  for (let idx = 0; idx < issues.length; idx++) {
    const iss = issues[idx]!;
    if (iss.suggestion === undefined || iss.start === undefined || iss.end === undefined) continue;
    const { start, end } = iss;
    if (start < 0 || end > fullText.length || start >= end) continue;
    const original =
      iss.original && iss.original.length > 0 ? iss.original : fullText.slice(start, end);
    out.push({
      id: `psc-${t0}-${idx}`,
      type: parseIssueCategory(iss.category),
      original,
      suggestion: iss.suggestion,
      explanation: (iss.explanation ?? iss.message ?? '').trim() || iss.message,
      start,
      end,
    });
  }
  return out;
}

export abstract class BaseAdapter {
  protected readonly overlay: UnderlineOverlay;
  protected readonly tooltip: TooltipManager;
  protected readonly summaryChip: SummaryChip;
  protected readonly debouncer: Debouncer;
  protected currentIssues: UnderlineIssue[] = [];
  protected currentText = '';
  protected activeElement: HTMLElement | null = null;
  /** Last text we successfully ran a check against — skip identical re-runs. */
  private lastCheckedText: string | null = null;
  /** Monotonic id so an in-flight check that resolves late can't overwrite
   *  newer `currentIssues` (e.g. after the user applied or dismissed). */
  private checkRequestSeq = 0;
  private mutationTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onWinResize = (): void => {
    if (this.activeElement) this.repositionUnderlines(this.activeElement);
  };

  constructor() {
    this.overlay = new UnderlineOverlay();
    this.tooltip = new TooltipManager();
    this.summaryChip = new SummaryChip();
    this.debouncer = new Debouncer(1500);
    window.addEventListener('resize', this.onWinResize);
  }

  abstract findEditableElements(): HTMLElement[];
  abstract getText(element: HTMLElement): string;
  /**
   * Replace [start, end) with `replacement`. MUST return `true` only if the
   * edit actually landed in the document — adapters that use `execCommand`
   * must check its return value, since rich editors (Draft.js, Lexical) can
   * silently veto the insert. If `false`, `applyIssue` will leave other
   * issues' offsets unshifted so the user can retry.
   */
  abstract replaceRange(element: HTMLElement, start: number, end: number, replacement: string): boolean;
  abstract getRangeRects(element: HTMLElement, start: number, end: number): DOMRect[];

  install(): void {
    const scan = (): void => {
      const seen = new Set<HTMLElement>();
      for (const el of this.findEditableElements()) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (!el.dataset.pscAttached) this.attachToElement(el);
      }
    };
    scan();

    const observer = new MutationObserver(() => {
      if (this.mutationTimer) clearTimeout(this.mutationTimer);
      this.mutationTimer = window.setTimeout(() => {
        this.mutationTimer = null;
        scan();
      }, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  protected attachToElement(element: HTMLElement): void {
    element.dataset.pscAttached = '1';

    // Per-invocation guard — Grammarly often loads AFTER we've attached
    // (especially on Gmail / ChatGPT), so a one-shot check at attach time
    // would miss it and leave both extensions painting on the same editor.
    // Re-evaluate on every listener fire; bail if a competitor has arrived.
    const competingSkip = (): boolean => {
      if (!hasCompetingExtension(element)) return false;
      if (element.dataset.pscSkippedReason !== 'competing-extension') {
        element.dataset.pscSkippedReason = 'competing-extension';
        console.info(
          'Polyscribe: pausing inline underlines on this editor — Grammarly or LanguageTool is also active. Disable the other extension on this site for the cleanest experience.',
        );
        this.overlay.clear();
        this.tooltip.hide();
        this.currentIssues = [];
      }
      return true;
    };
    // Run once now in case the competitor was already present.
    if (competingSkip()) return;

    element.addEventListener('input', () => {
      if (competingSkip()) return;
      this.activeElement = element;
      this.currentText = this.getText(element);
      this.debouncer.fire(() => void this.runCheck(element));
    });

    element.addEventListener('focus', () => {
      if (competingSkip()) return;
      this.activeElement = element;
      this.currentText = this.getText(element);
      this.renderUnderlines(element, this.currentIssues);
    });

    element.addEventListener('blur', () => {
      this.overlay.clear();
      this.tooltip.hide();
      this.summaryChip.hide();
    });

    element.addEventListener('scroll', () => this.repositionUnderlines(element), { passive: true });
  }

  protected async runCheck(element: HTMLElement): Promise<void> {
    const text = this.getText(element);
    this.currentText = text;
    if (text.length < 10) {
      this.currentIssues = [];
      this.lastCheckedText = null;
      this.overlay.clear();
      return;
    }
    // Skip identical re-checks — a debounce can fire on a no-op edit
    // (whitespace add/remove, IME composition end) and would otherwise
    // burn two API calls for the same text.
    if (text === this.lastCheckedText) return;

    const seq = ++this.checkRequestSeq;
    try {
      const s = await getSettings();
      const lang = s.defaultLanguage === 'auto' ? 'auto' : s.defaultLanguage;

      // Fire grammar + AI-tells in parallel. Two API calls per debounce —
      // ~2× spend but the AI-tell underlines (the moat vs. Grammarly) show
      // up automatically without the user having to discover the overlay.
      const [grammarResult, aiResult] = await Promise.all([
        requestCheckFromSw(text, lang),
        requestAiCheckFromSw(text, lang),
      ]);

      // Drop late results that have been superseded by a newer check —
      // otherwise we could overwrite `currentIssues` after the user has
      // already applied or dismissed something from the previous pass.
      if (seq !== this.checkRequestSeq) return;

      // Bail completely only if BOTH failed; otherwise show what we got.
      if (!grammarResult && !aiResult) {
        this.currentIssues = [];
        this.overlay.clear();
        return;
      }

      // Stale-text guard: the user kept typing during the round-trip.
      if (this.getText(element) !== text) return;

      const grammar = issuesToUnderline(grammarResult?.issues, text);
      // Belt-and-suspenders type override: server returns `type: 'ai-tell'`
      // but if a future change drops the field we still want teal underlines
      // on the ai-check results.
      const aiTells = issuesToUnderline(aiResult?.issues, text).map((i) => ({
        ...i,
        type: 'ai-tell' as const,
      }));
      // Grammar wins on overlap — an AI-tell intersecting a grammar issue
      // would just be visual noise on the same span.
      const aiTellsDeduped = aiTells.filter(
        (a) => !grammar.some((g) => a.start < g.end && g.start < a.end),
      );
      this.currentIssues = [...grammar, ...aiTellsDeduped];
      this.lastCheckedText = text;
      this.renderUnderlines(element, this.currentIssues);
    } catch (err) {
      console.warn('Polyscribe check failed:', err);
    }
  }

  protected renderUnderlines(element: HTMLElement, issues: UnderlineIssue[]): void {
    this.overlay.clear();
    for (const issue of issues) {
      const rects = this.getRangeRects(element, issue.start, issue.end);
      if (!rects.length) continue;
      this.overlay.drawUnderline(issue, rects, {
        onHover: (rect) =>
          this.tooltip.show(issue, rect, {
            onApply: () => this.applyIssue(element, issue),
            onDismiss: () => this.dismissIssue(issue),
          }),
        onLeave: () => this.tooltip.scheduleHide(),
      });
    }
    // Show "Fix all (N)" chip whenever we have 2+ fixable issues. Counts only
    // issues with a non-empty suggestion — there's nothing to apply otherwise.
    const fixable = issues.filter((i) => !!i.suggestion).length;
    this.summaryChip.update(fixable, () => void this.fixAllIssues(element));
  }

  protected repositionUnderlines(element: HTMLElement): void {
    this.renderUnderlines(element, this.currentIssues);
  }

  protected applyIssue(element: HTMLElement, issue: UnderlineIssue): void {
    if (!issue.suggestion) return;
    const ok = this.replaceRange(element, issue.start, issue.end, issue.suggestion);
    if (!ok) {
      // The rich editor vetoed the insert (Draft.js / Lexical can refuse).
      // Surface this loudly so the user isn't stuck wondering why Apply
      // appeared to do nothing — clipboard the suggestion as a fallback AND
      // flash the tooltip so the cue is visible without opening DevTools.
      console.warn(
        'Polyscribe: Apply blocked — the editor (Draft.js / Lexical / etc.) refused the insertText command. ' +
          'Suggestion copied to clipboard as fallback.',
      );
      void navigator.clipboard.writeText(issue.suggestion).catch(() => undefined);
      this.tooltip.flashApplied('Copied to clipboard');
      return;
    }
    // Bump the seq so any in-flight runCheck that resolves after this point
    // can't overwrite currentIssues with stale, pre-edit offsets.
    this.checkRequestSeq++;
    const delta = issue.suggestion.length - (issue.end - issue.start);
    this.currentIssues = this.currentIssues
      .filter((i) => i.id !== issue.id)
      .map((i) =>
        i.start >= issue.end
          ? { ...i, start: i.start + delta, end: i.end + delta }
          : i,
      );
    this.lastCheckedText = null;
    this.tooltip.hide();
    this.renderUnderlines(element, this.currentIssues);
  }

  protected dismissIssue(issue: UnderlineIssue): void {
    this.checkRequestSeq++;
    this.currentIssues = this.currentIssues.filter((i) => i.id !== issue.id);
    this.tooltip.hide();
    if (this.activeElement) this.renderUnderlines(this.activeElement, this.currentIssues);
  }

  /**
   * Apply every fixable issue in one go. Walks right-to-left so each
   * replacement leaves the earlier-offset issues' indices valid. Stops on
   * the first `replaceRange` veto (Draft.js/Lexical can refuse) and leaves
   * the remaining issues onscreen so the user knows what didn't apply.
   */
  protected async fixAllIssues(element: HTMLElement): Promise<void> {
    const fixable = this.currentIssues
      .filter((i) => !!i.suggestion)
      .sort((a, b) => b.start - a.start);
    if (!fixable.length) return;

    // Bump seq so an in-flight runCheck can't clobber the edits we're about
    // to make with offsets that no longer match the post-edit text.
    this.checkRequestSeq++;
    this.summaryChip.setLoading(true);
    this.tooltip.hide();

    const applied = new Set<string>();
    for (const issue of fixable) {
      // Verify the offsets still point at `issue.original` in the live text.
      // Rich editors that re-serialize on each insertText (Lexical with some
      // plugins) can shift offsets out from under us; in that case, abort
      // the rest rather than mis-applying.
      if (issue.original) {
        const live = this.getText(element).slice(issue.start, issue.end);
        if (live !== issue.original) {
          console.warn(
            `Polyscribe: Fix all stopped — offsets drifted after a prior replace (expected "${issue.original}", got "${live}").`,
          );
          break;
        }
      }
      const ok = this.replaceRange(element, issue.start, issue.end, issue.suggestion);
      if (!ok) {
        console.warn('Polyscribe: Fix all stopped — replaceRange was vetoed by the editor.');
        break;
      }
      applied.add(issue.id);
    }

    this.currentIssues = this.currentIssues.filter((i) => !applied.has(i.id));
    // Invalidate the dedupe cache so the next debounce re-checks the now-
    // edited text instead of skipping as a no-op.
    this.lastCheckedText = null;
    this.summaryChip.setLoading(false);
    this.renderUnderlines(element, this.currentIssues);
  }
}
