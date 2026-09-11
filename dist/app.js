const DEFAULT_HTML = `
<div class="site-shell">
  <header class="site-header" data-label="ヘッダー">
    <div class="logo"><span>N</span>NORTHLINE</div>
    <nav><a href="#">Product</a><a href="#">Story</a><a href="#">Journal</a></nav>
  </header>
  <main>
    <section class="hero" data-label="ヒーロー">
      <p class="eyebrow" data-label="ラベル">DESIGNED FOR DEEP WORK</p>
      <h1 data-label="メイン見出し">Focus,<br><em>beautifully.</em></h1>
      <p class="lead" data-label="本文">思考の輪郭を研ぎ澄ます、静かで美しいワークスペース。集中するための道具を、ひとつの場所に。</p>
      <a class="cta" href="#" data-label="ボタン">コレクションを見る <span>→</span></a>
    </section>
    <section class="features" data-label="特徴一覧">
      <div class="feature" data-label="特徴 1"><strong>01</strong><span>余白から生まれる<br>クリアな思考</span></div>
      <div class="feature" data-label="特徴 2"><strong>02</strong><span>必要なものだけを<br>手元に残す</span></div>
      <div class="feature" data-label="特徴 3"><strong>03</strong><span>長く使える<br>確かな品質</span></div>
    </section>
  </main>
</div>`;

const DEFAULT_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body { background: #fbfaf7; color: #151823; font-family: Arial, "Yu Gothic", sans-serif; }
.site-shell { min-height: 920px; padding: 46px 62px 52px; }
.site-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #cfd1d4; padding-bottom: 18px; }
.logo { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; letter-spacing: .13em; }
.logo > span { display: grid; place-items: center; width: 25px; height: 25px; border: 1px solid #181a1e; border-radius: 50%; font: 13px Georgia, serif; }
.site-header nav { display: flex; gap: 24px; }
.site-header a { color: #52555b; text-decoration: none; font-size: 11px; }
.hero { padding: 94px 0 82px; }
.eyebrow { color: #596477; font-size: 10px; font-weight: 800; letter-spacing: .21em; margin: 0 0 22px; }
.hero h1 { width: max-content; max-width: 100%; margin: 0 0 26px; font: 600 68px/.98 Georgia, serif; letter-spacing: -2px; }
.hero h1 em { color: #2457e6; font-weight: inherit; }
.lead { max-width: 425px; color: #5f6269; line-height: 1.9; font-size: 14px; margin: 0 0 30px; }
.cta { display: inline-flex; align-items: center; gap: 24px; padding: 13px 18px; background: #151823; color: #fff; text-decoration: none; font-size: 12px; font-weight: 700; }
.features { border-top: 1px solid #cfd1d4; display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; padding-top: 24px; }
.feature { display: flex; gap: 16px; align-items: flex-start; }
.feature strong { color: #2457e6; font-size: 11px; }
.feature span { font-size: 12px; line-height: 1.7; color: #4c5058; }
@media (max-width: 600px) {
  .site-shell { min-height: 760px; padding: 30px 28px 40px; }
  .site-header nav { display: none; }
  .hero { padding: 68px 0; }
  .hero h1 { font-size: 48px; }
  .features { grid-template-columns: 1fr; gap: 18px; }
}`;

const STORAGE_KEY = 'canvas-html-studio-project-v2';
const RECOVERY_KEY = 'canvas-html-studio-recovery-v1';
const SETTINGS_KEY = 'canvas-html-studio-settings-v1';
const ASSET_DB = 'canvas-html-studio-assets';
const ASSET_STORE = 'files';
const DEFAULT_SETTINGS = { theme: 'light', autosaveDelay: 350, viewport: 'desktop', zoom: 86 };
const BLANK_HTML = '<main style="max-width: 760px; margin: 0 auto; padding: 72px 40px;"><h1 data-label="見出し">新しいページ</h1><p data-label="本文">ここから内容を作成します。</p></main>';
const BLANK_CSS = '* { box-sizing: border-box; }\nhtml, body { margin: 0; min-height: 100%; }\nbody { color: #151823; background: #ffffff; font-family: Arial, "Yu Gothic", sans-serif; line-height: 1.7; }';
const frame = document.getElementById('canvasFrame');
const pageWrap = document.getElementById('pageWrap');
const pageSurface = document.getElementById('pageSurface');
const overlay = document.getElementById('selectionOverlay');
const snapGuideX = document.getElementById('snapGuideX');
const snapGuideY = document.getElementById('snapGuideY');
const stage = document.getElementById('stage');
const toast = document.getElementById('toast');
let selected = null;
let selectedPath = '';
let zoom = 86;
let codeTab = 'html';
let history = [];
let historyIndex = -1;
let commitTimer = null;
let dragPath = null;
let assets = new Map();
let assetUrls = new Map();
let dbPromise = null;
let dirty = false;
let styleScope = 'base';
let lastRecoveryAt = 0;
let settings = loadSettings();
let selectedElements = new Set();
let elementClipboard = '';
let lastTextRange = null;
let lastTextHost = null;
let groupSequence = 0;

let project = {
  filename: 'product-page.html', title: 'Northline', html: DEFAULT_HTML, css: DEFAULT_CSS,
  head: '', scripts: '', htmlPath: 'index.html', cssPath: 'styles.css', cssMode: 'external', styleKey: 'styles.css', inlineCss: '',
  activePagePath: 'index.html', homePagePath: 'index.html',
  pages: [{ filename: 'product-page.html', title: 'Northline', html: DEFAULT_HTML, head: '', scripts: '', htmlPath: 'index.html', cssPath: 'styles.css', cssMode: 'external', styleKey: 'styles.css', inlineCss: '' }],
  styles: { 'styles.css': DEFAULT_CSS }, responsiveRules: {}
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1900);
}

const dialogOpeners = new WeakMap();
function showAppDialog(dialog, initialFocus) {
  if (!dialog || dialog.open) return;
  dialogOpeners.set(dialog, document.activeElement);
  dialog.showModal();
  if (initialFocus) setTimeout(() => dialog.querySelector(initialFocus)?.focus(), 0);
}

document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => {
  const opener = dialogOpeners.get(dialog);
  if (opener?.isConnected) opener.focus();
  dialogOpeners.delete(dialog);
}));

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) }; }
  catch (_) { return { ...DEFAULT_SETTINGS }; }
}

function normalizePage(value, fallback = {}) {
  if (!value || typeof value.html !== 'string') return null;
  const htmlPath = normalizePath(value.htmlPath || value.filename || fallback.htmlPath || 'index.html');
  const cssMode = value.cssMode || fallback.cssMode || 'external';
  const cssPath = cssMode === 'inline' ? null : normalizePath(value.cssPath || fallback.cssPath || `${dirname(htmlPath)}/styles.css`);
  return {
    filename: value.filename || htmlPath.split('/').pop(), title: value.title || htmlPath.split('/').pop().replace(/\.html?$/i, ''),
    html: value.html, head: value.head || '', scripts: value.scripts || '', htmlPath, cssPath, cssMode,
    styleKey: value.styleKey || (cssMode === 'inline' ? `inline:${htmlPath}` : cssPath), inlineCss: value.inlineCss || ''
  };
}

function safeProject(value) {
  if (!value || typeof value.html !== 'string' || typeof value.css !== 'string') return null;
  const fallback = normalizePage(value);
  const pages = (Array.isArray(value.pages) ? value.pages.map(page => normalizePage(page, fallback)).filter(Boolean) : [fallback]);
  if (!pages.some(page => page.htmlPath === fallback.htmlPath)) pages.unshift(fallback);
  const activePagePath = pages.some(page => page.htmlPath === value.activePagePath) ? value.activePagePath : fallback.htmlPath;
  const active = pages.find(page => page.htmlPath === activePagePath) || pages[0];
  const styles = value.styles && typeof value.styles === 'object' ? { ...value.styles } : {};
  if (styles[active.styleKey] == null) styles[active.styleKey] = value.css;
  return {
    ...active, css: styles[active.styleKey] || '', activePagePath, homePagePath: pages.some(page => page.htmlPath === value.homePagePath) ? value.homePagePath : (pages.find(page => /(^|\/)index\.html?$/i.test(page.htmlPath))?.htmlPath || pages[0].htmlPath), pages, styles,
    responsiveRules: value.responsiveRules && typeof value.responsiveRules === 'object' ? value.responsiveRules : {}
  };
}

function syncActivePageRecord() {
  if (!project.pages) project.pages = [];
  const record = normalizePage(project);
  const index = project.pages.findIndex(page => page.htmlPath === project.htmlPath);
  if (index >= 0) project.pages[index] = record; else project.pages.push(record);
  project.activePagePath = project.htmlPath;
  project.styles ||= {};
  project.styles[project.styleKey] = project.css;
}

function hydratePage(path) {
  const page = project.pages?.find(item => item.htmlPath === path);
  if (!page) return false;
  Object.assign(project, cloneValue(page));
  project.activePagePath = page.htmlPath;
  project.css = project.styles?.[page.styleKey] || '';
  return true;
}

function getRecoveries() {
  try { const rows = JSON.parse(localStorage.getItem(RECOVERY_KEY)); return Array.isArray(rows) ? rows : []; }
  catch (_) { return []; }
}

function saveRecoverySnapshot(force = false) {
  if (!dirty || (!force && Date.now() - lastRecoveryAt < 30000)) return;
  syncActivePageRecord();
  const snapshot = { id: Date.now(), savedAt: new Date().toISOString(), project: cloneProject() };
  const signature = projectSignature(snapshot.project);
  const rows = getRecoveries().filter(row => projectSignature(row.project) !== signature);
  try { localStorage.setItem(RECOVERY_KEY, JSON.stringify([snapshot, ...rows].slice(0, 12))); lastRecoveryAt = Date.now(); }
  catch (_) {}
}

function loadSavedProject() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const restored = safeProject(saved?.project);
    if (!restored) return;
    project = restored;
    dirty = Boolean(saved.dirty);
    if (Array.isArray(saved.history) && saved.history.length) {
      history = saved.history.map(safeProject).filter(Boolean).slice(-30);
      historyIndex = Math.min(saved.historyIndex ?? history.length - 1, history.length - 1);
    }
  } catch (_) {}
}

function openAssetDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(ASSET_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(ASSET_STORE, { keyPath: 'path' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function loadAssetsFromDB() {
  try {
    const db = await openAssetDB();
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction(ASSET_STORE, 'readonly').objectStore(ASSET_STORE).getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    assets = new Map(rows.map(row => [row.path, { data: new Uint8Array(row.data), type: row.type || detectMime(row.path) }]));
  } catch (_) { assets = new Map(); }
}

async function saveAssetsToDB(replaceAll = false) {
  try {
    const db = await openAssetDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, 'readwrite'); const store = tx.objectStore(ASSET_STORE);
      if (replaceAll) store.clear();
      for (const [path, asset] of assets) store.put({ path, data: asset.data, type: asset.type });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  } catch (_) {}
}

function clearAssetUrls() {
  for (const url of assetUrls.values()) URL.revokeObjectURL(url);
  assetUrls.clear();
}

function assetUrl(path) {
  const normalized = normalizePath(path); const asset = assets.get(normalized); if (!asset) return null;
  if (!assetUrls.has(normalized)) assetUrls.set(normalized, URL.createObjectURL(new Blob([asset.data], { type: asset.type || detectMime(normalized) })));
  return assetUrls.get(normalized);
}

function normalizePath(path) {
  const parts = String(path || '').replace(/\\/g, '/').split('/'); const result = [];
  for (const part of parts) { if (!part || part === '.') continue; if (part === '..') result.pop(); else result.push(part); }
  return result.join('/');
}

function dirname(path) { const parts = normalizePath(path).split('/'); parts.pop(); return parts.join('/'); }
function resolveAssetPath(baseFile, reference) {
  if (!reference || /^(?:[a-z]+:|\/\/|#|data:|blob:)/i.test(reference)) return null;
  const clean = reference.split(/[?#]/)[0];
  return clean.startsWith('/') ? normalizePath(clean.slice(1)) : normalizePath(`${dirname(baseFile)}/${clean}`);
}
function relativePath(fromFile, toFile) {
  const from = dirname(fromFile).split('/').filter(Boolean), to = normalizePath(toFile).split('/');
  while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
  return [...from.map(() => '..'), ...to].join('/') || './';
}

function detectMime(path) {
  const ext = normalizePath(path).split('.').pop().toLowerCase();
  return ({ html:'text/html',htm:'text/html',css:'text/css',md:'text/markdown',markdown:'text/markdown',js:'text/javascript',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg' })[ext] || 'application/octet-stream';
}

function decodeText(asset) { return new TextDecoder().decode(asset.data); }
function isImage(path, type = '') { return type.startsWith('image/') || /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i.test(path); }

function cloneProject() { syncActivePageRecord(); return JSON.parse(JSON.stringify(project)); }
function projectSignature(value = project) { return JSON.stringify(value); }

function persist() {
  syncActivePageRecord();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, history, historyIndex, dirty, updatedAt: new Date().toISOString() })); }
  catch (_) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ project })); } catch (_) {} }
  if (document.documentElement.classList.contains('desktop-app')) {
    document.getElementById('savedDot').classList.toggle('pending', dirty);
    document.getElementById('saveLabel').textContent = dirty ? '未保存・復元データあり' : '端末に保存済み';
    return;
  }
  document.getElementById('savedDot').classList.remove('pending');
  document.getElementById('saveLabel').textContent = '端末に保存済み';
}

function markPending() {
  dirty = true;
  document.getElementById('savedDot').classList.add('pending');
  document.getElementById('saveLabel').textContent = document.documentElement.classList.contains('desktop-app') ? '未保存' : '保存中…';
}

function commit(options = {}) {
  clearTimeout(commitTimer);
  if (options.sync !== false) syncFromFrame();
  syncActivePageRecord();
  if (options.markDirty !== false) dirty = true;
  const signature = projectSignature();
  if (!history.length || projectSignature(history[historyIndex]) !== signature) {
    history = history.slice(0, historyIndex + 1);
    history.push(cloneProject());
    if (history.length > 30) history.shift();
    historyIndex = history.length - 1;
  }
  persist();
  saveRecoverySnapshot();
  updateHistoryButtons();
  if (options.renderLayers !== false) renderLayers();
  renderOutline();
}

function scheduleCommit() {
  markPending();
  clearTimeout(commitTimer);
  commitTimer = setTimeout(() => commit(), Number(settings.autosaveDelay) || 350);
}

function updateHistoryButtons() {
  document.getElementById('undoBtn').disabled = historyIndex <= 0;
  document.getElementById('redoBtn').disabled = historyIndex >= history.length - 1;
}

function rewriteCssUrls(css, baseFile = project.cssPath || project.htmlPath) {
  return css.replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi, (match, quote, ref) => {
    const path = resolveAssetPath(baseFile, ref.trim()); const url = path && assetUrl(path);
    return url ? `url("${url}")` : match;
  });
}

function cssPropertyName(property) { return property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`); }

function responsiveCss(styleKey = project.styleKey) {
  const rules = project.responsiveRules?.[styleKey] || {};
  const renderScope = scope => Object.entries(rules[scope] || {}).map(([selector, declarations]) => {
    const body = Object.entries(declarations).map(([property, value]) => `${cssPropertyName(property)}: ${value} !important;`).join(' ');
    return body ? `${selector} { ${body} }` : '';
  }).filter(Boolean).join('\n');
  const desktop = renderScope('desktop'), mobile = renderScope('mobile');
  return [desktop && `@media (min-width: 601px) {\n${desktop}\n}`, mobile && `@media (max-width: 600px) {\n${mobile}\n}`].filter(Boolean).join('\n\n');
}

function ensureEditableClass(element = selected) {
  if (!element) return '';
  const existing = Array.from(element.classList).find(name => /^[A-Za-z_][\w-]*$/.test(name));
  if (existing) return existing;
  let index = 1, name = 'canvas-element';
  while (frame.contentDocument.querySelector(`.${name}`)) name = `canvas-element-${++index}`;
  element.classList.add(name); renderClassChips();
  return name;
}

function setScopedStyle(property, value) {
  if (!selected) return;
  const targets = selectedElements.size ? Array.from(selectedElements).filter(element => element.isConnected) : [selected];
  if (targets.some(isElementLocked)) { showToast('ロックを解除すると編集できます'); return; }
  if (styleScope === 'base') targets.forEach(element => { element.style[property] = value; });
  else targets.forEach(element => {
    const className = ensureEditableClass(element), selector = `.${className}`;
    project.responsiveRules ||= {}; project.responsiveRules[project.styleKey] ||= {};
    project.responsiveRules[project.styleKey][styleScope] ||= {};
    project.responsiveRules[project.styleKey][styleScope][selector] ||= {};
    if (value === '') delete project.responsiveRules[project.styleKey][styleScope][selector][property];
    else project.responsiveRules[project.styleKey][styleScope][selector][property] = value;
  });
  if (styleScope !== 'base') updateProjectStyleInFrame();
}

function removeScopedStyles(properties) {
  if (!selected) return;
  const targets = selectedElements.size ? Array.from(selectedElements).filter(element => element.isConnected) : [selected];
  if (targets.some(isElementLocked)) { showToast('ロックを解除すると編集できます'); return; }
  if (styleScope === 'base') targets.forEach(element => properties.forEach(property => { element.style[property] = ''; }));
  else {
    const selectors = targets.flatMap(element => Array.from(element.classList).map(name => `.${name}`));
    const scoped = project.responsiveRules?.[project.styleKey]?.[styleScope] || {};
    selectors.forEach(selector => properties.forEach(property => { if (scoped[selector]) delete scoped[selector][property]; }));
    updateProjectStyleInFrame();
  }
}

function updateProjectStyleInFrame() {
  const style = frame.contentDocument?.getElementById('canvas-project-css');
  if (style) style.textContent = `${previewCssBundle()}\n${responsiveCss()}`;
}

function previewHTML() {
  const parsed = new DOMParser().parseFromString(`<body>${project.html}</body>`, 'text/html');
  const attrMap = [['src','data-canvas-original-src'],['poster','data-canvas-original-poster']];
  for (const [attr, marker] of attrMap) {
    parsed.body.querySelectorAll(`[${attr}]`).forEach(element => {
      const original = element.getAttribute(attr); const path = resolveAssetPath(project.htmlPath, original); const url = path && assetUrl(path);
      if (url) { element.setAttribute(marker, original); element.setAttribute(attr, url); }
    });
  }
  parsed.body.querySelectorAll('[srcset]').forEach(element => {
    const original = element.getAttribute('srcset');
    const rewritten = original.split(',').map(item => { const [ref, descriptor] = item.trim().split(/\s+/, 2); const path = resolveAssetPath(project.htmlPath, ref); const url = path && assetUrl(path); return `${url || ref}${descriptor ? ` ${descriptor}` : ''}`; }).join(', ');
    if (rewritten !== original) { element.setAttribute('data-canvas-original-srcset', original); element.setAttribute('srcset', rewritten); }
  });
  return parsed.body.innerHTML;
}

function previewHead() {
  const parsed = new DOMParser().parseFromString(`<head>${project.head}</head>`, 'text/html');
  parsed.head.querySelectorAll('script,link[rel~="stylesheet"]').forEach(el => el.remove());
  parsed.head.querySelectorAll('[href]').forEach(element => {
    const original = element.getAttribute('href'); const path = resolveAssetPath(project.htmlPath, original); const url = path && assetUrl(path); if (url) element.setAttribute('href', url);
  });
  return parsed.head.innerHTML;
}

function previewCssBundle() {
  const chunks = [rewriteCssUrls(project.css, project.cssPath || project.htmlPath), rewriteCssUrls(project.inlineCss || '', project.htmlPath)];
  const parsed = new DOMParser().parseFromString(`<head>${project.head}</head>`, 'text/html');
  parsed.head.querySelectorAll('link[rel~="stylesheet"][href]').forEach(link => {
    const path = resolveAssetPath(project.htmlPath, link.getAttribute('href'));
    if (path && path !== project.cssPath && assets.has(path)) chunks.push(rewriteCssUrls(decodeText(assets.get(path)), path));
  });
  return chunks.join('\n\n');
}

function documentSource() {
  return `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">${previewHead()}<style id="canvas-project-css">${previewCssBundle()}\n${responsiveCss()}</style><style>[contenteditable="true"]{outline:1px dashed #6c8ce9;outline-offset:3px}[data-canvas-selected="true"]{outline:1px dashed #7392ea;outline-offset:2px}[data-canvas-hidden="true"]{display:none!important}[data-canvas-locked="true"]{cursor:default}</style></head><body>${previewHTML()}</body></html>`;
}

function renderDocument(path = selectedPath) {
  selected = null;
  selectedElements = new Set();
  lastTextRange = null;
  lastTextHost = null;
  selectedPath = path || '';
  overlay.classList.remove('visible');
  frame.onload = () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.addEventListener('click', onFrameClick, true);
    doc.addEventListener('dblclick', onFrameDoubleClick, true);
    doc.addEventListener('input', onFrameInput, true);
    doc.addEventListener('blur', onFrameBlur, true);
    doc.addEventListener('keydown', onFrameKeydown, true);
    doc.addEventListener('selectionchange', captureTextSelection);
    doc.addEventListener('load', event => { if (event.target?.tagName === 'IMG') { resizeFrameHeight(); if (selected === event.target) renderImageAssetInfo(); } }, true);
    const target = resolvePath(selectedPath) || firstSelectable();
    if (target) selectElement(target);
    resizeFrameHeight();
    renderLayers();
    renderOutline();
  };
  frame.srcdoc = documentSource();
  updateFileLabels();
}

function resizeFrameHeight() {
  const doc = frame.contentDocument;
  if (!doc) return;
  const height = Math.max(720, Math.min(1800, doc.documentElement.scrollHeight + 4));
  pageSurface.style.height = `${height}px`;
  pageWrap.style.marginBottom = `${height * (zoom / 100 - 1)}px`;
}

function firstSelectable() {
  return frame.contentDocument?.body.querySelector('h1,h2,h3,p,a,button,img,section,div') || null;
}

function selectableFrom(target) {
  if (!(target instanceof frame.contentWindow.Element)) return null;
  const element = target.closest('body *');
  return element?.closest('[data-canvas-locked="true"]') || element;
}

function onFrameClick(event) {
  const target = selectableFrom(event.target);
  if (!target) return;
  const editing = event.target.closest?.('[contenteditable="true"]');
  if (editing) { if (!selectedElements.has(editing)) selectElement(editing); return; }
  const link = target.closest('a[href]');
  if (link) {
    const pagePath = resolveAssetPath(project.htmlPath, link.getAttribute('href'));
    if (pagePath && project.pages?.some(page => page.htmlPath === pagePath) && (document.body.classList.contains('preview-mode') || event.ctrlKey || event.metaKey)) { event.preventDefault(); switchPage(pagePath); return; }
    else if (pagePath && project.pages?.some(page => page.htmlPath === pagePath)) showToast('Ctrl+クリックでリンク先ページを開きます');
    event.preventDefault();
  }
  selectElement(target, event.shiftKey);
}

function onFrameDoubleClick(event) {
  const target = selectableFrom(event.target);
  if (!target || ['IMG','HR','SECTION','DIV','HEADER','MAIN','NAV'].includes(target.tagName)) return;
  if (isElementLocked(target)) { showToast('ロックを解除すると文字を編集できます'); return; }
  event.preventDefault();
  target.contentEditable = 'true';
  target.focus();
  const selection = frame.contentWindow.getSelection();
  const range = frame.contentDocument.createRange();
  range.selectNodeContents(target); range.collapse(false);
  selection.removeAllRanges(); selection.addRange(range);
  showToast('文字を直接編集できます');
}

function onFrameInput(event) {
  selected = selectableFrom(event.target) || selected;
  selectedPath = pathOf(selected);
  updateOverlay();
  resizeFrameHeight();
  renderOutline();
  scheduleCommit();
}

function onFrameBlur(event) {
  if (event.target?.isContentEditable) {
    event.target.removeAttribute('contenteditable');
    commit();
  }
}

function onFrameKeydown(event) {
  if (event.key === 'Escape' && document.body.classList.contains('preview-mode')) {
    event.preventDefault();
    document.body.classList.remove('preview-mode');
    updateOverlay();
    return;
  }
  if (event.key === 'Escape' && event.target?.isContentEditable) {
    event.target.blur();
    frame.focus();
    return;
  }
  handleEditorShortcut(event, Boolean(event.target?.isContentEditable), Boolean(event.target?.isContentEditable));
}

function pathOf(element) {
  const body = frame.contentDocument?.body;
  if (!body || !element || element === body) return '';
  const parts = [];
  let node = element;
  while (node && node !== body) {
    parts.unshift(Array.from(node.parentElement.children).indexOf(node));
    node = node.parentElement;
  }
  return parts.join('.');
}

function resolvePath(path) {
  const body = frame.contentDocument?.body;
  if (!body || path === '') return null;
  return path.split('.').reduce((node, part) => node?.children[Number(part)], body) || null;
}

function syncFromFrame() {
  const body = frame.contentDocument?.body;
  if (!body) return;
  if (selected?.isConnected) selectedPath = pathOf(selected);
  const clone = body.cloneNode(true);
  clone.querySelectorAll('[contenteditable],[data-canvas-selected]').forEach(el => { el.removeAttribute('contenteditable'); el.removeAttribute('data-canvas-selected'); });
  [['src','data-canvas-original-src'],['poster','data-canvas-original-poster'],['srcset','data-canvas-original-srcset']].forEach(([attr, marker]) => {
    clone.querySelectorAll(`[${marker}]`).forEach(el => { el.setAttribute(attr, el.getAttribute(marker)); el.removeAttribute(marker); });
  });
  project.html = clone.innerHTML;
  syncActivePageRecord();
}

function elementLabel(element) {
  const custom = element.dataset.label || element.getAttribute('aria-label');
  if (custom) return custom;
  const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 28) : element.tagName.toLowerCase();
}

function selectionRows() {
  return Array.from(selectedElements).filter(element => element?.isConnected && element !== frame.contentDocument?.body);
}

function groupMembers(element) {
  const groupId = element?.dataset.canvasGroup;
  if (!groupId) return element ? [element] : [];
  return Array.from(frame.contentDocument.querySelectorAll('[data-canvas-group]')).filter(item => item.dataset.canvasGroup === groupId);
}

function isElementLocked(element) {
  return Boolean(element?.closest?.('[data-canvas-locked="true"]'));
}

function clearSelectionMarkers() {
  selectedElements.forEach(item => item.removeAttribute('data-canvas-selected'));
  selectedElements.clear();
}

function selectElement(element, additive = false) {
  if (!element?.isConnected) return;
  const members = groupMembers(element);
  if (!additive) {
    clearSelectionMarkers();
  } else if (members.every(item => selectedElements.has(item))) {
    members.forEach(item => { item.removeAttribute('data-canvas-selected'); selectedElements.delete(item); });
    selected = Array.from(selectedElements).pop() || null;
    if (!selected) { overlay.classList.remove('visible'); renderClassChips(); updateSelectionActionState(); renderLayers(); return; }
    element = selected;
  }
  if (!selectedElements.has(element)) members.forEach(item => { selectedElements.add(item); item.setAttribute('data-canvas-selected', 'true'); });
  selected = element;
  selectedPath = pathOf(element);
  lastTextRange = null;
  lastTextHost = null;
  document.getElementById('textSelectionStatus').textContent = '文字をダブルクリックし、範囲を選択してください';
  const style = frame.contentWindow.getComputedStyle(element);
  const rows = selectionRows(), grouped = rows.length > 1 && rows.every(item => item.dataset.canvasGroup && item.dataset.canvasGroup === rows[0].dataset.canvasGroup);
  document.getElementById('selectedTag').textContent = element.tagName;
  document.getElementById('selectedName').textContent = rows.length > 1 ? `${grouped ? 'グループ · ' : ''}${rows.length}個の要素` : elementLabel(element);
  document.getElementById('moveHandle').textContent = `${isElementLocked(element) ? '🔒 ' : ''}${rows.length > 1 ? `${rows.length}要素` : `${element.tagName} · ${elementLabel(element)}`}`;
  setControl('fontFamily', style.fontFamily);
  setControl('fontSize', Math.round(parseFloat(style.fontSize) || 16));
  setControl('fontWeight', nearestWeight(style.fontWeight));
  setControl('lineHeight', style.lineHeight === 'normal' ? 1.2 : round((parseFloat(style.lineHeight) || 19) / (parseFloat(style.fontSize) || 16), 2));
  setControl('letterSpacing', style.letterSpacing === 'normal' ? 0 : round(parseFloat(style.letterSpacing) || 0, 1));
  setControl('marginTop', Math.round(parseFloat(style.marginTop) || 0));
  setControl('marginRight', Math.round(parseFloat(style.marginRight) || 0));
  setControl('marginBottom', Math.round(parseFloat(style.marginBottom) || 0));
  setControl('marginLeft', Math.round(parseFloat(style.marginLeft) || 0));
  setControl('paddingTop', Math.round(parseFloat(style.paddingTop) || 0));
  setControl('paddingRight', Math.round(parseFloat(style.paddingRight) || 0));
  setControl('paddingBottom', Math.round(parseFloat(style.paddingBottom) || 0));
  setControl('paddingLeft', Math.round(parseFloat(style.paddingLeft) || 0));
  setControl('displayMode', ['block','flex','grid','inline-block','none'].includes(style.display) ? style.display : 'block');
  setControl('layoutGap', Math.round(parseFloat(style.gap) || 0));
  setControl('flexDirection', style.flexDirection || 'row'); setControl('flexWrap', style.flexWrap || 'nowrap');
  setControl('justifyContent', style.justifyContent || 'flex-start'); setControl('alignItems', style.alignItems || 'stretch');
  setControl('gridColumns', ['repeat(2, minmax(0, 1fr))','repeat(3, minmax(0, 1fr))','repeat(4, minmax(0, 1fr))'].includes(style.gridTemplateColumns) ? style.gridTemplateColumns : 'none');
  setControl('backgroundColor', rgbToHex(style.backgroundColor, '#ffffff')); setControl('backgroundHex', rgbToHex(style.backgroundColor, '#ffffff').toUpperCase());
  setControl('borderWidth', Math.round(parseFloat(style.borderTopWidth) || 0)); setControl('borderRadius', Math.round(parseFloat(style.borderTopLeftRadius) || 0));
  setControl('borderColor', rgbToHex(style.borderTopColor, '#d5d9e1')); setControl('borderHex', rgbToHex(style.borderTopColor, '#d5d9e1').toUpperCase());
  const rect = element.getBoundingClientRect();
  setControl('elementWidth', Math.round(rect.width)); setControl('elementHeight', Math.round(rect.height));
  setControl('positionX', Number(element.dataset.canvasX || 0)); setControl('positionY', Number(element.dataset.canvasY || 0));
  const color = rgbToHex(style.color); setControl('textColor', color); setControl('colorHex', color.toUpperCase());
  document.querySelectorAll('[data-align]').forEach(btn => btn.classList.toggle('active', btn.dataset.align === style.textAlign));
  renderElementFields(); renderClassChips(); updateSelectionActionState(); updateOverlay(); renderLayers();
}

function refreshSelectionControls() {
  const rows = Array.from(selectedElements).filter(element => element?.isConnected);
  const active = selected?.isConnected ? selected : rows.at(-1);
  if (!active) return;
  selectElement(active);
  if (rows.length < 2) return;
  selectedElements = new Set(rows);
  rows.forEach(element => element.setAttribute('data-canvas-selected', 'true'));
  selected = active;
  document.getElementById('selectedName').textContent = `${rows.length}個の要素`;
  renderClassChips(); updateSelectionActionState(); renderLayers(); updateOverlay();
}

function setControl(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === 'SELECT' && !Array.from(el.options).some(o => o.value === String(value))) return;
  el.value = value;
}

function nearestWeight(value) {
  const number = parseInt(value, 10) || 400;
  return String([300,400,500,600,700,800].reduce((a,b) => Math.abs(b-number) < Math.abs(a-number) ? b : a));
}
function round(value, digits) { const p = 10 ** digits; return Math.round(value * p) / p; }
function rgbToHex(value, fallback = '#151823') {
  const values = value.match(/[\d.]+/g);
  if (!values || (values.length > 3 && Number(values[3]) === 0)) return fallback;
  return '#' + values.slice(0,3).map(x => Math.max(0,Math.min(255,Math.round(Number(x)))).toString(16).padStart(2,'0')).join('');
}

function applyElementTransform(element) {
  if (!element) return;
  const x = Number(element.dataset.canvasX || 0), y = Number(element.dataset.canvasY || 0), rotation = Number(element.dataset.canvasRotate || 0);
  const scaleX = element.dataset.canvasFlipX === 'true' ? -1 : 1, scaleY = element.dataset.canvasFlipY === 'true' ? -1 : 1, transforms = [];
  if (x || y) transforms.push(`translate(${Math.round(x)}px, ${Math.round(y)}px)`);
  if (rotation) transforms.push(`rotate(${rotation}deg)`);
  if (scaleX !== 1 || scaleY !== 1) transforms.push(`scale(${scaleX}, ${scaleY})`);
  element.style.transform = transforms.join(' ');
}

function selectionBounds(rows = selectionRows()) {
  const rects = rows.filter(element => element.dataset.canvasHidden !== 'true').map(element => element.getBoundingClientRect()).filter(rect => rect.width || rect.height);
  if (!rects.length) return null;
  const left = Math.min(...rects.map(rect => rect.left)), top = Math.min(...rects.map(rect => rect.top));
  const right = Math.max(...rects.map(rect => rect.right)), bottom = Math.max(...rects.map(rect => rect.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

function updateOverlay() {
  const rows = selectionRows(), rect = selectionBounds(rows);
  if (!selected?.isConnected || !rect || document.body.classList.contains('preview-mode')) { overlay.classList.remove('visible'); return; }
  overlay.style.left = `${rect.left}px`; overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${Math.max(1, rect.width)}px`; overlay.style.height = `${Math.max(1, rect.height)}px`;
  overlay.classList.toggle('multi', rows.length > 1);
  overlay.classList.toggle('locked', rows.some(isElementLocked));
  document.getElementById('selectionMetrics').textContent = `X ${Math.round(rect.left)}  Y ${Math.round(rect.top)}  W ${Math.round(rect.width)}  H ${Math.round(rect.height)}`;
  overlay.classList.add('visible');
}

function updateFileLabels() {
  document.getElementById('fileName').textContent = project.filename;
  document.getElementById('crumbName').textContent = project.filename;
  renderPageTabs();
}

function renderPageTabs() {
  const tabs = document.getElementById('pageTabs'); if (!tabs) return; tabs.innerHTML = '';
  for (const page of project.pages || []) {
    const button = document.createElement('button'); button.className = `page-tab${page.htmlPath === project.htmlPath ? ' active' : ''}`;
    button.type = 'button'; button.role = 'tab'; button.title = `${page.htmlPath}${page.htmlPath === project.homePagePath ? '・ホームページ' : ''}`; button.textContent = `${page.htmlPath === project.homePagePath ? '⌂ ' : ''}${page.filename}`; button.setAttribute('aria-selected', String(page.htmlPath === project.htmlPath));
    button.addEventListener('click', () => switchPage(page.htmlPath)); button.addEventListener('dblclick', openPageManager); tabs.appendChild(button);
  }
}

function switchPage(path) {
  if (path === project.htmlPath) return;
  syncFromFrame(); syncActivePageRecord(); persist();
  if (!hydratePage(path)) return;
  selectedPath = ''; renderDocument(''); loadCodeTab(); showToast(`${project.filename} を開きました`);
}

function renderClassChips() {
  const list = document.getElementById('classChips'); if (!list) return; list.innerHTML = '';
  const names = selected ? Array.from(selected.classList) : [];
  if (!names.length) { const empty = document.createElement('span'); empty.className = 'empty-hint'; empty.textContent = 'クラスなし'; list.appendChild(empty); return; }
  names.forEach(name => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'class-chip'; button.title = 'クリックして削除'; button.textContent = `.${name} ×`;
    button.addEventListener('click', () => { selected.classList.remove(name); renderClassChips(); commit(); showToast(`.${name} を削除しました`); }); list.appendChild(button);
  });
}

function renderElementFields() {
  const tag = selected?.tagName || '';
  setControl('elementId', selected?.id || '');
  document.getElementById('headingField').hidden = !/^H[1-6]$/.test(tag);
  document.getElementById('linkFields').hidden = tag !== 'A';
  document.getElementById('imageFields').hidden = tag !== 'IMG';
  document.getElementById('imageEditSection').hidden = tag !== 'IMG';
  if (/^H[1-6]$/.test(tag)) setControl('headingLevel', tag);
  if (tag === 'A') { setControl('linkHref', selected.getAttribute('href') || ''); document.getElementById('linkBlank').checked = selected.getAttribute('target') === '_blank'; }
  if (tag === 'IMG') { setControl('imageSrc', selected.dataset.canvasOriginalSrc || selected.getAttribute('src') || ''); setControl('imageAlt', selected.getAttribute('alt') || ''); renderImageControls(); }
}

function imagePositionValues(value) {
  const words = { left: 0, top: 0, center: 50, right: 100, bottom: 100 }, parts = String(value || '50% 50%').trim().split(/\s+/);
  const parse = (part, fallback) => part in words ? words[part] : /%$/.test(part || '') ? Number.parseFloat(part) : fallback;
  if (parts.length === 1) {
    if (parts[0] === 'top' || parts[0] === 'bottom') return [50, parse(parts[0], 50)];
    return [Math.max(0, Math.min(100, parse(parts[0], 50))), 50];
  }
  return [Math.max(0, Math.min(100, parse(parts[0], 50))), Math.max(0, Math.min(100, parse(parts[1], 50)))];
}

function filterPercentage(filter, name, fallback = 100) {
  const match = String(filter || '').match(new RegExp(`${name}\\(([-\\d.]+)(%?)\\)`, 'i'));
  if (!match) return fallback;
  return Math.max(0, Math.min(200, Math.round(Number(match[1]) * (match[2] ? 1 : 100))));
}

function renderImageAssetInfo() {
  const info = document.getElementById('imageAssetInfo'); if (!info || selected?.tagName !== 'IMG') return;
  const reference = selected.dataset.canvasOriginalSrc || selected.getAttribute('src') || '', path = resolveAssetPath(project.htmlPath, reference), asset = path && assets.get(path);
  const width = selected.naturalWidth || 0, height = selected.naturalHeight || 0, largeFile = Boolean(asset && asset.data.byteLength > 3 * 1024 * 1024), largeDimensions = width > 4096 || height > 4096;
  info.classList.toggle('warning', largeFile || largeDimensions);
  if (!asset) { info.textContent = `${reference || '画像パス未設定'}${width && height ? ` · ${width}×${height}px` : ''} · 外部または未登録の画像`; return; }
  const warning = largeFile || largeDimensions ? ' · 大きな画像です。表示速度に注意してください' : '';
  info.textContent = `${path} · ${width && height ? `${width}×${height}px · ` : ''}${formatSize(asset.data.byteLength)}${warning}`;
}

function renderImageControls() {
  if (selected?.tagName !== 'IMG') return;
  const style = frame.contentWindow.getComputedStyle(selected), position = imagePositionValues(selected.style.objectPosition || style.objectPosition);
  const opacity = Math.round((Number.parseFloat(style.opacity) || 0) * 100), brightness = Number(selected.dataset.canvasBrightness || filterPercentage(style.filter, 'brightness')), contrast = Number(selected.dataset.canvasContrast || filterPercentage(style.filter, 'contrast'));
  setControl('imageFit', selected.style.objectFit || 'auto'); setControl('imagePositionX', position[0]); setControl('imagePositionY', position[1]); setControl('imageRotate', Number(selected.dataset.canvasRotate || 0));
  setControl('imageOpacity', opacity); setControl('imageBrightness', brightness); setControl('imageContrast', contrast);
  document.getElementById('imagePositionXValue').textContent = `${Math.round(position[0])}%`; document.getElementById('imagePositionYValue').textContent = `${Math.round(position[1])}%`;
  document.getElementById('imageOpacityValue').textContent = `${opacity}%`; document.getElementById('imageBrightnessValue').textContent = `${brightness}%`; document.getElementById('imageContrastValue').textContent = `${contrast}%`;
  document.getElementById('imageFlipX').classList.toggle('active', selected.dataset.canvasFlipX === 'true'); document.getElementById('imageFlipY').classList.toggle('active', selected.dataset.canvasFlipY === 'true');
  renderImageAssetInfo();
}

function updateImageFilter(image) {
  const brightness = Number(image.dataset.canvasBrightness || 100), contrast = Number(image.dataset.canvasContrast || 100);
  image.style.filter = brightness === 100 && contrast === 100 ? '' : `brightness(${brightness}%) contrast(${contrast}%)`;
}

function selectedImage() {
  if (selected?.tagName !== 'IMG') return null;
  if (isElementLocked(selected)) { showToast('ロックを解除すると画像を編集できます'); return null; }
  return selected;
}

function rememberCropBaseline(image) {
  if (image.dataset.canvasCropBaseline === 'true') return;
  image.dataset.canvasCropBaseline = 'true'; image.dataset.canvasCropWidth = image.style.width; image.dataset.canvasCropHeight = image.style.height;
  image.dataset.canvasCropRatio = image.style.aspectRatio; image.dataset.canvasCropFit = image.style.objectFit;
}

function restoreCropBaseline(image) {
  if (image.dataset.canvasCropBaseline !== 'true') return false;
  image.style.width = image.dataset.canvasCropWidth || ''; image.style.height = image.dataset.canvasCropHeight || ''; image.style.aspectRatio = image.dataset.canvasCropRatio || ''; image.style.objectFit = image.dataset.canvasCropFit || '';
  ['canvasCropBaseline','canvasCropWidth','canvasCropHeight','canvasCropRatio','canvasCropFit'].forEach(key => delete image.dataset[key]); return true;
}

function addElement(type, text) {
  const doc = frame.contentDocument;
  if (!doc) return null;
  const tags = { heading: 'h2', text: 'p', button: 'a', divider: 'hr' };
  const labels = { heading: '新しい見出し', text: '新しいテキスト', button: '新しいボタン', divider: '区切り線' };
  const defaults = { heading: '新しい見出し', text: 'ここにテキストを入力します。', button: '詳しく見る →', divider: '' };
  const element = doc.createElement(tags[type]);
  element.dataset.label = labels[type];
  if (type === 'button') { element.href = '#'; element.style.cssText = 'display:inline-block;padding:12px 18px;background:#151823;color:#fff;text-decoration:none;font-weight:700;'; }
  if (type === 'heading') element.style.cssText = 'font:600 40px/1.1 Georgia,serif;margin:24px 0 16px;';
  if (type === 'text') element.style.cssText = 'font-size:16px;line-height:1.7;margin:16px 0;';
  if (type === 'divider') element.style.cssText = 'border:0;border-top:1px solid #cfd1d4;margin:28px 0;';
  element.textContent = text || defaults[type];
  const parent = selected?.parentElement && selected !== doc.body ? selected.parentElement : doc.body;
  if (selected?.parentElement === parent) selected.after(element); else parent.appendChild(element);
  selectElement(element); syncFromFrame(); commit(); resizeFrameHeight();
  return element;
}

document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => {
  const element = addElement(button.dataset.add);
  if (element && element.tagName !== 'HR') { element.contentEditable = 'true'; element.focus(); }
  showToast(`${elementLabel(element)}を追加しました`);
}));

document.querySelectorAll('[data-align]').forEach(button => button.addEventListener('click', () => {
  if (!selected) return; setScopedStyle('textAlign', button.dataset.align);
  document.querySelectorAll('[data-align]').forEach(x => x.classList.toggle('active', x === button));
  updateOverlay(); commit();
}));

const styleControls = {
  fontFamily: ['fontFamily',''], fontSize: ['fontSize','px'], fontWeight: ['fontWeight',''], lineHeight: ['lineHeight',''],
  letterSpacing: ['letterSpacing','px'], marginTop: ['marginTop','px'], marginRight: ['marginRight','px'], marginBottom: ['marginBottom','px'], marginLeft: ['marginLeft','px'],
  paddingTop: ['paddingTop','px'], paddingRight: ['paddingRight','px'], paddingBottom: ['paddingBottom','px'], paddingLeft: ['paddingLeft','px'],
  elementWidth: ['width','px'], elementHeight: ['height','px'], layoutGap: ['gap','px'], borderWidth: ['borderWidth','px'], borderRadius: ['borderRadius','px']
};
Object.entries(styleControls).forEach(([id,[prop,unit]]) => {
  const control = document.getElementById(id);
  control.addEventListener('input', event => { if (!selected || event.target.value === '') return; setScopedStyle(prop, event.target.value + unit); if (id === 'borderWidth' && Number(event.target.value) > 0) setScopedStyle('borderStyle', 'solid'); updateOverlay(); resizeFrameHeight(); scheduleCommit(); });
  control.addEventListener('change', () => commit());
});

document.getElementById('addClassBtn').addEventListener('click', () => {
  if (!selected) return;
  const input = document.getElementById('classInput'), name = input.value.trim();
  if (!/^[A-Za-z_][\w-]*$/.test(name)) { showToast('英数字・ハイフン・アンダースコアで入力してください'); return; }
  selected.classList.add(name); input.value = ''; renderClassChips(); commit(); showToast(`.${name} を追加しました`);
});
document.getElementById('classInput').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); document.getElementById('addClassBtn').click(); } });
document.querySelectorAll('[data-style-scope]').forEach(button => button.addEventListener('click', () => {
  styleScope = button.dataset.styleScope;
  document.querySelectorAll('[data-style-scope]').forEach(item => item.classList.toggle('active', item === button));
  document.getElementById('scopeNote').textContent = styleScope === 'base' ? '要素へ直接適用します' : styleScope === 'desktop' ? '幅601px以上のCSSへ追加します' : '幅600px以下のCSSへ追加します';
  if (selected) refreshSelectionControls();
}));

document.getElementById('elementId').addEventListener('change', event => {
  if (!selected) return; const value = event.target.value.trim();
  if (value && (!/^[A-Za-z][\w:.-]*$/.test(value) || frame.contentDocument.getElementById(value) && frame.contentDocument.getElementById(value) !== selected)) { showToast('重複しない有効なIDを入力してください'); renderElementFields(); return; }
  selected.id = value; commit();
});
document.getElementById('headingLevel').addEventListener('change', event => {
  if (!selected || !/^H[1-6]$/.test(selected.tagName)) return;
  const replacement = frame.contentDocument.createElement(event.target.value.toLowerCase());
  Array.from(selected.attributes).forEach(attribute => replacement.setAttribute(attribute.name, attribute.value)); replacement.innerHTML = selected.innerHTML;
  selected.replaceWith(replacement); selectElement(replacement); commit(); showToast(`${event.target.value} に変更しました`);
});
document.getElementById('linkHref').addEventListener('input', event => {
  if (selected?.tagName !== 'A') return;
  selected.setAttribute('href', event.target.value.trim() || '#');
  scheduleCommit();
});
document.getElementById('linkHref').addEventListener('change', () => { if (selected?.tagName === 'A') commit(); });
document.getElementById('linkBlank').addEventListener('change', event => {
  if (selected?.tagName !== 'A') return;
  if (event.target.checked) { selected.setAttribute('target', '_blank'); selected.setAttribute('rel', 'noopener noreferrer'); }
  else { selected.removeAttribute('target'); selected.removeAttribute('rel'); }
  commit();
});
document.getElementById('imageSrc').addEventListener('change', event => {
  if (selected?.tagName !== 'IMG') return; const image = selected, value = event.target.value.trim(), path = resolveAssetPath(project.htmlPath, value), url = path && assetUrl(path);
  if (url) { image.dataset.canvasOriginalSrc = value; image.setAttribute('src', url); }
  else { delete image.dataset.canvasOriginalSrc; image.setAttribute('src', value); }
  image.addEventListener('load', () => { if (selected === image) renderImageAssetInfo(); }, { once: true });
  commit(); updateOverlay();
});
document.getElementById('imageAlt').addEventListener('change', event => { if (selected?.tagName === 'IMG') { selected.setAttribute('alt', event.target.value); commit(); } });
document.getElementById('openAssetsForImage').addEventListener('click', () => toggleAssets(true));

document.getElementById('imageFit').addEventListener('change', event => {
  const image = selectedImage(); if (!image) return;
  if (event.target.value === 'auto') image.style.objectFit = ''; else image.style.objectFit = event.target.value;
  commit(); updateOverlay();
});
['imagePositionX','imagePositionY'].forEach(id => {
  const control = document.getElementById(id);
  control.addEventListener('input', () => {
    const image = selectedImage(); if (!image) return;
    const x = Number(document.getElementById('imagePositionX').value), y = Number(document.getElementById('imagePositionY').value); image.style.objectPosition = `${x}% ${y}%`;
    document.getElementById('imagePositionXValue').textContent = `${x}%`; document.getElementById('imagePositionYValue').textContent = `${y}%`; scheduleCommit();
  });
  control.addEventListener('change', () => { if (selected?.tagName === 'IMG') commit(); });
});
document.getElementById('imageRotate').addEventListener('input', event => {
  const image = selectedImage(); if (!image) return;
  const rotation = Math.max(-180, Math.min(180, Number(event.target.value) || 0));
  if (rotation) image.dataset.canvasRotate = rotation; else delete image.dataset.canvasRotate;
  applyElementTransform(image); updateOverlay(); scheduleCommit();
});
document.getElementById('imageRotate').addEventListener('change', () => { if (selected?.tagName === 'IMG') commit(); });
['imageFlipX','imageFlipY'].forEach((id, index) => document.getElementById(id).addEventListener('click', () => {
  const image = selectedImage(); if (!image) return; const key = index ? 'canvasFlipY' : 'canvasFlipX';
  if (image.dataset[key] === 'true') delete image.dataset[key]; else image.dataset[key] = 'true';
  applyElementTransform(image); renderImageControls(); commit(); updateOverlay();
}));
['imageOpacity','imageBrightness','imageContrast'].forEach(id => {
  const control = document.getElementById(id), output = document.getElementById(`${id}Value`);
  control.addEventListener('input', event => {
    const image = selectedImage(); if (!image) return; const value = Number(event.target.value); output.textContent = `${value}%`;
    if (id === 'imageOpacity') image.style.opacity = value === 100 ? '' : String(value / 100);
    else { const key = id === 'imageBrightness' ? 'canvasBrightness' : 'canvasContrast'; if (value === 100) delete image.dataset[key]; else image.dataset[key] = value; updateImageFilter(image); }
    scheduleCommit();
  });
  control.addEventListener('change', () => { if (selected?.tagName === 'IMG') commit(); });
});
document.querySelectorAll('[data-image-ratio]').forEach(button => button.addEventListener('click', () => {
  const image = selectedImage(); if (!image) return; const ratio = button.dataset.imageRatio;
  if (ratio === 'original') {
    if (!restoreCropBaseline(image)) { image.style.aspectRatio = ''; image.style.objectFit = ''; image.style.height = ''; }
  } else {
    rememberCropBaseline(image); const width = Math.max(1, Math.round(image.getBoundingClientRect().width));
    image.style.width = `${width}px`; image.style.height = `${Math.max(1, Math.round(width / Number(ratio)))}px`; image.style.aspectRatio = ratio; image.style.objectFit = 'cover';
  }
  renderImageControls(); commit(); resizeFrameHeight(); updateOverlay(); showToast(ratio === 'original' ? '元画像の比率へ戻しました' : `${button.textContent}でトリミングしました`);
}));
document.getElementById('resetImageEdit').addEventListener('click', () => {
  const image = selectedImage(); if (!image) return;
  const restoredCrop = restoreCropBaseline(image); ['objectPosition','opacity','filter'].forEach(property => image.style[property] = '');
  if (!restoredCrop) ['objectFit','aspectRatio'].forEach(property => image.style[property] = '');
  ['canvasRotate','canvasFlipX','canvasFlipY','canvasBrightness','canvasContrast'].forEach(key => delete image.dataset[key]);
  applyElementTransform(image); renderImageControls(); commit(); resizeFrameHeight(); updateOverlay(); showToast('画像の表示設定をリセットしました');
});

const layoutSelects = { displayMode: 'display', flexDirection: 'flexDirection', flexWrap: 'flexWrap', justifyContent: 'justifyContent', alignItems: 'alignItems', gridColumns: 'gridTemplateColumns' };
Object.entries(layoutSelects).forEach(([id, property]) => document.getElementById(id).addEventListener('change', event => {
  if (!selected) return; const value = id === 'gridColumns' && event.target.value === 'none' ? '' : event.target.value; setScopedStyle(property, value); commit(); resizeFrameHeight(); updateOverlay();
}));
document.getElementById('resetLayout').addEventListener('click', () => {
  removeScopedStyles(['display','gap','flexDirection','flexWrap','justifyContent','alignItems','gridTemplateColumns','backgroundColor','borderWidth','borderStyle','borderColor','borderRadius']); refreshSelectionControls(); commit(); showToast('レイアウト設定をリセットしました');
});

['positionX','positionY'].forEach(id => document.getElementById(id).addEventListener('input', () => {
  if (!selected || isElementLocked(selected)) return;
  const x = Number(document.getElementById('positionX').value || 0), y = Number(document.getElementById('positionY').value || 0);
  selected.dataset.canvasX = x; selected.dataset.canvasY = y; applyElementTransform(selected);
  updateOverlay(); scheduleCommit();
}));

document.getElementById('textColor').addEventListener('input', event => {
  if (!selected) return; setScopedStyle('color', event.target.value);
  document.getElementById('colorHex').value = event.target.value.toUpperCase(); updateOverlay(); scheduleCommit();
});
document.getElementById('colorHex').addEventListener('input', event => {
  if (!selected || !/^#[0-9a-f]{6}$/i.test(event.target.value)) return;
  setScopedStyle('color', event.target.value); document.getElementById('textColor').value = event.target.value; updateOverlay(); scheduleCommit();
});
document.getElementById('colorHex').addEventListener('change', event => {
  if (!selected || !/^#[0-9a-f]{6}$/i.test(event.target.value)) { if (selected) refreshSelectionControls(); return; }
  commit();
});
function bindColorControls(pickerId, textId, property) {
  document.getElementById(pickerId).addEventListener('input', event => { if (!selected) return; setScopedStyle(property, event.target.value); document.getElementById(textId).value = event.target.value.toUpperCase(); updateOverlay(); scheduleCommit(); });
  document.getElementById(textId).addEventListener('input', event => {
    if (!selected || !/^#[0-9a-f]{6}$/i.test(event.target.value)) return;
    setScopedStyle(property, event.target.value); document.getElementById(pickerId).value = event.target.value; updateOverlay(); scheduleCommit();
  });
  document.getElementById(textId).addEventListener('change', event => {
    if (!selected || !/^#[0-9a-f]{6}$/i.test(event.target.value)) { if (selected) refreshSelectionControls(); return; }
    commit();
  });
}
bindColorControls('backgroundColor', 'backgroundHex', 'backgroundColor');
bindColorControls('borderColor', 'borderHex', 'borderColor');

function setElementOffset(element, x, y) {
  element.dataset.canvasX = Math.round(x); element.dataset.canvasY = Math.round(y);
  applyElementTransform(element);
}

function moveElementBy(element, dx, dy) {
  setElementOffset(element, Number(element.dataset.canvasX || 0) + dx, Number(element.dataset.canvasY || 0) + dy);
}

function editableSelection(minimum = 1) {
  const rows = topLevelSelection();
  if (rows.length < minimum) { showToast(minimum > 2 ? '3個以上の要素を選択してください' : minimum > 1 ? '2個以上の要素を選択してください' : '要素を選択してください'); return null; }
  if (rows.some(isElementLocked)) { showToast('ロック中の要素が含まれています'); return null; }
  return rows;
}

function finishObjectTransform(message) {
  refreshSelectionControls(); commit(); resizeFrameHeight(); showToast(message);
}

function alignSelectedElements(mode) {
  const rows = editableSelection(2); if (!rows) return;
  const bounds = selectionBounds(rows); if (!bounds) return;
  rows.forEach(element => {
    const rect = element.getBoundingClientRect(); let dx = 0, dy = 0;
    if (mode === 'left') dx = bounds.left - rect.left;
    if (mode === 'center') dx = bounds.centerX - (rect.left + rect.right) / 2;
    if (mode === 'right') dx = bounds.right - rect.right;
    if (mode === 'top') dy = bounds.top - rect.top;
    if (mode === 'middle') dy = bounds.centerY - (rect.top + rect.bottom) / 2;
    if (mode === 'bottom') dy = bounds.bottom - rect.bottom;
    moveElementBy(element, dx, dy);
  });
  finishObjectTransform('選択した要素を整列しました');
}

function distributeSelectedElements(axis) {
  const rows = editableSelection(3); if (!rows) return;
  const horizontal = axis === 'horizontal';
  const sorted = rows.map(element => ({ element, rect: element.getBoundingClientRect() })).sort((a, b) => horizontal ? a.rect.left - b.rect.left : a.rect.top - b.rect.top);
  const first = sorted[0].rect, last = sorted.at(-1).rect;
  const span = horizontal ? last.right - first.left : last.bottom - first.top;
  const occupied = sorted.reduce((sum, item) => sum + (horizontal ? item.rect.width : item.rect.height), 0);
  const gap = (span - occupied) / (sorted.length - 1); let cursor = horizontal ? first.left : first.top;
  sorted.forEach((item, index) => {
    if (index && index < sorted.length - 1) {
      const delta = cursor - (horizontal ? item.rect.left : item.rect.top);
      moveElementBy(item.element, horizontal ? delta : 0, horizontal ? 0 : delta);
    }
    cursor += (horizontal ? item.rect.width : item.rect.height) + gap;
  });
  finishObjectTransform(horizontal ? '横方向へ等間隔に配置しました' : '縦方向へ等間隔に配置しました');
}

function reorderSelection(mode) {
  const rows = editableSelection(); if (!rows) return;
  const byParent = new Map(); rows.forEach(element => { const items = byParent.get(element.parentElement) || []; items.push(element); byParent.set(element.parentElement, items); });
  byParent.forEach((items, parent) => {
    if (mode === 'front') items.forEach(element => parent.appendChild(element));
    else if (mode === 'back') [...items].reverse().forEach(element => parent.prepend(element));
    else if (mode === 'forward') [...items].reverse().forEach(element => { const next = element.nextElementSibling; if (next && !items.includes(next)) next.after(element); });
    else [...items].forEach(element => { const previous = element.previousElementSibling; if (previous && !items.includes(previous)) previous.before(element); });
  });
  finishObjectTransform('要素の重なり順を変更しました');
}

function toggleSelectionLock() {
  const rows = selectionRows(); if (!rows.length) return;
  const unlock = rows.every(element => element.dataset.canvasLocked === 'true');
  rows.forEach(element => { if (unlock) delete element.dataset.canvasLocked; else element.dataset.canvasLocked = 'true'; });
  updateSelectionActionState(); updateOverlay(); renderLayers(); commit(); showToast(unlock ? 'ロックを解除しました' : '要素をロックしました');
}

function toggleSelectionVisibility() {
  const rows = selectionRows(); if (!rows.length) return;
  const show = rows.every(element => element.dataset.canvasHidden === 'true');
  rows.forEach(element => { if (show) delete element.dataset.canvasHidden; else element.dataset.canvasHidden = 'true'; });
  updateSelectionActionState(); updateOverlay(); renderLayers(); commit(); resizeFrameHeight(); showToast(show ? '要素を表示しました' : '編集画面で非表示にしました');
}

function groupSelection() {
  const rows = editableSelection(2); if (!rows) return;
  const id = `group-${Date.now().toString(36)}-${(++groupSequence).toString(36)}`;
  rows.forEach(element => { element.dataset.canvasGroup = id; });
  refreshSelectionControls(); commit(); showToast(`${rows.length}個の要素をグループ化しました`);
}

function ungroupSelection() {
  const rows = selectionRows().filter(element => element.dataset.canvasGroup);
  if (!rows.length) { showToast('グループ化された要素を選択してください'); return; }
  rows.forEach(element => { delete element.dataset.canvasGroup; });
  refreshSelectionControls(); commit(); showToast('グループを解除しました');
}

function updateSelectionActionState() {
  const rows = selectionRows(), blocked = rows.some(isElementLocked), directLocked = rows.length && rows.every(element => element.dataset.canvasLocked === 'true');
  const hidden = rows.length && rows.every(element => element.dataset.canvasHidden === 'true');
  document.querySelectorAll('.properties .property-section:not(.object-state-section) input, .properties .property-section:not(.object-state-section) select, .properties .property-section:not(.object-state-section) button').forEach(control => { control.disabled = blocked; });
  document.querySelectorAll('[data-object-align]').forEach(button => { button.disabled = rows.length < 2 || blocked; });
  document.querySelectorAll('[data-distribute]').forEach(button => { button.disabled = rows.length < 3 || blocked; });
  document.querySelectorAll('[data-order]').forEach(button => { button.disabled = !rows.length || blocked; });
  const lock = document.getElementById('lockSelectionBtn'), hide = document.getElementById('hideSelectionBtn');
  lock.disabled = !rows.length; lock.classList.toggle('active', directLocked); lock.textContent = directLocked ? 'ロック解除' : 'ロック';
  hide.disabled = !rows.length; hide.classList.toggle('active', hidden); hide.textContent = hidden ? '表示する' : '非表示';
  document.getElementById('groupSelectionBtn').disabled = rows.length < 2 || blocked;
  document.getElementById('ungroupSelectionBtn').disabled = !rows.some(element => element.dataset.canvasGroup);
  document.getElementById('deleteBtn').disabled = !rows.length || blocked;
}

document.querySelectorAll('[data-object-align]').forEach(button => button.addEventListener('click', () => alignSelectedElements(button.dataset.objectAlign)));
document.querySelectorAll('[data-distribute]').forEach(button => button.addEventListener('click', () => distributeSelectedElements(button.dataset.distribute)));
document.querySelectorAll('[data-order]').forEach(button => button.addEventListener('click', () => reorderSelection(button.dataset.order)));
document.getElementById('lockSelectionBtn').addEventListener('click', toggleSelectionLock);
document.getElementById('hideSelectionBtn').addEventListener('click', toggleSelectionVisibility);
document.getElementById('groupSelectionBtn').addEventListener('click', groupSelection);
document.getElementById('ungroupSelectionBtn').addEventListener('click', ungroupSelection);

function captureTextSelection() {
  const selection = frame.contentWindow?.getSelection();
  const status = document.getElementById('textSelectionStatus');
  if (!selection?.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0), node = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  const start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const end = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
  const host = start?.closest?.('[contenteditable="true"]');
  if (!node || !host || !host.contains(end) || !frame.contentDocument.body.contains(node) || isElementLocked(node)) return;
  lastTextRange = range.cloneRange();
  lastTextHost = host;
  status.textContent = `${selection.toString().length}文字を選択中`;
}

function selectedTextRange() {
  if (!lastTextRange || !lastTextHost?.isConnected || !lastTextRange.startContainer?.isConnected || lastTextRange.collapsed) {
    showToast('先に編集画面で文字範囲を選択してください'); return null;
  }
  return lastTextRange.cloneRange();
}

function wrapSelectedText(tagName, configure) {
  const range = selectedTextRange(); if (!range) return false;
  const wrapper = frame.contentDocument.createElement(tagName); if (configure) configure(wrapper);
  try { range.surroundContents(wrapper); }
  catch (_) { wrapper.appendChild(range.extractContents()); range.insertNode(wrapper); }
  const selection = frame.contentWindow.getSelection(), nextRange = frame.contentDocument.createRange();
  nextRange.selectNodeContents(wrapper); selection.removeAllRanges(); selection.addRange(nextRange); lastTextRange = nextRange.cloneRange();
  selected = lastTextHost || selectableFrom(wrapper) || selected; selectedPath = pathOf(selected); commit(); resizeFrameHeight(); updateOverlay();
  document.getElementById('textSelectionStatus').textContent = `${selection.toString().length}文字を選択中`;
  return true;
}

function applySelectionLink() {
  const input = document.getElementById('selectionLinkInput'), href = input.value.trim();
  if (!href || /^javascript:/i.test(href)) { showToast('安全なリンク先を入力してください'); return false; }
  const applied = wrapSelectedText('a', element => { element.setAttribute('href', href); });
  if (applied) showToast('選択した文字へリンクを設定しました'); return applied;
}

document.getElementById('selectionBoldBtn').addEventListener('click', () => { if (wrapSelectedText('strong')) showToast('選択した文字を太字にしました'); });
document.getElementById('selectionItalicBtn').addEventListener('click', () => { if (wrapSelectedText('em')) showToast('選択した文字を斜体にしました'); });
document.getElementById('selectionUnderlineBtn').addEventListener('click', () => { if (wrapSelectedText('span', element => { element.style.textDecoration = 'underline'; })) showToast('選択した文字へ下線を付けました'); });
document.getElementById('selectionColor').addEventListener('change', event => { if (wrapSelectedText('span', element => { element.style.color = event.target.value; })) showToast('選択した文字の色を変更しました'); });
document.getElementById('selectionLinkBtn').addEventListener('click', applySelectionLink);
document.getElementById('selectionLinkInput').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); applySelectionLink(); } });

function topLevelSelection() {
  const rows = Array.from(selectedElements).filter(element => element?.isConnected && element !== frame.contentDocument.body);
  return rows.filter(element => !rows.some(other => other !== element && other.contains(element)));
}

function cleanElementClone(element) {
  const clone = element.cloneNode(true); ['data-canvas-selected','data-canvas-group','data-canvas-locked','data-canvas-hidden','contenteditable','id'].forEach(attribute => clone.removeAttribute(attribute));
  clone.querySelectorAll('[data-canvas-selected],[data-canvas-group],[data-canvas-locked],[data-canvas-hidden],[contenteditable],[id]').forEach(item => { ['data-canvas-selected','data-canvas-group','data-canvas-locked','data-canvas-hidden','contenteditable','id'].forEach(attribute => item.removeAttribute(attribute)); }); return clone;
}

function selectMany(elements) {
  elements.forEach((element, index) => selectElement(element, index > 0));
}

function copySelection() {
  const rows = topLevelSelection(); if (!rows.length) return false;
  elementClipboard = rows.map(element => cleanElementClone(element).outerHTML).join('\n'); showToast(`${rows.length}個の要素をコピーしました`); return true;
}

function pasteSelection() {
  if (!elementClipboard || !selected?.isConnected) { showToast('コピーした要素がありません'); return false; }
  if (isElementLocked(selected)) { showToast('ロックを解除すると貼り付けできます'); return false; }
  const template = frame.contentDocument.createElement('template'); template.innerHTML = elementClipboard;
  const nodes = Array.from(template.content.children); if (!nodes.length) return false;
  selected.after(...nodes); selectMany(nodes); commit(); resizeFrameHeight(); showToast(`${nodes.length}個の要素を貼り付けました`); return true;
}

document.getElementById('copyBtn').addEventListener('click', copySelection);
document.getElementById('pasteBtn').addEventListener('click', pasteSelection);
document.getElementById('duplicateBtn').addEventListener('click', () => {
  const rows = editableSelection(); if (!rows) return;
  const clones = rows.map(element => { const clone = cleanElementClone(element); element.after(clone); return clone; });
  selectMany(clones); commit(); resizeFrameHeight(); showToast(`${clones.length}個の要素を複製しました`);
});
document.getElementById('deleteBtn').addEventListener('click', () => {
  const rows = editableSelection(); if (!rows) return;
  const anchor = rows[0], next = anchor.nextElementSibling || anchor.previousElementSibling || anchor.parentElement;
  rows.forEach(element => element.remove()); selectedElements.clear(); selected = null;
  if (next && next !== frame.contentDocument.body && next.isConnected) selectElement(next); else overlay.classList.remove('visible');
  commit(); resizeFrameHeight(); showToast(`${rows.length}個の要素を削除しました`);
});
document.getElementById('resetType').addEventListener('click', () => {
  if (!selected) return; removeScopedStyles(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing']); refreshSelectionControls(); commit(); showToast('文字設定をリセットしました');
});
document.getElementById('resetPosition').addEventListener('click', () => {
  const rows = editableSelection(); if (!rows) return; rows.forEach(element => { if (element.tagName === 'IMG') restoreCropBaseline(element); ['width','height'].forEach(prop => element.style[prop] = ''); delete element.dataset.canvasX; delete element.dataset.canvasY; applyElementTransform(element); }); refreshSelectionControls(); commit(); resizeFrameHeight(); showToast('位置とサイズを自動に戻しました');
});

function hideSnapGuides() {
  snapGuideX.classList.remove('active'); snapGuideY.classList.remove('active');
}

function snapMovement(bounds, dx, dy, excluded) {
  const doc = frame.contentDocument, threshold = 6;
  const xCandidates = [0, doc.documentElement.clientWidth / 2, doc.documentElement.clientWidth];
  const yCandidates = [0, doc.documentElement.clientHeight / 2, doc.documentElement.scrollHeight];
  doc.body.querySelectorAll('*').forEach(element => {
    if (excluded.some(item => item === element || item.contains(element) || element.contains(item)) || element.dataset.canvasHidden === 'true') return;
    const rect = element.getBoundingClientRect(); if (!rect.width && !rect.height) return;
    xCandidates.push(rect.left, (rect.left + rect.right) / 2, rect.right); yCandidates.push(rect.top, (rect.top + rect.bottom) / 2, rect.bottom);
  });
  const xPoints = [bounds.left + dx, bounds.centerX + dx, bounds.right + dx], yPoints = [bounds.top + dy, bounds.centerY + dy, bounds.bottom + dy];
  let bestX = null, bestY = null;
  xCandidates.forEach(candidate => xPoints.forEach(point => { const delta = candidate - point; if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) bestX = { delta, guide: candidate }; }));
  yCandidates.forEach(candidate => yPoints.forEach(point => { const delta = candidate - point; if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) bestY = { delta, guide: candidate }; }));
  if (bestX) { snapGuideX.style.left = `${bestX.guide}px`; snapGuideX.classList.add('active'); } else snapGuideX.classList.remove('active');
  if (bestY) { snapGuideY.style.top = `${bestY.guide}px`; snapGuideY.classList.add('active'); } else snapGuideY.classList.remove('active');
  return { dx: dx + (bestX?.delta || 0), dy: dy + (bestY?.delta || 0) };
}

function startPointerTransform(event, mode) {
  const rows = editableSelection(); if (!rows) return;
  if (mode !== 'move' && rows.length > 1) { showToast('複数選択では移動のみ使えます'); return; }
  event.preventDefault();
  const startX = event.clientX, startY = event.clientY, rect = selected.getBoundingClientRect();
  const startMoveX = Number(selected.dataset.canvasX || 0), startMoveY = Number(selected.dataset.canvasY || 0);
  const startBounds = selectionBounds(rows), offsets = rows.map(element => ({ element, x: Number(element.dataset.canvasX || 0), y: Number(element.dataset.canvasY || 0) }));
  const scale = zoom / 100;
  const onMove = moveEvent => {
    const rawX = (moveEvent.clientX - startX) / scale, rawY = (moveEvent.clientY - startY) / scale;
    if (mode === 'move') {
      const movement = moveEvent.altKey ? { dx: rawX, dy: rawY } : snapMovement(startBounds, rawX, rawY, rows);
      offsets.forEach(item => setElementOffset(item.element, item.x + movement.dx, item.y + movement.dy));
      setControl('positionX', Math.round(startMoveX + movement.dx)); setControl('positionY', Math.round(startMoveY + movement.dy));
    } else {
      hideSnapGuides(); const dx = rawX, dy = rawY;
      const west = mode.includes('w'), north = mode.includes('n');
      selected.style.width = `${Math.max(8, Math.round(rect.width + (west ? -dx : dx)))}px`;
      selected.style.height = `${Math.max(8, Math.round(rect.height + (north ? -dy : dy)))}px`;
      if (west || north) {
        const x = Math.round(startMoveX + (west ? dx : 0)), y = Math.round(startMoveY + (north ? dy : 0));
        selected.dataset.canvasX = x; selected.dataset.canvasY = y; applyElementTransform(selected);
      }
      setControl('elementWidth', Math.round(selected.getBoundingClientRect().width)); setControl('elementHeight', Math.round(selected.getBoundingClientRect().height));
    }
    updateOverlay(); markPending();
  };
  const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); hideSnapGuides(); commit(); resizeFrameHeight(); };
  document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp, { once: true });
}
document.getElementById('moveHandle').addEventListener('pointerdown', event => startPointerTransform(event, 'move'));
document.querySelectorAll('[data-resize]').forEach(handle => handle.addEventListener('pointerdown', event => startPointerTransform(event, handle.dataset.resize)));

function setZoom(value) {
  zoom = Math.max(50, Math.min(120, value)); pageWrap.style.transform = `scale(${zoom / 100})`;
  pageWrap.style.marginBottom = `${pageSurface.offsetHeight * (zoom / 100 - 1)}px`; document.getElementById('zoomLabel').textContent = `${zoom}%`;
}
document.getElementById('zoomOut').addEventListener('click', () => setZoom(zoom - 10));
document.getElementById('zoomIn').addEventListener('click', () => setZoom(zoom + 10));
function setDevice(mobile) {
  pageSurface.classList.toggle('mobile', mobile); document.getElementById('viewportLabel').textContent = mobile ? 'MOBILE' : 'DESKTOP';
  document.getElementById('desktopBtn').classList.toggle('active', !mobile); document.getElementById('mobileBtn').classList.toggle('active', mobile);
  setTimeout(() => { resizeFrameHeight(); updateOverlay(); setZoom(zoom); }, 260);
}
document.getElementById('desktopBtn').addEventListener('click', () => setDevice(false));
document.getElementById('mobileBtn').addEventListener('click', () => setDevice(true));

function renderLayers() {
  const list = document.getElementById('layersList'); if (!list) return; list.innerHTML = '';
  const body = frame.contentDocument?.body; if (!body) return;
  function walk(parent, depth) {
    Array.from(parent.children).forEach(element => {
      const path = pathOf(element), hidden = element.dataset.canvasHidden === 'true', locked = element.dataset.canvasLocked === 'true';
      const row = document.createElement('div'), main = document.createElement('button'), actions = document.createElement('div'), visibility = document.createElement('button'), lock = document.createElement('button');
      row.className = `layer-row${selectedElements.has(element) ? ' active' : ''}${hidden ? ' hidden-layer' : ''}`; row.draggable = !locked; row.dataset.path = path;
      main.type = 'button'; main.className = 'layer-main'; main.style.paddingLeft = `${8 + depth * 12}px`;
      main.innerHTML = `<span class="caret">${element.children.length ? '›' : '·'}</span><span>${escapeHTML(elementLabel(element))}</span><span class="tag">${element.dataset.canvasGroup ? 'G · ' : ''}${element.tagName}</span>`;
      main.addEventListener('click', event => { selectElement(element, event.shiftKey); if (!hidden) element.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
      actions.className = 'layer-actions'; visibility.type = lock.type = 'button'; visibility.classList.toggle('active', hidden); lock.classList.toggle('active', locked);
      visibility.textContent = hidden ? '○' : '◉'; visibility.title = hidden ? '編集画面に表示' : '編集画面で非表示';
      lock.textContent = locked ? '🔒' : '◇'; lock.title = locked ? 'ロック解除' : 'ロック';
      visibility.addEventListener('click', event => { event.stopPropagation(); if (hidden) delete element.dataset.canvasHidden; else element.dataset.canvasHidden = 'true'; selectElement(element); commit(); resizeFrameHeight(); });
      lock.addEventListener('click', event => { event.stopPropagation(); if (locked) delete element.dataset.canvasLocked; else element.dataset.canvasLocked = 'true'; selectElement(element); commit(); });
      actions.append(visibility, lock); row.append(main, actions);
      row.addEventListener('dragstart', event => { if (locked) { event.preventDefault(); return; } dragPath = path; event.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragover', event => { event.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', event => {
        event.preventDefault(); row.classList.remove('drag-over'); const source = resolvePath(dragPath), target = resolvePath(path);
        if (!source || !target || source === target || source.contains(target) || isElementLocked(source) || isElementLocked(target)) return;
        target.before(source); selectElement(source); commit(); resizeFrameHeight(); showToast('DOMの順序を変更しました');
      });
      list.appendChild(row); walk(element, depth + 1);
    });
  }
  walk(body, 0);
}
function escapeHTML(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
const layersPopover = document.getElementById('layersPopover');
function toggleLayers(force) { const open = force ?? !layersPopover.classList.contains('open'); if (open) { renderLayers(); toggleOutline(false); } layersPopover.classList.toggle('open', open); layersPopover.setAttribute('aria-hidden', String(!open)); }
document.getElementById('layersBtn').addEventListener('click', event => { event.stopPropagation(); toggleLayers(); });
document.getElementById('focusDomBtn').addEventListener('click', event => { event.stopPropagation(); toggleLayers(true); });
const outlinePopover = document.getElementById('outlinePopover');
function renderOutline() {
  const list = document.getElementById('outlineList'), headings = Array.from(frame.contentDocument?.body.querySelectorAll('h1,h2,h3,h4,h5,h6') || []);
  if (!list) return;
  list.innerHTML = ''; document.getElementById('outlineCount').textContent = `${headings.length}件`;
  if (!headings.length) {
    const empty = document.createElement('div'); empty.className = 'outline-empty'; empty.textContent = 'このページには見出しがありません'; list.appendChild(empty); return;
  }
  headings.forEach(heading => {
    const level = Number(heading.tagName[1]), button = document.createElement('button'), levelLabel = document.createElement('span'), title = document.createElement('span');
    button.type = 'button'; button.className = `outline-item level-${level}`; levelLabel.className = 'outline-level'; levelLabel.textContent = `H${level}`; title.className = 'outline-title'; title.textContent = (heading.textContent || '').replace(/\s+/g, ' ').trim() || '無題の見出し';
    button.append(levelLabel, title); button.addEventListener('click', () => { selectElement(heading); heading.scrollIntoView({ block: 'center', behavior: 'smooth' }); }); list.appendChild(button);
  });
}
function toggleOutline(force) {
  const open = force ?? !outlinePopover.classList.contains('open');
  if (open) { renderOutline(); toggleLayers(false); toggleAssets(false); }
  outlinePopover.classList.toggle('open', open); outlinePopover.setAttribute('aria-hidden', String(!open));
  document.getElementById('outlineBtn').classList.toggle('active', open);
}
document.getElementById('outlineBtn').addEventListener('click', event => { event.stopPropagation(); toggleOutline(); });

function pathWithinBody(element, body) {
  if (!element || element === body) return '';
  const parts = [];
  for (let node = element; node && node !== body; node = node.parentElement) parts.unshift(Array.from(node.parentElement.children).indexOf(node));
  return parts.join('.');
}

function elementWithinBody(body, path) {
  if (!body || path === '') return null;
  return String(path).split('.').reduce((node, part) => node?.children[Number(part)], body) || null;
}

function escapedRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const searchDialog = document.getElementById('searchDialog');
function searchProject(query, scope = 'current', caseSensitive = false) {
  syncFromFrame();
  if (!query) return { count: 0, results: [] };
  const expression = new RegExp(escapedRegExp(query), caseSensitive ? 'g' : 'gi'), results = [];
  let count = 0;
  const pages = scope === 'all' ? project.pages : project.pages.filter(page => page.htmlPath === project.htmlPath);
  pages.forEach(page => {
    const parsed = new DOMParser().parseFromString(`<body>${page.html}</body>`, 'text/html');
    const walker = parsed.createTreeWalker(parsed.body, 4);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest('script,style')) continue;
      expression.lastIndex = 0; const matches = node.nodeValue.match(expression);
      if (!matches?.length) continue;
      count += matches.length;
      if (results.length < 200) results.push({ pagePath: page.htmlPath, path: pathWithinBody(node.parentElement, parsed.body), snippet: node.nodeValue.replace(/\s+/g, ' ').trim().slice(0, 140), count: matches.length });
    }
  });
  return { count, results };
}

function renderSearchResults() {
  const query = document.getElementById('searchInput').value, scope = document.getElementById('searchScope').value, caseSensitive = document.getElementById('searchCaseCheck').checked;
  const output = searchProject(query, scope, caseSensitive), summary = document.getElementById('searchSummary'), list = document.getElementById('searchResults');
  list.innerHTML = '';
  if (!query) { summary.textContent = '検索する文字を入力してください'; list.innerHTML = '<div class="search-empty">文書の本文から検索します</div>'; return output; }
  const displayed = output.results.reduce((sum, result) => sum + result.count, 0);
  summary.textContent = output.count ? `${output.count}件見つかりました${displayed < output.count ? `・先頭${displayed}件を表示` : ''}` : '一致する文字はありません';
  if (!output.results.length) { list.innerHTML = '<div class="search-empty">一致する文字はありません</div>'; return output; }
  output.results.forEach(result => {
    const button = document.createElement('button'), page = document.createElement('span'), snippet = document.createElement('span'), count = document.createElement('span');
    button.type = 'button'; button.className = 'search-result'; page.className = 'search-result-page'; page.textContent = result.pagePath; snippet.className = 'search-result-snippet'; snippet.textContent = result.snippet; count.className = 'search-result-count'; count.textContent = `${result.count}件`;
    button.append(page, snippet, count); button.addEventListener('click', () => {
      searchDialog.close();
      if (result.pagePath !== project.htmlPath) { syncFromFrame(); hydratePage(result.pagePath); renderDocument(result.path); loadCodeTab(); }
      else { const target = resolvePath(result.path); if (target) { selectElement(target); target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
    });
    list.appendChild(button);
  });
  return output;
}

function replaceProjectText(query, replacement, scope = 'current', caseSensitive = false) {
  if (!query) return 0;
  syncFromFrame();
  const activePath = project.htmlPath, expression = new RegExp(escapedRegExp(query), caseSensitive ? 'g' : 'gi');
  let replaced = 0;
  const pages = scope === 'all' ? project.pages : project.pages.filter(page => page.htmlPath === activePath);
  pages.forEach(page => {
    const parsed = new DOMParser().parseFromString(`<body>${page.html}</body>`, 'text/html'), walker = parsed.createTreeWalker(parsed.body, 4);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest('script,style')) continue;
      expression.lastIndex = 0;
      node.nodeValue = node.nodeValue.replace(expression, () => { replaced += 1; return replacement; });
    }
    page.html = parsed.body.innerHTML;
  });
  if (replaced) { hydratePage(activePath); dirty = true; commit({ sync: false, renderLayers: false }); renderDocument(''); }
  return replaced;
}

function openSearchDialog() {
  showAppDialog(searchDialog, '#searchInput');
  renderSearchResults();
}
document.getElementById('searchBtn').addEventListener('click', openSearchDialog);
['searchInput','searchScope','searchCaseCheck'].forEach(id => document.getElementById(id).addEventListener('input', renderSearchResults));
document.getElementById('searchForm').addEventListener('submit', event => event.preventDefault());
document.getElementById('replaceAllBtn').addEventListener('click', () => {
  const count = replaceProjectText(document.getElementById('searchInput').value, document.getElementById('replaceInput').value, document.getElementById('searchScope').value, document.getElementById('searchCaseCheck').checked);
  if (count) searchDialog.close(); else renderSearchResults();
  showToast(count ? `${count}件を置換しました` : '置換する文字が見つかりません');
});
document.getElementById('closeSearchBtn').addEventListener('click', () => searchDialog.close());
document.getElementById('closeSearchAction').addEventListener('click', () => searchDialog.close());

document.addEventListener('click', event => {
  if (!event.target.closest('#layersPopover') && !event.target.closest('#layersBtn') && !event.target.closest('#focusDomBtn')) toggleLayers(false);
  if (!event.target.closest('#outlinePopover') && !event.target.closest('#outlineBtn')) toggleOutline(false);
  if (!event.target.closest('#assetsPopover') && !event.target.closest('#assetsBtn')) toggleAssets(false);
  if (!event.target.closest('#importMenu') && !event.target.closest('#importBtn')) toggleImportMenu(false);
});

async function inflateZipData(bytes, method) {
  if (method === 0) return bytes;
  if (method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('このZIPの圧縮形式には対応していません');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function parseZip(file) {
  const bytes = new Uint8Array(await file.arrayBuffer()); const view = new DataView(bytes.buffer); let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIPの構造を読み取れません');
  const count = view.getUint16(eocd + 10, true), centralOffset = view.getUint32(eocd + 16, true); let cursor = centralOffset, total = 0; const entries = [];
  if (count > 5000) throw new Error('ZIP内のファイル数が多すぎます');
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('ZIPのファイル一覧が壊れています');
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true), compressedSize = view.getUint32(cursor + 20, true), size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true), localOffset = view.getUint32(cursor + 42, true);
    const path = new TextDecoder((flags & 0x0800) ? 'utf-8' : 'utf-8').decode(bytes.slice(cursor + 46, cursor + 46 + nameLength)).replace(/\\/g, '/').replace(/^\.\//, '');
    cursor += 46 + nameLength + extraLength + commentLength; if (!path || path.endsWith('/') || path.startsWith('__MACOSX/')) continue;
    if (flags & 1) throw new Error('パスワード付きZIPには対応していません');
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('ZIP内のファイルを読み取れません');
    const localName = view.getUint16(localOffset + 26, true), localExtra = view.getUint16(localOffset + 28, true), start = localOffset + 30 + localName + localExtra;
    total += size; if (total > 150 * 1024 * 1024) throw new Error('ZIPの展開サイズが150MBを超えています');
    entries.push({ path, data: await inflateZipData(bytes.slice(start, start + compressedSize), method), type: detectMime(path) });
  }
  return stripCommonRoot(entries);
}

function stripCommonRoot(entries) {
  if (!entries.length) return entries; const roots = entries.map(entry => entry.path.split('/')[0]);
  if (roots.every(root => root === roots[0]) && entries.every(entry => entry.path.includes('/'))) return entries.map(entry => ({ ...entry, path: entry.path.split('/').slice(1).join('/') }));
  return entries;
}

async function entriesFromFiles(fileList) {
  const files = Array.from(fileList || []); const zip = files.find(file => /\.zip$/i.test(file.name) || file.type === 'application/zip');
  if (zip) return parseZip(zip);
  const entries = await Promise.all(files.map(async file => ({ path: normalizePath(file.webkitRelativePath || file.name), data: new Uint8Array(await file.arrayBuffer()), type: file.type || detectMime(file.name) })));
  return stripCommonRoot(entries);
}

async function readDirectoryEntry(entry, prefix = '') {
  if (entry.isFile) return new Promise((resolve, reject) => entry.file(async file => resolve([{ path: normalizePath(`${prefix}${file.name}`), data: new Uint8Array(await file.arrayBuffer()), type: file.type || detectMime(file.name) }]), reject));
  if (!entry.isDirectory) return [];
  const children = await new Promise((resolve, reject) => { const reader = entry.createReader(), all = []; const read = () => reader.readEntries(items => { if (!items.length) resolve(all); else { all.push(...items); read(); } }, reject); read(); });
  return (await Promise.all(children.map(child => readDirectoryEntry(child, `${prefix}${entry.name}/`)))).flat();
}

async function entriesFromDrop(dataTransfer) {
  const itemEntries = Array.from(dataTransfer.items || []).map(item => item.webkitGetAsEntry?.()).filter(Boolean);
  if (itemEntries.some(entry => entry.isDirectory)) return stripCommonRoot((await Promise.all(itemEntries.map(entry => readDirectoryEntry(entry)))).flat());
  return entriesFromFiles(dataTransfer.files);
}

function chooseHtmlPath(entries) {
  const html = entries.map(entry => entry.path).filter(path => /\.html?$/i.test(path));
  return html.sort((a,b) => (/(^|\/)index\.html?$/i.test(b) - /(^|\/)index\.html?$/i.test(a)) || a.split('/').length - b.split('/').length || a.length - b.length)[0];
}

const markdownDialog = document.getElementById('markdownDialog');
const markdownForm = document.getElementById('markdownForm');
let resolveMarkdownChoice = null;

function finishMarkdownChoice(value) {
  if (!resolveMarkdownChoice) return;
  const resolve = resolveMarkdownChoice;
  resolveMarkdownChoice = null;
  if (markdownDialog.open) markdownDialog.close();
  resolve(value);
}

function chooseMarkdownOptions(markdownEntries) {
  document.getElementById('markdownImportSummary').textContent = `${markdownEntries.length}個のMarkdownを、編集可能なHTMLページへ変換します。`;
  document.querySelector('input[name="markdownTheme"][value="document"]').checked = true;
  document.getElementById('markdownTocCheck').checked = true;
  return new Promise(resolve => {
    resolveMarkdownChoice = resolve;
    showAppDialog(markdownDialog, 'input[name="markdownTheme"]');
  });
}

markdownForm.addEventListener('submit', event => {
  event.preventDefault();
  finishMarkdownChoice({
    theme: new FormData(markdownForm).get('markdownTheme') || 'document',
    toc: document.getElementById('markdownTocCheck').checked
  });
});
document.getElementById('cancelMarkdownBtn').addEventListener('click', () => finishMarkdownChoice(null));
document.getElementById('cancelMarkdownIcon').addEventListener('click', () => finishMarkdownChoice(null));
markdownDialog.addEventListener('cancel', event => { event.preventDefault(); finishMarkdownChoice(null); });

function uniqueMarkdownCssPath(entries, theme) {
  const occupied = new Set(entries.map(entry => normalizePath(entry.path)));
  const base = `markdown-${theme}.css`;
  if (!occupied.has(base)) return base;
  let count = 2;
  while (occupied.has(`markdown-${theme}-${count}.css`)) count += 1;
  return `markdown-${theme}-${count}.css`;
}

async function parseMarkdownPages(markdownEntries, entries, options, styles) {
  if (!window.CanvasMarkdown) throw new Error('Markdown変換機能を読み込めませんでした');
  const occupied = new Set(entries.map(entry => normalizePath(entry.path)));
  const cssPath = uniqueMarkdownCssPath(entries, options.theme);
  styles[cssPath] = window.CanvasMarkdown.markdownThemeCss(options.theme);
  const definitions = markdownEntries.map(entry => {
    const sourcePath = normalizePath(entry.path);
    const htmlPath = window.CanvasMarkdown.outputPathForMarkdown(sourcePath, occupied);
    occupied.add(htmlPath);
    return { sourcePath, htmlPath, entry };
  });
  const outputBySource = new Map(definitions.map(definition => [definition.sourcePath, definition.htmlPath]));
  const pages = [];
  for (let index = 0; index < definitions.length; index += 1) {
    const { sourcePath, htmlPath, entry: sourceAsset } = definitions[index];
    if (sourceAsset.data.byteLength > 20 * 1024 * 1024) throw new Error(`${sourcePath} は20MBを超えているため変換できません`);
    const converted = window.CanvasMarkdown.convertMarkdown(decodeText(sourceAsset), {
      ...options,
      filename: sourcePath
    });
    const parsed = new DOMParser().parseFromString(`<body>${converted.html}</body>`, 'text/html');
    parsed.body.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (!/\.(?:md|markdown)(?:[?#].*)?$/i.test(href || '')) return;
      const targetSource = resolveAssetPath(sourcePath, href);
      const targetHtml = outputBySource.get(targetSource);
      if (!targetHtml) return;
      const suffix = href.match(/[?#].*$/)?.[0] || '';
      link.setAttribute('href', `${relativePath(htmlPath, targetHtml)}${suffix}`);
    });
    const descriptionMeta = converted.description ? `<meta name="description" content="${escapeHTML(converted.description).replace(/"/g, '&quot;')}">` : '';
    pages.push({
      filename: htmlPath.split('/').pop(), title: converted.title, html: parsed.body.innerHTML, head: descriptionMeta, scripts: '',
      htmlPath, cssPath, cssMode: 'external', styleKey: cssPath, inlineCss: ''
    });
    if (index < definitions.length - 1 && index % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return pages;
}

function parseImportedPage(htmlPath, entries, styles, sourceAssets = assets) {
  const source = decodeText(sourceAssets.get(htmlPath));
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  const inlineStyles = Array.from(parsed.querySelectorAll('style')).map(element => element.textContent).join('\n\n');
  parsed.querySelectorAll('style').forEach(element => element.remove());
  const scripts = Array.from(parsed.body.querySelectorAll('script')).map(element => element.outerHTML).join('\n');
  parsed.body.querySelectorAll('script').forEach(element => element.remove());
  const title = parsed.querySelector('title')?.textContent || htmlPath.split('/').pop().replace(/\.html?$/i, '');
  parsed.querySelectorAll('title').forEach(element => element.remove());
  parsed.querySelectorAll('meta[charset],meta[name="viewport"],base').forEach(element => element.remove());
  const linked = Array.from(parsed.head.querySelectorAll('link[rel~="stylesheet"][href]'))
    .map(link => resolveAssetPath(htmlPath, link.getAttribute('href')))
    .find(path => path && sourceAssets.has(path));
  let cssMode = 'external', cssPath = linked || null, styleKey, inlineCss = inlineStyles;
  if (cssPath) {
    styleKey = cssPath;
    if (styles[styleKey] == null) styles[styleKey] = decodeText(sourceAssets.get(cssPath));
  } else if (inlineStyles) {
    cssMode = 'inline'; styleKey = `inline:${htmlPath}`; styles[styleKey] = inlineStyles; inlineCss = '';
  } else {
    cssPath = entries.map(entry => entry.path).find(path => /\.css$/i.test(path)) || normalizePath(`${dirname(htmlPath)}/styles.css`);
    styleKey = cssPath;
    if (styles[styleKey] == null) styles[styleKey] = sourceAssets.has(cssPath) ? decodeText(sourceAssets.get(cssPath)) : '';
    const link = parsed.createElement('link'); link.rel = 'stylesheet'; link.href = relativePath(htmlPath, cssPath); parsed.head.appendChild(link);
  }
  return {
    filename: htmlPath.split('/').pop(), title, html: parsed.body.innerHTML, head: parsed.head.innerHTML, scripts,
    htmlPath, cssPath, cssMode, styleKey, inlineCss
  };
}

async function importEntries(entries) {
  if (!window.CanvasSafety) throw new Error('安全確認機能を読み込めませんでした');
  entries = window.CanvasSafety.validateImportEntries(entries);
  const htmlPath = chooseHtmlPath(entries);
  const markdownEntries = entries.filter(entry => /\.(?:md|markdown)$/i.test(entry.path));
  if (!htmlPath && !markdownEntries.length) throw new Error('HTMLまたはMarkdownファイルが見つかりません');
  const oversizedMarkdown = markdownEntries.find(entry => entry.data.byteLength > 20 * 1024 * 1024);
  if (!htmlPath && oversizedMarkdown) throw new Error(`${oversizedMarkdown.path} は20MBを超えているため変換できません`);
  const markdownOptions = htmlPath ? null : await chooseMarkdownOptions(markdownEntries);
  if (!htmlPath && !markdownOptions) return false;
  const nextAssets = new Map(entries.map(entry => [normalizePath(entry.path), { data: entry.data, type: entry.type || detectMime(entry.path) }]));
  const styles = {};
  let pages;
  if (htmlPath) {
    pages = entries.map(entry => normalizePath(entry.path)).filter(path => /\.html?$/i.test(path)).map(path => parseImportedPage(path, entries, styles, nextAssets));
  } else {
    pages = await parseMarkdownPages(markdownEntries, entries, markdownOptions, styles);
  }
  const active = pages.find(page => page.htmlPath === htmlPath) || pages.find(page => /(^|\/)index\.html?$/i.test(page.htmlPath)) || pages[0];
  window.dispatchEvent(new CustomEvent('canvas-new-project')); clearAssetUrls(); assets = nextAssets;
  project = { ...active, css: styles[active.styleKey] || '', activePagePath: active.htmlPath, homePagePath: active.htmlPath, pages, styles, responsiveRules: {} };
  history = []; historyIndex = -1; selectedPath = ''; dirty = true; commit({ sync: false, renderLayers: false });
  await saveAssetsToDB(true); renderDocument(''); renderAssets();
  closeStartScreen();
  const missing = findMissingAssets();
  const summary = htmlPath ? `${entries.length}ファイル・${pages.length}ページを読み込みました` : `${markdownEntries.length}個のMarkdownをHTMLへ変換しました・元ファイルも保持しています`;
  showToast(`${summary}${missing.length ? `・参照切れ ${missing.length}件` : ''}`);
  return true;
}

async function readFiles(fileList) {
  try { await importEntries(await entriesFromFiles(fileList)); } catch (error) { showImportError(error); }
}

const importErrorDialog = document.getElementById('importErrorDialog');
function showImportError(error) {
  document.getElementById('importErrorMessage').textContent = error?.message || 'ファイルを読み込めませんでした';
  showAppDialog(importErrorDialog, '#closeImportErrorAction');
}
document.getElementById('closeImportErrorBtn').addEventListener('click', () => importErrorDialog.close());
document.getElementById('closeImportErrorAction').addEventListener('click', () => importErrorDialog.close());

const importMenu = document.getElementById('importMenu');
function toggleImportMenu(force) { const open = force ?? !importMenu.classList.contains('open'); importMenu.classList.toggle('open', open); importMenu.setAttribute('aria-hidden', String(!open)); }
document.getElementById('importBtn').addEventListener('click', event => { event.stopPropagation(); toggleImportMenu(); });
document.querySelector('[data-import="files"]').addEventListener('click', () => { toggleImportMenu(false); document.getElementById('fileInput').click(); });
document.querySelector('[data-import="folder"]').addEventListener('click', () => { toggleImportMenu(false); document.getElementById('folderInput').click(); });
document.getElementById('fileInput').addEventListener('change', event => { readFiles(event.target.files); event.target.value = ''; });
document.getElementById('folderInput').addEventListener('change', event => { readFiles(event.target.files); event.target.value = ''; });
['dragenter','dragover'].forEach(type => stage.addEventListener(type, event => { event.preventDefault(); stage.classList.add('dragging'); }));
stage.addEventListener('dragleave', event => { event.preventDefault(); if (!stage.contains(event.relatedTarget)) stage.classList.remove('dragging'); });
stage.addEventListener('drop', async event => { event.preventDefault(); stage.classList.remove('dragging'); try { await importEntries(await entriesFromDrop(event.dataTransfer)); } catch (error) { showImportError(error); } });

function findMissingAssets() {
  const missing = new Set();
  const checks = [
    ['img[src],source[src],video[src],audio[src],script[src],iframe[src]', 'src'],
    ['video[poster]', 'poster'], ['link[href]', 'href']
  ];
  syncActivePageRecord();
  for (const page of project.pages || [project]) {
    const parsed = new DOMParser().parseFromString(`<html><head>${page.head}</head><body>${page.html}</body></html>`, 'text/html');
    for (const [selector, attr] of checks) parsed.querySelectorAll(selector).forEach(element => {
      const ref = element.getAttribute(attr), path = resolveAssetPath(page.htmlPath, ref); if (path && !assets.has(path) && !project.pages.some(item => item.htmlPath === path) && !Object.prototype.hasOwnProperty.call(project.styles || {}, path)) missing.add(path);
    });
    parsed.querySelectorAll('[srcset]').forEach(element => element.getAttribute('srcset').split(',').forEach(item => {
      const path = resolveAssetPath(page.htmlPath, item.trim().split(/\s+/)[0]); if (path && !assets.has(path)) missing.add(path);
    }));
  }
  const scanCss = (css, base) => css.replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi, (match, quote, ref) => {
    const path = resolveAssetPath(base, ref.trim()); if (path && !assets.has(path)) missing.add(path); return match;
  });
  for (const [styleKey, css] of Object.entries(project.styles || {})) scanCss(css, styleKey.startsWith('inline:') ? styleKey.slice(7) : styleKey);
  for (const [path, asset] of assets) if (/\.css$/i.test(path) && path !== project.cssPath) scanCss(decodeText(asset), path);
  return Array.from(missing).sort();
}

function collectBrokenReferences(sync = true) {
  if (sync) syncFromFrame();
  const broken = [];
  for (const page of project.pages || []) {
    const parsed = new DOMParser().parseFromString(`<body>${page.html}</body>`, 'text/html');
    const inspect = (selector, attribute, kind) => parsed.body.querySelectorAll(selector).forEach(element => {
      const reference = (element.getAttribute(attribute) || '').trim(), target = resolveAssetPath(page.htmlPath, reference);
      if (!target) return;
      const exists = project.pages.some(item => item.htmlPath === target) || assets.has(target) || Object.prototype.hasOwnProperty.call(project.styles || {}, target);
      if (!exists) broken.push({ pagePath: page.htmlPath, path: pathWithinBody(element, parsed.body), attribute, reference, target, kind, tag: element.tagName.toLowerCase() });
    });
    inspect('a[href]', 'href', 'page');
    inspect('img[src],source[src],video[src],audio[src]', 'src', 'asset');
    inspect('video[poster]', 'poster', 'image');
  }
  return broken;
}

function referenceCandidates(issue) {
  if (issue.kind === 'page') return [...(project.pages || []).map(page => page.htmlPath), ...Array.from(assets.keys())];
  const rows = Array.from(assets.entries());
  if (issue.kind === 'image' || issue.tag === 'img') return rows.filter(([path, asset]) => isImage(path, asset.type)).map(([path]) => path);
  if (issue.tag === 'video') return rows.filter(([path, asset]) => asset.type?.startsWith('video/') || /\.(?:mp4|webm)$/i.test(path)).map(([path]) => path);
  if (issue.tag === 'audio') return rows.filter(([path, asset]) => asset.type?.startsWith('audio/') || /\.(?:mp3|wav|ogg)$/i.test(path)).map(([path]) => path);
  return rows.map(([path]) => path);
}

function bestReferenceCandidate(issue, candidates) {
  const wanted = issue.target.split('/').pop().toLowerCase();
  return candidates.find(path => path.split('/').pop().toLowerCase() === wanted) || candidates[0] || '';
}

function applyReferenceRepair(issue, candidate) {
  syncFromFrame();
  const page = project.pages.find(item => item.htmlPath === issue.pagePath); if (!page || !candidate) return false;
  const parsed = new DOMParser().parseFromString(`<body>${page.html}</body>`, 'text/html'), element = elementWithinBody(parsed.body, issue.path); if (!element) return false;
  const suffix = issue.reference.match(/[?#].*$/)?.[0] || '';
  element.setAttribute(issue.attribute, `${relativePath(page.htmlPath, candidate)}${suffix}`); page.html = parsed.body.innerHTML;
  if (project.htmlPath === page.htmlPath) hydratePage(page.htmlPath);
  dirty = true; commit({ sync: false, renderLayers: false }); renderDocument(''); showToast('参照先を修正しました'); return true;
}

const referenceDialog = document.getElementById('referenceDialog');
function renderReferenceRepairs(sync = true) {
  const issues = collectBrokenReferences(sync), list = document.getElementById('referenceList'), summary = document.getElementById('referenceSummary');
  list.innerHTML = ''; summary.textContent = issues.length ? `${issues.length}件の参照切れがあります。既存のページまたは素材へ付け替えられます。` : 'リンク・画像の参照切れはありません。';
  if (!issues.length) { const empty = document.createElement('div'); empty.className = 'reference-empty'; empty.textContent = 'すべての参照先を確認できました'; list.appendChild(empty); return issues; }
  issues.forEach(issue => {
    const candidates = referenceCandidates(issue), row = document.createElement('div'), info = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('span'), label = document.createElement('label'), select = document.createElement('select'), button = document.createElement('button');
    row.className = 'reference-row'; info.className = 'reference-info'; title.textContent = issue.reference; detail.textContent = `${issue.pagePath}・${issue.tag}の${issue.attribute}`; info.append(title, detail); label.textContent = '新しい参照先';
    if (!candidates.length) { const option = document.createElement('option'); option.value = ''; option.textContent = '候補がありません'; select.appendChild(option); }
    else candidates.forEach(candidate => { const option = document.createElement('option'); option.value = candidate; option.textContent = candidate; select.appendChild(option); });
    select.value = bestReferenceCandidate(issue, candidates); label.appendChild(select); button.type = 'button'; button.textContent = '付け替え'; button.disabled = !candidates.length;
    button.addEventListener('click', () => { if (applyReferenceRepair(issue, select.value)) renderReferenceRepairs(false); }); row.append(info, label, button); list.appendChild(row);
  });
  return issues;
}

function openReferenceDialog() { if (checkDialog.open) checkDialog.close(); renderReferenceRepairs(); showAppDialog(referenceDialog, '#closeReferenceAction'); }

function formatSize(size) { if (size < 1024) return `${size} B`; if (size < 1048576) return `${Math.round(size/1024)} KB`; return `${(size/1048576).toFixed(1)} MB`; }

function replaceSelectedWithAsset(path) {
  if (!selected || !['IMG','SOURCE','VIDEO'].includes(selected.tagName)) { showToast('先にキャンバス上の画像を選択してください'); return; }
  const target = selected, relative = relativePath(project.htmlPath, path), url = assetUrl(path);
  if (selected.tagName === 'VIDEO') { selected.dataset.canvasOriginalPoster = relative; selected.setAttribute('poster', url); }
  else { selected.dataset.canvasOriginalSrc = relative; selected.setAttribute('src', url); }
  if (target.tagName === 'IMG') target.addEventListener('load', () => { if (selected === target) renderImageAssetInfo(); }, { once: true });
  commit(); updateOverlay(); showToast('画像を差し替えました');
}

function renderAssets() {
  const imageGrid = document.getElementById('assetGrid'), filesList = document.getElementById('assetFiles'); imageGrid.innerHTML = ''; filesList.innerHTML = '';
  const rows = Array.from(assets.entries()).sort(([a],[b]) => a.localeCompare(b)); const images = rows.filter(([path,asset]) => isImage(path,asset.type));
  document.getElementById('assetSummary').textContent = `${rows.length}ファイル · 画像 ${images.length}点 · 端末内に自動保存`;
  for (const [path, asset] of images) {
    const card = document.createElement('article'); card.className = 'asset-card'; const url = assetUrl(path);
    card.innerHTML = `<div class="asset-thumb"><img alt="" src="${url}"></div><footer><span class="asset-name" title="${escapeHTML(path)}">${escapeHTML(path.split('/').pop())}</span><button>選択画像に使用</button></footer>`;
    card.querySelector('button').addEventListener('click', () => replaceSelectedWithAsset(path)); imageGrid.appendChild(card);
  }
  for (const [path, asset] of rows.filter(([path,asset]) => !isImage(path,asset.type))) {
    const row = document.createElement('div'); row.className = 'asset-file'; const ext = path.split('.').pop().slice(0,4).toUpperCase();
    row.innerHTML = `<span class="file-type">${escapeHTML(ext)}</span><span class="file-path" title="${escapeHTML(path)}">${escapeHTML(path)}</span><span class="file-size">${formatSize(asset.data.byteLength)}</span>`; filesList.appendChild(row);
  }
  const missing = findMissingAssets(), missingList = document.getElementById('missingList'), badge = document.getElementById('assetBadge');
  missingList.hidden = missing.length === 0; missingList.innerHTML = missing.length ? `<strong>参照先が見つからないファイル</strong>${missing.slice(0,8).map(path=>`<div class="missing-item">${escapeHTML(path)}</div>`).join('')}${missing.length>8?`<div>ほか ${missing.length-8}件</div>`:''}` : '';
  badge.hidden = missing.length === 0; badge.textContent = missing.length;
}

async function addAssetFiles(fileList) {
  const files = Array.from(fileList || []); if (!files.length) return;
  for (const file of files) {
    const baseDir = normalizePath(`${dirname(project.htmlPath)}/assets`); let path = normalizePath(`${baseDir}/${file.name}`), counter = 2;
    while (assets.has(path)) { const dot = file.name.lastIndexOf('.'), stem = dot > 0 ? file.name.slice(0,dot) : file.name, ext = dot > 0 ? file.name.slice(dot) : ''; path = normalizePath(`${baseDir}/${stem}-${counter++}${ext}`); }
    assets.set(path, { data: new Uint8Array(await file.arrayBuffer()), type: file.type || detectMime(path) });
  }
  clearAssetUrls(); await saveAssetsToDB(); renderDocument(selectedPath); renderAssets(); showToast(`${files.length}点の素材を追加しました`);
}

const assetsPopover = document.getElementById('assetsPopover');
function toggleAssets(force) { const open = force ?? !assetsPopover.classList.contains('open'); if (open) { renderAssets(); toggleLayers(false); toggleOutline(false); } assetsPopover.classList.toggle('open',open); assetsPopover.setAttribute('aria-hidden',String(!open)); }
document.getElementById('assetsBtn').addEventListener('click', event => { event.stopPropagation(); toggleAssets(); });
document.getElementById('addAssetBtn').addEventListener('click', () => document.getElementById('assetInput').click());
document.getElementById('assetInput').addEventListener('change', event => { addAssetFiles(event.target.files); event.target.value=''; });

const drawer = document.getElementById('codeDrawer'); const codeEditor = document.getElementById('codeEditor');
function loadCodeTab() { codeEditor.value = codeTab === 'html' ? project.html.trim() : project.css.trim(); }
document.getElementById('codeBtn').addEventListener('click', () => { syncFromFrame(); loadCodeTab(); drawer.classList.add('open'); drawer.setAttribute('aria-hidden','false'); });
document.getElementById('closeCode').addEventListener('click', () => { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden','true'); });
document.querySelectorAll('[data-code-tab]').forEach(button => button.addEventListener('click', () => {
  codeTab = button.dataset.codeTab; document.querySelectorAll('[data-code-tab]').forEach(x => x.classList.toggle('active', x === button)); loadCodeTab();
}));
document.getElementById('applyCode').addEventListener('click', () => {
  if (codeTab === 'html') project.html = codeEditor.value; else project.css = codeEditor.value;
  selectedPath = ''; commit({ sync: false, renderLayers: false }); renderDocument(''); showToast(`${codeTab.toUpperCase()}を反映しました`);
});

function restoreHistory(index) {
  if (index < 0 || index >= history.length) return false;
  clearTimeout(commitTimer); historyIndex = index; project = cloneValue(history[index]); selectedPath = ''; dirty = true; renderDocument(''); persist(); saveRecoverySnapshot(); updateHistoryButtons(); return true;
}
function cloneValue(value) { return JSON.parse(JSON.stringify(value)); }
document.getElementById('undoBtn').addEventListener('click', () => { if (!restoreHistory(historyIndex - 1)) showToast('これ以上戻せません'); });
document.getElementById('redoBtn').addEventListener('click', () => { if (!restoreHistory(historyIndex + 1)) showToast('これ以上進めません'); });

document.getElementById('previewBtn').addEventListener('click', () => { document.body.classList.toggle('preview-mode'); overlay.classList.remove('visible'); if (!document.body.classList.contains('preview-mode')) updateOverlay(); });

function outputHTMLForPage(page) {
  const parsed = new DOMParser().parseFromString(`<body>${page.html}</body>`, 'text/html');
  parsed.body.querySelectorAll('[contenteditable],[data-canvas-x],[data-canvas-y],[data-canvas-selected],[data-canvas-group],[data-canvas-locked],[data-canvas-hidden],[data-canvas-rotate],[data-canvas-flip-x],[data-canvas-flip-y],[data-canvas-brightness],[data-canvas-contrast],[data-canvas-crop-baseline]').forEach(el => {
    ['contenteditable','data-canvas-x','data-canvas-y','data-canvas-selected','data-canvas-group','data-canvas-locked','data-canvas-hidden','data-canvas-rotate','data-canvas-flip-x','data-canvas-flip-y','data-canvas-brightness','data-canvas-contrast','data-canvas-crop-baseline','data-canvas-crop-width','data-canvas-crop-height','data-canvas-crop-ratio','data-canvas-crop-fit'].forEach(attribute => el.removeAttribute(attribute));
  });
  const head = new DOMParser().parseFromString(`<head>${page.head}</head>`, 'text/html').head;
  if (page.cssMode === 'external') {
    const linked = Array.from(head.querySelectorAll('link[rel~="stylesheet"][href]')).some(link => resolveAssetPath(page.htmlPath, link.getAttribute('href')) === page.cssPath);
    if (!linked) { const link = head.ownerDocument.createElement('link'); link.rel = 'stylesheet'; link.href = relativePath(page.htmlPath, page.cssPath || 'styles.css'); head.appendChild(link); }
    if (page.inlineCss) { const style = head.ownerDocument.createElement('style'); style.textContent = page.inlineCss; head.appendChild(style); }
  } else {
    const style = head.ownerDocument.createElement('style'); style.textContent = `${project.styles?.[page.styleKey] || ''}\n${responsiveCss(page.styleKey)}`.trim(); head.appendChild(style);
  }
  return `<!doctype html>\n<html lang="ja">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${escapeHTML(page.title)}</title>\n  ${head.innerHTML.trim()}\n</head>\n<body>\n${parsed.body.innerHTML.trim()}\n${(page.scripts || '').trim()}\n</body>\n</html>`;
}

function outputHTML() { syncActivePageRecord(); return outputHTMLForPage(project.pages.find(page => page.htmlPath === project.htmlPath) || project); }

const crcTable = (() => { const table = new Uint32Array(256); for (let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; table[n]=c>>>0; } return table; })();
function crc32(bytes) { let c=0xffffffff; for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
function write16(view, offset, value){ view.setUint16(offset,value,true); }
function write32(view, offset, value){ view.setUint32(offset,value>>>0,true); }
function createZip(files) {
  const encoder = new TextEncoder(); const localParts=[]; const centralParts=[]; let offset=0;
  files.forEach(file => {
    const name=encoder.encode(file.name), data=file.data instanceof Uint8Array ? file.data : encoder.encode(file.content || ''), crc=crc32(data);
    const local=new Uint8Array(30+name.length); const lv=new DataView(local.buffer); write32(lv,0,0x04034b50); write16(lv,4,20); write16(lv,6,0x0800); write16(lv,8,0); write32(lv,14,crc); write32(lv,18,data.length); write32(lv,22,data.length); write16(lv,26,name.length); local.set(name,30); localParts.push(local,data);
    const central=new Uint8Array(46+name.length); const cv=new DataView(central.buffer); write32(cv,0,0x02014b50); write16(cv,4,20); write16(cv,6,20); write16(cv,8,0x0800); write32(cv,16,crc); write32(cv,20,data.length); write32(cv,24,data.length); write16(cv,28,name.length); write32(cv,42,offset); central.set(name,46); centralParts.push(central); offset+=local.length+data.length;
  });
  const centralSize=centralParts.reduce((sum,p)=>sum+p.length,0); const end=new Uint8Array(22); const ev=new DataView(end.buffer); write32(ev,0,0x06054b50); write16(ev,8,files.length); write16(ev,10,files.length); write32(ev,12,centralSize); write32(ev,16,offset);
  return new Blob([...localParts,...centralParts,end],{type:'application/zip'});
}
function exportProjectZip() {
  const outputFiles = collectOutputFiles();
  const zip=createZip(Array.from(outputFiles.values()));
  const url=URL.createObjectURL(zip), link=document.createElement('a'); const base=project.filename.replace(/\.html?$/i,'') || 'canvas-page'; link.href=url; link.download=`${base}-complete.zip`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); showToast(`${outputFiles.size}ファイルをZIPに書き出しました`);
}

function collectOutputFiles() {
  syncFromFrame(); syncActivePageRecord();
  const outputFiles = new Map(Array.from(assets.entries()).map(([name,asset]) => [name, { name, data: asset.data, type: asset.type }]));
  for (const page of project.pages || []) outputFiles.set(page.htmlPath, { name: page.htmlPath, content: outputHTMLForPage(page), type: 'text/html' });
  const externalKeys = new Set((project.pages || []).filter(page => page.cssMode === 'external' && page.styleKey).map(page => page.styleKey));
  for (const styleKey of externalKeys) outputFiles.set(styleKey, { name: styleKey, content: `${project.styles?.[styleKey] || ''}\n${responsiveCss(styleKey)}`.trim(), type: 'text/css' });
  return outputFiles;
}

function runProjectChecks() {
  syncFromFrame(); syncActivePageRecord(); const issues = [];
  const add = (level, title, detail, page = '') => issues.push({ level, title, detail, page });
  if (!project.pages?.some(page => page.htmlPath === project.homePagePath)) add('error', 'ホームページがありません', 'ページ管理からホームページを指定してください');
  for (const page of project.pages || []) {
    if (!page.title?.trim()) add('warning', 'ページタイトルが空です', '<title>に使う名前を設定してください', page.htmlPath);
    const parsed = new DOMParser().parseFromString(`<body>${page.html}</body>`, 'text/html'), ids = new Map();
    parsed.body.querySelectorAll('[id]').forEach(element => { const id = element.id; ids.set(id, (ids.get(id) || 0) + 1); });
    ids.forEach((count, id) => { if (count > 1) add('error', `ID「${id}」が重複しています`, `${count}個の要素で同じIDが使われています`, page.htmlPath); });
    parsed.body.querySelectorAll('img').forEach((image, index) => { if (!image.hasAttribute('alt') || !image.getAttribute('alt').trim()) add('warning', '画像の代替テキストがありません', `${index + 1}番目の画像に内容の説明を追加してください`, page.htmlPath); });
    parsed.body.querySelectorAll('a').forEach(link => {
      const href = (link.getAttribute('href') || '').trim();
      if (!href || href === '#') { add('warning', 'リンク先が未設定です', (link.textContent || 'リンク').trim().slice(0, 40), page.htmlPath); return; }
    });
    let previous = 0;
    parsed.body.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(heading => { const level = Number(heading.tagName[1]); if (previous && level > previous + 1) add('warning', '見出しレベルが飛んでいます', `${heading.tagName}: ${(heading.textContent || '').trim().slice(0, 36)}`, page.htmlPath); previous = level; });
  }
  const brokenReferences = collectBrokenReferences(false), brokenTargets = new Set(brokenReferences.map(issue => issue.target));
  brokenReferences.forEach(issue => add('error', issue.kind === 'page' ? 'リンク先が見つかりません' : '参照ファイルが見つかりません', issue.target, issue.pagePath));
  findMissingAssets().filter(path => !brokenTargets.has(path)).forEach(path => add('error', '参照ファイルが見つかりません', path));
  for (const [path, asset] of assets) if (isImage(path, asset.type) && asset.data.byteLength > 3 * 1024 * 1024) add('warning', '画像ファイルが大きすぎます', `${path}・${formatSize(asset.data.byteLength)}`);
  if (dirty) add('warning', '未保存の編集があります', 'アプリ版ではCtrl+Sでフォルダーへ保存できます');
  return issues;
}

const checkDialog = document.getElementById('checkDialog');
function openCheckDialog() {
  const issues = runProjectChecks(), summary = document.getElementById('checkSummary'), list = document.getElementById('checkList');
  const errors = issues.filter(issue => issue.level === 'error').length, warnings = issues.length - errors;
  const brokenReferences = collectBrokenReferences(false), repairButton = document.getElementById('repairReferencesBtn');
  repairButton.hidden = brokenReferences.length === 0; repairButton.textContent = `参照切れを修正（${brokenReferences.length}）`;
  summary.classList.toggle('clean', issues.length === 0); summary.textContent = issues.length ? `エラー ${errors}件、確認事項 ${warnings}件があります。内容を確認してから書き出せます。` : '問題は見つかりませんでした。書き出す準備ができています。';
  document.getElementById('forceExportBtn').textContent = issues.length ? 'このままZIP書き出し' : 'ZIP書き出し';
  list.innerHTML = '';
  if (!issues.length) { const empty = document.createElement('div'); empty.className = 'check-empty'; empty.textContent = 'すべてのチェックを通過しました'; list.appendChild(empty); }
  issues.forEach(issue => {
    const row = document.createElement('div'); row.className = 'check-item'; const badge = document.createElement('span'), body = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('span');
    badge.className = `check-level${issue.level === 'error' ? ' error' : ''}`; badge.textContent = issue.level === 'error' ? 'エラー' : '確認'; title.textContent = issue.title; detail.textContent = `${issue.page ? `${issue.page}・` : ''}${issue.detail}`;
    body.append(title, detail); row.append(badge, body); list.appendChild(row);
  });
  showAppDialog(checkDialog, '#closeCheckAction'); return issues;
}
document.getElementById('checkBtn').addEventListener('click', openCheckDialog);
document.getElementById('exportBtn').addEventListener('click', openCheckDialog);
document.getElementById('forceExportBtn').addEventListener('click', () => { checkDialog.close(); exportProjectZip(); });
document.getElementById('closeCheckBtn').addEventListener('click', () => checkDialog.close());
document.getElementById('closeCheckAction').addEventListener('click', () => checkDialog.close());
document.getElementById('repairReferencesBtn').addEventListener('click', openReferenceDialog);
document.getElementById('closeReferenceBtn').addEventListener('click', () => referenceDialog.close());
document.getElementById('closeReferenceAction').addEventListener('click', () => referenceDialog.close());

function closeStartScreen() { document.getElementById('startScreen').classList.add('closed'); }
function openStartScreen() { updateRecoveryUI(); document.getElementById('startScreen').classList.remove('closed'); }

async function createFreshProject(kind) {
  const sample = kind === 'sample';
  const page = {
    filename: 'index.html', title: sample ? 'Northline' : 'New page', html: sample ? DEFAULT_HTML : BLANK_HTML,
    head: '', scripts: '', htmlPath: 'index.html', cssPath: 'styles.css', cssMode: 'external', styleKey: 'styles.css', inlineCss: ''
  };
  window.dispatchEvent(new CustomEvent('canvas-new-project'));
  clearAssetUrls(); assets = new Map(); await saveAssetsToDB(true);
  project = { ...page, css: sample ? DEFAULT_CSS : BLANK_CSS, activePagePath: page.htmlPath, homePagePath: page.htmlPath, pages: [page], styles: { 'styles.css': sample ? DEFAULT_CSS : BLANK_CSS }, responsiveRules: {} };
  history = []; historyIndex = -1; selectedPath = ''; dirty = true; commit({ sync: false, renderLayers: false }); renderDocument(''); renderAssets(); closeStartScreen();
  showToast(sample ? 'サンプルを開きました' : '空のページを作成しました');
}

function formatRecoveryTime(value) {
  try { return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch (_) { return ''; }
}

function updateRecoveryUI() {
  const rows = getRecoveries(), callout = document.getElementById('recoveryCallout');
  callout.hidden = !rows.length && !dirty;
  const latestTime = rows[0]?.savedAt;
  document.getElementById('recoveryTime').textContent = latestTime ? `${formatRecoveryTime(latestTime)} の状態` : '前回終了時の状態';
}

function restoreSnapshot(snapshot) {
  const restored = safeProject(snapshot?.project || snapshot); if (!restored) return;
  project = restored; history = [cloneProject()]; historyIndex = 0; selectedPath = ''; dirty = true;
  persist(); renderDocument(''); renderAssets(); closeStartScreen(); document.getElementById('recoveryDialog').close(); showToast('編集内容を復元しました');
}

function renderRecoveries() {
  const list = document.getElementById('recoveryList'), rows = getRecoveries(); list.innerHTML = '';
  if (!rows.length) { const empty = document.createElement('div'); empty.className = 'recovery-empty'; empty.textContent = '復元できる履歴はまだありません'; list.appendChild(empty); return; }
  rows.forEach(row => {
    const page = row.project?.pages?.find(item => item.htmlPath === row.project.activePagePath) || row.project;
    const item = document.createElement('div'); item.className = 'recovery-row';
    const info = document.createElement('div'), title = document.createElement('strong'), time = document.createElement('span'), button = document.createElement('button');
    title.textContent = page?.filename || 'HTMLプロジェクト'; time.textContent = formatRecoveryTime(row.savedAt); button.textContent = 'この状態を復元'; button.addEventListener('click', () => restoreSnapshot(row));
    info.append(title, time); item.append(info, button); list.appendChild(item);
  });
}

function applyTheme() {
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('theme-dark', dark);
}

document.getElementById('startOpenBtn').addEventListener('click', () => document.querySelector('[data-import="folder"]').click());
document.getElementById('startSampleBtn').addEventListener('click', () => createFreshProject('sample'));
document.getElementById('startBlankBtn').addEventListener('click', () => createFreshProject('blank'));
document.getElementById('restoreLatestBtn').addEventListener('click', () => {
  const latest = getRecoveries()[0]; if (latest) restoreSnapshot(latest); else closeStartScreen();
});
document.getElementById('openRecoveryBtn').addEventListener('click', () => { renderRecoveries(); showAppDialog(document.getElementById('recoveryDialog'), '#closeRecoveryAction'); window.dispatchEvent(new CustomEvent('canvas-recovery-open')); });
document.getElementById('closeRecoveryBtn').addEventListener('click', () => document.getElementById('recoveryDialog').close());
document.getElementById('closeRecoveryAction').addEventListener('click', () => document.getElementById('recoveryDialog').close());
document.getElementById('clearRecoveryBtn').addEventListener('click', () => { localStorage.removeItem(RECOVERY_KEY); renderRecoveries(); updateRecoveryUI(); showToast('復元履歴を消去しました'); });

const pageDialog = document.getElementById('pageDialog');
document.getElementById('addPageBtn').addEventListener('click', () => { document.getElementById('pageError').textContent = ''; document.getElementById('pageNameInput').value = 'about.html'; showAppDialog(pageDialog, '#pageNameInput'); setTimeout(() => document.getElementById('pageNameInput').select(), 0); });
document.getElementById('pageForm').addEventListener('submit', event => {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') { pageDialog.close(); return; }
  const raw = document.getElementById('pageNameInput').value.trim().replace(/\\/g, '/');
  const error = document.getElementById('pageError');
  if (!/\.html?$/i.test(raw) || raw.startsWith('/') || /(?:^|\/)\.\.(?:\/|$)/.test(raw) || /[<>:"|?*\x00-\x1f]/.test(raw)) { error.textContent = '安全な .html ファイル名を入力してください'; return; }
  const htmlPath = normalizePath(raw);
  if (project.pages.some(page => page.htmlPath.toLowerCase() === htmlPath.toLowerCase())) { error.textContent = '同じ名前のページがあります'; return; }
  syncFromFrame(); syncActivePageRecord();
  const page = { filename: htmlPath.split('/').pop(), title: htmlPath.split('/').pop().replace(/\.html?$/i, ''), html: BLANK_HTML, head: '', scripts: '', htmlPath, cssPath: project.cssPath, cssMode: project.cssMode, styleKey: project.styleKey, inlineCss: '' };
  project.pages.push(page); dirty = true; hydratePage(htmlPath); commit({ sync: false, renderLayers: false }); renderDocument(''); pageDialog.close(); showToast(`${page.filename} を追加しました`);
});

const pageManageDialog = document.getElementById('pageManageDialog');
function openPageManager() {
  syncFromFrame(); syncActivePageRecord(); document.getElementById('managePageError').textContent = '';
  document.getElementById('managePageHeading').textContent = project.filename; document.getElementById('managePageName').value = project.filename;
  document.getElementById('managePageTitle').value = project.title || ''; document.getElementById('homePageCheck').checked = project.htmlPath === project.homePagePath;
  document.getElementById('deletePageBtn').disabled = project.pages.length <= 1; showAppDialog(pageManageDialog, '#managePageName');
}
document.getElementById('managePageBtn').addEventListener('click', openPageManager);

function uniquePagePath(page, suffix = 'copy') {
  const folder = dirname(page.htmlPath), stem = page.filename.replace(/\.html?$/i, ''), extension = page.filename.match(/\.html?$/i)?.[0] || '.html'; let index = 1, path;
  do { path = normalizePath(`${folder}/${stem}-${suffix}${index > 1 ? `-${index}` : ''}${extension}`); index++; } while (project.pages.some(item => item.htmlPath.toLowerCase() === path.toLowerCase()));
  return path;
}

function duplicateCurrentPage() {
  syncFromFrame(); syncActivePageRecord(); const source = project.pages.find(page => page.htmlPath === project.htmlPath), htmlPath = uniquePagePath(source);
  const copy = { ...cloneValue(source), htmlPath, filename: htmlPath.split('/').pop(), title: `${source.title || source.filename} copy` };
  if (source.cssMode === 'inline') {
    copy.styleKey = `inline:${htmlPath}`; project.styles[copy.styleKey] = project.styles[source.styleKey] || '';
    if (project.responsiveRules[source.styleKey]) project.responsiveRules[copy.styleKey] = cloneValue(project.responsiveRules[source.styleKey]);
  }
  project.pages.push(copy); dirty = true; hydratePage(htmlPath); commit({ sync: false, renderLayers: false }); renderDocument(''); pageManageDialog.close(); showToast(`${copy.filename} を複製しました`);
}
document.getElementById('duplicatePageBtn').addEventListener('click', duplicateCurrentPage);

document.getElementById('deletePageBtn').addEventListener('click', () => {
  if (project.pages.length <= 1) return;
  const currentPath = project.htmlPath; if (!confirm(`${project.filename} を削除しますか？`)) return;
  const current = project.pages.find(page => page.htmlPath === currentPath); project.pages = project.pages.filter(page => page.htmlPath !== currentPath); assets.delete(currentPath);
  if (current?.cssMode === 'inline' && !project.pages.some(page => page.styleKey === current.styleKey)) { delete project.styles[current.styleKey]; delete project.responsiveRules[current.styleKey]; }
  if (project.homePagePath === currentPath) project.homePagePath = project.pages[0].htmlPath;
  dirty = true; hydratePage(project.pages[0].htmlPath); commit({ sync: false, renderLayers: false }); renderDocument(''); pageManageDialog.close(); showToast('ページを削除しました');
});

document.getElementById('pageManageForm').addEventListener('submit', event => {
  event.preventDefault(); if (event.submitter?.value === 'cancel') { pageManageDialog.close(); return; }
  const name = document.getElementById('managePageName').value.trim(), error = document.getElementById('managePageError');
  if (!/^[^\\\/:*?"<>|]+\.html?$/i.test(name)) { error.textContent = 'フォルダーを含まない安全な .html ファイル名を入力してください'; return; }
  const oldPath = project.htmlPath, newPath = normalizePath(`${dirname(oldPath)}/${name}`);
  if (newPath.toLowerCase() !== oldPath.toLowerCase() && project.pages.some(page => page.htmlPath.toLowerCase() === newPath.toLowerCase())) { error.textContent = '同じ名前のページがあります'; return; }
  syncFromFrame(); syncActivePageRecord();
  for (const page of project.pages) {
    const oldBase = page.htmlPath, newBase = oldBase === oldPath ? newPath : oldBase;
    const parsed = new DOMParser().parseFromString(`<body>${page.html}</body>`, 'text/html');
    parsed.body.querySelectorAll('a[href]').forEach(link => { if (resolveAssetPath(oldBase, link.getAttribute('href')) === oldPath) link.setAttribute('href', relativePath(newBase, newPath)); });
    page.html = parsed.body.innerHTML;
  }
  const page = project.pages.find(item => item.htmlPath === oldPath); page.htmlPath = newPath; page.filename = name; page.title = document.getElementById('managePageTitle').value.trim() || name.replace(/\.html?$/i, '');
  if (page.cssMode === 'inline') {
    const oldKey = page.styleKey, newKey = `inline:${newPath}`; project.styles[newKey] = project.styles[oldKey] || ''; delete project.styles[oldKey];
    if (project.responsiveRules[oldKey]) { project.responsiveRules[newKey] = project.responsiveRules[oldKey]; delete project.responsiveRules[oldKey]; } page.styleKey = newKey;
  }
  assets.delete(oldPath); if (project.homePagePath === oldPath || document.getElementById('homePageCheck').checked) project.homePagePath = newPath;
  dirty = true; hydratePage(newPath); commit({ sync: false, renderLayers: false }); renderDocument(''); pageManageDialog.close(); showToast('ページ情報を保存しました');
});

const settingsDialog = document.getElementById('settingsDialog');
document.getElementById('settingsBtn').addEventListener('click', () => {
  document.getElementById('themeSetting').value = settings.theme; document.getElementById('autosaveSetting').value = String(settings.autosaveDelay);
  document.getElementById('viewportSetting').value = settings.viewport; document.getElementById('zoomSetting').value = settings.zoom; showAppDialog(settingsDialog, '#themeSetting');
});

const helpDialog = document.getElementById('helpDialog');
function openHelpDialog() { showAppDialog(helpDialog, '#closeHelpAction'); }
document.getElementById('helpBtn').addEventListener('click', openHelpDialog);
document.getElementById('startGuideBtn').addEventListener('click', openHelpDialog);
document.getElementById('closeHelpBtn').addEventListener('click', () => helpDialog.close());
document.getElementById('closeHelpAction').addEventListener('click', () => helpDialog.close());
document.getElementById('settingsForm').addEventListener('submit', event => {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') { settingsDialog.close(); return; }
  settings = {
    theme: document.getElementById('themeSetting').value, autosaveDelay: Number(document.getElementById('autosaveSetting').value),
    viewport: document.getElementById('viewportSetting').value, zoom: Math.max(50, Math.min(120, Number(document.getElementById('zoomSetting').value) || 86))
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); applyTheme(); setDevice(settings.viewport === 'mobile'); setZoom(settings.zoom); settingsDialog.close(); showToast('設定を保存しました');
});
document.getElementById('resetSettingsBtn').addEventListener('click', event => {
  event.preventDefault(); settings = { ...DEFAULT_SETTINGS }; localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); applyTheme();
  document.getElementById('themeSetting').value = settings.theme; document.getElementById('autosaveSetting').value = String(settings.autosaveDelay); document.getElementById('viewportSetting').value = settings.viewport; document.getElementById('zoomSetting').value = settings.zoom;
});

window.addEventListener('canvas-native-saved', () => { dirty = false; persist(); updateRecoveryUI(); });

function nudgeSelection(dx, dy) {
  const rows = editableSelection(); if (!rows) return false;
  rows.forEach(element => moveElementBy(element, dx, dy));
  if (selected) { setControl('positionX', Number(selected.dataset.canvasX || 0)); setControl('positionY', Number(selected.dataset.canvasY || 0)); }
  updateOverlay(); scheduleCommit(); return true;
}

function handleEditorShortcut(event, editing = false, textEditing = false) {
  const mod = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
  if (mod && key === 'f') { event.preventDefault(); openSearchDialog(); return true; }
  if (mod && key === 's') { event.preventDefault(); window.dispatchEvent(new CustomEvent(event.shiftKey ? 'canvas-save-as-request' : 'canvas-save-request')); return true; }
  if (mod && ['b','i','u'].includes(key) && (textEditing || (!editing && lastTextRange))) {
    event.preventDefault();
    if (key === 'b') wrapSelectedText('strong'); else if (key === 'i') wrapSelectedText('em'); else wrapSelectedText('span', element => { element.style.textDecoration = 'underline'; });
    return true;
  }
  if (editing) return false;
  if (mod && key === 'z') { event.preventDefault(); restoreHistory(historyIndex + (event.shiftKey ? 1 : -1)); return true; }
  if (mod && key === 'c') { event.preventDefault(); copySelection(); return true; }
  if (mod && key === 'v') { event.preventDefault(); pasteSelection(); return true; }
  if (mod && key === 'a') { event.preventDefault(); const items = Array.from(frame.contentDocument?.body.children || []); if (items.length) selectMany(items); return true; }
  if (mod && key === 'd') { event.preventDefault(); document.getElementById('duplicateBtn').click(); return true; }
  if (mod && key === 'g') { event.preventDefault(); if (event.shiftKey) ungroupSelection(); else groupSelection(); return true; }
  if (mod && (event.key === ']' || event.key === '[')) { event.preventDefault(); reorderSelection(event.key === ']' ? (event.shiftKey ? 'front' : 'forward') : (event.shiftKey ? 'back' : 'backward')); return true; }
  if ((event.key === 'Delete' || event.key === 'Backspace') && selected) { event.preventDefault(); document.getElementById('deleteBtn').click(); return true; }
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key) && selected) {
    event.preventDefault(); const amount = event.shiftKey ? 10 : 1;
    return nudgeSelection(event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0, event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0);
  }
  return false;
}

document.addEventListener('keydown', event => {
  if (event.key === 'F1' || (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))) { event.preventDefault(); openHelpDialog(); return; }
  if (event.key === 'Escape') { drawer.classList.remove('open'); toggleLayers(false); toggleOutline(false); toggleAssets(false); toggleImportMenu(false); if (document.body.classList.contains('preview-mode')) { document.body.classList.remove('preview-mode'); updateOverlay(); } }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); openSearchDialog(); return; }
  const editing = Boolean(event.target?.matches?.('input,textarea,select,[contenteditable="true"]') || event.target?.matches?.('button') && event.target.id !== 'moveHandle');
  if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'e') { event.preventDefault(); document.getElementById('exportBtn').click(); return; }
  handleEditorShortcut(event, editing);
});
window.addEventListener('resize', updateOverlay);

function registerWebMCPTools() {
  const context=document.modelContext; if(!context?.registerTool)return; const controller=new AbortController();
  const tool={ name:'add_html_element', title:'HTML要素を追加', description:'現在のHTML文書に見出し、本文、ボタンのいずれかを追加します。',
    inputSchema:{type:'object',properties:{type:{type:'string',enum:['heading','text','button']},text:{type:'string',minLength:1,maxLength:300}},required:['type','text'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false}, execute(input){ if(!input||!['heading','text','button'].includes(input.type)||typeof input.text!=='string'||!input.text.trim())throw new Error('type と text を正しく指定してください'); const el=addElement(input.type,input.text.trim()); return {added:true,type:input.type,label:elementLabel(el)}; } };
  Promise.resolve(context.registerTool(tool,{signal:controller.signal})).catch(()=>{});
}

async function init() {
  applyTheme(); loadSavedProject(); await loadAssetsFromDB();
  if (!history.length) { history=[cloneProject()]; historyIndex=0; }
  renderDocument(''); renderAssets(); setDevice(settings.viewport === 'mobile'); setZoom(settings.zoom); updateHistoryButtons(); persist(); updateRecoveryUI(); registerWebMCPTools();
}
window.addEventListener('beforeunload', event => {
  saveRecoverySnapshot(true);
  if (dirty && document.documentElement.classList.contains('desktop-app')) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', clearAssetUrls);
init();
