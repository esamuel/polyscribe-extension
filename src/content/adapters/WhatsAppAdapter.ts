import { BaseAdapter } from './BaseAdapter';
import { getEditableText } from '../lib/editableText';
import { applyContentEditableReplace } from '../lib/applyReplace';
import { getContentEditableRangeRects } from '../lib/textRanges';

// WhatsApp Web message composer (Lexical) lives in the chat <footer>. The
// generic `[contenteditable="true"][role="textbox"]` would also match the
// left-pane search bar, group-subject editor, and status composer — scope
// to the footer to target the active chat composer only.
const WHATSAPP_SELECTORS = 'footer [contenteditable="true"][role="textbox"]';

export class WhatsAppAdapter extends BaseAdapter {
  findEditableElements(): HTMLElement[] {
    return Array.from(document.querySelectorAll(WHATSAPP_SELECTORS)) as HTMLElement[];
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
