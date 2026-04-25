import { getSettings } from './storage';
import type { CheckIssue, CheckResponse, HealthResponse, RewriteResponse, TranslateResponse } from './types';

/** Raw JSON from polyscribe-web `/api/check` (CheckResult). */
type CheckApiRaw = {
  language_detected?: string;
  corrected?: string;
  correctedText?: string;
  issues?: Array<{
    message?: string;
    explanation?: string;
    suggestion?: string;
    original?: string;
    start?: number;
    end?: number;
  }>;
};

function normalizeCheckResponse(raw: CheckApiRaw): CheckResponse {
  const correctedText = raw.correctedText ?? raw.corrected;
  const issues: CheckIssue[] = (raw.issues ?? []).map((i) => {
    const explanation = typeof i.explanation === 'string' ? i.explanation.trim() : '';
    const original = typeof i.original === 'string' ? i.original : '';
    const suggestion = typeof i.suggestion === 'string' ? i.suggestion : undefined;
    const message =
      (typeof i.message === 'string' && i.message.trim()) ||
      explanation ||
      (original && suggestion
        ? `Change “${original}” to “${suggestion}”`
        : suggestion || 'Suggestion');
    return { message, suggestion, start: i.start, end: i.end };
  });
  return {
    correctedText,
    issues,
    language_detected:
      typeof raw.language_detected === 'string' ? raw.language_detected : undefined,
  };
}

function pickText(raw: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: 'UNAUTHORIZED' | 'CONFIG',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiCall<T>(path: string, body: unknown): Promise<T> {
  const { apiBaseUrl, apiToken } = await getSettings();
  const base = apiBaseUrl.replace(/\/$/, '');
  if (!base || !apiToken) {
    throw new ApiError(
      'Polyscribe is not configured. Open the extension popup and add your API URL and token.',
      undefined,
      'CONFIG',
    );
  }
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    throw new ApiError('Your token was revoked. Update it in the popup settings.', 401, 'UNAUTHORIZED');
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new ApiError(`API error ${res.status}: ${errText}`, res.status);
  }
  return res.json() as Promise<T>;
}

export async function checkText(text: string, language = 'auto'): Promise<CheckResponse> {
  const raw = await apiCall<CheckApiRaw>('/api/check', { text, language });
  return normalizeCheckResponse(raw);
}

export async function rewriteText(text: string, instruction: string): Promise<RewriteResponse> {
  const raw = await apiCall<Record<string, unknown>>('/api/rewrite', { text, instruction });
  return { text: pickText(raw, ['rewrite', 'text']) };
}

export async function adjustTone(text: string, tone: string): Promise<RewriteResponse> {
  const raw = await apiCall<Record<string, unknown>>('/api/tone', { text, tone });
  return { text: pickText(raw, ['rewrite', 'text']) };
}

export async function translateText(
  text: string,
  from: string,
  to: string,
): Promise<TranslateResponse> {
  const raw = await apiCall<Record<string, unknown>>('/api/translate', { text, from, to });
  return {
    text: pickText(raw, ['translation', 'text']),
    detected_from: typeof raw.detected_from === 'string' ? raw.detected_from : undefined,
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    glossary_applied: Array.isArray(raw.glossary_applied)
      ? (raw.glossary_applied as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined,
  };
}

export async function healthCheck(): Promise<HealthResponse> {
  const { apiBaseUrl, apiToken } = await getSettings();
  const base = apiBaseUrl.replace(/\/$/, '');
  if (!base || !apiToken) {
    throw new ApiError(
      'Polyscribe is not configured. Open the extension popup and add your API URL and token.',
      undefined,
      'CONFIG',
    );
  }
  const res = await fetch(`${base}/api/health`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (res.status === 401) {
    throw new ApiError('Your token was revoked. Update it in the popup settings.', 401, 'UNAUTHORIZED');
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new ApiError(`API error ${res.status}: ${errText}`, res.status);
  }
  return res.json() as Promise<HealthResponse>;
}
