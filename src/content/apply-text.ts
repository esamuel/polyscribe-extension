type FormTextControl = HTMLTextAreaElement | HTMLInputElement;

function isFormTextControl(el: HTMLElement | null): el is FormTextControl {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const t = (el.getAttribute('type') ?? 'text').toLowerCase();
    return (
      t === 'text' ||
      t === 'search' ||
      t === 'url' ||
      t === 'email' ||
      t === 'tel' ||
      t === 'password' ||
      t === 'number' ||
      t === ''
    );
  }
  return false;
}

function findEditableRoot(range: Range): HTMLElement | null {
  const start = range.commonAncestorContainer;
  let n: Node | null = start.nodeType === Node.ELEMENT_NODE ? (start as Node) : start.parentNode;
  for (; n; n = n.parentNode) {
    if (!(n instanceof HTMLElement)) continue;
    if (n instanceof HTMLTextAreaElement) return n;
    if (n instanceof HTMLInputElement) {
      const t = (n.getAttribute('type') ?? 'text').toLowerCase();
      if (
        t === 'text' ||
        t === 'search' ||
        t === 'url' ||
        t === 'email' ||
        t === 'tel' ||
        t === 'password' ||
        t === 'number' ||
        t === ''
      ) {
        return n;
      }
      continue;
    }
    if (n.isContentEditable) {
      return n;
    }
  }
  return null;
}

function fieldOffsetsForRange(
  el: FormTextControl,
  r: Range,
): { start: number; end: number } | null {
  if (r.startContainer === el && r.endContainer === el) {
    return { start: r.startOffset, end: r.endOffset };
  }
  return null;
}

function applyToFormControl(
  el: FormTextControl,
  r: Range,
  text: string,
): 'ok' | 'clipboard' {
  const se = r.startContainer;
  if (!se.isConnected) {
    void navigator.clipboard.writeText(text);
    return 'clipboard';
  }
  const off = fieldOffsetsForRange(el, r);
  if (!off) {
    void navigator.clipboard.writeText(text);
    return 'clipboard';
  }
  const { start, end } = off;
  if (start < 0 || end < start || end > el.value.length) {
    void navigator.clipboard.writeText(text);
    return 'clipboard';
  }
  el.focus();
  try {
    if (typeof el.setRangeText === 'function') {
      el.setRangeText(text, start, end, 'end');
    } else {
      const v = el.value;
      const next = v.slice(0, start) + text + v.slice(end);
      el.value = next;
      const caret = start + text.length;
      el.setSelectionRange(caret, caret);
    }
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    return 'ok';
  } catch {
    void navigator.clipboard.writeText(text);
    return 'clipboard';
  }
}

/**
 * Replaces the range contents with `text` using the best available API for the field.
 * @returns 'ok' | 'clipboard' (fallback copy) | 'fail'
 */
export function applyTextToRange(
  range: Range,
  text: string,
  clipboardOnly: boolean,
): 'ok' | 'clipboard' | 'fail' {
  if (clipboardOnly) {
    void navigator.clipboard.writeText(text);
    return 'clipboard';
  }
  if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
    void navigator.clipboard.writeText(text);
    return 'clipboard';
  }

  const editable = findEditableRoot(range);
  if (isFormTextControl(editable)) {
    return applyToFormControl(editable, range, text);
  }

  if (!editable) {
    void navigator.clipboard.writeText(text);
    return 'clipboard';
  }

  // IFRAME-AWARE: Gmail's compose body lives in a same-origin iframe. The
  // top window's `getSelection()` and `execCommand` operate on the WRONG
  // document — they no-op for iframe editors, which is why "Apply" looked
  // like it did nothing on Gmail. Use the element's owner-document instead.
  const ownerDoc = editable.ownerDocument ?? document;
  const ownerWin = ownerDoc.defaultView ?? window;

  const sel = ownerWin.getSelection();
  if (!sel) {
    void navigator.clipboard.writeText(text);
    return 'clipboard';
  }

  // For iframe editors (Gmail), focus the iframe's window FIRST so the
  // subsequent selection lives in the right document. Without this, Gmail's
  // focus listener can clear the selection we set, leaving execCommand
  // with nothing to insert into.
  if (ownerWin !== window) {
    try { ownerWin.focus(); } catch { /* ignore */ }
  }
  try {
    editable.focus({ preventScroll: true });
  } catch {
    try {
      editable.focus();
    } catch {
      void navigator.clipboard.writeText(text);
      return 'clipboard';
    }
  }

  // Gmail & other editors clear selection on focus — set the range, then insert.
  try {
    sel.removeAllRanges();
    sel.addRange(range.cloneRange());
  } catch {
    void navigator.clipboard.writeText(text);
    return 'clipboard';
  }

  let ok = false;
  try {
    ok = ownerDoc.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }

  if (ok) {
    return 'ok';
  }

  try {
    const r3 = range.cloneRange();
    r3.deleteContents();
    // Stay in the editable's owner doc — Gmail compose iframe needs this
    // to keep the inserted text node and its surrounding range consistent.
    const node = ownerDoc.createTextNode(text);
    r3.insertNode(node);
    const after = ownerDoc.createRange();
    after.setStartAfter(node);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
  } catch {
    void navigator.clipboard.writeText(text);
    return 'clipboard';
  }
  return 'ok';
}
