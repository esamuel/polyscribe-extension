import { getSettings } from '../../lib/storage';
import {
  isExtensionContextInvalidated,
  requestAiCheckFromSw,
  requestCheckFromSw,
} from '../lib/sw-check';
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

/**
 * Find the occurrence of `needle` in `haystack` whose start is closest to
 * `hint`. Returns null if no occurrence exists. Used by the rebinder to
 * snap a stale underline back to whatever its original text is now.
 */
function findNearest(
  haystack: string,
  needle: string,
  hint: number,
): { start: number; end: number } | null {
  if (!needle) return null;
  let bestIdx = -1;
  let bestDist = Infinity;
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, cursor);
    if (found < 0) break;
    const dist = Math.abs(found - hint);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = found;
    }
    cursor = found + 1;
  }
  return bestIdx < 0 ? null : { start: bestIdx, end: bestIdx + needle.length };
}

/**
 * Whitespace-normalized + case-insensitive search. Builds a position map
 * so a hit in the normalized text translates back to live-text positions.
 * Handles NBSP vs space, smart-quote vs straight, double space vs single,
 * em-dash vs hyphen, casing drift from autocorrect.
 *
 * The map flattens runs of whitespace AND non-ASCII typographic
 * characters into their ASCII equivalents — so this is permissive on
 * purpose. The caller still uses the returned offsets to slice the LIVE
 * text, so we never insert wrong characters; we just find where to
 * splice.
 */
function findNormalized(
  liveText: string,
  original: string,
  hint: number,
): { start: number; end: number } | null {
  // Map typographic chars to their ASCII equivalents. Anything not in this
  // map is normalized just by lowercase + whitespace-collapse.
  const TYPO_MAP: Record<string, string> = {
    ' ': ' ', // NBSP
    ' ': ' ', // thin space
    ' ': ' ', // narrow NBSP
    '‘': "'", // left single
    '’': "'", // right single
    '“': '"', // left double
    '”': '"', // right double
    '–': '-', // en dash
    '—': '-', // em dash
    '…': '...', // ellipsis
  };

  // Build normalized string + per-position map back to liveText.
  const normChars: string[] = [];
  const map: number[] = []; // map[i] = index in liveText where normChars[i] starts
  let prevWs = false;
  for (let i = 0; i < liveText.length; i++) {
    const c = liveText[i]!;
    const mapped = TYPO_MAP[c] ?? c;
    if (/^\s$/.test(mapped)) {
      if (prevWs) continue;
      normChars.push(' ');
      map.push(i);
      prevWs = true;
      continue;
    }
    prevWs = false;
    if (mapped.length === 1) {
      normChars.push(mapped.toLowerCase());
      map.push(i);
    } else {
      // multi-char (e.g. ellipsis → "..."), preserve mapping back to same i
      for (const ch of mapped) {
        normChars.push(ch.toLowerCase());
        map.push(i);
      }
    }
  }
  const normLive = normChars.join('');

  // Normalize the needle the same way (don't need a map — just searching).
  const normNeedle = original
    .split('')
    .map((c) => TYPO_MAP[c] ?? c)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (!normNeedle.length) return null;

  // Pick nearest occurrence to hint.
  let bestNormIdx = -1;
  let bestDist = Infinity;
  let cursor = 0;
  while (cursor <= normLive.length - normNeedle.length) {
    const found = normLive.indexOf(normNeedle, cursor);
    if (found < 0) break;
    const liveApprox = map[found] ?? 0;
    const dist = Math.abs(liveApprox - hint);
    if (dist < bestDist) {
      bestDist = dist;
      bestNormIdx = found;
    }
    cursor = found + 1;
  }
  if (bestNormIdx < 0) return null;

  const liveStart = map[bestNormIdx];
  // End is the live position one past the last matched normalized char.
  const lastNormIdx = bestNormIdx + normNeedle.length - 1;
  const lastLiveIdx = map[lastNormIdx];
  if (liveStart === undefined || lastLiveIdx === undefined) return null;
  // The last char in liveText that participated in the match could be the
  // start of a multi-char mapping (e.g. ellipsis). Step forward until the
  // next mapped position changes, so we include all source chars.
  let liveEnd = lastLiveIdx + 1;
  while (liveEnd < liveText.length && map[lastNormIdx] === map[lastNormIdx + 1]) {
    liveEnd++;
  }
  return { start: liveStart, end: liveEnd };
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
    // 500ms (was 1500ms) — local spell-check fires on word boundaries for
    // instant feedback, so the cloud call here is just for grammar + style.
    // Tighter debounce keeps the perceived latency under ~1 second after
    // the user pauses, matching the "real-time" UX feel.
    this.debouncer = new Debouncer(500);
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
    // Extension was reloaded — content script is orphaned. Stop trying;
    // the StaleBanner is already telling the user to refresh the tab.
    if (isExtensionContextInvalidated()) {
      this.overlay.clear();
      this.tooltip.hide();
      this.summaryChip.hide();
      return;
    }
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

  /**
   * Re-find an issue's anchor in the live text. The cached `issue.start /
   * issue.end` offsets can go stale when:
   *   - the user typed more text after the check resolved but before they
   *     clicked Apply / Fix all,
   *   - a rich editor (ProseMirror) batches a state-to-DOM render that
   *     subtly shifts text-node boundaries,
   *   - an AI-tell and a grammar issue were computed against slightly
   *     different snapshots inside Promise.all.
   *
   * Strategy: if `live[start..end]` already matches `original`, no rebind
   * needed (the common case). Otherwise search the whole document for
   * `original`; if found, snap to the occurrence nearest to the cached
   * `start` (heuristic that handles "user added a sentence above" or
   * "below" cleanly). If `original` doesn't appear at all, give up.
   */
  protected rebindIssueOffsets(
    element: HTMLElement,
    issue: UnderlineIssue,
  ): { start: number; end: number } | null {
    if (!issue.original) {
      return { start: issue.start, end: issue.end };
    }
    const liveText = this.getText(element);

    // Fast path: cached offsets still point at the right text. Common case.
    if (liveText.slice(issue.start, issue.end) === issue.original) {
      return { start: issue.start, end: issue.end };
    }

    // Tier 1 — exact match anywhere. Pick the occurrence nearest the hint.
    const exactHit = findNearest(liveText, issue.original, issue.start);
    if (exactHit) return exactHit;

    // Tier 2 — trim trailing/leading whitespace from `original` (the AI
    // sometimes returns "word " with a trailing space that the live text
    // doesn't have at that position).
    const trimmed = issue.original.trim();
    if (trimmed.length && trimmed.length !== issue.original.length) {
      const trimHit = findNearest(liveText, trimmed, issue.start);
      if (trimHit) return trimHit;
    }

    // Tier 3 — whitespace-normalized + case-insensitive search. Maps the
    // hit back to live-text positions char by char. Handles NBSP vs space,
    // smart-quote vs straight-quote, double space vs single, and casing
    // drift from autocorrect.
    const fuzzy = findNormalized(liveText, issue.original, issue.start);
    if (fuzzy) return fuzzy;

    return null;
  }

  protected applyIssue(element: HTMLElement, issue: UnderlineIssue): void {
    if (!issue.suggestion) return;
    // Rebind offsets to wherever `original` actually lives now — handles
    // the case where the user kept typing between check and Apply.
    const live = this.rebindIssueOffsets(element, issue);
    if (!live) {
      console.warn(
        `Polyscribe: Apply skipped — "${issue.original}" is no longer in the document.`,
      );
      this.tooltip.hide();
      return;
    }
    const ok = this.replaceRange(element, live.start, live.end, issue.suggestion);
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
    const delta = issue.suggestion.length - (live.end - live.start);
    this.currentIssues = this.currentIssues
      .filter((i) => i.id !== issue.id)
      .map((i) =>
        i.start >= live.end
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

    // Walk right-to-left so each replacement leaves earlier-offset issues
    // untouched. **Skip on failure instead of bailing on the first veto** —
    // previously a single Draft.js/Lexical refusal stopped the whole batch
    // and the user saw "Fix all" do nothing. Now we apply what we can.
    const applied = new Set<string>();
    const skipped: Array<{ id: string; reason: 'drift' | 'veto' | 'gone' }> = [];
    for (const issue of fixable) {
      // Re-find each issue's anchor in the live text. Cached offsets can be
      // wildly off (the user typed a whole sentence above between the check
      // and this click). If `original` is still somewhere in the document,
      // use the nearest occurrence. If it's gone entirely, then skip.
      const live = this.rebindIssueOffsets(element, issue);
      if (!live) {
        console.warn(
          `Polyscribe: Fix all — "${issue.original}" no longer in document, skipping.`,
        );
        skipped.push({ id: issue.id, reason: 'gone' });
        continue;
      }
      const ok = this.replaceRange(element, live.start, live.end, issue.suggestion);
      if (!ok) {
        console.warn(
          `Polyscribe: Fix all — editor refused replacement for "${issue.original}". Continuing.`,
        );
        skipped.push({ id: issue.id, reason: 'veto' });
        continue;
      }
      applied.add(issue.id);
    }

    // Keep skipped issues onscreen so the user can see what didn't apply
    // and decide what to do (retry, edit manually, dismiss).
    this.currentIssues = this.currentIssues.filter((i) => !applied.has(i.id));
    // Invalidate the dedupe cache so the next debounce re-checks the now-
    // edited text instead of skipping as a no-op.
    this.lastCheckedText = null;

    // When the editor refused EVERY replacement (Lexical / Draft.js in some
    // contexts), the user has no actionable next step from "check console".
    // Build the corrected text in-memory and copy it — Cmd-V then becomes
    // the way out. Same fallback the single-issue Apply does on veto.
    let copiedToClipboard = false;
    if (applied.size === 0 && skipped.length > 0) {
      let workingText = this.getText(element);
      // Use the rebinder for each issue so the clipboard text reflects the
      // ACTUAL current document, not the stale offsets the editor refused.
      // Right-to-left order keeps earlier-offset rebinds valid as we go.
      const liveAnchors = fixable
        .map((issue) => ({ issue, live: this.rebindIssueOffsets(element, issue) }))
        .filter((x): x is { issue: UnderlineIssue; live: { start: number; end: number } } =>
          !!x.live,
        )
        .sort((a, b) => b.live.start - a.live.start);
      for (const { issue, live } of liveAnchors) {
        workingText =
          workingText.slice(0, live.start) + issue.suggestion + workingText.slice(live.end);
      }
      try {
        void navigator.clipboard.writeText(workingText).catch(() => undefined);
        copiedToClipboard = true;
      } catch {
        /* clipboard write requires user gesture in some contexts — silent */
      }
    }

    // Surface the outcome on the chip itself (not just console) — the user
    // shouldn't have to open devtools to know what happened.
    this.summaryChip.showResult(applied.size, fixable.length, copiedToClipboard);

    // Re-render underlines for the remaining issues, then hide the chip
    // after a short window if everything applied (success state).
    this.renderUnderlines(element, this.currentIssues);
    if (skipped.length === 0) {
      window.setTimeout(() => this.summaryChip.hide(), 1100);
    }
  }
}
