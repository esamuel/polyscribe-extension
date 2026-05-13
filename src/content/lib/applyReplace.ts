import { rangeFromOffsets } from './editableText';

/**
 * Replace a range inside a contenteditable element as if the user typed it.
 *
 * Why this exists: mutating `element.innerText` blows away rich editors'
 * internal state (ProseMirror, Quill, Lexical, Slate, Draft). The reliable
 * way to ask a rich editor to swap text *and* keep history/undo/decorations
 * intact is to dispatch `beforeinput` and call `execCommand('insertText', …)`,
 * which the editor handles as a user-driven edit.
 *
 * `execCommand` itself dispatches the trailing `input` event — callers must
 * NOT fire another or undo history doubles up.
 */
export function applyContentEditableReplace(
  element: HTMLElement,
  start: number,
  end: number,
  replacement: string,
): boolean {
  const range = rangeFromOffsets(element, start, end);
  if (!range) return false;

  // IFRAME-AWARE: Gmail's compose body, and any other editor inside a same-
  // origin iframe, has its OWN window/document. Calling `window.getSelection()`
  // or `document.execCommand()` from the top frame either no-ops or operates
  // on the wrong document — the user reported "Fix all" doing nothing on
  // Gmail; that was the cause. Use the element's owner-document throughout.
  const ownerDoc = element.ownerDocument ?? document;
  const ownerWin = ownerDoc.defaultView ?? window;

  const selection = ownerWin.getSelection();
  if (!selection) return false;

  element.focus();
  selection.removeAllRanges();
  selection.addRange(range);

  const beforeInput = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: replacement,
  });
  const accepted = element.dispatchEvent(beforeInput);
  if (!accepted) return false;

  // execCommand is deprecated but remains the most reliable cross-editor
  // way to ask a rich editor to insert text as a user-driven edit.
  // MUST be called on the element's owner document — not the top doc —
  // so iframe-hosted editors (Gmail) actually receive the insert.
  // eslint-disable-next-line deprecation/deprecation
  return ownerDoc.execCommand('insertText', false, replacement);
}

/**
 * Fallback for textareas (HTMLTextAreaElement). Uses the native value setter
 * so React's `onChange` fires for controlled inputs, and only nudges the caret
 * when the textarea is currently focused (so we don't steal focus from
 * elsewhere on the page).
 *
 * Returns `true` always — the native setter cannot fail. The return signature
 * matches `applyContentEditableReplace` so adapters can forward the boolean
 * through `replaceRange`.
 */
export function applyTextareaReplace(
  element: HTMLTextAreaElement,
  start: number,
  end: number,
  replacement: string,
): boolean {
  const v = element.value;
  const next = v.slice(0, start) + replacement + v.slice(end);
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(element, next);
  else element.value = next;
  // Use the textarea's owner document — irrelevant today (no iframe-hosted
  // <textarea> in our target list) but correct for the day it isn't.
  const ownerDoc = element.ownerDocument ?? document;
  if (ownerDoc.activeElement === element) {
    const caret = start + replacement.length;
    element.setSelectionRange(caret, caret);
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}
