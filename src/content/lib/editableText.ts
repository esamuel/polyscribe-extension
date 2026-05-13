/**
 * Shared plain-text model for contenteditable elements.
 *
 * Why this exists: `element.innerText` honors CSS (skips hidden nodes,
 * collapses whitespace, adds '\n' at block boundaries), but the DOM Range API
 * works against raw text-node offsets (which see neither newlines nor block
 * boundaries). If the grammar check returns offsets computed from one
 * representation and we map them with the other, underlines drift sideways
 * the moment the editor has multiple paragraphs — exactly what happens in
 * ChatGPT's ProseMirror prompt box (each line is its own <p>).
 *
 * Solution: a single walker emits text-node fragments and inserts a synthetic
 * '\n' at block-element boundaries. Both `getEditableText` (string) and
 * `setRangeFromOffsets` (DOM Range) consume the same walker, so offsets stay
 * consistent.
 *
 * Offsets are in **UTF-16 code units** — same as `String.length` and the
 * `/api/check` contract.
 */

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'PRE', 'BLOCKQUOTE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'TR', 'TD', 'TH', 'DT', 'DD',
  'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
  'FIGURE', 'ASIDE', 'NAV', 'MAIN',
]);

type Frag =
  | { kind: 'text'; node: Text; start: number; end: number }
  | { kind: 'break'; start: number; end: number };

function collectFragments(root: HTMLElement): { text: string; frags: Frag[] } {
  const frags: Frag[] = [];
  let out = '';
  let lastWasBreak = true;

  const pushBreak = (): void => {
    if (lastWasBreak) return;
    const start = out.length;
    out += '\n';
    frags.push({ kind: 'break', start, end: out.length });
    lastWasBreak = true;
  };

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node as Text;
      const data = t.data;
      if (!data) return;
      const start = out.length;
      out += data;
      frags.push({ kind: 'text', node: t, start, end: out.length });
      lastWasBreak = false;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName;

    if (tag === 'BR') {
      pushBreak();
      return;
    }

    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock && out.length > 0) pushBreak();

    for (let child = el.firstChild; child; child = child.nextSibling) {
      walk(child);
    }

    if (isBlock) pushBreak();
  };

  walk(root);

  while (out.endsWith('\n')) {
    out = out.slice(0, -1);
    frags.pop();
  }
  while (out.startsWith('\n') && frags[0]?.kind === 'break') {
    out = out.slice(1);
    frags.shift();
    for (const f of frags) {
      f.start -= 1;
      f.end -= 1;
    }
  }

  return { text: out, frags };
}

export function getEditableText(root: HTMLElement): string {
  return collectFragments(root).text;
}

/**
 * Locate a text-node + offset pair for a given UTF-16 offset into the
 * model produced by `getEditableText`. Synthetic break fragments collapse to
 * the *end* of the preceding text node (or start of the next), whichever is
 * adjacent — ranges spanning a `\n` still resolve to real DOM positions.
 */
function locate(
  frags: Frag[],
  offset: number,
): { node: Text; nodeOffset: number } | null {
  for (let i = 0; i < frags.length; i++) {
    const f = frags[i]!;
    if (offset >= f.start && offset <= f.end) {
      if (f.kind === 'text') {
        return { node: f.node, nodeOffset: offset - f.start };
      }
      for (let j = i - 1; j >= 0; j--) {
        const p = frags[j]!;
        if (p.kind === 'text') return { node: p.node, nodeOffset: p.node.data.length };
      }
      for (let j = i + 1; j < frags.length; j++) {
        const n = frags[j]!;
        if (n.kind === 'text') return { node: n.node, nodeOffset: 0 };
      }
      return null;
    }
  }
  return null;
}

export function rangeFromOffsets(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  if (start < 0 || end < start) return null;
  const { frags } = collectFragments(root);
  const s = locate(frags, start);
  const e = locate(frags, end);
  if (!s || !e) return null;
  // Create the Range in the element's OWN document, not the top one. Gmail's
  // compose body is in a same-origin iframe; building a Range against the
  // top doc and then setting its boundaries to iframe nodes works by spec
  // (it gets adopted) but execCommand calls downstream are touchier — this
  // keeps everything in the right document from the start.
  const range = (root.ownerDocument ?? document).createRange();
  try {
    range.setStart(s.node, s.nodeOffset);
    range.setEnd(e.node, e.nodeOffset);
  } catch {
    return null;
  }
  return range;
}

export function rangeRectsForOffsets(
  root: HTMLElement,
  start: number,
  end: number,
): DOMRect[] {
  const range = rangeFromOffsets(root, start, end);
  if (!range) return [];
  return Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
}
