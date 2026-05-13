import { BaseAdapter } from './BaseAdapter';
import { getEditableText } from '../lib/editableText';
import { applyContentEditableReplace } from '../lib/applyReplace';
import { getContentEditableRangeRects } from '../lib/textRanges';

// Gmail's compose body lives inside a dynamically-attached same-origin iframe
// (one per draft window). `document.querySelectorAll` from the top document
// never crosses iframe boundaries, so we must enumerate iframes and query
// their `contentDocument`.
const GMAIL_SELECTORS = [
  '[contenteditable="true"][aria-label*="Message Body" i]',
  '[contenteditable="true"][role="textbox"][g_editable="true"]',
].join(', ');

function* sameOriginDocuments(): Iterable<Document> {
  yield document;
  for (const iframe of Array.from(document.querySelectorAll('iframe'))) {
    try {
      const d = iframe.contentDocument;
      if (d) yield d;
    } catch {
      // Cross-origin iframe — skip.
    }
  }
}

/**
 * Translate iframe-local client rects into top-document coordinates by
 * adding the iframe element's bounding rect offset. The underline overlay
 * lives in the top document and uses `position: fixed`, so it needs
 * coordinates in the top viewport's frame of reference.
 */
function transformRectsToTopDoc(element: HTMLElement, rects: DOMRect[]): DOMRect[] {
  const frame = element.ownerDocument?.defaultView?.frameElement;
  if (!(frame instanceof HTMLElement)) return rects;
  const fr = frame.getBoundingClientRect();
  return rects.map((r) => new DOMRect(r.left + fr.left, r.top + fr.top, r.width, r.height));
}

export class GmailAdapter extends BaseAdapter {
  findEditableElements(): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const doc of sameOriginDocuments()) {
      const found = doc.querySelectorAll(GMAIL_SELECTORS);
      for (const el of Array.from(found)) {
        if (el instanceof HTMLElement) out.push(el);
      }
    }
    return out;
  }

  getText(element: HTMLElement): string {
    return getEditableText(element);
  }

  replaceRange(element: HTMLElement, start: number, end: number, replacement: string): boolean {
    return applyContentEditableReplace(element, start, end, replacement);
  }

  getRangeRects(element: HTMLElement, start: number, end: number): DOMRect[] {
    const rects = getContentEditableRangeRects(element, start, end);
    return transformRectsToTopDoc(element, rects);
  }
}
