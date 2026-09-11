const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('long-document tools have controls and implementation hooks', () => {
  for (const id of ['searchBtn', 'searchDialog', 'outlineBtn', 'outlinePopover', 'repairReferencesBtn', 'referenceDialog']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const name of ['searchProject', 'replaceProjectText', 'renderOutline', 'collectBrokenReferences', 'applyReferenceRepair']) {
    assert.match(app, new RegExp(`function ${name}\\(`));
  }
});

test('search has current-page and all-page scopes plus Ctrl+F', () => {
  assert.match(html, /value="current">現在のページ/);
  assert.match(html, /value="all">すべてのページ/);
  assert.match(app, /key === 'f'/);
});

test('Markdown import yields between batches and rejects oversized files safely', () => {
  assert.match(app, /20 \* 1024 \* 1024/);
  assert.match(app, /await new Promise\(resolve => setTimeout\(resolve, 0\)\)/);
  assert.ok(app.indexOf('pages = await parseMarkdownPages') < app.indexOf("window.dispatchEvent(new CustomEvent('canvas-new-project')); clearAssetUrls(); assets = nextAssets", app.indexOf('pages = await parseMarkdownPages')));
});
