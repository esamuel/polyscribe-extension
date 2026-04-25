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

export function getTrimmedSelectionText(): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  return sel.toString().trim();
}

export function cloneSelectionRange(): Range | null {
  const sel = window.getSelection();
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
