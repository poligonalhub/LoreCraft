/**
 * Browser IPC Mock for LoreCraft standalone browser execution.
 * Intercepts Tauri IPC calls when running in a standard web browser (Chrome, Edge, Firefox),
 * providing in-memory and localStorage persistence for studying and testing LoreCraft.
 */

import { mockIPC } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import { DEFAULT_SETTINGS, withDefaults } from './settings';
import type {
  Book,
  Bootstrap,
  Node,
  NodeMeta,
  Page,
  PageMeta,
  ProjectStatus,
  TitleEntry,
} from './types';

const STORAGE_KEY_PREFIX = 'lorecraft_browser_';

interface MockStore {
  projectStatus: ProjectStatus;
  settings: unknown;
  meta: Record<string, string>;
  pages: Map<string, Page>;
  books: Map<string, Book>;
  nodes: Map<string, Node>;
}

const store: MockStore = {
  projectStatus: {
    open: false,
    name: '',
    path: null,
    dirty: false,
  },
  settings: DEFAULT_SETTINGS,
  meta: {},
  pages: new Map(),
  books: new Map(),
  nodes: new Map(),
};

// Load saved settings if any
try {
  const savedSettings = localStorage.getItem(`${STORAGE_KEY_PREFIX}settings`);
  if (savedSettings) {
    store.settings = withDefaults(JSON.parse(savedSettings), DEFAULT_SETTINGS);
  }
} catch {
  store.settings = DEFAULT_SETTINGS;
}

function persistSettings(): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}settings`, JSON.stringify(store.settings));
  } catch (e) {
    console.warn('[LoreCraft Browser Mock] Failed to save settings to localStorage:', e);
  }
}

function countWords(content: unknown): number {
  if (!content) return 0;
  const str = typeof content === 'string' ? content : JSON.stringify(content);
  const words = str.match(/\b\w+\b/g);
  return words ? words.length : 0;
}

function toPageMeta(p: Page): PageMeta {
  return {
    id: p.id,
    title: p.title,
    pageType: p.pageType,
    status: p.status,
    summary: p.summary,
    wordCount: p.wordCount,
    isHome: p.isHome,
    revealNodeId: p.revealNodeId,
    localOnly: p.localOnly,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deletedAt: p.deletedAt,
    aliases: p.aliases || [],
    categories: p.categories || [],
  };
}

function toTitleEntry(p: Page): TitleEntry {
  return {
    id: p.id,
    title: p.title,
    pageType: p.pageType,
    status: p.status,
    summary: p.summary,
    aliases: p.aliases || [],
    localOnly: p.localOnly,
  };
}

function toNodeMeta(n: Node): NodeMeta {
  return {
    id: n.id,
    bookId: n.bookId,
    parentId: n.parentId,
    kind: n.kind,
    title: n.title,
    position: n.position,
    status: n.status,
    povPageId: n.povPageId,
    locationPageId: n.locationPageId,
    synopsis: n.synopsis,
    wordCount: n.wordCount,
    targetWords: n.targetWords,
    storyDate: n.storyDate,
    localOnly: n.localOnly,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    deletedAt: n.deletedAt,
  };
}

function importNodes(bookId: string, parentId: string | null, children: any[]): void {
  children.forEach((child, idx) => {
    const nodeId = child.id || `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const node: Node = {
      id: nodeId,
      bookId,
      parentId,
      kind: child.kind || 'chapter',
      title: child.title || 'Untitled',
      position: idx,
      status: child.status || 'draft',
      povPageId: child.pov ? null : null,
      locationPageId: child.location ? null : null,
      synopsis: child.synopsis || '',
      wordCount: countWords(child.content),
      targetWords: child.targetWords || 0,
      storyDate: child.storyDate || '',
      localOnly: !!child.localOnly,
      createdAt: child.createdAt || new Date().toISOString(),
      updatedAt: child.updatedAt || new Date().toISOString(),
      deletedAt: null,
      content: child.content || { type: 'doc', content: [{ type: 'paragraph' }] },
      notes: child.notes || '',
    };
    store.nodes.set(nodeId, node);
    if (child.children && Array.isArray(child.children)) {
      importNodes(bookId, nodeId, child.children);
    }
  });
}

export function handleBrowserRpc(method: string, params: any): any {
  // console.debug(`[RPC] ${method}`, params);

  switch (method) {
    // --- App Lifecycle ---
    case 'app.bootstrap': {
      const boot: Bootstrap = {
        version: '0.4.2 (Browser Sandbox)',
        dataDir: '/browser-data',
        settings: store.settings,
        recoverable: [],
        startupFile: null,
        status: { ...store.projectStatus },
        e2e: false,
        e2eGuide: false,
        platform: { os: 'windows', pdf: false },
      };
      return boot;
    }
    case 'app.ready':
    case 'app.setTheme':
    case 'app.closeAck':
    case 'app.quit':
    case 'app.logClientError':
      return true;

    case 'app.openExternal':
      if (params?.url && typeof window !== 'undefined') {
        window.open(params.url, '_blank');
      }
      return true;

    case 'app.info':
      return { version: '0.4.2', buildTime: '', os: 'windows' };

    case 'app.checkForUpdates':
      return { hasUpdate: false };

    case 'app.openLogFolder':
      return true;

    case 'app.diagnostics':
      return { text: 'LoreCraft Browser Mock Active' };

    // --- Settings ---
    case 'settings.get':
      return store.settings;

    case 'settings.update': {
      if (params?.patch) {
        store.settings = withDefaults(params.patch, store.settings as any);
        persistSettings();
      }
      return store.settings;
    }

    case 'settings.removeRecent': {
      const current = store.settings as any;
      if (current?.recent && Array.isArray(current.recent)) {
        current.recent = current.recent.filter((r: any) => r.path !== params?.path);
        persistSettings();
      }
      return store.settings;
    }

    case 'settings.takeLoadReport':
      return null;

    // --- Project ---
    case 'project.status':
      return { ...store.projectStatus };

    case 'project.new': {
      const name = params?.name?.trim() || 'Novo Projeto';
      store.projectStatus = {
        open: true,
        name,
        path: `/browser/${encodeURIComponent(name)}.lorecraft`,
        dirty: false,
      };
      // Reset stores for new project
      store.pages.clear();
      store.books.clear();
      store.nodes.clear();
      store.meta = {};

      // Create a default home page
      const homeId = `page_${Date.now()}`;
      const homePage: Page = {
        id: homeId,
        title: name,
        pageType: 'home',
        status: 'canon',
        summary: `Página inicial do projeto ${name}.`,
        wordCount: 0,
        isHome: true,
        revealNodeId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        aliases: [],
        categories: [],
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: name }],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Bem-vindo ao seu projeto no LoreCraft! Edite esta página ou crie novos artigos na wiki e cenas no manuscrito.',
                },
              ],
            },
          ],
        },
        infobox: { fields: [] },
        notes: null,
      };
      store.pages.set(homeId, homePage);

      void emit('project://status', { ...store.projectStatus });
      void emit('data://changed', { entity: 'all' });
      void emit('data://changed', { entity: 'pages' });
      void emit('data://changed', { entity: 'books' });
      void emit('data://changed', { entity: 'nodes' });
      return { ...store.projectStatus };
    }

    case 'project.open': {
      const path = params?.path || '/browser/project.lorecraft';
      const name = path.split('/').pop()?.replace('.lorecraft', '') || 'Projeto';
      store.projectStatus = {
        open: true,
        name,
        path,
        dirty: false,
      };
      void emit('project://status', { ...store.projectStatus });
      void emit('data://changed', { entity: 'all' });
      void emit('data://changed', { entity: 'pages' });
      void emit('data://changed', { entity: 'books' });
      void emit('data://changed', { entity: 'nodes' });
      return { ...store.projectStatus };
    }

    case 'project.save':
    case 'project.saveAs':
      store.projectStatus.dirty = false;
      return { ...store.projectStatus };

    case 'project.close':
      store.projectStatus = {
        open: false,
        name: '',
        path: null,
        dirty: false,
      };
      void emit('project://status', { ...store.projectStatus });
      return { ...store.projectStatus };

    case 'project.exportCopy':
      return { path: params?.path || '/browser/export.lorecraft' };

    case 'project.listRecoverable':
    case 'project.listBackups':
      return [];

    case 'project.getMeta':
      return store.meta[params?.key] || null;

    case 'project.setMeta':
      if (params?.key) {
        store.meta[params.key] = String(params.value);
      }
      return true;

    // --- Import (Open Sample World) ---
    case 'import.preview':
    case 'import.apply': {
      const payload = params || {};
      let createdCount = 0;

      if (payload.meta) {
        Object.assign(store.meta, payload.meta);
      }

      if (Array.isArray(payload.pages)) {
        // Clear placeholder home page generated by project.new so it doesn't conflict
        for (const [id, p] of Array.from(store.pages.entries())) {
          if (p.isHome && (p.wordCount === 0 || p.summary?.includes('Página inicial do projeto'))) {
            store.pages.delete(id);
          }
        }
        for (const p of payload.pages) {
          const pageId = p.id || `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const page: Page = {
            id: pageId,
            title: p.title || 'Sem Título',
            pageType: p.pageType || 'article',
            status: p.status || 'canon',
            summary: p.summary || '',
            wordCount: countWords(p.content),
            isHome: !!p.isHome,
            revealNodeId: p.revealNodeId || null,
            localOnly: !!p.localOnly,
            createdAt: p.createdAt || new Date().toISOString(),
            updatedAt: p.updatedAt || new Date().toISOString(),
            deletedAt: null,
            aliases: p.aliases || [],
            categories: p.categories || [],
            content: p.content || { type: 'doc', content: [{ type: 'paragraph' }] },
            infobox: p.infobox || { fields: [] },
            notes: p.notes || null,
          };
          store.pages.set(pageId, page);
          createdCount++;
        }
      }

      if (Array.isArray(payload.books)) {
        for (let bIdx = 0; bIdx < payload.books.length; bIdx++) {
          const b = payload.books[bIdx];
          const bookId = b.id || `book_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const book: Book = {
            id: bookId,
            title: b.title || 'Sem Título',
            subtitle: b.subtitle || '',
            author: b.author || '',
            position: bIdx,
            targetWords: b.targetWords || 50000,
            createdAt: b.createdAt || new Date().toISOString(),
            updatedAt: b.updatedAt || new Date().toISOString(),
            deletedAt: null,
            publishing: b.publishing || {},
          };
          store.books.set(bookId, book);
          createdCount++;

          if (Array.isArray(b.children)) {
            importNodes(bookId, null, b.children);
          }
        }
      }

      void emit('data://changed', { entity: 'all' });
      void emit('data://changed', { entity: 'pages' });
      void emit('data://changed', { entity: 'books' });
      void emit('data://changed', { entity: 'nodes' });

      return {
        created: createdCount,
        updated: 0,
        skipped: 0,
        problems: [],
      };
    }

    // --- Pages / Wiki ---
    case 'pages.list': {
      const filter = params || {};
      let list = Array.from(store.pages.values());
      if (!filter.deleted) {
        list = list.filter((p) => !p.deletedAt);
      }
      if (filter.pageType) {
        list = list.filter((p) => p.pageType === filter.pageType);
      }
      if (filter.category) {
        list = list.filter((p) => p.categories.includes(filter.category));
      }
      return list.map(toPageMeta);
    }

    case 'pages.titles':
      return Array.from(store.pages.values())
        .filter((p) => !p.deletedAt)
        .map(toTitleEntry);

    case 'pages.home': {
      const home = Array.from(store.pages.values()).find((p) => p.isHome && !p.deletedAt);
      if (home) return home;
      const first = Array.from(store.pages.values()).find((p) => !p.deletedAt);
      return first || null;
    }

    case 'pages.get': {
      const page = store.pages.get(params?.id);
      return page || null;
    }

    case 'pages.getByTitle': {
      const title = (params?.title || '').trim().toLowerCase();
      const page = Array.from(store.pages.values()).find(
        (p) =>
          !p.deletedAt &&
          (p.title.toLowerCase() === title ||
            p.aliases.some((a) => a.toLowerCase() === title)),
      );
      return page || null;
    }

    case 'pages.create': {
      const id = `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newPage: Page = {
        id,
        title: params?.title || 'Novo Artigo',
        pageType: params?.pageType || 'article',
        status: params?.status || 'draft',
        summary: params?.summary || '',
        wordCount: countWords(params?.content),
        isHome: false,
        revealNodeId: null,
        localOnly: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        aliases: params?.aliases || [],
        categories: params?.categories || [],
        content: params?.content || { type: 'doc', content: [{ type: 'paragraph' }] },
        infobox: params?.infobox || { fields: [] },
        notes: null,
      };
      store.pages.set(id, newPage);
      void emit('data://changed', { entity: 'pages' });
      return newPage;
    }

    case 'pages.update': {
      const page = store.pages.get(params?.id);
      if (page) {
        const patch = params.patch || {};
        Object.assign(page, patch);
        page.updatedAt = new Date().toISOString();
        if (patch.content) {
          page.wordCount = countWords(patch.content);
        }
        void emit('data://changed', { entity: 'pages' });
        return toPageMeta(page);
      }
      return null;
    }

    case 'pages.rename': {
      const page = store.pages.get(params?.id);
      if (page && params?.newTitle) {
        page.title = params.newTitle;
        page.updatedAt = new Date().toISOString();
        void emit('data://changed', { entity: 'pages' });
      }
      return { documentsChanged: 1 };
    }

    case 'pages.delete': {
      const page = store.pages.get(params?.id);
      if (page) {
        page.deletedAt = new Date().toISOString();
        void emit('data://changed', { entity: 'pages' });
      }
      return true;
    }

    case 'pages.restore': {
      const page = store.pages.get(params?.id);
      if (page) {
        page.deletedAt = null;
        void emit('data://changed', { entity: 'pages' });
      }
      return true;
    }

    case 'pages.purge': {
      store.pages.delete(params?.id);
      void emit('data://changed', { entity: 'pages' });
      return true;
    }

    case 'pages.categories': {
      const map: Record<string, number> = {};
      for (const p of store.pages.values()) {
        if (!p.deletedAt && p.categories) {
          for (const c of p.categories) {
            map[c] = (map[c] || 0) + 1;
          }
        }
      }
      return Object.entries(map).map(([name, count]) => ({ name, count }));
    }

    case 'pages.random': {
      const active = Array.from(store.pages.values()).filter((p) => !p.deletedAt);
      if (active.length === 0) return null;
      const pick = active[Math.floor(Math.random() * active.length)];
      return pick.id;
    }

    case 'pages.backlinks':
      return { pages: [], scenes: [] };

    case 'pages.firstAppearance':
      return null;

    case 'pages.firstAppearances':
      return {};

    case 'pages.sceneOptions':
      return [];

    case 'pages.infoboxLinks':
      return [];

    case 'pages.wanted':
    case 'pages.orphans':
      return [];

    // --- Books & Manuscript ---
    case 'books.list':
      return Array.from(store.books.values()).filter((b) => !b.deletedAt);

    case 'books.trash':
      return Array.from(store.books.values()).filter((b) => !!b.deletedAt);

    case 'books.create': {
      const id = `book_${Date.now()}`;
      const book: Book = {
        id,
        title: params?.title || 'Novo Livro',
        subtitle: '',
        author: '',
        position: store.books.size,
        targetWords: 50000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        publishing: {},
      };
      store.books.set(id, book);
      void emit('data://changed', { entity: 'books' });
      return { id };
    }

    case 'books.update': {
      const book = store.books.get(params?.id);
      if (book && params?.patch) {
        Object.assign(book, params.patch);
        book.updatedAt = new Date().toISOString();
        void emit('data://changed', { entity: 'books' });
      }
      return true;
    }

    case 'books.delete': {
      const book = store.books.get(params?.id);
      if (book) {
        book.deletedAt = new Date().toISOString();
        void emit('data://changed', { entity: 'books' });
      }
      return true;
    }

    case 'books.reorder':
      return true;

    // --- Nodes (Chapters / Scenes) ---
    case 'nodes.tree': {
      const bookId = params?.bookId;
      const nodes = Array.from(store.nodes.values()).filter(
        (n) => n.bookId === bookId && !n.deletedAt,
      );
      nodes.sort((a, b) => a.position - b.position);
      return nodes.map(toNodeMeta);
    }

    case 'nodes.get':
      return store.nodes.get(params?.id) || null;

    case 'nodes.create': {
      const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const node: Node = {
        id,
        bookId: params?.bookId,
        parentId: params?.parentId || null,
        kind: params?.kind || 'chapter',
        title: params?.title || 'Novo Item',
        position: store.nodes.size,
        status: params?.status || 'draft',
        povPageId: null,
        locationPageId: null,
        synopsis: params?.synopsis || '',
        wordCount: countWords(params?.content),
        targetWords: params?.targetWords || 0,
        storyDate: '',
        localOnly: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        content: params?.content || { type: 'doc', content: [{ type: 'paragraph' }] },
        notes: '',
      };
      store.nodes.set(id, node);
      void emit('data://changed', { entity: 'nodes' });
      return toNodeMeta(node);
    }

    case 'nodes.update': {
      const node = store.nodes.get(params?.id);
      if (node) {
        const patch = params?.patch || {};
        Object.assign(node, patch);
        node.updatedAt = new Date().toISOString();
        if (patch.content) {
          node.wordCount = countWords(patch.content);
        }
        void emit('data://changed', { entity: 'nodes' });
        return toNodeMeta(node);
      }
      return null;
    }

    case 'nodes.delete': {
      const node = store.nodes.get(params?.id);
      if (node) {
        node.deletedAt = new Date().toISOString();
        void emit('data://changed', { entity: 'nodes' });
      }
      return true;
    }

    case 'nodes.move':
      return true;

    case 'nodes.trash':
      return [];

    case 'nodes.stats':
      return { words: 0, writtenToday: 0, days: [] };

    case 'nodes.cast':
      return [];

    case 'nodes.setCast':
      return true;

    case 'nodes.mentions':
      return [];

    // --- Search ---
    case 'search.query': {
      const query = (params?.q || '').toLowerCase();
      const hits: any[] = [];
      for (const p of store.pages.values()) {
        if (!p.deletedAt && (p.title.toLowerCase().includes(query) || p.summary.toLowerCase().includes(query))) {
          hits.push({
            id: p.id,
            kind: 'page',
            title: p.title,
            snippet: p.summary || p.title,
            status: p.status,
          });
        }
      }
      return hits;
    }

    // --- Files Mock ---
    case 'files.pickOpen':
      return ['/browser/sample.lorecraft'];
    case 'files.pickSave':
      return '/browser/project.lorecraft';
    case 'files.pickFolder':
      return '/browser';
    case 'files.readText':
      return { text: '' };
    case 'files.writeText':
    case 'files.writeBytes':
      return true;
    case 'files.readBytes':
      return { base64: '' };
    case 'files.listDir':
      return [];
    case 'files.readResource':
      return { text: '' };

    // --- Extras, Canvases, Revisions, Threads, AI Fallbacks ---
    case 'canvases.list':
      return [];
    case 'canvases.get':
      return null;
    case 'canvases.create':
      return { id: 'c1', title: params?.title || 'Canvas', data: {} };
    case 'threads.list':
    case 'threads.links':
      return [];
    case 'consistency.list':
      return [];
    case 'revisions.list':
      return [];
    case 'revisions.retention':
      return { enabled: false, keepAllDays: 30, dailyForDays: 365, keepLatest: 10 };
    case 'snapshot.get':
      return { exportedAt: new Date().toISOString(), pages: [], books: [] };
    // --- Extras & Visualizers ---
    case 'extras.timelineData':
      return { scenes: [], events: [], eras: [] };
    case 'extras.timelineScope':
      return { min: 0, max: 1000 };
    case 'extras.graphData':
      return { nodes: [], links: [] };
    case 'extras.relationshipList':
      return [];
    case 'extras.relationshipAdd':
      return { id: `rel_${Date.now()}`, ...params };
    case 'extras.relationshipUpdate':
      return { id: params?.id || 'rel_1', ...params };
    case 'extras.relationshipDelete':
      return true;
    case 'extras.relationKinds':
      return [];
    case 'extras.relationKindSet':
      return true;
    case 'extras.familyData':
      return { members: [], relationships: [] };
    case 'extras.mapList':
      return [];
    case 'extras.mapGet':
      return null;
    case 'extras.mapCreate':
      return { id: `map_${Date.now()}`, title: params?.title || 'Novo Mapa', assetId: params?.assetId };
    case 'extras.mapRename':
    case 'extras.mapDelete':
    case 'extras.mapRestore':
    case 'extras.mapPurge':
      return true;
    case 'extras.pinAdd':
      return { id: `pin_${Date.now()}`, ...params };
    case 'extras.pinUpdate':
      return { id: params?.id || 'pin_1', ...params };
    case 'extras.pinDelete':
      return true;
    case 'extras.pageMaps':
      return [];
    case 'extras.dictionaryList':
      return [];
    case 'extras.dictionaryAdd':
    case 'extras.dictionaryRemove':
      return true;

    // --- MCP Server & External Tools ---
    case 'mcp.status':
      return {
        enabled: false,
        running: false,
        port: null,
        url: null,
        token: '',
        permission: 'suggest',
        shareLocalOnly: true,
        exePath: null,
        projectPath: null,
        projectName: store.projectStatus.name,
        projectOpen: store.projectStatus.open,
        clients: [],
        activity: [],
        error: null,
      };
    case 'mcp.update':
    case 'mcp.rotateToken':
      return handleBrowserRpc('mcp.status', null);
    case 'mcp.proposals':
      return [];
    case 'mcp.proposalCount':
      return 0;
    case 'mcp.proposalResolve':
      return { changed: false };

    // --- Meaning & AI ---
    case 'meaning.status':
      return { ready: false, indexing: false };
    case 'meaning.findSimilar':
      return [];
    case 'ai.prompt':
      return { text: '' };
    case 'ai.suggest':
      return [];

    default:
      console.warn(`[LoreCraft Browser Mock] Unhandled method: ${method}`);
      if (
        method.endsWith('list') ||
        method.endsWith('List') ||
        method.endsWith('titles') ||
        method.endsWith('Titles') ||
        method.endsWith('proposals') ||
        method.endsWith('links') ||
        method.endsWith('options') ||
        method.endsWith('categories')
      ) {
        return [];
      }
      return null;
  }
}

// Auto-initialize when running in browser without native Tauri
if (typeof window !== 'undefined' && (!(window as any).__TAURI_INTERNALS__ || !(window as any).__TAURI_INTERNALS__.invoke)) {
  console.info('[LoreCraft] Native Tauri runtime not detected. Initializing Browser Sandbox Mock...');
  mockIPC(
    (cmd, args) => {
      if (cmd === 'rpc') {
        const { method, params } = (args || {}) as { method: string; params: unknown };
        return handleBrowserRpc(method, params);
      }
      if (cmd === 'ai_cancel' || cmd === 'ai_stream') {
        return Promise.resolve();
      }
      console.warn(`[LoreCraft Browser Mock] Unknown IPC command: ${cmd}`, args);
      return Promise.resolve(null);
    },
    { shouldMockEvents: true },
  );
}
