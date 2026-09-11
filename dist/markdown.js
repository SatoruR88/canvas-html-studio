(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CanvasMarkdown = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function stripFormatting(value) {
    return String(value || '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[`*_~]/g, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  function safeUrl(value) {
    const cleaned = String(value || '').trim().replace(/^<|>$/g, '').replace(/[\u0000-\u001f\u007f]/g, '');
    if (!cleaned || /^(?:javascript|vbscript|data):/i.test(cleaned)) return '';
    return cleaned;
  }

  function idPart(value) {
    return stripFormatting(value).normalize('NFKC').toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
      .trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
  }

  const idCounters = new WeakMap();
  function uniqueId(value, used, fallback = 'section') {
    const base = idPart(value) || fallback;
    if (!used.has(base)) {
      const counters = idCounters.get(used) || new Map(); counters.set(base, 1); idCounters.set(used, counters); used.add(base); return base;
    }
    const counters = idCounters.get(used) || new Map();
    let suffix = (counters.get(base) || 1) + 1, candidate = `${base}-${suffix}`;
    while (used.has(candidate)) candidate = `${base}-${++suffix}`;
    counters.set(base, suffix); idCounters.set(used, counters); used.add(candidate); return candidate;
  }

  function inlineFormatting(value) {
    return value
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  }

  function renderInline(source, referencedFootnotes) {
    const tokens = [];
    const stash = html => `\u0000${tokens.push(html) - 1}\u0000`;
    let text = String(source || '');

    text = text.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${escapeHtml(code)}</code>`));
    text = text.replace(/!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g, (_, alt, rawUrl, title) => {
      const url = safeUrl(rawUrl);
      if (!url) return escapeHtml(alt);
      return stash(`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ''}>`);
    });
    text = text.replace(/\[([^\]]+)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g, (_, label, rawUrl, title) => {
      const url = safeUrl(rawUrl);
      if (!url) return escapeHtml(label);
      return stash(`<a href="${escapeHtml(url)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${inlineFormatting(escapeHtml(label))}</a>`);
    });
    text = text.replace(/\[\^([^\]]+)\]/g, (_, rawId) => {
      const id = idPart(rawId) || 'note';
      referencedFootnotes.add(id);
      return stash(`<sup class="footnote-ref"><a href="#footnote-${id}" id="footnote-ref-${id}">[${escapeHtml(rawId)}]</a></sup>`);
    });

    text = inlineFormatting(escapeHtml(text));
    text = text.replace(/(^|[\s(])((?:https?:\/\/)[^\s<]+)/g, (_, prefix, url) => `${prefix}<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
    return text.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] || '');
  }

  function parseFrontMatter(source) {
    const normalized = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (!normalized.startsWith('---\n')) return { meta: {}, body: normalized };
    const end = normalized.indexOf('\n---\n', 4);
    if (end < 0) return { meta: {}, body: normalized };
    const meta = {};
    normalized.slice(4, end).split('\n').forEach(line => {
      const match = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
      if (!match) return;
      meta[match[1].toLowerCase()] = match[2].trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, double, single) => double ?? single ?? '');
    });
    return { meta, body: normalized.slice(end + 5) };
  }

  function splitTableRow(line) {
    let row = String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '');
    const cells = [];
    let current = '';
    let escaped = false;
    for (const character of row) {
      if (escaped) { current += character; escaped = false; continue; }
      if (character === '\\') { escaped = true; current += character; continue; }
      if (character === '|') { cells.push(current.trim()); current = ''; continue; }
      current += character;
    }
    cells.push(current.trim());
    return cells;
  }

  function isTableDivider(line) {
    const cells = splitTableRow(line);
    return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
  }

  function startsBlock(lines, index) {
    const line = lines[index] || '';
    const next = lines[index + 1] || '';
    return !line.trim() || /^\s*(?:`{3,}|~{3,})/.test(line) || /^#{1,6}\s+/.test(line) ||
      /^\s*>/.test(line) || /^\s*(?:[-+*]|\d+\.)\s+/.test(line) || /^\s{4}\S/.test(line) ||
      /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) || /^\s*\[\^[^\]]+\]:/.test(line) ||
      (line.includes('|') && isTableDivider(next)) || (/^\s*(?:=+|-+)\s*$/.test(next) && line.trim());
  }

  function listLine(line) {
    const match = String(line || '').replace(/\t/g, '    ').match(/^(\s*)([-+*]|\d+\.)\s+(.*)$/);
    return match ? { indent: match[1].length, marker: match[2], content: match[3], ordered: /\d+\./.test(match[2]) } : null;
  }

  function renderList(lines, start, context, baseIndent = null) {
    const first = listLine(lines[start]);
    if (!first) return { html: '', next: start };
    const indent = baseIndent ?? first.indent, ordered = first.ordered, items = [];
    let index = start;
    while (index < lines.length) {
      const item = listLine(lines[index]);
      if (!item || item.indent < indent || (item.indent === indent && item.ordered !== ordered)) break;
      if (item.indent > indent) {
        if (!items.length) break;
        const nested = renderList(lines, index, context, item.indent);
        items[items.length - 1].nested += nested.html; index = nested.next; continue;
      }
      let content = item.content;
      const task = content.match(/^\[([ xX])\]\s+(.*)$/);
      content = task
        ? `<input type="checkbox" disabled${task[1].toLowerCase() === 'x' ? ' checked' : ''}> ${renderInline(task[2], context.referencedFootnotes)}`
        : renderInline(content, context.referencedFootnotes);
      items.push({ content, task: Boolean(task), nested: '' }); index += 1;
      while (index < lines.length && lines[index].trim() && !listLine(lines[index]) && /^\s+/.test(lines[index])) {
        items[items.length - 1].content += ` ${renderInline(lines[index].trim(), context.referencedFootnotes)}`; index += 1;
      }
    }
    const tag = ordered ? 'ol' : 'ul', taskList = items.some(item => item.task);
    return { html: `<${tag}${taskList ? ' class="task-list"' : ''}>${items.map(item => `<li${item.task ? ' class="task-item"' : ''}>${item.content}${item.nested}</li>`).join('')}</${tag}>`, next: index };
  }

  function parseBlocks(source, context) {
    const lines = String(source || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    const footnotes = new Map();
    const cleaned = [];
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(/^\s*\[\^([^\]]+)\]:\s*(.*)$/);
      if (!match) { cleaned.push(lines[i]); continue; }
      const id = idPart(match[1]) || 'note';
      let value = match[2];
      while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) value += ` ${lines[++i].trim()}`;
      footnotes.set(id, value);
    }

    const html = [];
    for (let i = 0; i < cleaned.length;) {
      const line = cleaned[i];
      if (!line.trim()) { i += 1; continue; }

      const fence = line.match(/^\s*(`{3,}|~{3,})\s*([^\s`]*)\s*$/);
      if (fence) {
        const marker = fence[1][0];
        const language = String(fence[2] || '').replace(/[^A-Za-z0-9_-]/g, '');
        const code = [];
        i += 1;
        while (i < cleaned.length && !new RegExp(`^\\s*${marker}{${fence[1].length},}\\s*$`).test(cleaned[i])) code.push(cleaned[i++]);
        if (i < cleaned.length) i += 1;
        html.push(`<pre><code${language ? ` class="language-${language}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`);
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const level = heading[1].length;
        const label = stripFormatting(heading[2]);
        const id = uniqueId(label, context.usedIds, `section-${context.headings.length + 1}`);
        context.headings.push({ level, label, id });
        html.push(`<h${level} id="${id}">${renderInline(heading[2], context.referencedFootnotes)}</h${level}>`);
        i += 1;
        continue;
      }

      if (i + 1 < cleaned.length && line.trim() && /^\s*(?:=+|-+)\s*$/.test(cleaned[i + 1])) {
        const level = cleaned[i + 1].trim()[0] === '=' ? 1 : 2;
        const label = stripFormatting(line);
        const id = uniqueId(label, context.usedIds, `section-${context.headings.length + 1}`);
        context.headings.push({ level, label, id });
        html.push(`<h${level} id="${id}">${renderInline(line, context.referencedFootnotes)}</h${level}>`);
        i += 2;
        continue;
      }

      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        html.push('<hr>'); i += 1; continue;
      }

      if (line.includes('|') && i + 1 < cleaned.length && isTableDivider(cleaned[i + 1])) {
        const headers = splitTableRow(line);
        const dividers = splitTableRow(cleaned[i + 1]);
        const alignments = dividers.map(cell => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : '');
        const rows = [];
        i += 2;
        while (i < cleaned.length && cleaned[i].includes('|') && cleaned[i].trim()) rows.push(splitTableRow(cleaned[i++]));
        const cell = (tag, value, column) => `<${tag}${alignments[column] ? ` style="text-align:${alignments[column]}"` : ''}>${renderInline(value || '', context.referencedFootnotes)}</${tag}>`;
        html.push(`<div class="table-wrap"><table><thead><tr>${headers.map((value, column) => cell('th', value, column)).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map((_, column) => cell('td', row[column], column)).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }

      if (/^\s*>/.test(line)) {
        const quote = [];
        while (i < cleaned.length && /^\s*>/.test(cleaned[i])) quote.push(cleaned[i++].replace(/^\s*>\s?/, ''));
        const alert = quote[0]?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
        if (alert) {
          const type = alert[1].toLowerCase(), labels = { note: 'NOTE', tip: 'TIP', important: 'IMPORTANT', warning: 'WARNING', caution: 'CAUTION' };
          html.push(`<aside class="markdown-alert markdown-alert-${type}"><strong>${labels[type]}</strong><div>${parseBlocks(quote.slice(1).join('\n'), { ...context, headings: [] }).html}</div></aside>`);
        } else html.push(`<blockquote>${parseBlocks(quote.join('\n'), { ...context, headings: [] }).html}</blockquote>`);
        continue;
      }

      const list = listLine(line);
      if (list) {
        const rendered = renderList(cleaned, i, context, list.indent); html.push(rendered.html); i = rendered.next;
        continue;
      }

      if (/^\s{4}\S/.test(line)) {
        const code = [];
        while (i < cleaned.length && (/^\s{4}/.test(cleaned[i]) || !cleaned[i].trim())) code.push(cleaned[i++].replace(/^\s{4}/, ''));
        html.push(`<pre><code>${escapeHtml(code.join('\n').replace(/\n+$/, ''))}</code></pre>`);
        continue;
      }

      const paragraph = [];
      while (i < cleaned.length && cleaned[i].trim() && (paragraph.length === 0 || !startsBlock(cleaned, i))) paragraph.push(cleaned[i++]);
      if (!paragraph.length) { paragraph.push(cleaned[i++]); }
      const body = paragraph.map((value, index) => {
        const hardBreak = /\s{2}$/.test(value);
        const rendered = renderInline(value.replace(/\s+$/, ''), context.referencedFootnotes);
        return `${rendered}${hardBreak && index < paragraph.length - 1 ? '<br>' : index < paragraph.length - 1 ? ' ' : ''}`;
      }).join('');
      html.push(`<p>${body}</p>`);
    }

    if (footnotes.size) {
      const items = [];
      for (const [id, value] of footnotes) {
        items.push(`<li id="footnote-${id}">${renderInline(value, context.referencedFootnotes)} <a class="footnote-back" href="#footnote-ref-${id}" aria-label="本文に戻る">↩</a></li>`);
      }
      html.push(`<section class="footnotes" aria-label="脚注"><hr><ol>${items.join('')}</ol></section>`);
    }
    return { html: html.join('\n') };
  }

  function convertMarkdown(source, options = {}) {
    const theme = ['document', 'technical', 'blog', 'readme'].includes(options.theme) ? options.theme : 'document';
    const { meta, body } = parseFrontMatter(source);
    const context = { headings: [], usedIds: new Set(), referencedFootnotes: new Set() };
    let content = parseBlocks(body, context).html;
    const sourceName = String(options.filename || 'document.md').split('/').pop();
    const firstHeading = context.headings.find(heading => heading.level === 1);
    const fallbackTitle = sourceName.replace(/\.(?:md|markdown)$/i, '').replace(/[-_]+/g, ' ') || 'Markdown document';
    const title = String(meta.title || firstHeading?.label || fallbackTitle).trim();
    const description = String(meta.description || '').trim();
    if (!firstHeading || (meta.title && firstHeading.label !== title)) {
      const id = uniqueId(title, context.usedIds, 'document-title');
      context.headings.unshift({ level: 1, label: title, id });
      content = `<h1 id="${id}">${escapeHtml(title)}</h1>\n${content}`;
    }
    const tocHeadings = context.headings.filter(heading => heading.level <= 3);
    const toc = options.toc !== false && tocHeadings.length > 1
      ? `<nav class="markdown-toc" aria-label="目次"><strong>目次</strong><ol>${tocHeadings.map(heading => `<li class="toc-level-${heading.level}"><a href="#${heading.id}">${escapeHtml(heading.label)}</a></li>`).join('')}</ol></nav>`
      : '';
    const header = `<header class="markdown-header"><span class="markdown-source">MARKDOWN · ${escapeHtml(sourceName)}</span>${description ? `<p>${escapeHtml(description)}</p>` : ''}</header>`;
    const html = `<div class="markdown-page markdown-theme-${theme}" data-source="${escapeHtml(sourceName)}"><article class="markdown-article">${header}<div class="markdown-layout">${toc}<main class="markdown-content">${content}</main></div></article></div>`;
    return { title, description, html, headings: context.headings, theme };
  }

  function outputPathForMarkdown(path, occupied = []) {
    const normalized = String(path || 'document.md').replace(/\\/g, '/').replace(/^\/+/, '');
    const slash = normalized.lastIndexOf('/');
    const directory = slash >= 0 ? normalized.slice(0, slash + 1) : '';
    const filename = slash >= 0 ? normalized.slice(slash + 1) : normalized;
    const stem = filename.replace(/\.(?:md|markdown)$/i, '') || 'document';
    const preferred = `${directory}${/^readme$/i.test(stem) ? 'index' : stem}.html`;
    const used = occupied instanceof Set ? occupied : new Set(Array.from(occupied || []));
    if (!used.has(preferred)) return preferred;
    let suffix = 1;
    let candidate = `${directory}${stem}-from-markdown.html`;
    while (used.has(candidate)) candidate = `${directory}${stem}-from-markdown-${++suffix}.html`;
    return candidate;
  }

  function markdownThemeCss(theme = 'document') {
    const selected = ['document', 'technical', 'blog', 'readme'].includes(theme) ? theme : 'document';
    const themes = {
      document: `:root{--md-bg:#eef1f5;--md-paper:#fff;--md-ink:#20242c;--md-muted:#677080;--md-accent:#315bcf;--md-line:#dfe3e9;--md-code:#f3f5f7}.markdown-article{max-width:820px;margin:48px auto;box-shadow:0 18px 55px rgba(28,35,48,.12);border-radius:4px}.markdown-content h1,.markdown-content h2{font-family:Georgia,'Times New Roman',serif}`,
      technical: `:root{--md-bg:#f4f7fb;--md-paper:#fff;--md-ink:#172033;--md-muted:#647087;--md-accent:#2864dc;--md-line:#dce3ee;--md-code:#101827}.markdown-article{max-width:1180px;margin:30px auto;border:1px solid var(--md-line);border-radius:12px}.markdown-layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:40px}.markdown-toc{position:sticky;top:24px;align-self:start}.markdown-content pre{color:#e9eef8}`,
      blog: `:root{--md-bg:#f8f3ec;--md-paper:#fffdf9;--md-ink:#29221d;--md-muted:#7b6c60;--md-accent:#b44d2c;--md-line:#e6d9cc;--md-code:#f2eae2}.markdown-article{max-width:900px;margin:44px auto;border-radius:22px;box-shadow:0 24px 70px rgba(80,53,35,.11)}.markdown-header{padding:45px 58px 30px;background:linear-gradient(135deg,#fff6e9,#f7dfcf);border-radius:22px 22px 0 0}.markdown-content{font-family:Georgia,'Times New Roman',serif}.markdown-content h1{font-size:3rem;line-height:1.08}`,
      readme: `:root{--md-bg:#f6f8fa;--md-paper:#fff;--md-ink:#1f2328;--md-muted:#656d76;--md-accent:#0969da;--md-line:#d0d7de;--md-code:#f6f8fa}.markdown-article{max-width:1012px;margin:32px auto;border:1px solid var(--md-line);border-radius:8px}.markdown-header{background:#f6f8fa}.markdown-content h1,.markdown-content h2{padding-bottom:.35em;border-bottom:1px solid var(--md-line)}`
    };
    return `*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--md-bg);color:var(--md-ink);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.7}.markdown-page{min-height:100vh;padding:1px 24px 48px}.markdown-article{background:var(--md-paper);overflow:visible}.markdown-header{padding:28px 52px;border-bottom:1px solid var(--md-line)}.markdown-header p{max-width:700px;margin:10px 0 0;color:var(--md-muted)}.markdown-source{font-size:11px;font-weight:750;letter-spacing:.12em;color:var(--md-accent)}.markdown-layout{padding:40px 52px 58px}.markdown-content{min-width:0}.markdown-content>:first-child{margin-top:0}.markdown-content>:last-child{margin-bottom:0}.markdown-content h1,.markdown-content h2,.markdown-content h3,.markdown-content h4{line-height:1.25;scroll-margin-top:20px}.markdown-content h1{font-size:2.5rem;margin:0 0 1em}.markdown-content h2{font-size:1.65rem;margin:2em 0 .7em}.markdown-content h3{font-size:1.25rem;margin:1.6em 0 .5em}.markdown-content p,.markdown-content ul,.markdown-content ol,.markdown-content blockquote,.markdown-alert,.table-wrap,.markdown-content pre{margin:0 0 1.25em}.markdown-content a,.markdown-toc a{color:var(--md-accent);text-decoration:none}.markdown-content a:hover,.markdown-toc a:hover{text-decoration:underline}.markdown-content img{display:block;max-width:100%;height:auto;margin:1.4em auto;border-radius:8px}.markdown-content blockquote{padding:.25em 1.1em;border-left:4px solid var(--md-accent);color:var(--md-muted);background:color-mix(in srgb,var(--md-accent) 5%,transparent)}.markdown-content blockquote>:last-child{margin-bottom:0}.markdown-alert{--alert:#4481d8;padding:14px 16px;border:1px solid color-mix(in srgb,var(--alert) 35%,var(--md-line));border-left:5px solid var(--alert);border-radius:7px;background:color-mix(in srgb,var(--alert) 8%,var(--md-paper))}.markdown-alert>strong{display:block;margin-bottom:5px;color:var(--alert);font-size:.82em;letter-spacing:.05em}.markdown-alert p:last-child{margin-bottom:0}.markdown-alert-tip{--alert:#27865f}.markdown-alert-important{--alert:#7b55c7}.markdown-alert-warning{--alert:#b97713}.markdown-alert-caution{--alert:#c4444d}.markdown-content code{padding:.15em .35em;border-radius:4px;background:var(--md-code);font: .9em ui-monospace,SFMono-Regular,Consolas,monospace}.markdown-content pre{overflow:auto;padding:18px 20px;border-radius:8px;background:var(--md-code)}.markdown-content pre code{padding:0;background:transparent;white-space:pre}.table-wrap{overflow-x:auto}.markdown-content table{width:100%;border-collapse:collapse;font-size:.95em}.markdown-content th,.markdown-content td{padding:9px 12px;border:1px solid var(--md-line)}.markdown-content th{background:var(--md-code);font-weight:700}.markdown-content hr{margin:2em 0;border:0;border-top:1px solid var(--md-line)}.task-list{padding-left:.25em;list-style:none}.task-item input{width:1em;height:1em;margin-right:.45em}.markdown-toc{margin:0 0 32px;padding:18px 20px;border:1px solid var(--md-line);border-radius:8px;background:color-mix(in srgb,var(--md-bg) 60%,transparent);font-size:.9em}.markdown-toc ol{margin:10px 0 0;padding:0;list-style:none}.markdown-toc li{margin:5px 0}.markdown-toc .toc-level-2{padding-left:12px}.markdown-toc .toc-level-3{padding-left:24px}.footnotes{margin-top:3em;color:var(--md-muted);font-size:.9em}.footnote-back{margin-left:.3em}${themes[selected]}@media(max-width:760px){.markdown-page{padding:0}.markdown-article{margin:0;border-radius:0;border-left:0;border-right:0}.markdown-header{padding:22px 22px}.markdown-layout{display:block;padding:28px 22px 42px}.markdown-toc{position:static}.markdown-content h1{font-size:2rem}}`;
  }

  return { convertMarkdown, markdownThemeCss, outputPathForMarkdown, parseFrontMatter, safeUrl };
});
