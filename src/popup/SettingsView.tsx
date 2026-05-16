import { useMemo, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { ApiError, healthCheck } from '../lib/api';
import { saveSettings } from '../lib/storage';
import { LANGUAGE_CODES, SUPPORTED_LANGUAGES, type LanguageCode } from '../lib/languages';
import { DEFAULT_SETTINGS, TONE_OPTIONS, type Settings } from '../lib/types';

type Props = {
  settings: Settings;
  onSaved: (s: Settings) => void;
};

function optLabel(code: LanguageCode | 'auto'): string {
  if (code === 'auto') return '🌐 Auto-detect';
  const L = SUPPORTED_LANGUAGES[code];
  return `${L.flag} ${L.name}`;
}

export function SettingsView({ settings, onSaved }: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);
  const baseForLinks = (draft.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl).replace(/\/$/, '');

  async function onSave(): Promise<void> {
    setSaving(true);
    try {
      const next = await saveSettings(draft);
      onSaved(next);
      setTestMsg(null);
    } finally {
      setSaving(false);
    }
  }

  async function onTest(): Promise<void> {
    setTesting(true);
    setTestMsg(null);
    try {
      await saveSettings(draft);
      const h = await healthCheck();
      const u = h.user;
      const label = u?.email ?? u?.name ?? u?.id ?? 'connected';
      setTestMsg(`Connected as ${label}.`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {
        setTestMsg('Unauthorized — your token may be revoked.');
      } else {
        setTestMsg(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-0.5">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">API &amp; auth</h3>
        <div className="mt-2 space-y-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">API base URL</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://polyscribe.app"
              value={draft.apiBaseUrl}
              onChange={(e) => setDraft({ ...draft, apiBaseUrl: e.target.value.trim() })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">API token</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="From web app / settings"
              type="password"
              value={draft.apiToken}
              onChange={(e) => setDraft({ ...draft, apiToken: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-200 disabled:opacity-50"
            onClick={() => void onTest()}
            disabled={testing || !draft.apiToken?.trim()}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Test connection
          </button>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            onClick={() => void onSave()}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            onClick={() => setDraft(settings)}
          >
            Reset
          </button>
        </div>
        {testMsg ? (
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800">
            {testMsg}
          </div>
        ) : null}
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Automation</h3>
        <div className="mt-2 space-y-2">
          <label className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
            <span className="text-sm text-gray-800">
              <span className="font-medium">Auto-check on selection</span>
              <span className="mt-0.5 block text-[11px] text-gray-500">
                When you select 10+ characters, check grammar in the background and show a badge if
                there are issues.
              </span>
            </span>
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.autoCheckOnSelection}
              onChange={(e) => setDraft({ ...draft, autoCheckOnSelection: e.target.checked })}
            />
          </label>
          <label className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
            <span className="text-sm font-medium text-gray-800">Enable floating button</span>
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.enableFloatingButton}
              onChange={(e) => setDraft({ ...draft, enableFloatingButton: e.target.checked })}
            />
          </label>
          <label className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
            <span className="text-sm text-gray-800">
              <span className="font-medium">Inline underlines on supported sites</span>
              <span className="mt-0.5 block text-[11px] text-gray-500">
                Show grammar issues inside the field on Gmail, ChatGPT, LinkedIn, X, and WhatsApp Web.
                Hover an underline for the suggestion. Requires API token.
              </span>
              <span className="mt-1 block text-[11px] text-gray-400">
                Supported: Gmail · ChatGPT · LinkedIn · X · WhatsApp Web
              </span>
            </span>
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.enableInlineUnderlines}
              onChange={(e) => setDraft({ ...draft, enableInlineUnderlines: e.target.checked })}
            />
          </label>
          <label className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
            <span className="text-sm text-gray-800">
              <span className="font-medium">Also flag AI-sounding text inline</span>
              <span className="mt-0.5 block text-[11px] text-gray-500">
                Adds AI-tell underlines on every typing pause, on top of grammar. Off by default —
                it roughly doubles API usage. The overlay&apos;s “AI tells” tab still works on
                demand when this is off.
              </span>
            </span>
            <input
              type="checkbox"
              className="mt-1"
              disabled={!draft.enableInlineUnderlines}
              checked={draft.enableInlineAiTells}
              onChange={(e) => setDraft({ ...draft, enableInlineAiTells: e.target.checked })}
            />
          </label>
          <label className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <span className="text-sm text-gray-800">
              <span className="font-medium">Run even if Grammarly is active</span>
              <span className="mt-0.5 block text-[11px] text-gray-600">
                Polyscribe normally pauses its underlines on fields where Grammarly or LanguageTool
                is also running, to avoid tangled underlines. Turn this on to test Polyscribe
                without disabling the other extension — you&apos;ll see underlines from both.
              </span>
            </span>
            <input
              type="checkbox"
              className="mt-1"
              disabled={!draft.enableInlineUnderlines}
              checked={draft.forceOverCompetingExtension}
              onChange={(e) =>
                setDraft({ ...draft, forceOverCompetingExtension: e.target.checked })
              }
            />
          </label>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Auto-check quota per page
            </label>
            <input
              type="number"
              min={5}
              max={100}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              value={draft.autoCheckQuotaPerPage}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  autoCheckQuotaPerPage: Math.min(
                    100,
                    Math.max(5, Number(e.target.value) || draft.autoCheckQuotaPerPage),
                  ),
                })
              }
            />
            <p className="mt-0.5 text-[11px] text-gray-500">
              Caps automatic checks per browser tab — covers both selection and inline auto-checks.
              Resets on a full page reload (on single-page apps like Gmail it resets when the tab
              is reloaded, not on in-app navigation).
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
            <span className="font-semibold text-gray-700">What gets sent:</span> Checks run on
            Polyscribe&apos;s API, so the relevant text leaves your browser.
            <span className="mt-1 block">
              • <span className="font-medium">Selection check:</span> the text you select is sent
              when a check runs.
            </span>
            <span className="mt-0.5 block">
              • <span className="font-medium">Inline underlines:</span> the active field&apos;s text
              is sent shortly after you stop typing.
            </span>
            <span className="mt-1 block">
              Nothing is sent until you trigger a check or type in a supported field, and only while
              these options are on. See the{' '}
              <a
                className="font-semibold text-indigo-600 hover:text-indigo-800"
                href={`${baseForLinks}/privacy`}
                target="_blank"
                rel="noreferrer"
              >
                privacy policy
              </a>
              .
            </span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Language defaults</h3>
        <div className="mt-2 grid grid-cols-1 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Grammar check language</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              value={draft.defaultLanguage}
              onChange={(e) =>
                setDraft({ ...draft, defaultLanguage: e.target.value as Settings['defaultLanguage'] })
              }
            >
              <option value="auto">{optLabel('auto')}</option>
              {LANGUAGE_CODES.map((c) => (
                <option key={c} value={c}>
                  {optLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Default translate — from</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              value={draft.defaultTranslateSource}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  defaultTranslateSource: e.target.value as Settings['defaultTranslateSource'],
                })
              }
            >
              <option value="auto">{optLabel('auto')}</option>
              {LANGUAGE_CODES.map((c) => (
                <option key={c} value={c}>
                  {optLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Default translate — to</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              value={draft.defaultTranslateTarget}
              onChange={(e) =>
                setDraft({ ...draft, defaultTranslateTarget: e.target.value as LanguageCode })
              }
            >
              {LANGUAGE_CODES.map((c) => (
                <option key={c} value={c}>
                  {optLabel(c)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Preferences</h3>
        <div className="mt-2">
          <label className="mb-1 block text-xs font-semibold text-gray-600">Default tone</label>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            value={draft.defaultTone}
            onChange={(e) =>
              setDraft({ ...draft, defaultTone: e.target.value as Settings['defaultTone'] })
            }
          >
            {TONE_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <a
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          href={`${baseForLinks}/glossary`}
          target="_blank"
          rel="noreferrer"
        >
          Manage glossary on polyscribe.app
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
