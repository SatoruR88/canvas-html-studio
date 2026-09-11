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
const ASSET_DB = 'canvas-html-studio-assets';
const ASSET_STORE = 'files';
const frame = document.getElementById('canvasFrame');
const pageWrap = document.getElementById('pageWrap');
const pageSurface = document.getElementById('pageSurface');
const overlay = document.getElementById('selectionOverlay');
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

let project = {
  filename: 'product-page.html', title: 'Northline', html: DEFAULT_HTML, css: DEFAULT_CSS,
  head: '', scripts: '', htmlPath: 'index.html', cssPath: 'styles.css', cssMode: 'external'
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1900);
}

function safeProject(value) {
  return value && typeof value.html === 'string' && typeof value.css === 'string' ? {
    filename: value.filename || 'document.html', title: value.title || 'Untitled', html: value.html,
    css: value.css, head: value.head || '', scripts: value.scripts || '',
    htmlPath: value.htmlPath || value.filename || 'index.html', cssPath: value.cssPath ?? 'styles.css', cssMode: value.cssMode || 'external'
  } : null;
}

function loadSavedProject() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const restored = safeProject(saved?.project);
    if (!restored) return;
    project = restored;
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
  return normalizePath(`${dirname(baseFile)}/${reference.split(/[?#]/)[0]}`);
}
function relativePath(fromFile, toFile) {
  const from = dirname(fromFile).split('/').filter(Boolean), to = normalizePath(toFile).split('/');
  while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
  return [...from.map(() => '..'), ...to].join('/') || './';
}

function detectMime(path) {
  const ext = normalizePath(path).split('.').pop().toLowerCase();
  return ({ html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg' })[ext] || 'application/octet-stream';
}

function decodeText(asset) { return new TextDecoder().decode(asset.data); }
function isImage(path, type = '') { return type.startsWith('image/') || /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i.test(path); }

function cloneProject() { return JSON.parse(JSON.stringify(project)); }
function projectSignature(value = project) { return JSON.stringify(value); }

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, history, historyIndex })); }
  catch (_) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ project })); } catch (_) {} }
  document.getElementById('savedDot').classList.remove('pending');
  document.getElementById('saveLabel').textContent = '端末に保存済み';
}

function markPending() {
  document.getElementById('savedDot').classList.add('pending');
  document.getElementById('saveLabel').textContent = '保存中…';
}

function commit(options = {}) {
  clearTimeout(commitTimer);
  if (options.sync !== false) syncFromFrame();
  const signature = projectSignature();
  if (!history.length || projectSignature(history[historyIndex]) !== signature) {
    history = history.slice(0, historyIndex + 1);
    history.push(cloneProject());
    if (history.length > 30) history.shift();
    historyIndex = history.length - 1;
  }
  persist();
  updateHistoryButtons();
  if (options.renderLayers !== false) renderLayers();
}

function scheduleCommit() {
  markPending();
  clearTimeout(commitTimer);
  commitTimer = setTimeout(() => commit(), 350);
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
  const chunks = [rewriteCssUrls(project.css, project.cssPath || project.htmlPath)];
  const parsed = new DOMParser().parseFromString(`<head>${project.head}</head>`, 'text/html');
  parsed.head.querySelectorAll('link[rel~="stylesheet"][href]').forEach(link => {
    const path = resolveAssetPath(project.htmlPath, link.getAttribute('href'));
    if (path && path !== project.cssPath && assets.has(path)) chunks.push(rewriteCssUrls(decodeText(assets.get(path)), path));
  });
  return chunks.join('\n\n');
}

function documentSource() {
  return `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">${previewHead()}<style>${previewCssBundle()}</style><style>[contenteditable="true"]{outline:1px dashed #6c8ce9;outline-offset:3px}</style></head><body>${previewHTML()}</body></html>`;
}

function renderDocument(path = selectedPath) {
  selected = null;
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
    const target = resolvePath(selectedPath) || firstSelectable();
    if (target) selectElement(target);
    resizeFrameHeight();
    renderLayers();
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
  return target.closest('body *');
}

function onFrameClick(event) {
  const target = selectableFrom(event.target);
  if (!target) return;
  if (target.closest('a')) event.preventDefault();
  selectElement(target);
}

function onFrameDoubleClick(event) {
  const target = selectableFrom(event.target);
  if (!target || ['IMG','HR','SECTION','DIV','HEADER','MAIN','NAV'].includes(target.tagName)) return;
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
  scheduleCommit();
}

function onFrameBlur(event) {
  if (event.target?.isContentEditable) {
    event.target.removeAttribute('contenteditable');
    commit();
  }
}

function onFrameKeydown(event) {
  if (event.key === 'Escape' && event.target?.isContentEditable) {
    event.target.blur();
    frame.focus();
  }
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
  clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  [['src','data-canvas-original-src'],['poster','data-canvas-original-poster'],['srcset','data-canvas-original-srcset']].forEach(([attr, marker]) => {
    clone.querySelectorAll(`[${marker}]`).forEach(el => { el.setAttribute(attr, el.getAttribute(marker)); el.removeAttribute(marker); });
  });
  project.html = clone.innerHTML;
}

function elementLabel(element) {
  const custom = element.dataset.label || element.getAttribute('aria-label');
  if (custom) return custom;
  const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 28) : element.tagName.toLowerCase();
}

function selectElement(element) {
  if (!element?.isConnected) return;
  selected = element;
  selectedPath = pathOf(element);
  const style = frame.contentWindow.getComputedStyle(element);
  document.getElementById('selectedTag').textContent = element.tagName;
  document.getElementById('selectedName').textContent = elementLabel(element);
  document.getElementById('moveHandle').textContent = `${element.tagName} · ${elementLabel(element)}`;
  setControl('fontFamily', style.fontFamily);
  setControl('fontSize', Math.round(parseFloat(style.fontSize) || 16));
  setControl('fontWeight', nearestWeight(style.fontWeight));
  setControl('lineHeight', style.lineHeight === 'normal' ? 1.2 : round((parseFloat(style.lineHeight) || 19) / (parseFloat(style.fontSize) || 16), 2));
  setControl('letterSpacing', style.letterSpacing === 'normal' ? 0 : round(parseFloat(style.letterSpacing) || 0, 1));
  setControl('marginTop', Math.round(parseFloat(style.marginTop) || 0));
  setControl('marginBottom', Math.round(parseFloat(style.marginBottom) || 0));
  const rect = element.getBoundingClientRect();
  setControl('elementWidth', Math.round(rect.width)); setControl('elementHeight', Math.round(rect.height));
  setControl('positionX', Number(element.dataset.canvasX || 0)); setControl('positionY', Number(element.dataset.canvasY || 0));
  const color = rgbToHex(style.color); setControl('textColor', color); setControl('colorHex', color.toUpperCase());
  document.querySelectorAll('[data-align]').forEach(btn => btn.classList.toggle('active', btn.dataset.align === style.textAlign));
  updateOverlay(); renderLayers();
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
function rgbToHex(value) {
  const values = value.match(/[\d.]+/g);
  if (!values) return '#151823';
  return '#' + values.slice(0,3).map(x => Math.max(0,Math.min(255,Math.round(Number(x)))).toString(16).padStart(2,'0')).join('');
}

function updateOverlay() {
  if (!selected?.isConnected || document.body.classList.contains('preview-mode')) { overlay.classList.remove('visible'); return; }
  const rect = selected.getBoundingClientRect();
  overlay.style.left = `${rect.left}px`; overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${Math.max(1, rect.width)}px`; overlay.style.height = `${Math.max(1, rect.height)}px`;
  overlay.classList.add('visible');
}

function updateFileLabels() {
  document.getElementById('fileName').textContent = project.filename;
  document.getElementById('crumbName').textContent = project.filename;
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
  if (!selected) return; selected.style.textAlign = button.dataset.align;
  document.querySelectorAll('[data-align]').forEach(x => x.classList.toggle('active', x === button));
  updateOverlay(); commit();
}));

const styleControls = {
  fontFamily: ['fontFamily',''], fontSize: ['fontSize','px'], fontWeight: ['fontWeight',''], lineHeight: ['lineHeight',''],
  letterSpacing: ['letterSpacing','px'], marginTop: ['marginTop','px'], marginBottom: ['marginBottom','px'],
  elementWidth: ['width','px'], elementHeight: ['height','px']
};
Object.entries(styleControls).forEach(([id,[prop,unit]]) => {
  const control = document.getElementById(id);
  control.addEventListener('input', event => { if (!selected || event.target.value === '') return; selected.style[prop] = event.target.value + unit; updateOverlay(); resizeFrameHeight(); scheduleCommit(); });
  control.addEventListener('change', () => commit());
});

['positionX','positionY'].forEach(id => document.getElementById(id).addEventListener('input', () => {
  if (!selected) return;
  const x = Number(document.getElementById('positionX').value || 0), y = Number(document.getElementById('positionY').value || 0);
  selected.dataset.canvasX = x; selected.dataset.canvasY = y; selected.style.transform = `translate(${x}px, ${y}px)`;
  updateOverlay(); scheduleCommit();
}));

document.getElementById('textColor').addEventListener('input', event => {
  if (!selected) return; selected.style.color = event.target.value;
  document.getElementById('colorHex').value = event.target.value.toUpperCase(); updateOverlay(); scheduleCommit();
});
document.getElementById('colorHex').addEventListener('change', event => {
  if (!selected || !/^#[0-9a-f]{6}$/i.test(event.target.value)) return;
  selected.style.color = event.target.value; document.getElementById('textColor').value = event.target.value; commit();
});

document.getElementById('duplicateBtn').addEventListener('click', () => {
  if (!selected) return; const clone = selected.cloneNode(true); selected.after(clone); selectElement(clone); commit(); resizeFrameHeight(); showToast('要素を複製しました');
});
document.getElementById('deleteBtn').addEventListener('click', () => {
  if (!selected) return; const next = selected.nextElementSibling || selected.previousElementSibling || selected.parentElement;
  if (selected === frame.contentDocument.body) return; selected.remove(); selected = null;
  if (next && next !== frame.contentDocument.body) selectElement(next); else overlay.classList.remove('visible');
  commit(); resizeFrameHeight(); showToast('要素を削除しました');
});
document.getElementById('resetType').addEventListener('click', () => {
  if (!selected) return; ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing'].forEach(prop => selected.style[prop] = ''); selectElement(selected); commit(); showToast('文字設定をリセットしました');
});
document.getElementById('resetPosition').addEventListener('click', () => {
  if (!selected) return; ['width','height','transform'].forEach(prop => selected.style[prop] = ''); delete selected.dataset.canvasX; delete selected.dataset.canvasY; selectElement(selected); commit(); resizeFrameHeight(); showToast('位置とサイズを自動に戻しました');
});

function startPointerTransform(event, mode) {
  if (!selected) return;
  event.preventDefault();
  const startX = event.clientX, startY = event.clientY, rect = selected.getBoundingClientRect();
  const startMoveX = Number(selected.dataset.canvasX || 0), startMoveY = Number(selected.dataset.canvasY || 0);
  const scale = zoom / 100;
  const onMove = moveEvent => {
    const dx = (moveEvent.clientX - startX) / scale, dy = (moveEvent.clientY - startY) / scale;
    if (mode === 'move') {
      const x = Math.round(startMoveX + dx), y = Math.round(startMoveY + dy);
      selected.dataset.canvasX = x; selected.dataset.canvasY = y; selected.style.transform = `translate(${x}px, ${y}px)`;
      setControl('positionX', x); setControl('positionY', y);
    } else {
      const west = mode.includes('w'), north = mode.includes('n');
      selected.style.width = `${Math.max(8, Math.round(rect.width + (west ? -dx : dx)))}px`;
      selected.style.height = `${Math.max(8, Math.round(rect.height + (north ? -dy : dy)))}px`;
      if (west || north) {
        const x = Math.round(startMoveX + (west ? dx : 0)), y = Math.round(startMoveY + (north ? dy : 0));
        selected.dataset.canvasX = x; selected.dataset.canvasY = y; selected.style.transform = `translate(${x}px, ${y}px)`;
      }
      setControl('elementWidth', Math.round(selected.getBoundingClientRect().width)); setControl('elementHeight', Math.round(selected.getBoundingClientRect().height));
    }
    updateOverlay(); markPending();
  };
  const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); commit(); resizeFrameHeight(); };
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
      const path = pathOf(element); const row = document.createElement('button'); row.className = `layer-row${element === selected ? ' active' : ''}`;
      row.style.paddingLeft = `${8 + depth * 12}px`; row.draggable = true; row.dataset.path = path;
      row.innerHTML = `<span class="caret">${element.children.length ? '›' : '·'}</span><span>${escapeHTML(elementLabel(element))}</span><span class="tag">${element.tagName}</span>`;
      row.addEventListener('click', () => { selectElement(element); element.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
      row.addEventListener('dragstart', event => { dragPath = path; event.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragover', event => { event.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', event => {
        event.preventDefault(); row.classList.remove('drag-over'); const source = resolvePath(dragPath), target = resolvePath(path);
        if (!source || !target || source === target || source.contains(target)) return;
        target.before(source); selectElement(source); commit(); resizeFrameHeight(); showToast('DOMの順序を変更しました');
      });
      list.appendChild(row); walk(element, depth + 1);
    });
  }
  walk(body, 0);
}
function escapeHTML(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
const layersPopover = document.getElementById('layersPopover');
function toggleLayers(force) { const open = force ?? !layersPopover.classList.contains('open'); if (open) renderLayers(); layersPopover.classList.toggle('open', open); layersPopover.setAttribute('aria-hidden', String(!open)); }
document.getElementById('layersBtn').addEventListener('click', event => { event.stopPropagation(); toggleLayers(); });
document.getElementById('focusDomBtn').addEventListener('click', event => { event.stopPropagation(); toggleLayers(true); });
document.addEventListener('click', event => {
  if (!event.target.closest('#layersPopover') && !event.target.closest('#layersBtn') && !event.target.closest('#focusDomBtn')) toggleLayers(false);
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
    const path = normalizePath(new TextDecoder((flags & 0x0800) ? 'utf-8' : 'utf-8').decode(bytes.slice(cursor + 46, cursor + 46 + nameLength)));
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

async function importEntries(entries) {
  if (!entries.length) throw new Error('読み込めるファイルがありません');
  const htmlPath = chooseHtmlPath(entries); if (!htmlPath) throw new Error('index.html またはHTMLファイルが見つかりません');
  clearAssetUrls(); assets = new Map(entries.map(entry => [normalizePath(entry.path), { data: entry.data, type: entry.type || detectMime(entry.path) }]));
  const source = decodeText(assets.get(htmlPath)); const parsed = new DOMParser().parseFromString(source, 'text/html');
  const inlineStyles = Array.from(parsed.querySelectorAll('style')).map(el => el.textContent).join('\n\n'); parsed.querySelectorAll('style').forEach(el => el.remove());
  const scripts = Array.from(parsed.body.querySelectorAll('script')).map(el => el.outerHTML).join('\n'); parsed.body.querySelectorAll('script').forEach(el => el.remove());
  const title = parsed.querySelector('title')?.textContent || htmlPath.split('/').pop().replace(/\.html?$/i, ''); parsed.querySelectorAll('title').forEach(el => el.remove());
  parsed.querySelectorAll('meta[charset],meta[name="viewport"],base').forEach(el => el.remove());
  const styleLinks = Array.from(parsed.head.querySelectorAll('link[rel~="stylesheet"][href]'));
  let cssPath = null, css = '';
  for (const link of styleLinks) {
    const path = resolveAssetPath(htmlPath, link.getAttribute('href')); if (!path || !assets.has(path)) continue;
    if (!cssPath) { cssPath = path; css = decodeText(assets.get(path)); }
  }
  if (!cssPath) {
    cssPath = entries.map(entry => entry.path).find(path => /\.css$/i.test(path)) || normalizePath(`${dirname(htmlPath)}/styles.css`);
    if (assets.has(cssPath)) css = decodeText(assets.get(cssPath));
    if (!styleLinks.length) { const link = parsed.createElement('link'); link.rel = 'stylesheet'; link.href = relativePath(htmlPath, cssPath); parsed.head.appendChild(link); }
  }
  project = { filename: htmlPath.split('/').pop(), title, html: parsed.body.innerHTML, css: [css, inlineStyles].filter(Boolean).join('\n\n'), head: parsed.head.innerHTML, scripts, htmlPath, cssPath, cssMode: 'external' };
  history = []; historyIndex = -1; selectedPath = ''; commit({ sync: false, renderLayers: false });
  await saveAssetsToDB(true); renderDocument(''); renderAssets();
  const missing = findMissingAssets(); showToast(`${entries.length}ファイルを読み込みました${missing.length ? `・参照切れ ${missing.length}件` : ''}`);
}

async function readFiles(fileList) {
  try { await importEntries(await entriesFromFiles(fileList)); } catch (error) { showToast(error.message || 'ファイルを読み込めませんでした'); }
}

const importMenu = document.getElementById('importMenu');
function toggleImportMenu(force) { const open = force ?? !importMenu.classList.contains('open'); importMenu.classList.toggle('open', open); importMenu.setAttribute('aria-hidden', String(!open)); }
document.getElementById('importBtn').addEventListener('click', event => { event.stopPropagation(); toggleImportMenu(); });
document.querySelector('[data-import="files"]').addEventListener('click', () => { toggleImportMenu(false); document.getElementById('fileInput').click(); });
document.querySelector('[data-import="folder"]').addEventListener('click', () => { toggleImportMenu(false); document.getElementById('folderInput').click(); });
document.getElementById('fileInput').addEventListener('change', event => { readFiles(event.target.files); event.target.value = ''; });
document.getElementById('folderInput').addEventListener('change', event => { readFiles(event.target.files); event.target.value = ''; });
['dragenter','dragover'].forEach(type => stage.addEventListener(type, event => { event.preventDefault(); stage.classList.add('dragging'); }));
stage.addEventListener('dragleave', event => { event.preventDefault(); if (!stage.contains(event.relatedTarget)) stage.classList.remove('dragging'); });
stage.addEventListener('drop', async event => { event.preventDefault(); stage.classList.remove('dragging'); try { await importEntries(await entriesFromDrop(event.dataTransfer)); } catch (error) { showToast(error.message || 'ファイルを読み込めませんでした'); } });

function findMissingAssets() {
  const missing = new Set(); const parsed = new DOMParser().parseFromString(`<html><head>${project.head}</head><body>${project.html}</body></html>`, 'text/html');
  const checks = [
    ['img[src],source[src],video[src],audio[src],script[src],iframe[src]', 'src'],
    ['video[poster]', 'poster'], ['link[href]', 'href']
  ];
  for (const [selector, attr] of checks) parsed.querySelectorAll(selector).forEach(element => {
    const ref = element.getAttribute(attr), path = resolveAssetPath(project.htmlPath, ref); if (path && !assets.has(path)) missing.add(path);
  });
  parsed.querySelectorAll('[srcset]').forEach(element => element.getAttribute('srcset').split(',').forEach(item => {
    const path = resolveAssetPath(project.htmlPath, item.trim().split(/\s+/)[0]); if (path && !assets.has(path)) missing.add(path);
  }));
  const scanCss = (css, base) => css.replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi, (match, quote, ref) => {
    const path = resolveAssetPath(base, ref.trim()); if (path && !assets.has(path)) missing.add(path); return match;
  });
  scanCss(project.css, project.cssPath || project.htmlPath);
  for (const [path, asset] of assets) if (/\.css$/i.test(path) && path !== project.cssPath) scanCss(decodeText(asset), path);
  return Array.from(missing).sort();
}

function formatSize(size) { if (size < 1024) return `${size} B`; if (size < 1048576) return `${Math.round(size/1024)} KB`; return `${(size/1048576).toFixed(1)} MB`; }

function replaceSelectedWithAsset(path) {
  if (!selected || !['IMG','SOURCE','VIDEO'].includes(selected.tagName)) { showToast('先にキャンバス上の画像を選択してください'); return; }
  const relative = relativePath(project.htmlPath, path), url = assetUrl(path);
  if (selected.tagName === 'VIDEO') { selected.dataset.canvasOriginalPoster = relative; selected.setAttribute('poster', url); }
  else { selected.dataset.canvasOriginalSrc = relative; selected.setAttribute('src', url); }
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
function toggleAssets(force) { const open = force ?? !assetsPopover.classList.contains('open'); if (open) { renderAssets(); toggleLayers(false); } assetsPopover.classList.toggle('open',open); assetsPopover.setAttribute('aria-hidden',String(!open)); }
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
  clearTimeout(commitTimer); historyIndex = index; project = cloneValue(history[index]); selectedPath = ''; renderDocument(''); persist(); updateHistoryButtons(); return true;
}
function cloneValue(value) { return JSON.parse(JSON.stringify(value)); }
document.getElementById('undoBtn').addEventListener('click', () => { if (!restoreHistory(historyIndex - 1)) showToast('これ以上戻せません'); });
document.getElementById('redoBtn').addEventListener('click', () => { if (!restoreHistory(historyIndex + 1)) showToast('これ以上進めません'); });

document.getElementById('previewBtn').addEventListener('click', () => { document.body.classList.toggle('preview-mode'); overlay.classList.remove('visible'); if (!document.body.classList.contains('preview-mode')) updateOverlay(); });

function outputHTML() {
  const parsed = new DOMParser().parseFromString(`<body>${project.html}</body>`, 'text/html');
  parsed.body.querySelectorAll('[contenteditable],[data-canvas-x],[data-canvas-y]').forEach(el => { el.removeAttribute('contenteditable'); el.removeAttribute('data-canvas-x'); el.removeAttribute('data-canvas-y'); });
  const head = new DOMParser().parseFromString(`<head>${project.head}</head>`, 'text/html').head;
  if (project.cssMode === 'external') {
    const linked = Array.from(head.querySelectorAll('link[rel~="stylesheet"][href]')).some(link => resolveAssetPath(project.htmlPath, link.getAttribute('href')) === project.cssPath);
    if (!linked) { const link = head.ownerDocument.createElement('link'); link.rel = 'stylesheet'; link.href = relativePath(project.htmlPath, project.cssPath || 'styles.css'); head.appendChild(link); }
  } else { const style = head.ownerDocument.createElement('style'); style.textContent = project.css; head.appendChild(style); }
  return `<!doctype html>\n<html lang="ja">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${escapeHTML(project.title)}</title>\n  ${head.innerHTML.trim()}\n</head>\n<body>\n${parsed.body.innerHTML.trim()}\n${project.scripts.trim()}\n</body>\n</html>`;
}

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
document.getElementById('exportBtn').addEventListener('click', () => {
  syncFromFrame(); const outputFiles = new Map(Array.from(assets.entries()).map(([name,asset]) => [name, { name, data: asset.data }]));
  const htmlPath = project.htmlPath || project.filename || 'index.html', cssPath = project.cssPath || normalizePath(`${dirname(htmlPath)}/styles.css`);
  outputFiles.set(htmlPath, { name: htmlPath, content: outputHTML() });
  if (project.cssMode === 'external') outputFiles.set(cssPath, { name: cssPath, content: project.css });
  const zip=createZip(Array.from(outputFiles.values()));
  const url=URL.createObjectURL(zip), link=document.createElement('a'); const base=project.filename.replace(/\.html?$/i,'') || 'canvas-page'; link.href=url; link.download=`${base}-complete.zip`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); showToast(`${outputFiles.size}ファイルをZIPに書き出しました`);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { drawer.classList.remove('open'); toggleLayers(false); toggleAssets(false); toggleImportMenu(false); if (document.body.classList.contains('preview-mode')) { document.body.classList.remove('preview-mode'); updateOverlay(); } }
  const mod=event.ctrlKey||event.metaKey; if(mod&&event.key.toLowerCase()==='z'){ event.preventDefault(); restoreHistory(historyIndex+(event.shiftKey?1:-1)); }
  if(mod&&event.key.toLowerCase()==='e'){ event.preventDefault(); document.getElementById('exportBtn').click(); }
  if((event.key==='Delete'||event.key==='Backspace')&&!event.target.matches('input,textarea,[contenteditable="true"]')&&selected){ event.preventDefault(); document.getElementById('deleteBtn').click(); }
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
  loadSavedProject(); await loadAssetsFromDB();
  if (!history.length) { history=[cloneProject()]; historyIndex=0; }
  renderDocument(''); renderAssets(); setZoom(86); updateHistoryButtons(); persist(); registerWebMCPTools();
}
window.addEventListener('beforeunload', clearAssetUrls);
init();
