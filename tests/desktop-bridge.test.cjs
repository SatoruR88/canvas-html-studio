const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'desktop.js'), 'utf8');

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.hidden = false;
    this.textContent = '';
    this.title = '';
    this.innerHTML = '';
    this.children = [];
    this.listeners = new Map();
    const values = new Set();
    this.classList = {
      add: value => values.add(value),
      remove: value => values.delete(value),
      contains: value => values.has(value)
    };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  querySelector() { return this.children[0] || null; }

  async trigger(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) await listener(event);
  }
}

function createHarness({ currentRoot = 'C:\\Sites\\project', recent = [], folderExists: initialFolderExists = true, backups = [], readProject = null } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new MockElement());
    return elements.get(id);
  };
  [
    'saveBtn', 'saveAsBtn', 'saveLocation', 'saveLabel', 'savedDot', 'importMenu',
    'recentProjects', 'startRecentProjects', 'startRecentList', 'keepLocalBtn',
    'reloadNativeBtn', 'externalChangeMessage', 'diskBackupSection', 'diskBackupList'
  ].forEach(element);
  const folderImport = new MockElement('button');
  const documentListeners = new Map();
  const windowListeners = new Map();
  const eventListeners = new Map();
  const storage = new Map([
    ['canvas-desktop-recent-projects', JSON.stringify(recent)]
  ]);
  if (currentRoot) storage.set('canvas-desktop-current-project', currentRoot);
  const invocations = [];
  let chosenRoot = 'D:\\Exports\\copy';
  let folderExists = initialFolderExists;

  const document = {
    title: '',
    documentElement: new MockElement('html'),
    body: new MockElement('body'),
    createElement: tag => new MockElement(tag),
    getElementById: id => element(id),
    querySelector: selector => selector === '[data-import="folder"]' ? folderImport : null,
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener); documentListeners.set(type, listeners);
    }
  };
  const localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  const invoke = async (command, input = {}) => {
    invocations.push({ command, input });
    if (command === 'choose_save_folder') return chosenRoot;
    if (command === 'save_project_files') return { count: input.files.length, backup: null };
    if (command === 'list_project_backups') return backups;
    if (command === 'restore_project_backup') return 2;
    if (command === 'project_folder_exists') return folderExists;
    if (command === 'read_project_folder') {
      if (readProject) return readProject;
      throw new Error('missing');
    }
    return null;
  };
  const window = {
    __TAURI__: {
      core: { invoke },
      event: { listen: async (name, listener) => eventListeners.set(name, listener) }
    },
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener); windowListeners.set(type, listeners);
    },
    dispatchEvent(event) {
      for (const listener of windowListeners.get(event.type) || []) listener(event);
    },
    confirm: () => true
  };
  const context = vm.createContext({
    window, document, localStorage, console, TextEncoder, Uint8Array,
    CustomEvent: class { constructor(type) { this.type = type; } },
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    setTimeout: callback => { callback(); return 1; }, clearTimeout: () => {},
    toggleImportMenu: () => {}, importEntries: async () => {},
    showToast: () => {}, markPending: () => {}, commit: () => {}, dirty: false,
    collectOutputFiles: () => new Map([['index.html', { name: 'index.html', content: '<h1>Saved</h1>', type: 'text/html' }]]),
    detectMime: () => 'application/octet-stream'
  });
  vm.runInContext(source, context);
  return {
    window, document, elements, storage, invocations, eventListeners, documentListeners,
    setChosenRoot(value) { chosenRoot = value; },
    setFolderExists(value) { folderExists = value; },
    async flush() { for (let index = 0; index < 8; index++) await Promise.resolve(); }
  };
}

test('shows the current folder and saves a copy to a newly chosen folder', async () => {
  const harness = createHarness();
  await harness.flush();
  assert.equal(harness.elements.get('saveLocation').textContent, 'C:/Sites/project');
  assert.equal(harness.elements.get('saveLocation').title, 'C:\\Sites\\project');

  await harness.elements.get('saveAsBtn').trigger('click');
  const save = harness.invocations.find(call => call.command === 'save_project_files');
  assert.equal(save.input.root, 'D:\\Exports\\copy');
  assert.equal(harness.storage.get('canvas-desktop-current-project'), 'D:\\Exports\\copy');
});

test('removes a missing current folder from recent projects', async () => {
  const missing = 'C:\\Sites\\missing';
  const harness = createHarness({ currentRoot: missing, recent: [missing, 'C:\\Sites\\valid'], folderExists: false });
  await harness.flush();

  const recent = JSON.parse(harness.storage.get('canvas-desktop-recent-projects'));
  assert.equal(harness.storage.has('canvas-desktop-current-project'), false);
  assert.deepEqual(recent, ['C:\\Sites\\valid']);
  assert.equal(harness.elements.get('saveLocation').hidden, true);
  assert.equal(harness.elements.get('saveLabel').textContent, '保存先を選択してください');
  assert.equal(harness.elements.get('savedDot').classList.contains('pending'), true);
});

test('shows relative filenames for aggregated external changes', async () => {
  const harness = createHarness();
  await harness.flush();
  const listener = harness.eventListeners.get('project-files-changed');
  listener({ payload: ['C:\\Sites\\project\\index.html', 'C:\\Sites\\project\\styles.css', 'C:\\Sites\\project\\about.html'] });
  assert.equal(harness.elements.get('externalChangeMessage').textContent, 'index.html、styles.css ほか1件 が外部で変更されました。');
  assert.equal(harness.document.body.children[0].classList.contains('visible'), true);
});

test('uses Ctrl+Shift+S for saving to another folder', async () => {
  const harness = createHarness();
  await harness.flush();
  let prevented = false;
  let stopped = false;
  const listener = harness.documentListeners.get('keydown')[0];
  listener({
    ctrlKey: true, metaKey: false, shiftKey: true, key: 's',
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; }
  });
  await harness.flush();

  const save = harness.invocations.find(call => call.command === 'save_project_files');
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(save.input.root, 'D:\\Exports\\copy');
});

test('lists backup differences and restores a selected generation', async () => {
  const root = 'C:\\Sites\\project';
  const backups = [{
    id: 'backup-123-1', createdAt: Date.UTC(2026, 8, 12, 1, 30), fileCount: 2, changedCount: 2,
    changes: [{ path: 'index.html', status: 'changed' }, { path: 'about.html', status: 'added' }]
  }];
  const harness = createHarness({ currentRoot: root, backups, readProject: { root, files: [] } });
  await harness.flush();
  harness.window.dispatchEvent({ type: 'canvas-recovery-open' });
  await harness.flush();

  const section = harness.elements.get('diskBackupSection');
  const list = harness.elements.get('diskBackupList');
  assert.equal(section.hidden, false);
  assert.equal(list.children.length, 1);
  const row = list.children[0];
  const restoreButton = row.children[0].children[1].children[1];
  await restoreButton.trigger('click');
  await harness.flush();

  const restore = harness.invocations.find(call => call.command === 'restore_project_backup');
  assert.equal(restore.input.root, root);
  assert.equal(restore.input.id, 'backup-123-1');
});
