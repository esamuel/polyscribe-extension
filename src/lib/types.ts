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
  /**
   * Also run AI-tell detection inline (in addition to grammar) on every
   * typing pause. Off by default: it doubles API spend per check and the
   * overlay's "AI tells" tab still works on demand. Power-user opt-in.
   */
  enableInlineAiTells: boolean;
  /**
   * By default Polyscribe pauses its inline underlines on any editor where
   * Grammarly / LanguageTool is also active, to avoid two extensions
   * painting conflicting underlines. Turn this on to force Polyscribe to
   * run anyway — useful for testing Polyscribe without uninstalling the
   * other tool (expect overlapping underlines from both).
   */
  forceOverCompetingExtension: boolean;
  autoCheckOnSelection: boolean;
  /** Max automatic checks per full page load (5–100). Applies to both
   *  selection auto-checks and inline-underline auto-checks. */
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
  enableInlineAiTells: false,
  forceOverCompetingExtension: false,
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

export type NiqqudResponse = {
  /** Hebrew text with niqqud (ניקוד) added. */
  text: string;
  /** Which engine produced it: Dicta (preferred) or the Claude fallback. */
  engine?: 'dicta' | 'claude';
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
