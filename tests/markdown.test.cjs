const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const markdown = require('../dist/markdown.js');

const dist = path.join(__dirname, '..', 'dist');

const sample = `---
title: Canvas ガイド
description: Markdownから作った説明書です
---

# はじめに

本文と[安全なリンク](https://example.com)です。画像は ![図](images/diagram.png) です。

## 機能

- [x] 見出し
- [ ] 表

| 名前 | 状態 |
| :--- | ---: |
| 変換 | 完了 |

\`\`\`js
const ready = true;
\`\`\`

注釈[^note]

[^note]: 脚注の内容

<script>alert('bad')</script>`;

test('converts common Markdown constructs into editable document HTML', () => {
  const result = markdown.convertMarkdown(sample, { filename: 'docs/guide.md', theme: 'technical', toc: true });
  assert.equal(result.title, 'Canvas ガイド');
  assert.equal(result.description, 'Markdownから作った説明書です');
  assert.match(result.html, /class="markdown-toc"/);
  assert.match(result.html, /<table>/);
  assert.match(result.html, /type="checkbox" disabled checked/);
  assert.match(result.html, /class="language-js"/);
  assert.match(result.html, /src="images\/diagram\.png"/);
  assert.match(result.html, /class="footnotes"/);
});

test('escapes raw HTML and rejects executable URLs', () => {
  const result = markdown.convertMarkdown(`<script>alert(1)</script>\n\n[危険](javascript:alert(1))`, { filename: 'unsafe.md' });
  assert.doesNotMatch(result.html, /<script>/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.doesNotMatch(result.html, /href="javascript:/i);
});

test('maps README to index and avoids occupied output paths', () => {
  assert.equal(markdown.outputPathForMarkdown('docs/README.md'), 'docs/index.html');
  assert.equal(markdown.outputPathForMarkdown('guide.md'), 'guide.html');
  assert.equal(markdown.outputPathForMarkdown('guide.md', new Set(['guide.html'])), 'guide-from-markdown.html');
});

test('provides four self-contained document themes', () => {
  for (const theme of ['document', 'technical', 'blog', 'readme']) {
    const css = markdown.markdownThemeCss(theme);
    assert.match(css, /\.markdown-content/);
    assert.match(css, /@media\(max-width:760px\)/);
  }
  assert.notEqual(markdown.markdownThemeCss('document'), markdown.markdownThemeCss('blog'));
});

test('loads the converter before the editor and exposes Markdown import controls', () => {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(dist, 'app.js'), 'utf8');
  assert.ok(html.indexOf('src="markdown.js"') < html.indexOf('src="app.js"'));
  assert.match(html, /id="markdownDialog"/);
  assert.match(html, /\.md,\.markdown/);
  assert.match(app, /CanvasMarkdown\.convertMarkdown/);
  assert.match(app, /text\/markdown/);
});

test('converts nested lists and GitHub-style alerts', () => {
  const result = markdown.convertMarkdown(`# ガイド

- 親
  - 子
    1. 孫

> [!WARNING]
> 保存前に確認してください`, { filename: '資料/操作ガイド.md' });
  assert.match(result.html, /<ul><li>親<ul><li>子<ol><li>孫<\/li><\/ol><\/li><\/ul><\/li><\/ul>/);
  assert.match(result.html, /markdown-alert-warning/);
  assert.equal(markdown.outputPathForMarkdown('資料/操作ガイド.md'), '資料/操作ガイド.html');
});

test('keeps heading IDs unique in a large document', () => {
  const source = Array.from({ length: 2000 }, () => '## 同じ見出し\n\n本文').join('\n\n');
  const result = markdown.convertMarkdown(source, { filename: 'large.md', toc: false });
  assert.equal(result.headings.length, 2001);
  assert.equal(result.headings.at(-1).id, '同じ見出し-2000');
});
