import type { CheckResponse, RewriteResponse, TranslateResponse } from './types';

export const MSG = {
  CHECK: 'POLYSCRIBE_CHECK',
  REWRITE: 'POLYSCRIBE_REWRITE',
  TONE: 'POLYSCRIBE_TONE',
  TRANSLATE: 'POLYSCRIBE_TRANSLATE',
  HEALTH: 'POLYSCRIBE_HEALTH',
} as const;

export type PolyscribeRequest =
  | { type: typeof MSG.CHECK; text: string; language?: string }
  | { type: typeof MSG.REWRITE; text: string; instruction: string }
  | { type: typeof MSG.TONE; text: string; tone: string }
  | { type: typeof MSG.TRANSLATE; text: string; from: string; to: string }
  | { type: typeof MSG.HEALTH };

export type PolyscribeSuccess =
  | { ok: true; data: CheckResponse }
  | { ok: true; data: RewriteResponse }
  | { ok: true; data: TranslateResponse }
  | { ok: true; data: { user?: unknown; ok?: boolean } };

export type PolyscribeError = {
  ok: false;
  error: string;
  code?: 'UNAUTHORIZED' | 'CONFIG' | 'NETWORK';
};

export type PolyscribeResponse = PolyscribeSuccess | PolyscribeError;

export function isPolyscribeError(r: PolyscribeResponse): r is PolyscribeError {
  return !r.ok;
}
