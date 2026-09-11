const page = document.getElementById('canvasPage');
const toast = document.getElementById('toast');
let selected = document.querySelector('.editable-block.selected');
let zoom = 86;
let history = [];
let historyIndex = -1;
let inputTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function selectBlock(element) {
  if (!element) return;
  document.querySelectorAll('.editable-block.selected').forEach(el => el.classList.remove('selected'));
  selected = element;
  selected.classList.add('selected');
  document.getElementById('selectedName').textContent = selected.dataset.label || '要素';
  const style = getComputedStyle(selected);
  document.getElementById('fontSize').value = Math.round(parseFloat(style.fontSize));
  document.getElementById('fontWeight').value = ['400','500','600','700'].includes(style.fontWeight) ? style.fontWeight : '400';
  document.getElementById('lineHeight').value = style.lineHeight === 'normal' ? 1.2 : (parseFloat(style.lineHeight) / parseFloat(style.fontSize)).toFixed(2);
  document.getElementById('letterSpacing').value = style.letterSpacing === 'normal' ? 0 : Math.round(parseFloat(style.letterSpacing));
  document.getElementById('marginTop').value = Math.round(parseFloat(style.marginTop));
  document.getElementById('marginBottom').value = Math.round(parseFloat(style.marginBottom));
  const color = rgbToHex(style.color);
  document.getElementById('textColor').value = color;
  document.getElementById('colorHex').value = color.toUpperCase();
  renderLayers();
}

function snapshot(announce = false) {
  const state = page.innerHTML;
  if (history[historyIndex] === state) return;
  history = history.slice(0, historyIndex + 1);
  history.push(state);
  if (history.length > 40) history.shift();
  historyIndex = history.length - 1;
  try { localStorage.setItem('canvas-html-studio-draft', state); } catch (_) {}
  if (announce) showToast('変更を保存しました');
}

function restoreHistory(index) {
  if (index < 0 || index >= history.length) return false;
  historyIndex = index;
  page.innerHTML = history[historyIndex];
  selected = page.querySelector('.editable-block.selected') || page.querySelector('.editable-block');
  selectBlock(selected);
  return true;
}

function rgbToHex(value) {
  const values = value.match(/\d+/g);
  if (!values) return '#151823';
  return '#' + values.slice(0, 3).map(x => Number(x).toString(16).padStart(2, '0')).join('');
}

page.addEventListener('click', event => {
  const block = event.target.closest('.editable-block');
  if (block) selectBlock(block);
});
page.addEventListener('input', () => {
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => snapshot(), 320);
});

document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => {
  const type = button.dataset.add;
  const element = document.createElement(type === 'heading' ? 'h2' : type === 'button' ? 'a' : type === 'divider' ? 'hr' : 'p');
  element.className = type === 'button' ? 'cta editable-block' : 'editable-block';
  element.dataset.type = type;
  element.dataset.label = ({ heading: '新しい見出し', text: '新しいテキスト', button: '新しいボタン', divider: '区切り線' })[type];
  if (type !== 'divider') {
    element.contentEditable = 'true';
    element.textContent = ({ heading: '新しい見出し', text: 'ここにテキストを入力します。', button: '詳しく見る →' })[type];
  }
  element.style.marginTop = '24px';
  element.style.marginBottom = '16px';
  page.querySelector('.hero-block').appendChild(element);
  selectBlock(element);
  element.focus();
  snapshot();
  showToast(`${element.dataset.label}を追加しました`);
}));

document.querySelectorAll('[data-align]').forEach(button => button.addEventListener('click', () => {
  if (!selected) return;
  selected.style.textAlign = button.dataset.align;
  document.querySelectorAll('[data-align]').forEach(x => x.classList.toggle('active', x === button));
  snapshot();
}));

const controls = {
  fontFamily: 'fontFamily', fontSize: 'fontSize', fontWeight: 'fontWeight', lineHeight: 'lineHeight',
  letterSpacing: 'letterSpacing', marginTop: 'marginTop', marginBottom: 'marginBottom'
};

Object.entries(controls).forEach(([id, prop]) => document.getElementById(id).addEventListener('input', event => {
  if (!selected) return;
  const unit = ['fontSize', 'letterSpacing', 'marginTop', 'marginBottom'].includes(prop) ? 'px' : '';
  selected.style[prop] = event.target.value + unit;
  snapshot();
}));

document.getElementById('textColor').addEventListener('input', event => {
  if (!selected) return;
  selected.style.color = event.target.value;
  document.getElementById('colorHex').value = event.target.value.toUpperCase();
  snapshot();
});
document.getElementById('colorHex').addEventListener('change', event => {
  if (!selected || !/^#[0-9a-f]{6}$/i.test(event.target.value)) return;
  selected.style.color = event.target.value;
  document.getElementById('textColor').value = event.target.value;
  snapshot();
});

document.getElementById('duplicateBtn').addEventListener('click', () => {
  if (!selected) return;
  const clone = selected.cloneNode(true);
  selected.after(clone);
  selectBlock(clone);
  snapshot();
  showToast('要素を複製しました');
});
document.getElementById('deleteBtn').addEventListener('click', () => {
  if (!selected || selected.dataset.type === 'header') return showToast('ヘッダーは削除できません');
  const next = selected.previousElementSibling?.closest('.editable-block') || page.querySelector('.editable-block');
  selected.remove();
  selectBlock(next);
  snapshot();
  showToast('要素を削除しました');
});

function setZoom(value) {
  zoom = Math.max(50, Math.min(120, value));
  page.style.transform = `scale(${zoom / 100})`;
  page.style.marginBottom = `${page.offsetHeight * (zoom / 100 - 1)}px`;
  document.getElementById('zoomLabel').textContent = `${zoom}%`;
}
document.getElementById('zoomOut').addEventListener('click', () => setZoom(zoom - 10));
document.getElementById('zoomIn').addEventListener('click', () => setZoom(zoom + 10));
document.getElementById('desktopBtn').addEventListener('click', () => { page.classList.remove('mobile-page'); showToast('デスクトップ表示'); });
document.getElementById('mobileBtn').addEventListener('click', () => { page.classList.add('mobile-page'); showToast('モバイル表示'); });

const drawer = document.getElementById('codeDrawer');
const codeEditor = document.getElementById('codeEditor');
function cleanCanvasHTML() {
  const clone = page.cloneNode(true);
  clone.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
  clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  clone.querySelector('#selectionBox')?.remove();
  clone.querySelector('.page-badge')?.remove();
  clone.removeAttribute('style');
  clone.removeAttribute('id');
  clone.classList.remove('page', 'mobile-page');
  return clone.innerHTML.trim();
}
document.getElementById('codeBtn').addEventListener('click', () => {
  codeEditor.value = cleanCanvasHTML();
  drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
});
document.getElementById('closeCode').addEventListener('click', () => { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); });
document.getElementById('applyCode').addEventListener('click', () => {
  page.innerHTML = `<div class="page-badge">PAGE 01</div>${codeEditor.value}<div class="selection-box" id="selectionBox" aria-hidden="true"></div>`;
  page.querySelectorAll('h1,h2,h3,p,a,.feature,.doc-header').forEach(el => {
    el.classList.add('editable-block'); el.contentEditable = 'true';
    if (!el.dataset.label) el.dataset.label = el.tagName;
  });
  selectBlock(page.querySelector('.editable-block'));
  snapshot();
  drawer.classList.remove('open');
  showToast('HTMLコードを反映しました');
});

document.getElementById('previewBtn').addEventListener('click', () => {
  document.body.classList.toggle('preview-mode');
  document.querySelectorAll('.editable-block.selected').forEach(el => el.classList.remove('selected'));
  showToast('プレビューを切り替えました');
});
document.getElementById('exportBtn').addEventListener('click', () => {
  const output = `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>Exported Page</title>\n<style>${exportStyles()}</style>\n</head>\n<body>\n<main class="exported-page">${cleanCanvasHTML()}</main>\n</body>\n</html>`;
  const url = URL.createObjectURL(new Blob([output], { type: 'text/html' }));
  const link = document.createElement('a'); link.href = url; link.download = 'canvas-export.html'; link.click();
  URL.revokeObjectURL(url);
  showToast('HTMLを書き出しました');
});
document.getElementById('resetType').addEventListener('click', () => {
  if (!selected) return;
  ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing'].forEach(prop => selected.style[prop] = '');
  selectBlock(selected); snapshot(); showToast('文字設定をリセットしました');
});
document.getElementById('undoBtn').addEventListener('click', () => {
  clearTimeout(inputTimer);
  if (!restoreHistory(historyIndex - 1)) showToast('これ以上戻せません');
});
document.getElementById('redoBtn').addEventListener('click', () => {
  if (!restoreHistory(historyIndex + 1)) showToast('これ以上進めません');
});

function exportStyles() {
  return `*{box-sizing:border-box}body{margin:0;background:#eceef2;color:#151823;font-family:Arial,sans-serif;padding:40px 18px}.exported-page{max-width:840px;min-height:880px;margin:auto;background:#fbfaf7;padding:46px 62px 52px;box-shadow:0 16px 40px #1b1f2b20}.doc-header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #cfd1d4;padding-bottom:18px}.logo-lockup{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.13em}.logo-glyph{display:grid;place-items:center;width:25px;height:25px;border:1px solid #181a1e;border-radius:50%;font-family:Georgia,serif}.doc-header nav{display:flex;gap:24px}.doc-header a{color:#52555b;text-decoration:none;font-size:11px}.hero-block{padding:94px 0 82px}.eyebrow{color:#596477;font-size:10px;font-weight:800;letter-spacing:.21em;margin-bottom:22px}.hero-block h1{margin:0 0 26px;font-family:Georgia,serif;font-size:68px;line-height:.98;letter-spacing:-2px}.hero-block h1 em{color:#2457e6}.lead{max-width:425px;color:#5f6269;line-height:1.9;font-size:14px;margin:0 0 30px}.cta{display:inline-flex;align-items:center;gap:24px;padding:13px 18px;background:#151823;color:#fff;text-decoration:none;font-size:12px;font-weight:700}.feature-row{border-top:1px solid #cfd1d4;display:grid;grid-template-columns:repeat(3,1fr);gap:28px;padding-top:24px}.feature{display:flex;gap:16px}.feature strong{color:#2457e6;font-size:11px}.feature span{font-size:12px;line-height:1.7;color:#4c5058}@media(max-width:600px){body{padding:0}.exported-page{padding:30px 28px;box-shadow:none}.doc-header nav{display:none}.hero-block{padding:68px 0}.hero-block h1{font-size:48px}.feature-row{grid-template-columns:1fr}}`;
}

function renderLayers() {
  const list = document.getElementById('layersList');
  if (!list) return;
  list.innerHTML = '';
  page.querySelectorAll('.editable-block').forEach((el, index) => {
    const row = document.createElement('button');
    row.className = `layer-row${el === selected ? ' active' : ''}`;
    row.innerHTML = `<span>${el.dataset.label || `要素 ${index + 1}`}</span><span>${el.dataset.type || el.tagName}</span>`;
    row.addEventListener('click', () => { selectBlock(el); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
    list.appendChild(row);
  });
}

const layersPopover = document.getElementById('layersPopover');
document.getElementById('layersBtn').addEventListener('click', event => {
  event.stopPropagation();
  renderLayers();
  layersPopover.classList.toggle('open');
  layersPopover.setAttribute('aria-hidden', String(!layersPopover.classList.contains('open')));
});
document.addEventListener('click', event => {
  if (!event.target.closest('#layersPopover') && !event.target.closest('#layersBtn')) {
    layersPopover.classList.remove('open');
    layersPopover.setAttribute('aria-hidden', 'true');
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    drawer.classList.remove('open');
    layersPopover.classList.remove('open');
    if (document.body.classList.contains('preview-mode')) document.body.classList.remove('preview-mode');
  }
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) restoreHistory(historyIndex + 1); else restoreHistory(historyIndex - 1);
  }
  if (mod && event.key.toLowerCase() === 'e') { event.preventDefault(); document.getElementById('exportBtn').click(); }
});

function registerWebMCPTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const controller = new AbortController();
  const addTool = {
    name: 'add_html_element',
    title: 'HTML要素を追加',
    description: '現在のページに見出し、本文、またはボタンを追加し、キャンバス上で選択します。',
    inputSchema: {
      type: 'object',
      properties: { type: { type: 'string', enum: ['heading', 'text', 'button'] }, text: { type: 'string', minLength: 1, maxLength: 300 } },
      required: ['type', 'text'], additionalProperties: false
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      if (!input || !['heading','text','button'].includes(input.type) || typeof input.text !== 'string' || !input.text.trim()) throw new Error('type と text を正しく指定してください');
      const trigger = document.querySelector(`[data-add="${input.type}"]`);
      trigger.click();
      selected.textContent = input.text.trim();
      snapshot();
      return { added: true, type: input.type, label: selected.dataset.label };
    }
  };
  Promise.resolve(context.registerTool(addTool, { signal: controller.signal })).catch(() => {});
}

setZoom(86);
selectBlock(selected);
snapshot();
registerWebMCPTools();
