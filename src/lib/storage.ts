import { isExtensionContextInvalidatedError } from './ext-context';
import { DEFAULT_SETTINGS, type Settings } from './types';

const SETTINGS_KEY = 'polyscribeSettings';

export async function getSettings(): Promise<Settings> {
  try {
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    const raw = data[SETTINGS_KEY] as Partial<Settings> | undefined;
    const merged: Settings = { ...DEFAULT_SETTINGS, ...raw };
    if (raw && raw.apiBaseUrl === undefined) {
      merged.apiBaseUrl = DEFAULT_SETTINGS.apiBaseUrl;
    }
    const q = merged.autoCheckQuotaPerPage;
    if (typeof q !== 'number' || Number.isNaN(q) || q < 5) {
      merged.autoCheckQuotaPerPage = DEFAULT_SETTINGS.autoCheckQuotaPerPage;
    } else if (q > 100) {
      merged.autoCheckQuotaPerPage = 100;
    }
    return merged;
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) {
      return { ...DEFAULT_SETTINGS };
    }
    throw e;
  }
}

export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...partial };
  try {
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) {
      return next;
    }
    throw e;
  }
  return next;
}
