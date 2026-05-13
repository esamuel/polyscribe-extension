import { BaseAdapter } from './BaseAdapter';
import { getEditableText } from '../lib/editableText';
import { applyContentEditableReplace } from '../lib/applyReplace';
import { getContentEditableRangeRects } from '../lib/textRanges';

// X/Twitter composer surfaces:
//  - Tweet composers (main + reply + thread): `[data-testid^="tweetTextarea_"]`.
//  - DM composer: `[data-testid="dmComposerTextInput"]`.
// Avoid the generic `[contenteditable][role="textbox"]` shell — it also
// matches /settings bio and search overlays.
const X_SELECTORS = [
  '[data-testid^="tweetTextarea_"]',
  '[data-testid="dmComposerTextInput"]',
].join(', ');

export class XAdapter extends BaseAdapter {
  findEditableElements(): HTMLElement[] {
    return Array.from(document.querySelectorAll(X_SELECTORS)) as HTMLElement[];
  }

  getText(element: HTMLElement): string {
    return getEditableText(element);
  }

  replaceRange(element: HTMLElement, start: number, end: number, replacement: string): boolean {
    return applyContentEditableReplace(element, start, end, replacement);
  }

  getRangeRects(element: HTMLElement, start: number, end: number): DOMRect[] {
    return getContentEditableRangeRects(element, start, end);
  }
}
