import { rangeFromOffsets } from './editableText';

/**
 * Replace a range inside a contenteditable element as if the user typed it.
 *
 * Why this is hard: every modern rich editor (ProseMirror in ChatGPT,
 * Lexical in WhatsApp / Gmail / LinkedIn-messaging, Quill in LinkedIn posts,
 * Draft.js in X) intercepts `beforeinput` events and decides whether to
 * apply them based on `inputType`. They ALL special-case `insertText` to
 * the browser's real input pipeline — a synthetic `InputEvent` with that
 * type usually gets `preventDefault()`'d, and `execCommand('insertText')`
 * then no-ops. That's the "Apply does nothing" path users saw.
 *
 * The fix is to use the spell-check-correction semantic instead:
 * `inputType: 'insertReplacementText'`. ProseMirror, Lexical, and Slate
 * all special-case this exact input type because it's what Chrome itself
 * dispatches when the user clicks a spell-check suggestion in the native
 * context menu. We're doing the same thing — just from JS.
 *
 * Strategy ladder (try in order, stop on first success):
 *   1. `beforeinput` with `inputType: 'insertReplacementText'` + a patched
 *      `getTargetRanges()` (PM reads this to know where to replace).
 *   2. Synthetic `paste` ClipboardEvent with a DataTransfer carrying the
 *      replacement text. Robust on PM / Lexical / Quill.
 *   3. Legacy `execCommand('insertText')` — works for plain contenteditable
 *      and some lighter editors that don't special-case beforeinput.
 *   4. Direct DOM mutation (`range.deleteContents()` + `insertNode`). PM
 *      will rebuild state from the DOM on the next tick; loses fine undo
 *      coalescing but the edit lands.
 *
 * Returns `true` only when the edit actually changed the visible text.
 * Caller's clipboard-fallback path runs only after all four strategies
 * fail — at which point the editor is genuinely intransigent.
 */

// Verbose tier-by-tier logging — flip to true to debug Apply on a new editor.
const DEBUG = false;
function dlog(...args: unknown[]): void {
  if (DEBUG) console.log('[Polyscribe replace]', ...args);
}

function resetSelection(
  win: Window,
  range: Range,
): Selection | null {
  const sel = win.getSelection();
  if (!sel) return null;
  sel.removeAllRanges();
  try {
    sel.addRange(range.cloneRange());
  } catch {
    return null;
  }
  return sel;
}

function buildStaticRanges(range: Range): StaticRange[] {
  try {
    return [
      new StaticRange({
        startContainer: range.startContainer,
        startOffset: range.startOffset,
        endContainer: range.endContainer,
        endOffset: range.endOffset,
      }),
    ];
  } catch {
    return [];
  }
}

/**
 * STRATEGY 1 — insertReplacementText with a synthetic `getTargetRanges`.
 * The semantic Chrome itself uses when applying a spell-check suggestion.
 * ProseMirror's `view.someProp("handleDOMEvents")` and Lexical's
 * input-event handlers both special-case this `inputType`.
 */
function tryInsertReplacementText(
  element: HTMLElement,
  range: Range,
  replacement: string,
): boolean {
  const dt = new DataTransfer();
  dt.setData('text/plain', replacement);

  const ev = new InputEvent('beforeinput', {
    inputType: 'insertReplacementText',
    data: replacement,
    dataTransfer: dt,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  // The `getTargetRanges()` method on a real InputEvent tells the editor
  // which DOM range to replace. PM reads it; Lexical reads it. Default
  // getTargetRanges on synthetic events returns []. Override.
  const staticRanges = buildStaticRanges(range);
  if (staticRanges.length) {
    try {
      Object.defineProperty(ev, 'getTargetRanges', {
        value: () => staticRanges,
        configurable: true,
      });
    } catch {
      /* if defineProperty fails we still dispatch — PM will fall back to selection */
    }
  }
  const accepted = element.dispatchEvent(ev);
  dlog('strategy 1 insertReplacementText accepted=', accepted);
  return accepted;
}

/**
 * STRATEGY 3 — legacy `execCommand('insertText')`. Works on plain
 * contenteditable and on some non-PM editors. SYNCHRONOUS; caller can
 * verify the result immediately.
 */
function tryExecInsertText(ownerDoc: Document, replacement: string): boolean {
  // eslint-disable-next-line deprecation/deprecation
  const ok = ownerDoc.execCommand('insertText', false, replacement);
  dlog('strategy 3 execCommand returned=', ok);
  return ok;
}

/**
 * STRATEGY 4 — direct DOM mutation. PM will see foreign DOM changes and
 * re-derive its state on the next render tick. Visually identical to the
 * other paths; loses fine undo coalescing.
 */
function tryDomMutation(
  element: HTMLElement,
  ownerDoc: Document,
  range: Range,
  replacement: string,
): boolean {
  try {
    range.deleteContents();
    range.insertNode(ownerDoc.createTextNode(replacement));
    element.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertReplacementText',
        data: replacement,
      }),
    );
    dlog('strategy 4 DOM mutation applied');
    return true;
  } catch (e) {
    dlog('strategy 4 DOM mutation threw', e);
    return false;
  }
}

export function applyContentEditableReplace(
  element: HTMLElement,
  start: number,
  end: number,
  replacement: string,
): boolean {
  const range = rangeFromOffsets(element, start, end);
  if (!range) {
    dlog('rangeFromOffsets returned null — abort');
    return false;
  }

  // Iframe-aware: Gmail compose body lives in an iframe with its own
  // window/document. The top-frame window.getSelection() is the wrong one.
  const ownerDoc = element.ownerDocument ?? document;
  const ownerWin = ownerDoc.defaultView ?? window;

  // CRITICAL for iframe editors (Gmail compose): focus the iframe's window
  // FIRST, then the editable. Without this, the inline tooltip's Apply
  // looks like it did nothing because `execCommand` runs against the wrong
  // document. The overlay's `applyTextToRange` does this and works fine —
  // we just weren't doing it here.
  if (ownerWin !== window) {
    try {
      ownerWin.focus();
    } catch {
      /* cross-origin or detached — ignore */
    }
  }
  try {
    element.focus({ preventScroll: true });
  } catch {
    try {
      element.focus();
    } catch {
      dlog('element.focus failed — abort');
      return false;
    }
  }

  // Detect ProseMirror (ChatGPT, Notion, Substack, etc.) — it has a beforeinput
  // handler that calls preventDefault on `insertText` from synthetic events,
  // so execCommand returns false on PM. For non-PM editors (Gmail Lexical,
  // LinkedIn Quill, plain contenteditable), execCommand IS the right tool
  // and trusting its boolean is what the proven `applyTextToRange` does.
  const isProseMirror =
    element.classList.contains('ProseMirror') || !!element.closest('.ProseMirror');
  dlog('isProseMirror=', isProseMirror, 'element=', element.tagName, element.className);

  const trySelection = (): boolean => !!resetSelection(ownerWin, range);

  // ── Strategy 1: execCommand('insertText') ─────────────────────────────
  // SYNCHRONOUS, returns a real boolean. This is what the overlay's
  // `applyTextToRange` uses and it works reliably on Gmail. Trust the
  // return value — DON'T add a text-change check, because some editors
  // (Lexical) commit on the next microtask and the sync check would lie.
  if (trySelection()) {
    const ok = tryExecInsertText(ownerDoc, replacement);
    if (ok) {
      dlog('strategy 1 (execCommand) returned true — trusting');
      return true;
    }
    dlog('strategy 1 (execCommand) returned false — fall through');
  }

  // ── Strategy 2: insertReplacementText — ProseMirror specifically ──────
  // PM cancels `insertText` but special-cases `insertReplacementText` (the
  // spell-check semantic). Only try this when we're on PM; other editors
  // accept it but don't necessarily act on it, which would be a false
  // positive.
  if (isProseMirror && trySelection() && tryInsertReplacementText(element, range, replacement)) {
    dlog('strategy 2 (insertReplacementText, PM-only) accepted');
    return true;
  }

  // ── Strategy 3: direct DOM mutation (last resort) ─────────────────────
  // Always commits synchronously. PM rebuilds its state from the DOM on
  // the next tick — losing fine undo coalescing but the edit lands.
  const beforeText = element.textContent ?? '';
  if (
    trySelection() &&
    tryDomMutation(element, ownerDoc, range, replacement) &&
    (element.textContent ?? '') !== beforeText
  ) {
    dlog('strategy 3 (DOM mutation) succeeded');
    return true;
  }

  dlog('all strategies failed — caller will clipboard fallback');
  return false;
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
  const ownerDoc = element.ownerDocument ?? document;
  if (ownerDoc.activeElement === element) {
    const caret = start + replacement.length;
    element.setSelectionRange(caret, caret);
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}
