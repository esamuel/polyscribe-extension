function findEditableRoot(range: Range): HTMLElement | null {
  const node = range.commonAncestorContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  if (!el) return null;
  const ce = el.closest<HTMLElement>('textarea, input[type="text"], [contenteditable="true"]');
  return ce;
}

/**
 * Replaces the range contents with `text` using execCommand('insertText') when possible.
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

  const editable = findEditableRoot(range);
  try {
    editable?.focus({ preventScroll: true });
  } catch {
    try {
      editable?.focus();
    } catch {
      /* ignore */
    }
  }

  const sel = window.getSelection();
  if (!sel) {
    void navigator.clipboard.writeText(text);
    return 'clipboard';
  }

  try {
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    void navigator.clipboard.writeText(text);
    return 'clipboard';
  }

  let ok = false;
  try {
    ok = document.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }

  if (!ok) {
    void navigator.clipboard.writeText(text);
    return 'clipboard';
  }
  return 'ok';
}
