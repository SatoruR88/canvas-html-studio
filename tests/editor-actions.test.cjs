const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('editor action controls have unique static IDs', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    'snapGuideX', 'snapGuideY', 'selectionMetrics', 'lockSelectionBtn',
    'hideSelectionBtn', 'groupSelectionBtn', 'ungroupSelectionBtn',
    'selectionBoldBtn', 'selectionItalicBtn', 'selectionUnderlineBtn',
    'selectionColor', 'selectionLinkBtn'
  ]) assert.ok(ids.includes(id), `${id} is missing`);
});

test('all five editing action groups are wired', () => {
  for (const name of [
    'alignSelectedElements', 'distributeSelectedElements', 'snapMovement',
    'toggleSelectionLock', 'toggleSelectionVisibility', 'groupSelection',
    'handleEditorShortcut', 'captureTextSelection', 'wrapSelectedText'
  ]) assert.match(app, new RegExp(`function ${name}\\(`));
});

test('editor-only state is stripped from exported HTML', () => {
  const exportSection = app.slice(app.indexOf('function outputHTMLForPage'), app.indexOf('function outputHTML()'));
  for (const attribute of ['data-canvas-group', 'data-canvas-locked', 'data-canvas-hidden']) {
    assert.match(exportSection, new RegExp(attribute));
  }
});
