/**
 * Inline underlines for read-only selections (ChatGPT responses, articles,
 * email reading pane). The active-editor pipeline (BaseAdapter) can't help
 * here because there's no editable element to attach to — but a user who
 * selects "fix what's wrong" wants to SEE where the issues are, not just
 * see a count badge on the FAB.
 *
 * We can't offer Apply (the text is read-only), so the tooltip's primary
 * action becomes Copy: clipboard the corrected sentence so the user can
 * paste it wherever they're actually writing.
 *
 * Offset mapping is the load-bearing piece here. The API received
 * `Selection.toString().trim()` — which inserts synthetic newlines at block
 * boundaries that don't correspond to any DOM node. To paint underlines at
 * the right characters, we need to walk the range with the SAME serialization
 * (text + newlines between blocks) and remember which DOM position each
 * character maps to.
 */

import type { CheckIssue, UnderlineIssue, UnderlineIssueType } from '../lib/types';
import { UnderlineOverlay } from './overlay/UnderlineOverlay';
import { TooltipManager } from './overlay/TooltipManager';
import { rectsToTopDoc } from './lib/iframeRects';

function parseIssueCategory(raw?: string): UnderlineIssueType {
  if (!raw) return 'grammar';
  const k = raw.toLowerCase();
  if (k === 'ai-tell' || k.includes('ai-tell') || k.includes('ai tell')) return 'ai-tell';
  if (k.includes('spell')) return 'spelling';
  if (k.includes('punct')) return 'punctuation';
  if (k.includes('style')) return 'style';
  if (k === 'grammar' || k === 'spelling' || k === 'punctuation' || k === 'style') return k;
  return 'grammar';
}

function issuesToUnderline(issues: CheckIssue[] | undefined): UnderlineIssue[] {
  if (!issues?.length) return [];
  const t0 = Date.now();
  const out: UnderlineIssue[] = [];
  for (let idx = 0; idx < issues.length; idx++) {
    const iss = issues[idx]!;
    if (iss.suggestion === undefined || iss.start === undefined || iss.end === undefined) continue;
    const { start, end } = iss;
    if (start < 0 || start >= end) continue;
    out.push({
      id: `pscsel-${t0}-${idx}`,
      type: parseIssueCategory(iss.category),
      original: iss.original ?? '',
      suggestion: iss.suggestion,
      explanation: (iss.explanation ?? iss.message ?? '').trim() || iss.message,
      start,
      end,
    });
  }
  return out;
}

type DomPos = { node: Text; offset: number };
type RangeMap = {
  /** Serialized text — approximates `Selection.toString()`. */
  text: string;
  /** For each character in `text`, the DOM position (or null for synthetic newlines). */
  positions: (DomPos | null)[];
};

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'PRE', 'BLOCKQUOTE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'SECTION', 'ARTICLE', 'TR', 'TD', 'TH',
  'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGURE',
  'DT', 'DD',
]);

/**
 * Walks text nodes inside `range` and emits a (text, positions[]) map.
 * Inserts a synthetic '\n' at block-element transitions so the resulting
 * string lines up with `Selection.toString()`, which is what the API saw.
 */
function buildRangeMap(range: Range): RangeMap {
  const text: string[] = [];
  const positions: (DomPos | null)[] = [];

  try {
    const root = range.commonAncestorContainer;
    // Walker must live in the range's OWN document so it can traverse the
    // iframe's tree when the selection is in a same-origin iframe. Using
    // the top doc's TreeWalker on an iframe node throws / mis-resolves.
    const ownerDoc = root.ownerDocument ?? document;
    const walker = ownerDoc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });

    const blockAncestor = (node: Node): Element | null => {
      let cur: Node | null = node.parentNode;
      while (cur && cur !== root.parentNode) {
        if (cur.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((cur as Element).tagName)) {
          return cur as Element;
        }
        cur = cur.parentNode;
      }
      return null;
    };

    let lastBlock: Element | null = null;
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const node = n as Text;
      let nodeStart = 0;
      let nodeEnd = node.data.length;
      if (node === range.startContainer) nodeStart = range.startOffset;
      if (node === range.endContainer) nodeEnd = range.endOffset;
      const slice = node.data.slice(nodeStart, nodeEnd);
      if (!slice.length) continue;

      const block = blockAncestor(node);
      if (lastBlock !== null && block !== lastBlock && text.length > 0) {
        text.push('\n');
        positions.push(null);
      }
      lastBlock = block;

      for (let i = 0; i < slice.length; i++) {
        text.push(slice[i]!);
        positions.push({ node, offset: nodeStart + i });
      }
    }
  } catch {
    // Range can throw if the DOM has been mutated (SPA navigation). Return
    // empty map; the painter will draw nothing.
    return { text: '', positions: [] };
  }

  return { text: text.join(''), positions };
}

/**
 * Map a [start..end) range in the API-served string to a DOM Range.
 * Skips over synthetic newline positions when locating the boundary chars.
 */
function subRangeFromMap(map: RangeMap, start: number, end: number): Range | null {
  if (start >= end || end > map.positions.length) return null;
  let sIdx = start;
  while (sIdx < map.positions.length && map.positions[sIdx] === null) sIdx++;
  let eIdx = end - 1;
  while (eIdx >= 0 && map.positions[eIdx] === null) eIdx--;
  if (sIdx > eIdx || sIdx >= map.positions.length || eIdx < 0) return null;
  const sPos = map.positions[sIdx];
  const ePos = map.positions[eIdx];
  if (!sPos || !ePos) return null;
  try {
    // Build the Range in the same document as the DOM nodes; mixing docs
    // would later trip up downstream consumers (esp. iframe selections).
    const ownerDoc = sPos.node.ownerDocument ?? document;
    const r = ownerDoc.createRange();
    r.setStart(sPos.node, sPos.offset);
    // ePos.offset is the DOM offset of the LAST character; range end is
    // exclusive so we want one past it.
    r.setEnd(ePos.node, ePos.offset + 1);
    return r;
  } catch {
    return null;
  }
}

export class SelectionUnderlines {
  private readonly overlay: UnderlineOverlay;
  private readonly tooltip: TooltipManager;
  private currentMap: RangeMap | null = null;
  private leadingTrim = 0;
  private currentIssues: UnderlineIssue[] = [];
  private repaintTicket = 0;

  constructor() {
    this.overlay = new UnderlineOverlay();
    this.tooltip = new TooltipManager();
  }

  /** Paint underlines for each issue. Offsets are relative to the trimmed text. */
  paint(range: Range, issues: CheckIssue[] | undefined): void {
    this.clear();
    this.currentMap = buildRangeMap(range);
    // The API received `selectionText.trim()`. Offsets in issues are relative
    // to the trimmed string; the map indexes the untrimmed serialization.
    // Find the leading whitespace count in the serialized text to align them.
    const full = this.currentMap.text;
    this.leadingTrim = full.length - full.trimStart().length;
    this.currentIssues = issuesToUnderline(issues);
    this.repaint();
  }

  /** Coalesced reposition for scroll/resize — avoids hammering during inertial scroll. */
  reposition(): void {
    if (!this.currentMap) return;
    const ticket = ++this.repaintTicket;
    requestAnimationFrame(() => {
      if (ticket !== this.repaintTicket) return;
      this.repaint();
    });
  }

  clear(): void {
    this.overlay.clear();
    this.tooltip.hide();
    this.currentMap = null;
    this.leadingTrim = 0;
    this.currentIssues = [];
    this.repaintTicket++;
  }

  private repaint(): void {
    if (!this.currentMap) return;
    this.overlay.clear();
    for (const issue of this.currentIssues) {
      const start = issue.start + this.leadingTrim;
      const end = issue.end + this.leadingTrim;
      const sub = subRangeFromMap(this.currentMap, start, end);
      if (!sub) continue;
      const localRects = Array.from(sub.getClientRects()).filter(
        (r) => r.width > 0 || r.height > 0,
      );
      if (!localRects.length) continue;
      // If the selection is inside a same-origin iframe (Gmail quoted-text,
      // etc.), the rects are in the iframe's viewport. Translate them to
      // the top-doc viewport so the overlay (top-doc, position:fixed) draws
      // underlines exactly on the source text.
      const rects = rectsToTopDoc(sub.commonAncestorContainer, localRects);
      this.overlay.drawUnderline(issue, rects, {
        onHover: (rect) =>
          this.tooltip.show(issue, rect, {
            // Read-only: the primary action puts the suggestion on the
            // clipboard (we can't replace the source). The button label
            // says "Copy" so the user knows what to expect; "Copied!" flashes
            // after click as a confirmation.
            onApply: () => void this.copySuggestion(issue.suggestion),
            onDismiss: () => this.tooltip.hide(),
            applyLabel: 'Copy',
            appliedLabel: 'Copied!',
          }),
        onLeave: () => this.tooltip.scheduleHide(),
      });
    }
  }

  private async copySuggestion(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard write can fail without user gesture in some pages — silent */
    }
  }
}
