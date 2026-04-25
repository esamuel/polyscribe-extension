import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ExternalLink, Info, Settings as SettingsIcon } from 'lucide-react';
import { getSettings } from '../lib/storage';
import type { Settings } from '../lib/types';
import { ManualCheckView } from './ManualCheckView';
import { SettingsView } from './SettingsView';

type Tab = 'check' | 'settings' | 'about';

export function App() {
  const [tab, setTab] = useState<Tab>('check');
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  const needsToken = useMemo(() => {
    if (!settings) return true;
    return !settings.apiToken.trim();
  }, [settings]);

  const openWeb = (): void => {
    const base = (settings?.apiBaseUrl || 'https://polyscribe.app').replace(/\/$/, '');
    window.open(base, '_blank', 'noopener,noreferrer');
  };

  const version = chrome.runtime.getManifest().version;

  if (!settings) {
    return (
      <div className="p-4 text-sm text-gray-700">
        <div className="inline-flex items-center gap-2 text-gray-900">
          <SettingsIcon className="h-4 w-4 animate-pulse" />
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[420px] bg-gradient-to-b from-white to-gray-50">
      <div className="border-b border-gray-200 bg-white/80 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setTab('check')}
            className="min-w-0 text-left"
          >
            <div className="truncate text-sm font-bold text-gray-900">Polyscribe</div>
            <div className="text-[10px] text-gray-500">v{version}</div>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={openWeb}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              title="Open web app"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </button>
            <button
              type="button"
              onClick={() => setTab('settings')}
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
              title="Settings"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        {needsToken ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Add your <span className="font-semibold">API token</span> in Settings (from the web app).
          </div>
        ) : null}
      </div>

      <div className="px-3 pt-2">
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold ${
              tab === 'check' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setTab('check')}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <BookOpen className="h-4 w-4" />
              Quick
            </span>
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold ${
              tab === 'settings' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setTab('settings')}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              Settings
            </span>
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold ${
              tab === 'about' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setTab('about')}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Info className="h-4 w-4" />
              About
            </span>
          </button>
        </div>
      </div>

      <div className="p-3">
        {tab === 'check' ? <ManualCheckView settings={settings} /> : null}
        {tab === 'settings' ? (
          <SettingsView
            settings={settings}
            onSaved={(s) => setSettings(s)}
          />
        ) : null}
        {tab === 'about' ? (
          <div className="space-y-3 text-sm text-gray-800">
            <p className="text-xs text-gray-600">
              Writing assistant for the other 94% of the world&apos;s languages — grammar, tone, rewrite, and
              translation across 17 languages.
            </p>
            <button
              type="button"
              onClick={openWeb}
              className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              Open polyscribe.app →
            </button>
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">Tip:</span> Use the in-page button or
              right-click → Polyscribe on any site. Reload the page if the extension was updated.
            </p>
            <a
              className="inline-flex text-xs font-semibold text-indigo-700 hover:text-indigo-900"
              href="https://github.com/yourusername/polyscribe-extension"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
