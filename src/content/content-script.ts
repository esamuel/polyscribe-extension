import { MSG, type PolyscribeRequest, type PolyscribeResponse } from '../lib/messaging';
import { getSettings } from '../lib/storage';
import type { CheckResponse } from '../lib/types';
import {
  cloneSelectionRange,
  getTrimmedSelectionText,
  isGoogleDocsDocument,
  isLikelyPdfViewer,
  shrinkRangeToTrimmedContent,
} from './selection-utils';
import {
  getFloatingButtonRect,
  onFloatingButtonClick,
  onQuickAction,
  setFabMode,
  setFloatingButtonPosition,
  setQuickActionLoading,
  setQuickActionsVisible,
  showFloatingButtonIdle,
  type QuickActionId,
} from './floating-button';
import { applyTextToRange } from './apply-text';
import { pickAdapter } from './adapters';
import { PolyscribeOverlay } from './result-overlay';
import { SelectionUnderlines } from './SelectionUnderlines';
import { rectsToTopDoc } from './lib/iframeRects';

type ContextPayload = {
  type: 'POLYSCRIBE_CONTEXT';
  selectionText: string;
  request: PolyscribeRequest;
  response: PolyscribeResponse;
};

type OpenTranslateMessage = { type: 'POLYSCRIBE_OPEN_TRANSLATE' };

function wordCount(s: string): number {
  const trimmed = s.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Whether the selection is long enough to warrant the rephrase chips.
 * Uses word count for space-separated scripts, falls back to character
 * length so 25+ Chinese / Japanese characters (which often have no spaces)
 * also surface the chips.
 */
function isMeaningfulSelection(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return wordCount(t) >= 5 || t.length >= 25;
}

type QuickActionPreset =
  | { type: 'rewrite'; instruction: string }
  | { type: 'tone'; tone: 'formal' | 'casual' };

// Append the length anchor to every preset that isn't explicitly trying to
// shorten — the model otherwise often returns a wordier paragraph when asked
// to "rephrase a sentence," which feels bad inline. Tone presets are tone-
// only (we don't pass instructions there); the server tone prompt already
// preserves length implicitly via "preserving meaning and language."
const KEEP_CLOSE = ' Keep the result close to the original length.';

const QUICK_ACTION_PRESETS: Record<QuickActionId, QuickActionPreset> = {
  rephrase: {
    type: 'rewrite',
    instruction: 'Rewrite for clarity and flow while preserving meaning.' + KEEP_CLOSE,
  },
  shorter: {
    type: 'rewrite',
    instruction:
      'Rewrite shorter while preserving meaning. Aim for about 70% of the original length.',
  },
  formal: { type: 'tone', tone: 'formal' },
  casual: { type: 'tone', tone: 'casual' },
};

function rectFromRange(range: Range): DOMRect {
  const localRects = Array.from(range.getClientRects());
  // Translate iframe-local rects into top-document viewport space so the
  // FAB / overlay (which live in the top doc with position: fixed) anchor
  // at the right place when the selection is inside Gmail's compose iframe.
  const rects = rectsToTopDoc(range.commonAncestorContainer, localRects);
  if (!rects.length) {
    const bb = range.getBoundingClientRect();
    const [transformed] = rectsToTopDoc(range.commonAncestorContainer, [bb]);
    return transformed ?? bb;
  }
  let minL = Infinity;
  let minT = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    minL = Math.min(minL, r.left);
    minT = Math.min(minT, r.top);
    maxR = Math.max(maxR, r.right);
    maxB = Math.max(maxB, r.bottom);
  }
  return new DOMRect(minL, minT, maxR - minL, maxB - minT);
}

function isDegenerateRect(r: DOMRect): boolean {
  return (
    !r ||
    !Number.isFinite(r.left) ||
    !Number.isFinite(r.top) ||
    (r.width === 0 && r.height === 0 && r.left === 0 && r.top === 0)
  );
}

/**
 * Best-effort overlay anchor. Some sites (Gmail reading pane in particular)
 * clear the native selection between the FAB show and click, leaving us with
 * a stale `Range` whose `getClientRects()` returns nothing — `rectFromRange`
 * then yields `{0,0,0,0}` and the overlay ends up jammed in a corner. Fall
 * back to the FAB's own screen rect, which is always valid at click time.
 */
function anchorRectForOverlay(range: Range): DOMRect {
  const fromRange = rectFromRange(range);
  if (!isDegenerateRect(fromRange)) return fromRange;
  const fab = getFloatingButtonRect();
  if (fab) return fab;
  return new DOMRect(window.innerWidth / 2 - 180, 80, 0, 0);
}

let lastSelection: { range: Range; text: string } | null = null;
let lastPrefetch: { text: string; data: CheckResponse; issues: number } | null = null;
let autoQuotaUsed = 0;
let debounceCheck: ReturnType<typeof setTimeout> | null = null;
/** Selection text the user explicitly dismissed. Suppresses auto-reopen for
 *  exactly THAT text — a fresh selection (different text) still auto-opens. */
let dismissedText: string | null = null;

let overlaySingleton: PolyscribeOverlay | null = null;
function getOverlay(): PolyscribeOverlay {
  if (!overlaySingleton) {
    overlaySingleton = new PolyscribeOverlay();
    overlaySingleton.onClose(() => {
      // Remember which selection text the user dismissed so we don't
      // immediately re-open the same overlay if the auto-check completes
      // again for that same selection.
      dismissedText = lastSelection?.text ?? null;
    });
  }
  return overlaySingleton;
}

let selectionUnderlinesSingleton: SelectionUnderlines | null = null;
function getSelectionUnderlines(): SelectionUnderlines {
  if (!selectionUnderlinesSingleton) {
    selectionUnderlinesSingleton = new SelectionUnderlines();
    // Reposition on viewport changes so underlines stay glued to the text.
    window.addEventListener('scroll', () => selectionUnderlinesSingleton?.reposition(), {
      passive: true,
      capture: true,
    });
    window.addEventListener('resize', () => selectionUnderlinesSingleton?.reposition());
  }
  return selectionUnderlinesSingleton;
}

function isInsideEditable(range: Range): boolean {
  const node = range.commonAncestorContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el) return false;
  return !!el.closest('[contenteditable="true"], textarea, input');
}

let floatingEnabled = true;
let autoCheckOn = true;
let autoCheckQuota = 20;

async function refreshSettings(): Promise<void> {
  const s = await getSettings();
  floatingEnabled = s.enableFloatingButton !== false;
  autoCheckOn = s.autoCheckOnSelection !== false;
  autoCheckQuota = s.autoCheckQuotaPerPage;
  if (!floatingEnabled) {
    setFabMode('hidden');
  }
}

void refreshSettings().catch(() => undefined);

async function maybeInstallInlineUnderlines(): Promise<void> {
  try {
    const s = await getSettings();
    if (!s.apiToken?.trim() || s.enableInlineUnderlines === false) return;
    const adapter = pickAdapter();
    if (adapter) adapter.install();
  } catch {
    /* ignore */
  }
}
void maybeInstallInlineUnderlines();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.polyscribeSettings) void refreshSettings().catch(() => undefined);
});

function isTwitterComposingShort(): boolean {
  const h = location.hostname;
  if (!/^(www\.)?(twitter\.com|x\.com)$/i.test(h)) return false;
  return getTrimmedSelectionText().length < 50;
}

function updateLastSelection(): void {
  const text = getTrimmedSelectionText();
  if (text.length < 3) {
    lastSelection = null;
    if (text.length < 1) {
      lastPrefetch = null;
      setFabMode('hidden');
      // No selection at all → drop any read-only underlines we painted.
      selectionUnderlinesSingleton?.clear();
    }
    return;
  }
  const range0 = cloneSelectionRange();
  if (!range0) {
    lastSelection = null;
    return;
  }
  const range = shrinkRangeToTrimmedContent(range0) ?? range0;
  if (lastSelection && lastSelection.text !== text) {
    lastPrefetch = null;
    // Selection text changed — previous underlines are no longer relevant.
    selectionUnderlinesSingleton?.clear();
    // A new selection means the previous dismissal no longer suppresses
    // anything; auto-open is free to fire again for this fresh text.
    dismissedText = null;
  }
  lastSelection = { range, text };
}

function scheduleAutoCheck(): void {
  if (!autoCheckOn) return;
  if (isLikelyPdfViewer() || isGoogleDocsDocument()) return;
  if (isTwitterComposingShort()) return;
  if (autoQuotaUsed >= autoCheckQuota) return;

  if (debounceCheck) {
    clearTimeout(debounceCheck);
    debounceCheck = null;
  }

  debounceCheck = window.setTimeout(() => {
    debounceCheck = null;
    void (async () => {
      const s = await getSettings();
      if (!s.autoCheckOnSelection) return;
      const t = getTrimmedSelectionText();
      if (t.length < 10) return;
      if (isTwitterComposingShort()) return;
      if (autoQuotaUsed >= s.autoCheckQuotaPerPage) return;
      if (t !== lastSelection?.text) return;

      const language = s.defaultLanguage;
      const raw = await sendSw<PolyscribeResponse>({
        type: MSG.CHECK,
        text: t,
        language: language === 'auto' ? 'auto' : language,
      });
      if (!raw || !('ok' in raw) || !raw.ok) return;
      const data = raw.data as CheckResponse;
      autoQuotaUsed += 1;
      const n = data.issues?.length ?? 0;
      if (n > 0) {
        lastPrefetch = { text: t, data, issues: n };
        setFabMode('issues', { issueCount: n });
        const sel = lastSelection;
        if (sel && sel.text === t) {
          // Paint inline underlines on the selection only when it's NOT
          // inside an editable element — BaseAdapter already handles those.
          // Read-only contexts (ChatGPT replies, articles, email reading
          // pane) are where this matters most.
          if (!isInsideEditable(sel.range)) {
            getSelectionUnderlines().paint(sel.range, data.issues);
          }
          // Auto-open the overlay so the user immediately sees the issues
          // without having to discover the FAB. Skip if the user already
          // dismissed the overlay for THIS exact selection — they made an
          // active choice to close it. A different selection re-opens.
          if (dismissedText !== t) {
            const rect = anchorRectForOverlay(sel.range);
            getOverlay().openWithPrefetch(
              { range: sel.range, text: t, googleDocsMode: isGoogleDocsDocument() },
              rect,
              { type: MSG.CHECK, text: t, language: language === 'auto' ? 'auto' : language },
              { ok: true, data },
            );
          }
        }
      } else {
        setFabMode('ok');
        getSelectionUnderlines().clear();
        window.setTimeout(() => {
          if (getTrimmedSelectionText() === t) {
            setFabMode('hidden');
          }
        }, 1000);
      }
    })().catch(() => undefined);
  }, 600);
}

function sendSw<T>(msg: PolyscribeRequest): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(resp as T);
      });
    } catch {
      resolve(null);
    }
  });
}

function onSelectionOrMouseUp(): void {
  window.setTimeout(() => {
    if (isLikelyPdfViewer()) {
      setFabMode('hidden');
      return;
    }
    const text = getTrimmedSelectionText();
    if (text.length < 3 || !floatingEnabled) {
      if (text.length < 3) {
        setFabMode('hidden');
        lastSelection = null;
        lastPrefetch = null;
      }
      updateLastSelection();
      return;
    }
    updateLastSelection();
    const range = cloneSelectionRange();
    if (!range) {
      setFabMode('hidden');
      return;
    }
    const rect = rectFromRange(range);
    showFloatingButtonIdle();
    setFloatingButtonPosition(rect.right + 8, rect.top);
    // Show one-click rephrase chips alongside the FAB once the selection is
    // long enough to be a meaningful sentence (~5 words). Keeps the chips
    // out of the way for tiny "fix this typo" selections.
    setQuickActionsVisible(isMeaningfulSelection(text));
    if (text.length >= 10 && autoCheckOn) {
      if (autoQuotaUsed < autoCheckQuota) {
        scheduleAutoCheck();
      } else {
        setFabMode('idle');
      }
    } else {
      setFabMode('idle');
    }
  }, 0);
}

document.addEventListener('mouseup', onSelectionOrMouseUp);
document.addEventListener('selectionchange', onSelectionOrMouseUp);

document.addEventListener('contextmenu', () => {
  updateLastSelection();
});

let fabInit = false;
function initFabOnce(): void {
  if (fabInit) return;
  fabInit = true;
  onFloatingButtonClick(() => {
    const sel = lastSelection;
    if (!sel) return;
    const rect = anchorRectForOverlay(sel.range);
    const gdocs = isGoogleDocsDocument();
    if (lastPrefetch && lastPrefetch.text === sel.text) {
      const n = lastPrefetch.issues;
      if (n > 0) {
        getOverlay().openWithPrefetch(
          { range: sel.range, text: sel.text, googleDocsMode: gdocs },
          rect,
          {
            type: MSG.CHECK,
            text: sel.text,
            language: 'auto',
          },
          { ok: true, data: lastPrefetch.data },
        );
        return;
      }
    }
    getOverlay().open(
      {
        range: sel.range,
        text: sel.text,
        googleDocsMode: gdocs,
      },
      rect,
    );
  });

  onQuickAction((id) => {
    const sel = lastSelection;
    if (!sel) return;
    void runQuickAction(id, sel.text, sel.range);
  });
}

async function runQuickAction(id: QuickActionId, text: string, range: Range): Promise<void> {
  const preset = QUICK_ACTION_PRESETS[id];
  setQuickActionLoading(id);
  try {
    let result: string | null = null;
    if (preset.type === 'rewrite') {
      const resp = await sendSw<PolyscribeResponse>({
        type: MSG.REWRITE,
        text,
        instruction: preset.instruction,
      });
      if (resp && 'ok' in resp && resp.ok) {
        result = (resp.data as { text?: string }).text ?? null;
      }
    } else {
      const resp = await sendSw<PolyscribeResponse>({
        type: MSG.TONE,
        text,
        tone: preset.tone,
      });
      if (resp && 'ok' in resp && resp.ok) {
        result = (resp.data as { text?: string }).text ?? null;
      }
    }
    if (!result) return;
    const gdocs = isGoogleDocsDocument();
    const mode = applyTextToRange(range, result, gdocs);
    if (mode === 'clipboard') {
      // Range went stale or editor isn't writable from script — text went
      // to clipboard. The FAB-show window will close on the next selection
      // change so user feedback is implicit.
    } else if (mode === 'ok') {
      setFabMode('hidden');
    }
  } catch (err) {
    console.warn('Polyscribe quick action failed:', err);
  } finally {
    setQuickActionLoading(null);
  }
}

initFabOnce();

chrome.runtime.onMessage.addListener(
  (message: ContextPayload | OpenTranslateMessage) => {
    if (message.type === 'POLYSCRIBE_OPEN_TRANSLATE') {
      const sel = lastSelection;
      if (!sel) return;
      const rect = anchorRectForOverlay(sel.range);
      getOverlay().openTranslateChooser(
        {
          range: sel.range,
          text: sel.text,
          googleDocsMode: isGoogleDocsDocument(),
        },
        rect,
      );
      return;
    }
    if (!message || message.type !== 'POLYSCRIBE_CONTEXT') return;

    const m = message as ContextPayload;
    const text = m.selectionText?.trim() ?? '';
    let range: Range | null = null;
    if (lastSelection && lastSelection.text === text) {
      range = lastSelection.range;
    }
    const ctx = {
      range,
      text,
      googleDocsMode: isGoogleDocsDocument(),
    };
    const anchorRect = range ? anchorRectForOverlay(range) : new DOMRect(24, 24, 0, 0);
    getOverlay().openWithPrefetch(ctx, anchorRect, m.request, m.response);
  },
);
