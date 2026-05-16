import {
  addNiqqud,
  adjustTone,
  aiCheckText,
  checkText,
  healthCheck,
  rewriteText,
  translateText,
  ApiError,
} from '../lib/api';
import type { LanguageCode } from '../lib/languages';
import { SUPPORTED_LANGUAGES } from '../lib/languages';
import { getSettings } from '../lib/storage';
import { MSG, type PolyscribeRequest, type PolyscribeResponse } from '../lib/messaging';

type ContextMenusAugmented = typeof chrome.contextMenus & {
  onShown?: chrome.events.Event<(info: chrome.contextMenus.OnClickData) => void>;
};

const contextMenus = chrome.contextMenus as ContextMenusAugmented;

const MENU = {
  CHECK: 'polyscribe_check',
  REWRITE: 'polyscribe_rewrite',
  TONE_PARENT: 'polyscribe_tone_parent',
  TONE_PREFIX: 'polyscribe_tone_',
  TR_PARENT: 'polyscribe_tr_parent',
  TR_TO_EN: 'polyscribe_tr_to_en',
  TR_TO_HE: 'polyscribe_tr_to_he',
  TR_TO_USER: 'polyscribe_tr_to_user',
  TR_CHOOSE: 'polyscribe_tr_choose',
} as const;

const TONE_IDS = ['formal', 'casual', 'friendly', 'professional', 'concise'] as const;

/**
 * `removeAll` is asynchronous. Overlapping rebuilds (e.g. onInstalled + onStartup)
 * could both run `create` with the same ids → "duplicate id" and lastError.
 * Serialize so only one full rebuild runs at a time.
 */
let contextMenuRebuildChain: Promise<void> = Promise.resolve();

function createContextMenuTree(): void {
  contextMenus.create({
    id: MENU.CHECK,
    title: 'Polyscribe: Check grammar',
    contexts: ['selection'],
  });
  contextMenus.create({
    id: MENU.REWRITE,
    title: 'Polyscribe: Rewrite',
    contexts: ['selection'],
  });
  contextMenus.create({
    id: MENU.TONE_PARENT,
    title: 'Polyscribe: Adjust tone',
    contexts: ['selection'],
  });
  for (const tone of TONE_IDS) {
    contextMenus.create({
      id: `${MENU.TONE_PREFIX}${tone}`,
      parentId: MENU.TONE_PARENT,
      title: tone.charAt(0).toUpperCase() + tone.slice(1),
      contexts: ['selection'],
    });
  }
  contextMenus.create({
    id: MENU.TR_PARENT,
    title: 'Polyscribe: Translate',
    contexts: ['selection'],
  });
  contextMenus.create({
    id: MENU.TR_TO_EN,
    parentId: MENU.TR_PARENT,
    title: '→ English',
    contexts: ['selection'],
  });
  contextMenus.create({
    id: MENU.TR_TO_HE,
    parentId: MENU.TR_PARENT,
    title: '→ Hebrew',
    contexts: ['selection'],
  });
  contextMenus.create({
    id: MENU.TR_TO_USER,
    parentId: MENU.TR_PARENT,
    title: '→ (loading…)',
    contexts: ['selection'],
  });
  contextMenus.create({
    id: MENU.TR_CHOOSE,
    parentId: MENU.TR_PARENT,
    title: 'Choose language…',
    contexts: ['selection'],
  });
}

function rebuildContextMenus(): void {
  contextMenuRebuildChain = contextMenuRebuildChain
    .then(
      () =>
        new Promise<void>((resolve) => {
          try {
            contextMenus.removeAll(() => {
              try {
                createContextMenuTree();
              } catch (e) {
                console.error('Polyscribe: context menu create failed', e);
              }
              void syncTranslateUserMenu().finally(() => resolve());
            });
          } catch (e) {
            console.error('Polyscribe: context menu removeAll failed', e);
            resolve();
          }
        }),
    )
    .catch(() => undefined);
}

chrome.runtime.onInstalled.addListener(() => {
  rebuildContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  rebuildContextMenus();
});

async function syncTranslateUserMenu(): Promise<void> {
  try {
    const s = await getSettings();
    const t = s.defaultTranslateTarget;
    const hide = t === 'en' || t === 'he';
    const name =
      t && t in SUPPORTED_LANGUAGES ? SUPPORTED_LANGUAGES[t as LanguageCode].name : 'Language';
    contextMenus.update(MENU.TR_TO_USER, {
      visible: !hide,
      title: `→ ${name}`,
    });
  } catch {
    /* ignore */
  }
}

if (contextMenus.onShown) {
  contextMenus.onShown.addListener(() => {
    void syncTranslateUserMenu();
  });
}

async function handleApiRequest(req: PolyscribeRequest): Promise<PolyscribeResponse> {
  try {
    switch (req.type) {
      case MSG.CHECK: {
        const data = await checkText(req.text, req.language);
        return { ok: true, data };
      }
      case MSG.AI_CHECK: {
        const data = await aiCheckText(req.text, req.language);
        return { ok: true, data };
      }
      case MSG.REWRITE: {
        const data = await rewriteText(req.text, req.instruction);
        return { ok: true, data };
      }
      case MSG.TONE: {
        const data = await adjustTone(req.text, req.tone);
        return { ok: true, data };
      }
      case MSG.TRANSLATE: {
        const data = await translateText(req.text, req.from, req.to);
        return { ok: true, data };
      }
      case MSG.NIQQUD: {
        const data = await addNiqqud(req.text);
        return { ok: true, data };
      }
      case MSG.HEALTH: {
        const data = await healthCheck();
        return { ok: true, data };
      }
      default:
        return { ok: false, error: 'Unknown request' };
    }
  } catch (e) {
    if (e instanceof ApiError) {
      return {
        ok: false,
        error: e.message,
        code: e.code === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : e.code === 'CONFIG' ? 'CONFIG' : undefined,
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, code: 'NETWORK' };
  }
}

chrome.runtime.onMessage.addListener((message: PolyscribeRequest, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return false;
  }
  void handleApiRequest(message).then(sendResponse);
  return true;
});

contextMenus.onClicked.addListener((info, tab) => {
  const text = info.selectionText?.trim();
  if (!text || !tab?.id) return;

  const run = async (req: PolyscribeRequest) => {
    const response = await handleApiRequest(req);
    try {
      await chrome.tabs.sendMessage(tab.id!, {
        type: 'POLYSCRIBE_CONTEXT',
        selectionText: text,
        request: req,
        response,
      });
    } catch {
      /* no content script */
    }
  };

  const runOpenTranslate = async () => {
    try {
      await chrome.tabs.sendMessage(tab.id!, { type: 'POLYSCRIBE_OPEN_TRANSLATE' } as const);
    } catch {
      /* */
    }
  };

  if (info.menuItemId === MENU.CHECK) {
    void run({ type: MSG.CHECK, text });
    return;
  }
  if (info.menuItemId === MENU.REWRITE) {
    void run({
      type: MSG.REWRITE,
      text,
      instruction: 'Rewrite for clarity and flow while preserving meaning.',
    });
    return;
  }
  if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith(MENU.TONE_PREFIX)) {
    const tone = info.menuItemId.slice(MENU.TONE_PREFIX.length);
    void run({ type: MSG.TONE, text, tone });
    return;
  }
  if (info.menuItemId === MENU.TR_TO_EN) {
    void run({ type: MSG.TRANSLATE, text, from: 'auto', to: 'en' });
    return;
  }
  if (info.menuItemId === MENU.TR_TO_HE) {
    void run({ type: MSG.TRANSLATE, text, from: 'auto', to: 'he' });
    return;
  }
  if (info.menuItemId === MENU.TR_TO_USER) {
    void getSettings().then((s) => {
      void run({
        type: MSG.TRANSLATE,
        text,
        from: 'auto',
        to: s.defaultTranslateTarget,
      });
    });
    return;
  }
  if (info.menuItemId === MENU.TR_CHOOSE) {
    void runOpenTranslate();
    return;
  }
});
