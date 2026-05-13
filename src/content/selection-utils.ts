const HEBREW_RE = /[\u0590-\u05FF]/;
const ARABIC_RE = /[\u0600-\u06FF]/;

export function selectionContainsHebrew(text: string): boolean {
  return HEBREW_RE.test(text);
}

export function contentNeedsRtl(text: string): boolean {
  return HEBREW_RE.test(text) || ARABIC_RE.test(text);
}

export function isGoogleDocsDocument(): boolean {
  return /:\/\/docs\.google\.com\/document\//.test(location.href);
}

export function isLikelyPdfViewer(): boolean {
  const h = location.href;
  if (h.includes('.pdf') && (h.startsWith('http') || h.startsWith('file:'))) return true;
  if (h.includes('chrome-extension://') && h.toLowerCase().includes('pdf')) return true;
  return document.contentType === 'application/pdf';
}

/**
 * Returns the active non-empty Selection — checking the top window first,
 * then every same-origin iframe. Required for Gmail compose (and any other
 * iframe-hosted editor): `window.getSelection()` from the top frame never
 * sees an in-iframe selection, so the FAB and auto-check pipeline used to
 * miss those entirely.
 */
function findActiveSelection(): Selection | null {
  const top = window.getSelection();
  if (top && top.rangeCount > 0 && top.toString().length > 0) return top;
  for (const iframe of Array.from(document.querySelectorAll('iframe'))) {
    try {
      const win = (iframe as HTMLIFrameElement).contentWindow;
      if (!win) continue;
      const sel = win.getSelection();
      if (sel && sel.rangeCount > 0 && sel.toString().length > 0) return sel;
    } catch {
      // Cross-origin iframe — skip.
    }
  }
  // No live text selection anywhere. Fall back to the top window so callers
  // that need a Selection object (even if empty) get a sane default.
  return top ?? null;
}

export function getTrimmedSelectionText(): string {
  const sel = findActiveSelection();
  if (!sel || sel.rangeCount === 0) return '';
  return sel.toString().trim();
}

export function cloneSelectionRange(): Range | null {
  const sel = findActiveSelection();
  if (!sel || sel.rangeCount === 0) return null;
  try {
    return sel.getRangeAt(0).cloneRange();
  } catch {
    return null;
  }
}

export function rangeText(range: Range): string {
  try {
    return range.toString().trim();
  } catch {
    return '';
  }
}

/**
 * Shrinks a range to exclude leading/trailing whitespace so it matches
 * the trimmed string you send to the API. Required when the live selection
 * includes spaces but the translation is of the trimmed text only.
 * Handles single text nodes and textarea / text-like input as range container.
 */
export function shrinkRangeToTrimmedContent(range: Range | null): Range | null {
  if (!range) return null;
  let r: Range;
  try {
    r = range.cloneRange();
  } catch {
    return null;
  }
  const full = r.toString();
  if (!full) return r;
  let lead = 0;
  while (lead < full.length && /\s/u.test(full[lead]!)) {
    lead += 1;
  }
  let end = full.length;
  while (end > lead && /\s/u.test(full[end - 1]!)) {
    end -= 1;
  }
  if (end <= lead) return r;

  if (r.startContainer === r.endContainer) {
    if (r.startContainer.nodeType === Node.TEXT_NODE) {
      const n = r.startContainer as Text;
      const a = r.startOffset + lead;
      const b = r.startOffset + end;
      if (a >= 0 && b <= n.length && a <= b) {
        r.setStart(n, a);
        r.setEnd(n, b);
        return r;
      }
    }
    if (r.startContainer instanceof HTMLTextAreaElement) {
      const el = r.startContainer;
      const a = r.startOffset + lead;
      const b = r.startOffset + end;
      if (a >= 0 && b <= el.value.length && a <= b) {
        r.setStart(el, a);
        r.setEnd(el, b);
        return r;
      }
    }
    if (r.startContainer instanceof HTMLInputElement) {
      const el = r.startContainer;
      const a = r.startOffset + lead;
      const b = r.startOffset + end;
      if (a >= 0 && b <= el.value.length && a <= b) {
        r.setStart(el, a);
        r.setEnd(el, b);
        return r;
      }
    }
  }
  return range.cloneRange();
}
