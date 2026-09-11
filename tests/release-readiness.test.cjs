const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const safety = require('../dist/safety.js');
const markdown = require('../dist/markdown.js');

const dist = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(dist, 'app.js'), 'utf8');
const desktopRoot = path.join(__dirname, '..', '..', 'canvas-desktop');
const desktopPackage = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'));
const tauriConfig = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const cargoManifest = fs.readFileSync(path.join(desktopRoot, 'src-tauri', 'Cargo.toml'), 'utf8');
const bytes = length => new Uint8Array(length);

test('quick start, help, keyboard reference, and persistent import errors are available', () => {
  for (const id of ['helpBtn', 'startGuideBtn', 'helpDialog', 'shortcutTitle', 'importErrorDialog', 'importErrorMessage']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /event\.key === 'F1'/);
  assert.match(app, /function showAppDialog\(/);
  assert.match(app, /function showImportError\(/);
  assert.equal((app.match(/\.showModal\(/g) || []).length, 1, 'dialogs should use the focus-restoring helper');
});

test('release identity, version, and local-only policy stay aligned', () => {
  const version = '0.1.0';
  assert.equal(desktopPackage.version, version);
  assert.equal(tauriConfig.version, version);
  assert.match(cargoManifest, /^version = "0\.1\.0"$/m);
  assert.match(html, new RegExp(`id="appVersion">${version}<`));
  assert.match(html, /一人で使うローカル編集アプリ/);
  assert.match(html, /共有機能やアカウント連携は使用しません/);
  assert.equal(tauriConfig.productName, 'Canvas HTML Studio');
  assert.equal(tauriConfig.identifier, 'studio.canvas.html');
});

test('import validation rejects traversal, absolute paths, duplicates, and oversized projects', () => {
  assert.throws(() => safety.validateImportEntries([{ path: '../outside.html', data: bytes(1) }]), /安全でない/);
  assert.throws(() => safety.validateImportEntries([{ path: 'C:/outside.html', data: bytes(1) }]), /安全でない/);
  assert.throws(() => safety.validateImportEntries([
    { path: 'Index.html', data: bytes(1) }, { path: 'index.html', data: bytes(1) }
  ]), /同じファイル/);
  assert.throws(() => safety.validateImportEntries([{ path: 'huge.bin', data: { byteLength: 51 * 1024 * 1024 } }]), /50MB/);
  assert.throws(() => safety.validateImportEntries([
    { path: 'a.bin', data: { byteLength: 101 * 1024 * 1024 } },
    { path: 'b.bin', data: { byteLength: 101 * 1024 * 1024 } }
  ], { maxFileBytes: 150 * 1024 * 1024 }), /200MB/);
});

test('failed HTML parsing cannot replace the active asset map before all pages are prepared', () => {
  const parseStart = app.indexOf('if (htmlPath) {', app.indexOf('async function importEntries'));
  const pageBuild = app.indexOf('pages = entries.map', parseStart);
  const commitAssets = app.indexOf('assets = nextAssets', parseStart);
  assert.ok(pageBuild > parseStart);
  assert.ok(commitAssets > pageBuild);
  assert.match(app.slice(pageBuild, commitAssets), /parseImportedPage\(path, entries, styles, nextAssets\)/);
  const zipSection = app.slice(app.indexOf('async function parseZip'), app.indexOf('function stripCommonRoot'));
  assert.doesNotMatch(zipSection, /const path = normalizePath/);
});

test('Japanese Markdown and a maximum-sized file list remain compatible', () => {
  const source = '# 操作ガイド\n\n日本語の本文です。\n\n- 開く\n- 編集\n- 保存';
  const converted = markdown.convertMarkdown(source, { filename: '資料/操作ガイド.md', theme: 'document', toc: true });
  assert.match(converted.html, /日本語の本文/);
  assert.equal(markdown.outputPathForMarkdown('資料/操作ガイド.md'), '資料/操作ガイド.html');

  const entries = Array.from({ length: 5000 }, (_, index) => ({ path: `assets/file-${index}.txt`, data: bytes(1) }));
  const validated = safety.validateImportEntries(entries);
  assert.equal(validated.length, 5000);
  assert.equal(validated.at(-1).path, 'assets/file-4999.txt');
});
