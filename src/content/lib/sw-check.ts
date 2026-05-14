import { MSG, type PolyscribeResponse } from '../../lib/messaging';
import type { CheckResponse } from '../../lib/types';
import { showStaleBanner } from '../StaleBanner';

/**
 * After a Chrome extension reload, content scripts already running in open
 * tabs are orphaned — every `chrome.runtime.sendMessage` throws "Extension
 * context invalidated". Once we detect this, subsequent calls short-circuit
 * (no log spam, no pointless work) and the user sees a one-time banner
 * pointing them at the Refresh button.
 */
let extensionContextInvalidated = false;

function isInvalidatedMessage(msg: string | undefined): boolean {
  if (!msg) return false;
  return msg.includes('Extension context invalidated') || msg.includes('context invalidated');
}

function markInvalidated(): void {
  if (extensionContextInvalidated) return;
  extensionContextInvalidated = true;
  console.warn(
    'Polyscribe: extension was reloaded — this tab is orphaned. Refresh the page to reconnect.',
  );
  showStaleBanner();
}

/** Exported so callers outside sw-check (the selection-driven sendSw in
 *  content-script.ts) can route their own caught errors to the same place. */
export function markExtensionContextInvalidated(): void {
  markInvalidated();
}

export function isExtensionContextInvalidated(): boolean {
  return extensionContextInvalidated;
}

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
  // Short-circuit: once we've seen the orphan error, every subsequent send
  // will fail the same way. Returning null without trying avoids log spam
  // and lets callers gracefully no-op until the tab is refreshed.
  if (extensionContextInvalidated) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, text, language } as const, (resp: PolyscribeResponse) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          if (isInvalidatedMessage(lastErr.message)) {
            markInvalidated();
          } else {
            console.warn(`Polyscribe ${type} failed:`, lastErr.message);
          }
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
      // `chrome.runtime.sendMessage` THROWS (not callback-errors) when the
      // extension is reloaded — the message you see in the user's bug
      // report. Catch it, route to the shared invalidation path.
      const msg = e instanceof Error ? e.message : String(e);
      if (isInvalidatedMessage(msg)) {
        markInvalidated();
      } else {
        console.warn(`Polyscribe ${type} failed:`, e);
      }
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
