(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CanvasSafety = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_LIMITS = Object.freeze({
    maxFiles: 5000,
    maxFileBytes: 50 * 1024 * 1024,
    maxTotalBytes: 200 * 1024 * 1024
  });

  function normalizedPath(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
  }

  function validatePath(value) {
    const path = normalizedPath(value);
    if (!path || path.startsWith('/') || /^[a-z]:\//i.test(path) || path.includes('\0')) {
      throw new Error(`安全でないファイルパスです: ${value || '(空)'}`);
    }
    const parts = path.split('/');
    if (parts.some(part => !part || part === '.' || part === '..')) {
      throw new Error(`安全でないファイルパスです: ${value}`);
    }
    return parts.join('/');
  }

  function validateImportEntries(entries, customLimits = {}) {
    if (!Array.isArray(entries) || entries.length === 0) throw new Error('読み込めるファイルがありません');
    const limits = { ...DEFAULT_LIMITS, ...customLimits };
    if (entries.length > limits.maxFiles) throw new Error(`ファイル数が上限の${limits.maxFiles}件を超えています`);
    const seen = new Set();
    let totalBytes = 0;
    return entries.map(entry => {
      const path = validatePath(entry?.path);
      const key = path.toLocaleLowerCase('en-US');
      if (seen.has(key)) throw new Error(`同じファイルが複数含まれています: ${path}`);
      seen.add(key);
      const data = entry?.data;
      const byteLength = Number(data?.byteLength ?? data?.length ?? 0);
      if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw new Error(`ファイルデータが壊れています: ${path}`);
      if (byteLength > limits.maxFileBytes) throw new Error(`50MBを超えるファイルがあります: ${path}`);
      totalBytes += byteLength;
      if (totalBytes > limits.maxTotalBytes) throw new Error('プロジェクト全体が200MBを超えています');
      return { ...entry, path };
    });
  }

  return { DEFAULT_LIMITS, validatePath, validateImportEntries };
});
