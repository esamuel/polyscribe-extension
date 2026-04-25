/** Per-host translate from/to memory (hostname only, no path). */
function key(host: string): string {
  return `polyscribeSiteTranslate__${host}`;
}

export async function getSiteTranslatePrefs(
  host: string,
): Promise<{ from: string; to: string } | null> {
  if (!host) return null;
  const data = await chrome.storage.local.get(key(host));
  const v = data[key(host)] as { from?: string; to?: string } | undefined;
  if (v && typeof v.from === 'string' && typeof v.to === 'string') {
    return { from: v.from, to: v.to };
  }
  return null;
}

export async function setSiteTranslatePrefs(
  host: string,
  from: string,
  to: string,
): Promise<void> {
  if (!host) return;
  await chrome.storage.local.set({ [key(host)]: { from, to } });
}
