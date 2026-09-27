use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, State};
use walkdir::{DirEntry, WalkDir};

const MAX_FILES: usize = 5_000;
const MAX_TOTAL_BYTES: u64 = 200 * 1024 * 1024;
const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;
const INTERNAL_DIR: &str = ".canvas-html-studio";
const BACKUPS_DIR: &str = "backups";
const TRANSACTIONS_DIR: &str = "transactions";
const MAX_BACKUPS: usize = 8;

#[derive(Default)]
struct WatchState(Mutex<Option<RecommendedWatcher>>);

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FilePayload {
    path: String,
    data: String,
    #[serde(rename = "type")]
    media_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectPayload {
    root: String,
    files: Vec<FilePayload>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BackupEntry {
    path: String,
    existed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    id: String,
    created_at: u64,
    entries: Vec<BackupEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransactionEntry {
    path: String,
    had_previous: bool,
    has_replacement: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransactionManifest {
    entries: Vec<TransactionEntry>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BackupChange {
    path: String,
    status: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BackupSummary {
    id: String,
    created_at: u64,
    file_count: usize,
    changed_count: usize,
    changes: Vec<BackupChange>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveResult {
    count: usize,
    backup: Option<BackupSummary>,
}

#[derive(Debug, Clone)]
struct FileChange {
    relative: PathBuf,
    data: Option<Vec<u8>>,
}

fn is_ignored_component(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | ".idea" | INTERNAL_DIR
    )
}

fn is_ignored(entry: &DirEntry) -> bool {
    let name = entry.file_name().to_string_lossy();
    entry.depth() > 0 && entry.file_type().is_dir() && is_ignored_component(&name)
}

fn media_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "md" | "markdown" => "text/markdown",
        "js" | "mjs" => "text/javascript",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        _ => "application/octet-stream",
    }
}

fn load_project(root: &Path) -> Result<ProjectPayload, String> {
    let root = root
        .canonicalize()
        .map_err(|error| format!("フォルダを開けません: {error}"))?;
    if !root.is_dir() {
        return Err("選択した場所はフォルダではありません".into());
    }
    recover_interrupted_transactions(&root)?;

    let mut files = Vec::new();
    let mut total_bytes = 0_u64;
    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| !is_ignored(entry))
    {
        let entry = entry.map_err(|error| format!("フォルダを読み取れません: {error}"))?;
        if !entry.file_type().is_file() {
            continue;
        }
        if files.len() >= MAX_FILES {
            return Err(format!("ファイル数が上限の{MAX_FILES}件を超えています"));
        }
        let metadata = entry
            .metadata()
            .map_err(|error| format!("ファイル情報を読めません: {error}"))?;
        if metadata.len() > MAX_FILE_BYTES {
            return Err(format!(
                "50MBを超えるファイルがあります: {}",
                entry.path().display()
            ));
        }
        total_bytes += metadata.len();
        if total_bytes > MAX_TOTAL_BYTES {
            return Err("プロジェクト全体が200MBを超えています".into());
        }
        let relative = entry
            .path()
            .strip_prefix(&root)
            .map_err(|_| "相対パスを作成できません")?;
        let data =
            fs::read(entry.path()).map_err(|error| format!("ファイルを読めません: {error}"))?;
        files.push(FilePayload {
            path: relative.to_string_lossy().replace('\\', "/"),
            data: BASE64.encode(data),
            media_type: media_type(entry.path()).into(),
        });
    }

    Ok(ProjectPayload {
        root: root.to_string_lossy().to_string(),
        files,
    })
}

fn choose_folder() -> Option<PathBuf> {
    rfd::FileDialog::new()
        .set_title("Webサイトのフォルダを選択")
        .pick_folder()
}

#[tauri::command]
async fn open_project_folder() -> Result<Option<ProjectPayload>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        choose_folder().map(|path| load_project(&path)).transpose()
    })
    .await
    .map_err(|error| format!("フォルダ選択を開始できません: {error}"))?
}

#[tauri::command]
async fn choose_save_folder() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        choose_folder().map(|path| path.to_string_lossy().to_string())
    })
    .await
    .map_err(|error| format!("保存先の選択を開始できません: {error}"))
}

#[tauri::command]
async fn read_project_folder(root: String) -> Result<ProjectPayload, String> {
    tauri::async_runtime::spawn_blocking(move || load_project(Path::new(&root)))
        .await
        .map_err(|error| format!("フォルダを読み込めません: {error}"))?
}

fn folder_exists(path: &Path) -> bool {
    path.is_dir()
}

#[tauri::command]
fn project_folder_exists(root: String) -> bool {
    folder_exists(Path::new(&root))
}

fn safe_relative(path: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    if candidate.is_absolute()
        || candidate
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(format!("安全でないファイルパスです: {path}"));
    }
    if candidate
        .components()
        .next()
        .is_some_and(|part| matches!(part, Component::Normal(name) if name == INTERNAL_DIR))
    {
        return Err(format!("アプリ専用領域には保存できません: {path}"));
    }
    Ok(candidate.to_path_buf())
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn operation_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{prefix}-{nanos}-{}", std::process::id())
}

fn remove_owned_directory(path: &Path) {
    if path
        .components()
        .any(|part| matches!(part, Component::Normal(name) if name == INTERNAL_DIR))
    {
        let _ = fs::remove_dir_all(path);
    }
}

fn rollback_changes(root: &Path, rollback_root: &Path, applied: &[PathBuf]) {
    for relative in applied.iter().rev() {
        let destination = root.join(relative);
        if destination.is_file() {
            let _ = fs::remove_file(&destination);
        }
        let previous = rollback_root.join(relative);
        if previous.is_file() {
            if let Some(parent) = destination.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::rename(previous, destination);
        }
    }
}

fn recover_transaction(root: &Path, transaction_root: &Path) -> Result<(), String> {
    let manifest_data = fs::read(transaction_root.join("manifest.json"))
        .map_err(|error| format!("中断した保存情報を読めません: {error}"))?;
    let manifest: TransactionManifest = serde_json::from_slice(&manifest_data)
        .map_err(|error| format!("中断した保存情報が壊れています: {error}"))?;
    let stage_root = transaction_root.join("stage");
    let rollback_root = transaction_root.join("rollback");
    for entry in manifest.entries.iter().rev() {
        let relative = safe_relative(&entry.path)?;
        let destination = root.join(&relative);
        let previous = rollback_root.join(&relative);
        if previous.is_file() {
            if destination.is_file() {
                fs::remove_file(&destination)
                    .map_err(|error| format!("中断した保存を戻せません: {error}"))?;
            }
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("復旧先を作成できません: {error}"))?;
            }
            fs::rename(previous, destination)
                .map_err(|error| format!("中断した保存を戻せません: {error}"))?;
        } else if !entry.had_previous
            && entry.has_replacement
            && !stage_root.join(&relative).exists()
            && destination.is_file()
        {
            fs::remove_file(destination)
                .map_err(|error| format!("中断した新規ファイルを戻せません: {error}"))?;
        }
    }
    remove_owned_directory(transaction_root);
    Ok(())
}

fn recover_interrupted_transactions(root: &Path) -> Result<usize, String> {
    let transactions_root = root.join(INTERNAL_DIR).join(TRANSACTIONS_DIR);
    if !transactions_root.is_dir() {
        return Ok(0);
    }
    let mut recovered = 0;
    for entry in fs::read_dir(&transactions_root)
        .map_err(|error| format!("中断した保存を確認できません: {error}"))?
    {
        let entry = entry.map_err(|error| format!("中断した保存を確認できません: {error}"))?;
        if entry.path().is_dir() {
            recover_transaction(root, &entry.path())?;
            recovered += 1;
        }
    }
    Ok(recovered)
}

fn transactional_apply_with_hook<F>(
    root: &Path,
    changes: &[FileChange],
    mut before_apply: F,
) -> Result<usize, String>
where
    F: FnMut(usize) -> Result<(), String>,
{
    if changes.is_empty() {
        return Ok(0);
    }
    let transaction_root = root
        .join(INTERNAL_DIR)
        .join(TRANSACTIONS_DIR)
        .join(operation_id("save"));
    let stage_root = transaction_root.join("stage");
    let rollback_root = transaction_root.join("rollback");

    let mut journal_entries = Vec::with_capacity(changes.len());
    for change in changes {
        let destination = root.join(&change.relative);
        if destination.exists() && !destination.is_file() {
            remove_owned_directory(&transaction_root);
            return Err(format!(
                "同名のフォルダがあるため保存できません: {}",
                destination.display()
            ));
        }
        if let Some(data) = &change.data {
            let stage = stage_root.join(&change.relative);
            if let Some(parent) = stage.parent() {
                if let Err(error) = fs::create_dir_all(parent) {
                    remove_owned_directory(&transaction_root);
                    return Err(format!("保存準備ができません: {error}"));
                }
            }
            if let Err(error) = fs::write(&stage, data) {
                remove_owned_directory(&transaction_root);
                return Err(format!("保存準備ができません: {error}"));
            }
        }
        journal_entries.push(TransactionEntry {
            path: change.relative.to_string_lossy().replace('\\', "/"),
            had_previous: destination.is_file(),
            has_replacement: change.data.is_some(),
        });
    }
    let journal = match serde_json::to_vec_pretty(&TransactionManifest {
        entries: journal_entries,
    }) {
        Ok(journal) => journal,
        Err(error) => {
            remove_owned_directory(&transaction_root);
            return Err(format!("安全保存情報を作成できません: {error}"));
        }
    };
    if let Err(error) = fs::write(transaction_root.join("manifest.json"), journal) {
        remove_owned_directory(&transaction_root);
        return Err(format!("安全保存情報を記録できません: {error}"));
    }

    let mut applied = Vec::new();
    for (index, change) in changes.iter().enumerate() {
        if let Err(error) = before_apply(index) {
            rollback_changes(root, &rollback_root, &applied);
            remove_owned_directory(&transaction_root);
            return Err(error);
        }

        let destination = root.join(&change.relative);
        if destination.exists() && !destination.is_file() {
            rollback_changes(root, &rollback_root, &applied);
            remove_owned_directory(&transaction_root);
            return Err(format!(
                "同名のフォルダがあるため保存できません: {}",
                destination.display()
            ));
        }
        if let Some(parent) = destination.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                rollback_changes(root, &rollback_root, &applied);
                remove_owned_directory(&transaction_root);
                return Err(format!("保存先を作成できません: {error}"));
            }
        }

        let had_previous = destination.is_file();
        if had_previous {
            let rollback = rollback_root.join(&change.relative);
            if let Some(parent) = rollback.parent() {
                if let Err(error) = fs::create_dir_all(parent) {
                    rollback_changes(root, &rollback_root, &applied);
                    remove_owned_directory(&transaction_root);
                    return Err(format!("安全保存を準備できません: {error}"));
                }
            }
            if let Err(error) = fs::rename(&destination, &rollback) {
                rollback_changes(root, &rollback_root, &applied);
                remove_owned_directory(&transaction_root);
                return Err(format!("元のファイルを保護できません: {error}"));
            }
        }

        if change.data.is_some() {
            let stage = stage_root.join(&change.relative);
            if let Err(error) = fs::rename(&stage, &destination) {
                if had_previous {
                    let _ = fs::rename(rollback_root.join(&change.relative), &destination);
                }
                rollback_changes(root, &rollback_root, &applied);
                remove_owned_directory(&transaction_root);
                return Err(format!("保存内容を反映できません: {error}"));
            }
        }
        applied.push(change.relative.clone());
    }

    remove_owned_directory(&transaction_root);
    Ok(changes.len())
}

fn transactional_apply(root: &Path, changes: &[FileChange]) -> Result<usize, String> {
    transactional_apply_with_hook(root, changes, |_| Ok(()))
}

fn create_backup(root: &Path, changes: &[FileChange]) -> Result<Option<BackupManifest>, String> {
    if changes.is_empty() {
        return Ok(None);
    }
    let id = operation_id("backup");
    let backup_root = root.join(INTERNAL_DIR).join(BACKUPS_DIR).join(&id);
    let files_root = backup_root.join("files");
    fs::create_dir_all(&backup_root)
        .map_err(|error| format!("バックアップを準備できません: {error}"))?;
    let mut entries = Vec::with_capacity(changes.len());
    for change in changes {
        let destination = root.join(&change.relative);
        let existed = destination.is_file();
        if destination.exists() && !existed {
            remove_owned_directory(&backup_root);
            return Err(format!(
                "同名のフォルダがあるためバックアップできません: {}",
                destination.display()
            ));
        }
        if existed {
            let backup_file = files_root.join(&change.relative);
            if let Some(parent) = backup_file.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("バックアップを準備できません: {error}"))?;
            }
            fs::copy(&destination, &backup_file)
                .map_err(|error| format!("バックアップを作成できません: {error}"))?;
        }
        entries.push(BackupEntry {
            path: change.relative.to_string_lossy().replace('\\', "/"),
            existed,
        });
    }
    let manifest = BackupManifest {
        id,
        created_at: now_millis(),
        entries,
    };
    let manifest_data = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| format!("バックアップ情報を作成できません: {error}"))?;
    fs::write(backup_root.join("manifest.json"), manifest_data)
        .map_err(|error| format!("バックアップ情報を保存できません: {error}"))?;
    Ok(Some(manifest))
}

fn backup_summary(root: &Path, manifest: &BackupManifest) -> Result<BackupSummary, String> {
    let files_root = root
        .join(INTERNAL_DIR)
        .join(BACKUPS_DIR)
        .join(&manifest.id)
        .join("files");
    let mut changes = Vec::new();
    for entry in &manifest.entries {
        let relative = safe_relative(&entry.path)?;
        let current = root.join(&relative);
        let status = if entry.existed {
            let backup = fs::read(files_root.join(&relative))
                .map_err(|error| format!("バックアップを読めません: {error}"))?;
            if !current.is_file() {
                Some("missing")
            } else if fs::read(&current).map_err(|error| format!("比較できません: {error}"))?
                != backup
            {
                Some("changed")
            } else {
                None
            }
        } else if current.exists() {
            Some("added")
        } else {
            None
        };
        if let Some(status) = status {
            changes.push(BackupChange {
                path: entry.path.clone(),
                status: status.into(),
            });
        }
    }
    Ok(BackupSummary {
        id: manifest.id.clone(),
        created_at: manifest.created_at,
        file_count: manifest.entries.len(),
        changed_count: changes.len(),
        changes,
    })
}

fn load_backup_manifest(root: &Path, id: &str) -> Result<BackupManifest, String> {
    if id.is_empty()
        || !id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("安全でないバックアップIDです".into());
    }
    let path = root
        .join(INTERNAL_DIR)
        .join(BACKUPS_DIR)
        .join(id)
        .join("manifest.json");
    let data = fs::read(path).map_err(|error| format!("バックアップを開けません: {error}"))?;
    let manifest: BackupManifest = serde_json::from_slice(&data)
        .map_err(|error| format!("バックアップ情報が壊れています: {error}"))?;
    if manifest.id != id {
        return Err("バックアップ情報が一致しません".into());
    }
    Ok(manifest)
}

fn list_backups(root: &Path) -> Result<Vec<BackupSummary>, String> {
    let root = root
        .canonicalize()
        .map_err(|error| format!("保存先を開けません: {error}"))?;
    let backups_root = root.join(INTERNAL_DIR).join(BACKUPS_DIR);
    if !backups_root.is_dir() {
        return Ok(Vec::new());
    }
    let mut manifests = Vec::new();
    for entry in fs::read_dir(&backups_root)
        .map_err(|error| format!("バックアップ一覧を読めません: {error}"))?
    {
        let entry = entry.map_err(|error| format!("バックアップ一覧を読めません: {error}"))?;
        if !entry.path().is_dir() {
            continue;
        }
        if let Ok(manifest) = load_backup_manifest(&root, &entry.file_name().to_string_lossy()) {
            manifests.push(manifest);
        }
    }
    manifests.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    manifests
        .iter()
        .map(|manifest| backup_summary(&root, manifest))
        .collect()
}

fn prune_backups(root: &Path) {
    if let Ok(backups) = list_backups(root) {
        for backup in backups.into_iter().skip(MAX_BACKUPS) {
            remove_owned_directory(&root.join(INTERNAL_DIR).join(BACKUPS_DIR).join(backup.id));
        }
    }
}

fn write_project_files(root: &Path, files: &[FilePayload]) -> Result<SaveResult, String> {
    fs::create_dir_all(root).map_err(|error| format!("保存先を作成できません: {error}"))?;
    let root = root
        .canonicalize()
        .map_err(|error| format!("保存先を開けません: {error}"))?;
    recover_interrupted_transactions(&root)?;
    if files.len() > MAX_FILES {
        return Err(format!("保存ファイル数が上限の{MAX_FILES}件を超えています"));
    }
    let mut total_bytes = 0_u64;
    let mut seen = HashSet::new();
    let mut changes = Vec::new();
    for file in files {
        let relative = safe_relative(&file.path)?;
        let normalized = relative
            .to_string_lossy()
            .replace('\\', "/")
            .to_ascii_lowercase();
        if !seen.insert(normalized) {
            return Err(format!("同じファイルが複数含まれています: {}", file.path));
        }
        let data = BASE64
            .decode(&file.data)
            .map_err(|_| format!("ファイルデータが壊れています: {}", file.path))?;
        total_bytes += data.len() as u64;
        if data.len() as u64 > MAX_FILE_BYTES || total_bytes > MAX_TOTAL_BYTES {
            return Err("保存データがサイズ上限を超えています".into());
        }
        let destination = root.join(&relative);
        if destination.exists() && !destination.is_file() {
            return Err(format!(
                "同名のフォルダがあるため保存できません: {}",
                destination.display()
            ));
        }
        if destination.is_file()
            && fs::read(&destination)
                .map_err(|error| format!("保存前の比較ができません: {error}"))?
                == data
        {
            continue;
        }
        changes.push(FileChange {
            relative,
            data: Some(data),
        });
    }
    let backup = create_backup(&root, &changes)?;
    if let Err(error) = transactional_apply(&root, &changes) {
        if let Some(manifest) = &backup {
            remove_owned_directory(&root.join(INTERNAL_DIR).join(BACKUPS_DIR).join(&manifest.id));
        }
        return Err(error);
    }
    prune_backups(&root);
    let summary = backup
        .as_ref()
        .map(|manifest| backup_summary(&root, manifest))
        .transpose()?;
    Ok(SaveResult {
        count: files.len(),
        backup: summary,
    })
}

#[tauri::command]
async fn save_project_files(root: String, files: Vec<FilePayload>) -> Result<SaveResult, String> {
    tauri::async_runtime::spawn_blocking(move || write_project_files(Path::new(&root), &files))
        .await
        .map_err(|error| format!("保存処理に失敗しました: {error}"))?
}

#[tauri::command]
async fn list_project_backups(root: String) -> Result<Vec<BackupSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || list_backups(Path::new(&root)))
        .await
        .map_err(|error| format!("バックアップ一覧を取得できません: {error}"))?
}

fn restore_backup(root: &Path, id: &str) -> Result<usize, String> {
    let root = root
        .canonicalize()
        .map_err(|error| format!("保存先を開けません: {error}"))?;
    recover_interrupted_transactions(&root)?;
    let manifest = load_backup_manifest(&root, id)?;
    let files_root = root
        .join(INTERNAL_DIR)
        .join(BACKUPS_DIR)
        .join(id)
        .join("files");
    let mut changes = Vec::new();
    for entry in &manifest.entries {
        let relative = safe_relative(&entry.path)?;
        let data = if entry.existed {
            Some(
                fs::read(files_root.join(&relative))
                    .map_err(|error| format!("復元ファイルを読めません: {error}"))?,
            )
        } else {
            None
        };
        let current = root.join(&relative);
        let already_equal = match &data {
            Some(previous) => {
                current.is_file()
                    && fs::read(&current)
                        .map(|value| value == *previous)
                        .unwrap_or(false)
            }
            None => !current.exists(),
        };
        if !already_equal {
            changes.push(FileChange { relative, data });
        }
    }
    if changes.is_empty() {
        return Ok(0);
    }
    let undo_backup = create_backup(&root, &changes)?;
    if let Err(error) = transactional_apply(&root, &changes) {
        if let Some(undo) = &undo_backup {
            remove_owned_directory(&root.join(INTERNAL_DIR).join(BACKUPS_DIR).join(&undo.id));
        }
        return Err(error);
    }
    prune_backups(&root);
    Ok(changes.len())
}

#[tauri::command]
async fn restore_project_backup(root: String, id: String) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || restore_backup(Path::new(&root), &id))
        .await
        .map_err(|error| format!("バックアップを復元できません: {error}"))?
}

fn relevant_change_paths(root: &Path, kind: &EventKind, paths: &[PathBuf]) -> Vec<String> {
    if !matches!(
        kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    ) {
        return Vec::new();
    }
    paths
        .iter()
        .filter(|path| {
            path.strip_prefix(root)
                .ok()
                .map(|relative| {
                    !relative.components().any(|component| {
                        matches!(component, Component::Normal(name) if is_ignored_component(&name.to_string_lossy()))
                    })
                })
                .unwrap_or(false)
        })
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

fn create_project_watcher<F>(path: &Path, mut on_change: F) -> Result<RecommendedWatcher, String>
where
    F: FnMut(Vec<String>) + Send + 'static,
{
    let watched_root = path.to_path_buf();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        if let Ok(event) = result {
            let paths = relevant_change_paths(&watched_root, &event.kind, &event.paths);
            if !paths.is_empty() {
                on_change(paths);
            }
        }
    })
    .map_err(|error| format!("監視を作成できません: {error}"))?;
    watcher
        .watch(path, RecursiveMode::Recursive)
        .map_err(|error| format!("監視を開始できません: {error}"))?;
    Ok(watcher)
}

#[tauri::command]
fn watch_project_folder(
    root: String,
    app: AppHandle,
    state: State<'_, WatchState>,
) -> Result<(), String> {
    let path = PathBuf::from(root)
        .canonicalize()
        .map_err(|error| format!("監視を開始できません: {error}"))?;
    let watcher = create_project_watcher(&path, move |paths| {
        let _ = app.emit("project-files-changed", paths);
    })?;
    *state.0.lock().map_err(|_| "監視状態を更新できません")? = Some(watcher);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatchState::default())
        .invoke_handler(tauri::generate_handler![
            open_project_folder,
            choose_save_folder,
            read_project_folder,
            project_folder_exists,
            save_project_files,
            list_project_backups,
            restore_project_backup,
            watch_project_folder
        ])
        .run(tauri::generate_context!())
        .expect("Canvas HTML Studio failed to start");
}
