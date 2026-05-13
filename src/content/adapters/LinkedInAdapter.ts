import { BaseAdapter } from './BaseAdapter';
import { getEditableText } from '../lib/editableText';
import { applyContentEditableReplace } from '../lib/applyReplace';
import { getContentEditableRangeRects } from '../lib/textRanges';

// LinkedIn surfaces:
//  - Post composer: Quill, `.ql-editor`.
//  - Messaging: `.msg-form__contenteditable` (Lexical).
// The generic `[contenteditable="true"][role="textbox"]` would also match
// the nav-bar search typeahead — DO NOT use it without a parent scope.
const LINKEDIN_SELECTORS = [
  '.ql-editor[contenteditable="true"]',
  '.msg-form__contenteditable[contenteditable="true"]',
].join(', ');

export class LinkedInAdapter extends BaseAdapter {
  findEditableElements(): HTMLElement[] {
    return Array.from(document.querySelectorAll(LINKEDIN_SELECTORS)) as HTMLElement[];
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
