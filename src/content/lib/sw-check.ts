import { MSG, type PolyscribeResponse } from '../../lib/messaging';
import type { CheckResponse } from '../../lib/types';

/**
 * Check grammar via the service worker. Content scripts must not call `fetch` to
 * the Polyscribe API directly: those requests are subject to the page’s CORS
 * policy; the service worker is not.
 */
function requestFromSw(
  type: typeof MSG.CHECK | typeof MSG.AI_CHECK,
  text: string,
  language: string,
): Promise<CheckResponse | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, text, language } as const, (resp: PolyscribeResponse) => {
        if (chrome.runtime.lastError) {
          console.warn(`Polyscribe ${type} failed:`, chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        if (resp && 'ok' in resp && resp.ok) {
          resolve(resp.data as CheckResponse);
          return;
        }
        if (resp && 'ok' in resp && !resp.ok) {
          console.warn(`Polyscribe ${type} failed:`, resp.error);
          resolve(null);
          return;
        }
        resolve(null);
      });
    } catch (e) {
      console.warn(`Polyscribe ${type} failed:`, e);
      resolve(null);
    }
  });
}

/**
 * Check grammar via the service worker. Content scripts must not call `fetch` to
 * the Polyscribe API directly: those requests are subject to the page's CORS
 * policy; the service worker is not.
 */
export function requestCheckFromSw(text: string, language: string): Promise<CheckResponse | null> {
  return requestFromSw(MSG.CHECK, text, language);
}

/** Same plumbing for AI-tells (always-on companion to grammar in v0.4+). */
export function requestAiCheckFromSw(text: string, language: string): Promise<CheckResponse | null> {
  return requestFromSw(MSG.AI_CHECK, text, language);
}
