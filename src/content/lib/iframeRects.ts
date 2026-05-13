/**
 * Translate iframe-local DOMRects into the top-document viewport.
 *
 * When `node` lives inside a same-origin iframe, `getClientRects()` returns
 * coordinates relative to that iframe's viewport — not the top window's.
 * The FAB, overlay, and underline overlays all live in the top document and
 * use `position: fixed` against the top viewport, so iframe rects must be
 * shifted by the iframe element's bounding rect.
 *
 * For nodes already in the top document, returns the rects unchanged.
 */
export function rectsToTopDoc(node: Node | null | undefined, rects: DOMRect[]): DOMRect[] {
  if (!node || !rects.length) return rects;
  const frame = node.ownerDocument?.defaultView?.frameElement;
  if (!(frame instanceof HTMLElement)) return rects;
  const fr = frame.getBoundingClientRect();
  return rects.map(
    (r) => new DOMRect(r.left + fr.left, r.top + fr.top, r.width, r.height),
  );
}

/**
 * Translate one iframe-local rect to top-doc viewport coords.
 * Convenience wrapper for the single-rect case (FAB anchor, overlay anchor).
 */
export function rectToTopDoc(node: Node | null | undefined, rect: DOMRect): DOMRect {
  const [out] = rectsToTopDoc(node, [rect]);
  return out ?? rect;
}
