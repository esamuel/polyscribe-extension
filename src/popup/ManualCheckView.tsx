import { useCallback, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { adjustTone, ApiError, checkText, rewriteText, translateText } from '../lib/api';
import { flagForLanguageCode, LANGUAGE_CODES, SUPPORTED_LANGUAGES, type LanguageCode } from '../lib/languages';
import { DEFAULT_SETTINGS } from '../lib/types';
import type { CheckResponse, Settings } from '../lib/types';

const LONG_THRESHOLD = 3000;

type Action = 'check' | 'rewrite' | 'tone' | 'translate';

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

type Props = {
  settings: Settings;
};

export function ManualCheckView({ settings }: Props) {
  const [action, setAction] = useState<Action>('check');
  const [text, setText] = useState('');
  const [rewriteIn, setRewriteIn] = useState('Improve clarity and flow while preserving meaning.');
  const [trFrom, setTrFrom] = useState<string>(
    settings.defaultTranslateSource === 'auto' ? 'auto' : settings.defaultTranslateSource,
  );
  const [trTo, setTrTo] = useState<string>(settings.defaultTranslateTarget);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResponse | null>(null);
  const [otherResult, setOtherResult] = useState<{ text: string; meta?: string } | null>(null);

  const tokenHint = useMemo(() => {
    if (text.length <= LONG_THRESHOLD) return null;
    return `This will use roughly ${estimateTokens(text)} tokens.`;
  }, [text]);

  const openInEditor = (): void => {
    const base = (settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl).replace(/\/$/, '');
    const t = text.trim();
    const url = t
      ? `${base}/editor?text=${encodeURIComponent(t.slice(0, 50_000))}`
      : `${base}/editor`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const run = useCallback(async (): Promise<void> => {
    setError(null);
    setCheckResult(null);
    setOtherResult(null);
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setError('Enter at least 3 characters.');
      return;
    }
    if (trimmed.length > LONG_THRESHOLD) {
      const ok = window.confirm(
        `Long text (${trimmed.length} chars). ${tokenHint ?? ''}\n\nContinue?`,
      );
      if (!ok) return;
    }

    setLoading(true);
    try {
      if (action === 'check') {
        const lang = settings.defaultLanguage;
        const data = await checkText(trimmed, lang === 'auto' ? 'auto' : lang);
        setCheckResult(data);
        return;
      }
      if (action === 'rewrite') {
        if (!rewriteIn.trim()) {
          setError('Add a rewrite instruction.');
          return;
        }
        const data = await rewriteText(trimmed, rewriteIn.trim());
        setOtherResult({ text: data.text, meta: data.text ? 'Rewrite' : undefined });
        return;
      }
      if (action === 'tone') {
        const data = await adjustTone(trimmed, settings.defaultTone);
        setOtherResult({ text: data.text });
        return;
      }
      if (trFrom !== 'auto' && trFrom === trTo) {
        setError('Source and target must differ (or use Auto-detect).');
        return;
      }
      const data = await translateText(trimmed, trFrom, trTo);
      const bits: string[] = ['Translation'];
      if (data.detected_from) {
        bits.push(
          `Detected: ${flagForLanguageCode(data.detected_from)} ${
            data.detected_from in SUPPORTED_LANGUAGES
              ? SUPPORTED_LANGUAGES[data.detected_from as LanguageCode].name
              : data.detected_from
          }`,
        );
      }
      if (data.glossary_applied?.length) {
        bits.push(`Preserved: ${data.glossary_applied.join(', ')}`);
      }
      setOtherResult({ text: data.text, meta: bits.join(' · ') });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {
        setError('Your token was revoked. Update it in Settings.');
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [
    text,
    tokenHint,
    action,
    settings.defaultLanguage,
    settings.defaultTone,
    rewriteIn,
    trFrom,
    trTo,
  ]);

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void run();
    }
  };

  const corrected = checkResult?.correctedText;
  const issues = checkResult?.issues ?? [];
  const outText = otherResult?.text ?? null;
  const outMeta = otherResult?.meta;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">Quick check</div>
          <div className="text-xs text-gray-600">Run checks and tools on pasted text. ⌘↵ or Ctrl+↵ to run.</div>
        </div>
        <Sparkles className="h-5 w-5 shrink-0 text-indigo-600" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-600">Action</label>
        <select
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          value={action}
          onChange={(e) => setAction(e.target.value as Action)}
        >
          <option value="check">Check grammar</option>
          <option value="rewrite">Rewrite</option>
          <option value="tone">Adjust tone</option>
          <option value="translate">Translate</option>
        </select>
      </div>

      <textarea
        className="min-h-[120px] w-full resize-y rounded-xl border border-gray-200 p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        placeholder="Paste text here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        dir="auto"
        autoFocus
      />

      {action === 'rewrite' ? (
        <input
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          value={rewriteIn}
          onChange={(e) => setRewriteIn(e.target.value)}
          placeholder="How should this be rewritten?"
        />
      ) : null}

      {action === 'translate' ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[10px] font-semibold text-gray-500">From</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none"
              value={trFrom}
              onChange={(e) => setTrFrom(e.target.value)}
            >
              <option value="auto">🌐 Auto</option>
              {LANGUAGE_CODES.map((c) => (
                <option key={c} value={c}>
                  {SUPPORTED_LANGUAGES[c].flag} {SUPPORTED_LANGUAGES[c].name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-semibold text-gray-500">To</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none"
              value={trTo}
              onChange={(e) => setTrTo(e.target.value)}
            >
              {LANGUAGE_CODES.map((c) => (
                <option key={c} value={c}>
                  {SUPPORTED_LANGUAGES[c].flag} {SUPPORTED_LANGUAGES[c].name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {tokenHint ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {tokenHint}
        </div>
      ) : null}

      <button
        type="button"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        onClick={() => void run()}
        disabled={loading || !text.trim()}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {action === 'check'
          ? 'Check'
          : action === 'rewrite'
            ? 'Rewrite'
            : action === 'tone'
              ? 'Adjust tone'
              : 'Translate'}
      </button>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {error}
        </div>
      ) : null}

      {checkResult && action === 'check' ? (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3">
          {checkResult.language_detected ? (
            <div className="text-xs text-gray-600">
              {flagForLanguageCode(checkResult.language_detected)} Detected:{' '}
              {checkResult.language_detected in SUPPORTED_LANGUAGES
                ? SUPPORTED_LANGUAGES[checkResult.language_detected as LanguageCode].name
                : checkResult.language_detected}
            </div>
          ) : null}
          {issues.length ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">Issues</div>
              <ul className="space-y-2">
                {issues.map((i, idx) => (
                  <li key={idx} className="rounded-lg bg-gray-50 p-2 text-xs text-gray-800">
                    {i.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-xs text-gray-600">No issues returned.</div>
          )}

          {corrected ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">Corrected</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-900">
                {corrected}
              </pre>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                  onClick={() => setText(corrected)}
                >
                  Apply all
                </button>
                <button
                  type="button"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-200"
                  onClick={() => void navigator.clipboard.writeText(corrected)}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {otherResult && action !== 'check' && outText ? (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
          {outMeta ? <div className="text-[11px] text-gray-500">{outMeta}</div> : null}
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-900">
            {outText}
          </pre>
          <button
            type="button"
            className="w-full rounded-lg bg-gray-100 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-200"
            onClick={() => void navigator.clipboard.writeText(outText)}
          >
            <Copy className="mr-1 inline h-3.5 w-3.5" />
            Copy
          </button>
        </div>
      ) : null}

      {text.trim() ? (
        <button
          type="button"
          onClick={openInEditor}
          className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
        >
          Open in polyscribe.app
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
