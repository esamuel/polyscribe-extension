/**
 * Mirrors `polyscribe-web` `SUPPORTED_LANGUAGES` + display flags.
 * 17 writing/locale codes used for grammar, check, and translation.
 */
export const SUPPORTED_LANGUAGES = {
  en: { name: 'English', flag: '🇺🇸', rtl: false },
  he: { name: 'Hebrew', flag: '🇮🇱', rtl: true },
  es: { name: 'Spanish', flag: '🇪🇸', rtl: false },
  ar: { name: 'Arabic', flag: '🇸🇦', rtl: true },
  fr: { name: 'French', flag: '🇫🇷', rtl: false },
  de: { name: 'German', flag: '🇩🇪', rtl: false },
  it: { name: 'Italian', flag: '🇮🇹', rtl: false },
  ru: { name: 'Russian', flag: '🇷🇺', rtl: false },
  zh: { name: 'Chinese (Simplified)', flag: '🇨🇳', rtl: false },
  ja: { name: 'Japanese', flag: '🇯🇵', rtl: false },
  pt: { name: 'Portuguese', flag: '🇵🇹', rtl: false },
  nl: { name: 'Dutch', flag: '🇳🇱', rtl: false },
  pl: { name: 'Polish', flag: '🇵🇱', rtl: false },
  tr: { name: 'Turkish', flag: '🇹🇷', rtl: false },
  ko: { name: 'Korean', flag: '🇰🇷', rtl: false },
  el: { name: 'Greek', flag: '🇬🇷', rtl: false },
  ro: { name: 'Romanian', flag: '🇷🇴', rtl: false },
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

export const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES) as LanguageCode[];

export const RTL_CODES: LanguageCode[] = ['he', 'ar'];

export function flagForLanguageCode(code: string | undefined): string {
  if (!code || !(code in SUPPORTED_LANGUAGES)) return '🌐';
  return SUPPORTED_LANGUAGES[code as LanguageCode].flag;
}

export function isRtlLanguageCode(code: string | undefined): boolean {
  if (!code) return false;
  return RTL_CODES.includes(code as LanguageCode);
}
