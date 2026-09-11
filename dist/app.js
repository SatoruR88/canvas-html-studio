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

let project = {
  filename: 'product-page.html', title: 'Northline', html: DEFAULT_HTML, css: DEFAULT_CSS,
  head: '', scripts: ''
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
    css: value.css, head: value.head || '', scripts: value.scripts || ''
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

function cloneProject() { return JSON.parse(JSON.stringify(project)); }
function projectSignature(value = project) { return JSON.stringify(value); }

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, history, historyIndex })); }
  catch (_) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ project })); } catch (_) {} }
  document.getElementById('savedDot').classList.remove('pending');
  document.getElementById('saveLabel').textContent = '自動保存済み';
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

function documentSource() {
  return `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">${project.head}<style>${project.css}</style><style>[contenteditable="true"]{outline:1px dashed #6c8ce9;outline-offset:3px}</style></head><body>${project.html}</body></html>`;
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
document.addEventListener('click', event => { if (!event.target.closest('#layersPopover') && !event.target.closest('#layersBtn') && !event.target.closest('#focusDomBtn')) toggleLayers(false); });

async function readFiles(fileList) {
  const files = Array.from(fileList || []); const htmlFile = files.find(file => /\.html?$/i.test(file.name) || file.type === 'text/html');
  const cssFiles = files.filter(file => /\.css$/i.test(file.name) || file.type === 'text/css');
  if (!htmlFile && !cssFiles.length) { showToast('HTMLまたはCSSファイルを選んでください'); return; }
  if (htmlFile) {
    const source = await htmlFile.text(); const parsed = new DOMParser().parseFromString(source, 'text/html');
    const styles = Array.from(parsed.querySelectorAll('style')).map(el => el.textContent).join('\n\n'); parsed.querySelectorAll('style').forEach(el => el.remove());
    const scripts = Array.from(parsed.querySelectorAll('script')).map(el => el.outerHTML).join('\n'); parsed.querySelectorAll('script').forEach(el => el.remove());
    const title = parsed.querySelector('title')?.textContent || htmlFile.name.replace(/\.html?$/i, ''); parsed.querySelectorAll('title').forEach(el => el.remove());
    parsed.querySelectorAll('meta[charset],meta[name="viewport"],base').forEach(el => el.remove());
    project = { filename: htmlFile.name, title, html: parsed.body.innerHTML, css: styles, head: parsed.head.innerHTML, scripts };
  }
  if (cssFiles.length) {
    const css = (await Promise.all(cssFiles.map(file => file.text()))).join('\n\n'); project.css = [project.css, css].filter(Boolean).join('\n\n');
  }
  history = []; historyIndex = -1; selectedPath = '';
  commit({ sync: false, renderLayers: false }); renderDocument('');
  showToast(`${files.length}個のファイルを読み込みました`);
}
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', event => { readFiles(event.target.files); event.target.value = ''; });
['dragenter','dragover'].forEach(type => stage.addEventListener(type, event => { event.preventDefault(); stage.classList.add('dragging'); }));
['dragleave','drop'].forEach(type => stage.addEventListener(type, event => { event.preventDefault(); if (type === 'drop') readFiles(event.dataTransfer.files); stage.classList.remove('dragging'); }));

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
  return `<!doctype html>\n<html lang="ja">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${escapeHTML(project.title)}</title>\n  ${project.head.trim()}\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n${parsed.body.innerHTML.trim()}\n${project.scripts.trim()}\n</body>\n</html>`;
}

const crcTable = (() => { const table = new Uint32Array(256); for (let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; table[n]=c>>>0; } return table; })();
function crc32(bytes) { let c=0xffffffff; for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
function write16(view, offset, value){ view.setUint16(offset,value,true); }
function write32(view, offset, value){ view.setUint32(offset,value>>>0,true); }
function createZip(files) {
  const encoder = new TextEncoder(); const localParts=[]; const centralParts=[]; let offset=0;
  files.forEach(file => {
    const name=encoder.encode(file.name), data=encoder.encode(file.content), crc=crc32(data);
    const local=new Uint8Array(30+name.length); const lv=new DataView(local.buffer); write32(lv,0,0x04034b50); write16(lv,4,20); write16(lv,6,0x0800); write16(lv,8,0); write32(lv,14,crc); write32(lv,18,data.length); write32(lv,22,data.length); write16(lv,26,name.length); local.set(name,30); localParts.push(local,data);
    const central=new Uint8Array(46+name.length); const cv=new DataView(central.buffer); write32(cv,0,0x02014b50); write16(cv,4,20); write16(cv,6,20); write16(cv,8,0x0800); write32(cv,16,crc); write32(cv,20,data.length); write32(cv,24,data.length); write16(cv,28,name.length); write32(cv,42,offset); central.set(name,46); centralParts.push(central); offset+=local.length+data.length;
  });
  const centralSize=centralParts.reduce((sum,p)=>sum+p.length,0); const end=new Uint8Array(22); const ev=new DataView(end.buffer); write32(ev,0,0x06054b50); write16(ev,8,files.length); write16(ev,10,files.length); write32(ev,12,centralSize); write32(ev,16,offset);
  return new Blob([...localParts,...centralParts,end],{type:'application/zip'});
}
document.getElementById('exportBtn').addEventListener('click', () => {
  syncFromFrame(); const zip=createZip([{name:'index.html',content:outputHTML()},{name:'styles.css',content:project.css}]);
  const url=URL.createObjectURL(zip), link=document.createElement('a'); const base=project.filename.replace(/\.html?$/i,'') || 'canvas-page'; link.href=url; link.download=`${base}-edited.zip`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); showToast('HTMLとCSSをZIPに書き出しました');
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { drawer.classList.remove('open'); toggleLayers(false); if (document.body.classList.contains('preview-mode')) { document.body.classList.remove('preview-mode'); updateOverlay(); } }
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

loadSavedProject();
if (!history.length) { history=[cloneProject()]; historyIndex=0; }
renderDocument(''); setZoom(86); updateHistoryButtons(); persist(); registerWebMCPTools();
