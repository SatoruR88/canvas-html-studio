(() => {
  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) return;

  const invoke = tauri.core.invoke;
  const RECENT_KEY = 'canvas-desktop-recent-projects';
  const CURRENT_KEY = 'canvas-desktop-current-project';
  let nativeRoot = localStorage.getItem(CURRENT_KEY) || '';
  let ignoreWatchUntil = 0;
  let externalTimer = null;
  let pendingExternalPaths = new Set();

  document.documentElement.classList.add('desktop-app');
  document.title = 'Canvas HTML Studio';
  const saveButton = document.getElementById('saveBtn');
  const saveAsButton = document.getElementById('saveAsBtn');
  const saveLocation = document.getElementById('saveLocation');
  const diskBackupSection = document.getElementById('diskBackupSection');
  const diskBackupList = document.getElementById('diskBackupList');
  saveButton.hidden = false; saveAsButton.hidden = false;
  document.getElementById('saveLabel').textContent = nativeRoot ? '端末に保存済み' : '未保存のプロジェクト';

  const banner = document.createElement('div');
  banner.className = 'external-banner';
  banner.innerHTML = '<span id="externalChangeMessage">フォルダ内のファイルが別のアプリで変更されました。</span><button id="keepLocalBtn">現在の編集を保持</button><button class="reload-btn" id="reloadNativeBtn">再読み込み</button>';
  document.body.appendChild(banner);

  function fromBase64(value) {
    const binary = atob(value); const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function toBase64(bytes) {
    let binary = ''; const size = 0x8000;
    for (let index = 0; index < bytes.length; index += size) binary += String.fromCharCode(...bytes.subarray(index, index + size));
    return btoa(binary);
  }

  function payloadEntries(result) {
    return result.files.map(file => ({ path: file.path, data: fromBase64(file.data), type: file.type }));
  }

  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (_) { return []; }
  }

  function rememberRoot(root) {
    nativeRoot = root; localStorage.setItem(CURRENT_KEY, root);
    const recent = [root, ...getRecent().filter(item => item !== root)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); renderRecent(); updateSaveLocation();
  }

  function forgetRoot(root) {
    const recent = getRecent().filter(item => item !== root);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    if (nativeRoot === root) {
      nativeRoot = ''; localStorage.removeItem(CURRENT_KEY);
      document.getElementById('savedDot').classList.add('pending');
      document.getElementById('saveLabel').textContent = '保存先を選択してください';
    }
    renderRecent(); updateSaveLocation();
  }

  function shortPath(path) {
    const parts = path.replace(/\\/g, '/').split('/'); return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : parts.join('/');
  }

  function updateSaveLocation() {
    saveLocation.hidden = !nativeRoot;
    saveLocation.textContent = nativeRoot ? shortPath(nativeRoot) : '';
    saveLocation.title = nativeRoot;
  }

  function changedFilesMessage(paths) {
    if (!Array.isArray(paths) || !paths.length) return 'フォルダ内のファイルが別のアプリで変更されました。';
    const root = nativeRoot.replace(/\\/g, '/').replace(/\/$/, '');
    const names = [...new Set(paths.map(path => {
      const normalized = String(path).replace(/\\/g, '/');
      return normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : normalized.split('/').pop();
    }).filter(Boolean))];
    const shown = names.slice(0, 2).join('、'), rest = names.length - 2;
    return `${shown}${rest > 0 ? ` ほか${rest}件` : ''} が外部で変更されました。`;
  }

  function renderRecent() {
    let container = document.getElementById('recentProjects');
    if (!container) { container = document.createElement('div'); container.id = 'recentProjects'; container.className = 'recent-projects'; document.getElementById('importMenu').appendChild(container); }
    const recent = getRecent(); container.innerHTML = recent.length ? '<span class="recent-label">最近開いたフォルダ</span>' : '';
    const appendMenuButton = root => {
      const button = document.createElement('button'), title = document.createElement('strong'), path = document.createElement('span');
      title.textContent = shortPath(root); path.textContent = root; button.append(title, path);
      button.addEventListener('click', event => { event.stopPropagation(); toggleImportMenu(false); loadNativeRoot(root); }); container.appendChild(button);
    };
    recent.forEach(appendMenuButton);
    const start = document.getElementById('startRecentProjects'), list = document.getElementById('startRecentList');
    if (start && list) {
      start.hidden = recent.length === 0; list.innerHTML = '';
      recent.forEach(root => {
        const button = document.createElement('button'), title = document.createElement('strong'), path = document.createElement('span');
        button.type = 'button'; button.className = 'start-recent-button'; title.textContent = shortPath(root); path.textContent = root; button.append(title, path);
        button.addEventListener('click', () => loadNativeRoot(root)); list.appendChild(button);
      });
    }
  }

  async function startWatcher(root) {
    try { await invoke('watch_project_folder', { root }); } catch (_) {}
  }

  async function applyNativeProject(result) {
    if (!(await importEntries(payloadEntries(result)))) return false;
    rememberRoot(result.root); await startWatcher(result.root);
    window.dispatchEvent(new CustomEvent('canvas-native-saved'));
    return true;
  }

  async function openNativeFolder() {
    try {
      const result = await invoke('open_project_folder');
      if (result) await applyNativeProject(result);
    } catch (error) { showToast(String(error)); }
  }

  async function loadNativeRoot(root) {
    try { await applyNativeProject(await invoke('read_project_folder', { root })); }
    catch (error) {
      const exists = await invoke('project_folder_exists', { root }).catch(() => true);
      if (!exists) { forgetRoot(root); showToast('保存先が見つからないため履歴から外しました'); }
      else showToast(`フォルダを開けません: ${String(error)}`);
    }
  }

  function outputPayload() {
    const encoder = new TextEncoder();
    return Array.from(collectOutputFiles().values()).map(file => {
      const bytes = file.data instanceof Uint8Array ? file.data : encoder.encode(file.content || '');
      return { path: file.name, data: toBase64(bytes), type: file.type || detectMime(file.name) };
    });
  }

  async function saveNativeProject(chooseNewRoot = false) {
    try {
      let destinationRoot = nativeRoot;
      if (!destinationRoot || chooseNewRoot) { destinationRoot = await invoke('choose_save_folder'); if (!destinationRoot) return; }
      ignoreWatchUntil = Number.POSITIVE_INFINITY; markPending();
      const result = await invoke('save_project_files', { root: destinationRoot, files: outputPayload() });
      const count = typeof result === 'number' ? result : result.count;
      ignoreWatchUntil = Date.now() + 1200;
      commit(); window.dispatchEvent(new CustomEvent('canvas-native-saved')); rememberRoot(destinationRoot); await startWatcher(destinationRoot);
      showToast(result?.backup ? `${count}ファイルを安全に保存しました` : `${count}ファイルを保存しました（変更なし）`);
    } catch (error) { ignoreWatchUntil = Date.now() + 1200; document.getElementById('saveLabel').textContent = '保存できませんでした'; showToast(String(error)); }
  }

  function backupTime(value) {
    try { return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch (_) { return ''; }
  }

  function backupStatus(status) {
    return status === 'added' ? '保存時に追加' : status === 'missing' ? '現在は削除済み' : '内容が変更';
  }

  async function restoreDiskBackup(backup) {
    if (!nativeRoot) return;
    const countText = backup.changedCount ? `${backup.changedCount}ファイルが現在と異なります。` : '現在と同じ状態です。';
    if (!window.confirm(`${countText}\nこの保存前の状態へ戻しますか？\n現在の状態も復元用に残ります。`)) return;
    try {
      ignoreWatchUntil = Number.POSITIVE_INFINITY;
      const count = await invoke('restore_project_backup', { root: nativeRoot, id: backup.id });
      ignoreWatchUntil = Date.now() + 1200;
      await loadNativeRoot(nativeRoot);
      showToast(count ? `${count}ファイルを復元しました` : 'すでに同じ状態です');
      await renderDiskBackups();
    } catch (error) {
      ignoreWatchUntil = Date.now() + 1200;
      showToast(String(error));
    }
  }

  function createBackupRow(backup) {
    const row = document.createElement('div'), header = document.createElement('div'), info = document.createElement('div');
    const title = document.createElement('strong'), detail = document.createElement('span'), actions = document.createElement('div');
    const compare = document.createElement('button'), restore = document.createElement('button'), diff = document.createElement('div');
    row.className = 'disk-backup-row'; header.className = 'disk-backup-row-head'; actions.className = 'disk-backup-actions'; diff.className = 'backup-diff'; diff.hidden = true;
    title.textContent = `${backupTime(backup.createdAt)} の保存前`;
    detail.textContent = backup.changedCount ? `現在との差分 ${backup.changedCount}件・対象 ${backup.fileCount}ファイル` : `現在と同じ状態・対象 ${backup.fileCount}ファイル`;
    info.append(title, detail);
    compare.type = 'button'; compare.textContent = '差分を見る'; compare.disabled = !backup.changes?.length;
    compare.addEventListener('click', () => { diff.hidden = !diff.hidden; compare.textContent = diff.hidden ? '差分を見る' : '差分を閉じる'; });
    restore.type = 'button'; restore.className = 'restore-backup-btn'; restore.textContent = 'この状態へ戻す'; restore.addEventListener('click', () => restoreDiskBackup(backup));
    actions.append(compare, restore); header.append(info, actions); row.append(header);
    (backup.changes || []).forEach(change => {
      const item = document.createElement('div'), path = document.createElement('span'), status = document.createElement('span');
      item.className = 'backup-diff-row'; path.textContent = change.path; status.className = `backup-status ${change.status}`; status.textContent = backupStatus(change.status); item.append(path, status); diff.appendChild(item);
    });
    row.appendChild(diff); return row;
  }

  async function renderDiskBackups() {
    if (!diskBackupSection || !diskBackupList) return;
    diskBackupSection.hidden = false; diskBackupList.innerHTML = '';
    if (!nativeRoot) {
      const empty = document.createElement('div'); empty.className = 'recovery-empty'; empty.textContent = 'フォルダーへ保存すると、上書き前の状態がここに残ります'; diskBackupList.appendChild(empty); return;
    }
    try {
      const backups = await invoke('list_project_backups', { root: nativeRoot });
      if (!backups.length) {
        const empty = document.createElement('div'); empty.className = 'recovery-empty'; empty.textContent = '保存前バックアップはまだありません'; diskBackupList.appendChild(empty); return;
      }
      backups.forEach(backup => diskBackupList.appendChild(createBackupRow(backup)));
    } catch (error) {
      const empty = document.createElement('div'); empty.className = 'recovery-empty'; empty.textContent = `バックアップを読み込めません: ${String(error)}`; diskBackupList.appendChild(empty);
    }
  }

  document.querySelector('[data-import="folder"]').addEventListener('click', event => {
    event.preventDefault(); event.stopImmediatePropagation(); toggleImportMenu(false); openNativeFolder();
  }, true);
  saveButton.addEventListener('click', () => saveNativeProject());
  saveAsButton.addEventListener('click', () => saveNativeProject(true));
  window.addEventListener('canvas-save-request', () => saveNativeProject());
  window.addEventListener('canvas-save-as-request', () => saveNativeProject(true));
  window.addEventListener('canvas-recovery-open', renderDiskBackups);
  window.addEventListener('canvas-new-project', () => {
    nativeRoot = ''; localStorage.removeItem(CURRENT_KEY);
    updateSaveLocation(); document.getElementById('savedDot').classList.add('pending'); document.getElementById('saveLabel').textContent = '保存先を選択してください';
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopImmediatePropagation(); saveNativeProject(event.shiftKey); }
  }, true);

  document.getElementById('keepLocalBtn').addEventListener('click', () => banner.classList.remove('visible'));
  document.getElementById('reloadNativeBtn').addEventListener('click', async () => {
    if (dirty && !window.confirm('未保存の編集を破棄して、フォルダの内容を再読み込みしますか？')) return;
    banner.classList.remove('visible'); if (nativeRoot) await loadNativeRoot(nativeRoot);
  });

  if (tauri.event?.listen) {
    tauri.event.listen('project-files-changed', event => {
      if (Date.now() < ignoreWatchUntil) return;
      (Array.isArray(event?.payload) ? event.payload : []).forEach(path => pendingExternalPaths.add(path));
      clearTimeout(externalTimer);
      externalTimer = setTimeout(() => {
        document.getElementById('externalChangeMessage').textContent = changedFilesMessage([...pendingExternalPaths]);
        pendingExternalPaths = new Set();
        banner.classList.add('visible');
      }, 280);
    });
  }

  async function resumeNativeRoot() {
    if (!nativeRoot) return;
    const exists = await invoke('project_folder_exists', { root: nativeRoot }).catch(() => true);
    if (!exists) { const missing = nativeRoot; forgetRoot(missing); showToast('以前の保存先が見つからないため履歴から外しました'); return; }
    await startWatcher(nativeRoot);
  }

  renderRecent(); updateSaveLocation(); resumeNativeRoot();
})();
