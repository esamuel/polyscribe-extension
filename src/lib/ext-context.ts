/** True when the page's content script outlived a reload of the extension (or similar). */
export function isExtensionContextInvalidatedError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /extension context invalid/i.test(m);
}
