import { MSG, type PolyscribeRequest, type PolyscribeResponse } from '../lib/messaging';
import { getSettings } from '../lib/storage';
import type { CheckResponse } from '../lib/types';
import {
  cloneSelectionRange,
  getTrimmedSelectionText,
  isGoogleDocsDocument,
  isLikelyPdfViewer,
} from './selection-utils';
import {
  onFloatingButtonClick,
  setFabMode,
  setFloatingButtonPosition,
  showFloatingButtonIdle,
} from './floating-button';
import { PolyscribeOverlay } from './result-overlay';

type ContextPayload = {
  type: 'POLYSCRIBE_CONTEXT';
  selectionText: string;
  request: PolyscribeRequest;
  response: PolyscribeResponse;
};

type OpenTranslateMessage = { type: 'POLYSCRIBE_OPEN_TRANSLATE' };

function rectFromRange(range: Range): DOMRect {
  const rects = range.getClientRects();
  if (!rects.length) return range.getBoundingClientRect();
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

let lastSelection: { range: Range; text: string } | null = null;
let lastPrefetch: { text: string; data: CheckResponse; issues: number } | null = null;
let autoQuotaUsed = 0;
let debounceCheck: ReturnType<typeof setTimeout> | null = null;

let overlaySingleton: PolyscribeOverlay | null = null;
function getOverlay(): PolyscribeOverlay {
  overlaySingleton ??= new PolyscribeOverlay();
  return overlaySingleton;
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

void refreshSettings();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.polyscribeSettings) void refreshSettings();
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
    }
    return;
  }
  const range = cloneSelectionRange();
  if (!range) {
    lastSelection = null;
    return;
  }
  if (lastSelection && lastSelection.text !== text) {
    lastPrefetch = null;
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
      } else {
        setFabMode('ok');
        window.setTimeout(() => {
          if (getTrimmedSelectionText() === t) {
            setFabMode('hidden');
          }
        }, 1000);
      }
    })();
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
    const rect = rectFromRange(sel.range);
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
}

initFabOnce();

chrome.runtime.onMessage.addListener(
  (message: ContextPayload | OpenTranslateMessage) => {
    if (message.type === 'POLYSCRIBE_OPEN_TRANSLATE') {
      const sel = lastSelection;
      if (!sel) return;
      const rect = rectFromRange(sel.range);
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
    const anchorRect = range ? rectFromRange(range) : new DOMRect(24, 24, 0, 0);
    getOverlay().openWithPrefetch(ctx, anchorRect, m.request, m.response);
  },
);
