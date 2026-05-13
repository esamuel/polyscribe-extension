import type { LanguageCode } from './languages';

export type Settings = {
  apiBaseUrl: string;
  apiToken: string;
  defaultLanguage: 'auto' | LanguageCode;
  defaultTranslateSource: 'auto' | LanguageCode;
  defaultTranslateTarget: LanguageCode;
  enableFloatingButton: boolean;
  /** Inline underlines on Gmail, ChatGPT, LinkedIn, X, WhatsApp (when configured). */
  enableInlineUnderlines: boolean;
  autoCheckOnSelection: boolean;
  /** Max automatic grammar checks per full page load (5–100). */
  autoCheckQuotaPerPage: number;
  defaultTone: 'formal' | 'casual' | 'friendly' | 'professional' | 'concise';
};

export const DEFAULT_SETTINGS: Settings = {
  apiBaseUrl: 'https://polyscribe.app',
  apiToken: '',
  defaultLanguage: 'auto',
  defaultTranslateSource: 'auto',
  defaultTranslateTarget: 'en',
  enableFloatingButton: true,
  enableInlineUnderlines: true,
  autoCheckOnSelection: true,
  autoCheckQuotaPerPage: 20,
  defaultTone: 'professional',
};

export type CheckIssue = {
  message: string;
  suggestion?: string;
  start?: number;
  end?: number;
  original?: string;
  explanation?: string;
  /** grammar | spelling | punctuation | style (from API when present). */
  category?: string;
};

/** Issue with UI metadata for inline underlines (content script). */
export type UnderlineIssueType = 'grammar' | 'spelling' | 'punctuation' | 'style' | 'ai-tell';

export type UnderlineIssue = {
  id: string;
  type: UnderlineIssueType;
  original: string;
  suggestion: string;
  explanation: string;
  start: number;
  end: number;
};

export type CheckResponse = {
  correctedText?: string;
  issues?: CheckIssue[];
  /** ISO code from the proofreading API (e.g. `en`, `he`). */
  language_detected?: string;
};

export type RewriteResponse = {
  text: string;
};

export type TranslateResponse = {
  text: string;
  detected_from?: string;
  notes?: string;
  glossary_applied?: string[];
};

export type HealthResponse = {
  ok?: boolean;
  user?: { id?: string; email?: string; name?: string };
};

export const TONE_OPTIONS = [
  { id: 'formal', label: 'Formal' },
  { id: 'casual', label: 'Casual' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'professional', label: 'Professional' },
  { id: 'concise', label: 'Concise' },
] as const;

export type ToneId = (typeof TONE_OPTIONS)[number]['id'];
