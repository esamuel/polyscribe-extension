/**
 * Map character offsets in plain text to client rects for contenteditable / textarea.
 *
 * Contenteditable mapping delegates to `editableText.ts`, which uses the same
 * walker as `getEditableText` so offsets stay consistent across paragraph /
 * block boundaries (critical for ProseMirror-based editors like ChatGPT).
 */

import { rangeRectsForOffsets } from './editableText';

export function getContentEditableRangeRects(
  element: HTMLElement,
  start: number,
  end: number,
): DOMRect[] {
  if (start >= end) return [];
  return rangeRectsForOffsets(element, start, end);
}

export function getTextareaRangeRects(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
): DOMRect[] {
  if (start >= end) return [];
  const mirror = document.createElement('div');
  const cs = window.getComputedStyle(textarea);
  const props = [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'lineHeight',
    'letterSpacing',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'boxSizing',
    'wordWrap',
    'whiteSpace',
    'textTransform',
  ] as const;
  for (const p of props) {
    mirror.style.setProperty(p, cs.getPropertyValue(p));
  }
  mirror.style.cssText += `
    position: absolute; top: -9999px; left: -9999px;
    visibility: hidden; white-space: pre-wrap; overflow-wrap: break-word;
    width: ${textarea.clientWidth}px;
  `;

  const val = textarea.value;
  const before = document.createTextNode(val.slice(0, start));
  const span = document.createElement('span');
  span.textContent = val.slice(start, end);
  const after = document.createTextNode(val.slice(end));

  mirror.appendChild(before);
  mirror.appendChild(span);
  mirror.appendChild(after);
  document.body.appendChild(mirror);

  const mirrorRect = mirror.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  const spanRects = Array.from(span.getClientRects());

  const result = spanRects.map(
    (r) =>
      new DOMRect(
        textareaRect.left + (r.left - mirrorRect.left) - textarea.scrollLeft,
        textareaRect.top + (r.top - mirrorRect.top) - textarea.scrollTop,
        r.width,
        r.height,
      ),
  );

  mirror.remove();
  return result;
}
