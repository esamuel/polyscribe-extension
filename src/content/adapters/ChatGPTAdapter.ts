import { BaseAdapter } from './BaseAdapter';
import { getEditableText } from '../lib/editableText';
import { applyContentEditableReplace, applyTextareaReplace } from '../lib/applyReplace';
import { getContentEditableRangeRects, getTextareaRangeRects } from '../lib/textRanges';

// Scoped to the composer (inside the page's <form>) so we don't attach to
// ProseMirror instances rendered for message bubbles or sandboxed tool output.
const PROMPT_SELECTORS = [
  'form div#prompt-textarea[contenteditable="true"]',
  'form div[contenteditable="true"][data-id="prompt-textarea"]',
  'form div.ProseMirror[contenteditable="true"]',
  'form textarea#prompt-textarea',
].join(', ');

export class ChatGPTAdapter extends BaseAdapter {
  findEditableElements(): HTMLElement[] {
    return Array.from(document.querySelectorAll(PROMPT_SELECTORS)) as HTMLElement[];
  }

  getText(element: HTMLElement): string {
    if (element instanceof HTMLTextAreaElement) return element.value;
    return getEditableText(element);
  }

  replaceRange(element: HTMLElement, start: number, end: number, replacement: string): boolean {
    if (element instanceof HTMLTextAreaElement) {
      return applyTextareaReplace(element, start, end, replacement);
    }
    return applyContentEditableReplace(element, start, end, replacement);
  }

  getRangeRects(element: HTMLElement, start: number, end: number): DOMRect[] {
    if (element instanceof HTMLTextAreaElement) {
      return getTextareaRangeRects(element, start, end);
    }
    return getContentEditableRangeRects(element, start, end);
  }
}
