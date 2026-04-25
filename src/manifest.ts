import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from '../package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Polyscribe',
  version: packageJson.version,
  description:
    'Private AI writing assistant — grammar, tone, rewrite, translation across 17 languages. Powered by Claude.',
  icons: {
    16: 'public/icon-16.png',
    32: 'public/icon-32.png',
    48: 'public/icon-48.png',
    128: 'public/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: 'public/icon-32.png',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content-script.ts'],
      run_at: 'document_idle',
      all_frames: true,
    },
  ],
  permissions: ['storage', 'contextMenus', 'activeTab', 'scripting'],
  host_permissions: ['<all_urls>'],
});
