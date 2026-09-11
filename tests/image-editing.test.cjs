const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('image editing controls cover crop, focus, transform, and tone', () => {
  for (const id of [
    'imageEditSection', 'imageFit', 'imagePositionX', 'imagePositionY',
    'imageRotate', 'imageFlipX', 'imageFlipY', 'imageOpacity',
    'imageBrightness', 'imageContrast', 'resetImageEdit', 'imageAssetInfo'
  ]) assert.match(html, new RegExp(`id="${id}"`));
  for (const ratio of ['1', '1.333333', '1.777778', 'original']) assert.match(html, new RegExp(`data-image-ratio="${ratio}"`));
});

test('image transforms compose with canvas movement', () => {
  assert.match(app, /function applyElementTransform\(/);
  assert.match(app, /translate\(\$\{Math\.round\(x\)\}px, \$\{Math\.round\(y\)\}px\)/);
  assert.match(app, /rotate\(\$\{rotation\}deg\)/);
  assert.match(app, /scale\(\$\{scaleX\}, \$\{scaleY\}\)/);
  assert.match(app, /function setElementOffset[\s\S]*?applyElementTransform\(element\)/);
});

test('image edits export as styles without editor metadata', () => {
  const exportSection = app.slice(app.indexOf('function outputHTMLForPage'), app.indexOf('function outputHTML()'));
  for (const attribute of ['data-canvas-rotate', 'data-canvas-flip-x', 'data-canvas-flip-y', 'data-canvas-brightness', 'data-canvas-contrast', 'data-canvas-crop-baseline']) {
    assert.match(exportSection, new RegExp(attribute));
  }
  assert.match(app, /画像ファイルが大きすぎます/);
  assert.match(app, /3 \* 1024 \* 1024/);
});
