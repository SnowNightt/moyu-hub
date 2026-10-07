mod parse;
mod xml;
use parse::{err, io, Result};
use serde_json::{json, Value};
use sqlx::{Row, SqlitePool};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct ReaderState {
    selections: Mutex<HashMap<String, PathBuf>>,
    job: Mutex<Value>,
    cancel: Arc<AtomicBool>,
    active: AtomicBool,
    initialized: Mutex<bool>,
    asset_lock: Mutex<()>,
    checked_sources: Mutex<HashMap<String, (String, i64)>>,
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn field<'a>(v: &'a Value, key: &str) -> Result<&'a str> {
    v.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| err("INVALID_INPUT", &format!("缺少 {key}")))
}
fn uuid_path(s: &str) -> Result<&str> {
    uuid::Uuid::parse_str(s).map_err(|_| err("INVALID_INPUT", "作品 ID 无效"))?;
    Ok(s)
}
fn data_root(app: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_data_dir().map_err(io)?.join("reader"))
}
fn cache_root(app: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_cache_dir().map_err(io)?.join("reader"))
}
async fn pool(app: &tauri::AppHandle) -> Result<SqlitePool> {
    let instances = app.state::<tauri_plugin_sql::DbInstances>();
    let dbs = instances.0.read().await;
    match dbs.get("sqlite:moyuhub.db") {
        Some(tauri_plugin_sql::DbPool::Sqlite(p)) => Ok(p.clone()),
        _ => Err(err("DATABASE_UNAVAILABLE", "本机数据库未就绪，请重试")),
    }
}
fn authorize(window: &tauri::WebviewWindow) -> Result<()> {
    if window.label() != "main" {
        Err(err("ACCESS_DENIED", "窗口无权访问阅读器"))
    } else {
        Ok(())
    }
}
fn source(app: &tauri::AppHandle, token: &str) -> Result<PathBuf> {
    app.state::<ReaderState>()
        .selections
        .lock()
        .unwrap()
        .get(token)
        .cloned()
        .ok_or_else(|| err("ACCESS_DENIED", "文件选择已过期，请重新选择"))
}
fn emit_job(
    app: &tauri::AppHandle,
    index: Option<usize>,
    status: &str,
    message: Option<String>,
    item: Option<String>,
) {
    let state = app.state::<ReaderState>();
    let mut job = state.job.lock().unwrap();
    if let Some(index) = index {
        job["entries"][index]["status"] = json!(status);
        if let Some(message) = message {
            job["entries"][index]["message"] = json!(message);
        }
        if let Some(item) = item {
            job["entries"][index]["itemId"] = json!(item);
        }
    } else {
        job["status"] = json!(status);
    }
    job["revision"] = json!(job["revision"].as_u64().unwrap_or(0) + 1);
    let _ = app.emit("reader-import", job.clone());
}
#[tauri::command]
pub async fn reader_select(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    directory: bool,
) -> Result<Value> {
    authorize(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let dialog=app.dialog().file().set_title(if directory{"选择一部漫画的图片目录"}else{"选择小说或漫画"});
        let files=if directory{dialog.blocking_pick_folder().into_iter().collect::<Vec<_>>()}else{dialog.add_filter("小说与漫画",&["txt","epub","cbz"]).blocking_pick_files().unwrap_or_default()};
        if files.len()>50{return Err(err("LIMIT_EXCEEDED","每批最多选择 50 部作品"));}
        let mut items=vec![];let state=app.state::<ReaderState>();let mut selections=state.selections.lock().unwrap();
        if selections.len()>500{selections.clear();}
        for file in files {let p=file.into_path().map_err(io)?.canonicalize().map_err(io)?;let token=id();
            items.push(json!({"sourceToken":token,"displayName":p.file_name().unwrap_or_default().to_string_lossy(),"format":parse::format(&p)?}));selections.insert(token,p);}
        Ok(json!(items))
    }).await.map_err(io)?
}
async fn recover(app: &tauri::AppHandle, db: &SqlitePool) -> Result<()> {
    if *app.state::<ReaderState>().initialized.lock().unwrap() {
        return Ok(());
    }
    let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM library_items")
        .fetch_all(db)
        .await
        .map_err(io)?;
    let root = data_root(app)?;
    fs::create_dir_all(root.join("library")).map_err(io)?;
    fs::create_dir_all(root.join("staging")).map_err(io)?;
    // Only UUID-named directories inside application-owned roots are ever removed.
    for name in ["staging", "library"] {
        for entry in fs::read_dir(root.join(name)).map_err(io)? {
            let entry = entry.map_err(io)?;
            let file_name = entry.file_name().to_string_lossy().into_owned();
            if uuid::Uuid::parse_str(&file_name).is_ok()
                && (name == "staging" || !ids.contains(&file_name))
                && entry.file_type().map_err(io)?.is_dir()
            {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }
    *app.state::<ReaderState>().initialized.lock().unwrap() = true;
    Ok(())
}
async fn item_row(db: &SqlitePool, item: &str) -> Result<sqlx::sqlite::SqliteRow> {
    uuid_path(item)?;
    sqlx::query("SELECT * FROM library_items WHERE id=?")
        .bind(item)
        .fetch_optional(db)
        .await
        .map_err(io)?
        .ok_or_else(|| err("NOT_FOUND", "作品已移除"))
}
async fn usable_source(
    app: &tauri::AppHandle,
    db: &SqlitePool,
    item: &str,
) -> Result<(PathBuf, String)> {
    let row = item_row(db, item).await?;
    let path = PathBuf::from(row.get::<String, _>("source_path"));
    let fmt: String = row.get("format");
    let saved: String = row.get("source_stamp");
    if app
        .state::<ReaderState>()
        .checked_sources
        .lock()
        .unwrap()
        .get(item)
        .is_some_and(|(stamp, time)| stamp == &saved && now() - time < 1000)
    {
        return Ok((path, fmt));
    }
    let p = path.clone();
    let stamp =
        tauri::async_runtime::spawn_blocking(move || parse::stamp(&p, &AtomicBool::new(false)))
            .await
            .map_err(io)??;
    if stamp != saved {
        return Err(err("SOURCE_CHANGED", "源内容已变化，请返回书架重新导入"));
    }
    app.state::<ReaderState>()
        .checked_sources
        .lock()
        .unwrap()
        .insert(item.into(), (saved, now()));
    Ok((path, fmt))
}
async fn insert_parsed(
    db: &SqlitePool,
    item: &str,
    fmt: &str,
    fingerprint: &str,
    path: &Path,
    mode: &str,
    stamp: &str,
    parsed: &parse::Parsed,
    title: Option<&str>,
) -> Result<Value> {
    let data = json!({"id":item,"sourceId":item,"source":"local","type":if fmt=="TXT"||fmt=="EPUB"{"novel"}else{"comic"},"title":title.filter(|v|!v.trim().is_empty()).unwrap_or(&parsed.title),"author":parsed.author,"format":fmt,"coverResourceId":parsed.resources.iter().find(|r|r.error.is_none()).map(|r|&r.id),"storageMode":mode,"availability":"ready","warnings":parsed.warnings.iter().take(50).collect::<Vec<_>>()});
    let mut tx = db.begin().await.map_err(io)?;
    sqlx::query("INSERT INTO library_items(id,format,fingerprint,source_path,storage_mode,source_stamp,encoding,data,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .bind(item).bind(fmt).bind(fingerprint).bind(path.to_string_lossy().as_ref()).bind(mode).bind(stamp).bind(&parsed.encoding).bind(data.to_string()).bind(now()).execute(&mut *tx).await.map_err(io)?;
    for chapter in &parsed.chapters {
        sqlx::query("INSERT INTO reader_chapters(item_id,id,ordinal,data) VALUES(?,?,?,?)")
            .bind(item)
            .bind(&chapter.id)
            .bind(chapter.index as i64)
            .bind(serde_json::to_string(chapter).map_err(io)?)
            .execute(&mut *tx)
            .await
            .map_err(io)?;
    }
    for resource in &parsed.resources {
        sqlx::query("INSERT INTO reader_resources(item_id,id,data) VALUES(?,?,?)")
            .bind(item)
            .bind(&resource.id)
            .bind(serde_json::to_string(resource).map_err(io)?)
            .execute(&mut *tx)
            .await
            .map_err(io)?;
    }
    tx.commit().await.map_err(io)?;
    Ok(data)
}
async fn import_one(
    app: &tauri::AppHandle,
    db: &SqlitePool,
    request: &Value,
    index: usize,
) -> Result<(String, bool)> {
    let path = source(app, field(request, "sourceToken")?)?;
    let fmt = parse::format(&path)?;
    let mode = field(request, "storageMode")?.to_owned();
    if !matches!(mode.as_str(), "copy" | "reference") {
        return Err(err("INVALID_INPUT", "存储方式无效"));
    }
    let item = id();
    let staging = data_root(app)?.join("staging").join(&item);
    let final_dir = data_root(app)?.join("library").join(&item);
    let cache = cache_root(app)?.join(&item);
    let cancel = app.state::<ReaderState>().cancel.clone();
    let enc = request
        .get("encoding")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let p = path.clone();
    let staging2 = staging.clone();
    let cache2 = cache.clone();
    let fmt2 = fmt.clone();
    let mode2 = mode.clone();
    let a = app.clone();
    let parsed_result = tauri::async_runtime::spawn_blocking(move || {
        parse::check(&cancel)?;
        let size = parse::source_size(&p, &fmt2, &cancel)?;
        let before = parse::stamp(&p, &cancel)?;
        emit_job(&a, Some(index), "preparing", None, None);
        fs::create_dir_all(&staging2).map_err(io)?;
        parse::check_space(&staging2, if mode2 == "copy" { size } else { 0 })?;
        let target = if mode2 == "copy" {
            let target = staging2.join(if fmt2 == "folder" {
                "source".into()
            } else {
                format!("source.{}", fmt2.to_lowercase())
            });
            parse::copy_source(&p, &target, &cancel)?;
            target
        } else {
            p.clone()
        };
        let fp = parse::fingerprint(&target, &cancel)?;
        emit_job(&a, Some(index), "indexing", None, None);
        let mut parsed = parse::parse(&target, &fmt2, &cache2, enc.as_deref(), &cancel)?;
        if fmt2 != "EPUB" || parsed.title == "source" {
            parsed.title = parse::name(&p);
        }
        if parse::stamp(&p, &cancel)? != before {
            return Err(err("SOURCE_CHANGED", "导入时源文件发生变化，请重试"));
        }
        parse::check(&cancel)?;
        Ok((target, fp, parsed))
    })
    .await
    .map_err(io)?;
    let outcome = async {
        let (target, fp, parsed) = parsed_result?;
        if let Some(existing) = sqlx::query_scalar::<_, String>(
            "SELECT id FROM library_items WHERE format=? AND fingerprint=?",
        )
        .bind(&fmt)
        .bind(&fp)
        .fetch_optional(db)
        .await
        .map_err(io)?
        {
            return Ok((existing, true));
        }
        parse::check(&app.state::<ReaderState>().cancel)?;
        emit_job(app, Some(index), "committing", None, None);
        let target = if mode == "copy" {
            fs::rename(&staging, &final_dir).map_err(io)?;
            final_dir.join(target.file_name().ok_or("源名称无效")?)
        } else {
            target
        };
        let stamp = parse::stamp(&target, &AtomicBool::new(false))?;
        insert_parsed(
            db,
            &item,
            &fmt,
            &fp,
            &target,
            &mode,
            &stamp,
            &parsed,
            request.get("title").and_then(Value::as_str),
        )
        .await?;
        Ok((item.clone(), false))
    }
    .await;
    let _ = fs::remove_dir_all(staging);
    if !matches!(&outcome, Ok((_, false))) {
        let _ = fs::remove_dir_all(final_dir);
        let _ = fs::remove_dir_all(cache);
    }
    outcome
}
async fn run_import(app: tauri::AppHandle, db: SqlitePool, requests: Vec<Value>) {
    for (index, request) in requests.iter().enumerate() {
        if app.state::<ReaderState>().cancel.load(Ordering::Relaxed) {
            emit_job(&app, Some(index), "cancelled", Some("已取消".into()), None);
            continue;
        }
        emit_job(&app, Some(index), "validating", None, None);
        match import_one(&app, &db, request, index).await {
            Ok((item, duplicate)) => {
                emit_job(
                    &app,
                    Some(index),
                    if duplicate { "duplicate" } else { "succeeded" },
                    Some(
                        if duplicate {
                            "书架已有相同内容"
                        } else {
                            "已加入书架"
                        }
                        .into(),
                    ),
                    Some(item),
                );
                let _ = app.emit("reader-changed", ());
            }
            Err(e) => {
                let status = if e.starts_with("CANCELLED:") {
                    "cancelled"
                } else {
                    "failed"
                };
                emit_job(&app, Some(index), status, Some(e), None);
            }
        }
    }
    emit_job(&app, None, "finished", None, None);
    app.state::<ReaderState>()
        .active
        .store(false, Ordering::SeqCst);
}
async fn json_rows(db: &SqlitePool, sql: &str, item: Option<&str>) -> Result<Value> {
    let q = sqlx::query_scalar::<_, String>(sql);
    let rows = if let Some(item) = item {
        q.bind(item).fetch_all(db).await
    } else {
        q.fetch_all(db).await
    }
    .map_err(io)?;
    Ok(Value::Array(
        rows.into_iter()
            .map(|s| serde_json::from_str(&s).map_err(io))
            .collect::<Result<Vec<_>>>()?,
    ))
}
async fn validate_progress(db: &SqlitePool, p: &Value) -> Result<()> {
    let item = field(p, "itemId")?;
    item_row(db, item).await?;
    let chapter = field(p, "chapterId")?;
    let data: Option<String> =
        sqlx::query_scalar("SELECT data FROM reader_chapters WHERE item_id=? AND id=?")
            .bind(item)
            .bind(chapter)
            .fetch_optional(db)
            .await
            .map_err(io)?;
    let ch: parse::Chapter = serde_json::from_str(&data.ok_or("章节无效")?).map_err(io)?;
    let position = p["position"].as_f64().ok_or("阅读位置无效")?;
    let completion = p["completion"].as_f64().ok_or("阅读进度无效")?;
    if !(0.0..=1.0).contains(&position) || !(0.0..=1.0).contains(&completion) {
        return Err(err("INVALID_INPUT", "阅读位置超出范围"));
    }
    let chunk = p["chunk"].as_u64().unwrap_or(0) as usize;
    if chunk >= ch.chunks.max(1) {
        return Err(err("INVALID_INPUT", "正文分块无效"));
    }
    if !ch.pages.is_empty() && p["page"].as_u64().unwrap_or(0) as usize >= ch.pages.len() {
        return Err(err("INVALID_INPUT", "页码无效"));
    }
    Ok(())
}
#[tauri::command]
pub async fn reader_api(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    op: String,
    args: Value,
) -> Result<Value> {
    authorize(&window)?;
    if op == "job" {
        return Ok(app.state::<ReaderState>().job.lock().unwrap().clone());
    }
    if op == "cancel" {
        app.state::<ReaderState>()
            .cancel
            .store(true, Ordering::Relaxed);
        return Ok(Value::Null);
    }
    if op == "inspect" {
        let path = source(&app, field(&args, "sourceToken")?)?;
        let enc = args["encoding"].as_str().map(str::to_owned);
        return tauri::async_runtime::spawn_blocking(move || {
            let fmt = parse::format(&path)?;
            let mut v =
                json!({"format":fmt,"type":if fmt=="TXT"||fmt=="EPUB"{"novel"}else{"comic"}});
            v["sizeBytes"] = json!(parse::source_size(&path, &fmt, &AtomicBool::new(false))?);
            if fmt == "folder" || fmt == "CBZ" {
                let mut names = if fmt == "folder" {
                    parse::folder_files(&path, &AtomicBool::new(false))?
                } else {
                    parse::archive(&path)?
                        .file_names()
                        .filter(|n| parse::image_name(n))
                        .map(str::to_owned)
                        .collect::<Vec<_>>()
                };
                names.sort_by(|a, b| parse::natural(a, b));
                v["pageCount"] = json!(names.len());
                v["pagePreview"] = json!(names.into_iter().take(20).collect::<Vec<_>>());
            }
            if fmt == "TXT" {
                let (e, preview, suspect) = parse::detect(&path, enc.as_deref())?;
                v["encoding"] = json!(e.name());
                v["preview"] = json!(preview);
                v["suspect"] = json!(suspect);
            }
            Ok(v)
        })
        .await
        .map_err(io)?;
    }
    let db = pool(&app).await?;
    match op.as_str() {
        "init" => {
            recover(&app, &db).await?;
            Ok(Value::Null)
        }
        "start" => {
            recover(&app, &db).await?;
            let requests = args["requests"].as_array().ok_or("导入参数无效")?.clone();
            if requests.is_empty() || requests.len() > 50 {
                return Err(err("LIMIT_EXCEEDED", "请选择 1–50 部作品"));
            }
            let state = app.state::<ReaderState>();
            if state.active.swap(true, Ordering::SeqCst) {
                return Err(err("BUSY", "已有导入任务，请等待完成"));
            }
            state.cancel.store(false, Ordering::Relaxed);
            let job = json!({"id":id(),"status":"running","revision":0,"entries":requests.iter().enumerate().map(|(i,r)|json!({"entryId":i,"name":r["displayName"],"request":r,"status":"queued"})).collect::<Vec<_>>()});
            *state.job.lock().unwrap() = job.clone();
            tauri::async_runtime::spawn(run_import(app.clone(), db, requests));
            Ok(job)
        }
        "library" => {
            let rows=sqlx::query("SELECT l.data,l.source_path,l.source_stamp,l.format,p.data AS progress FROM library_items l LEFT JOIN reading_progress p ON p.item_id=l.id ORDER BY l.created_at DESC").fetch_all(&db).await.map_err(io)?;
            tauri::async_runtime::spawn_blocking(move || {
                let mut items = vec![];
                for row in rows {
                    let mut value: Value = serde_json::from_str(row.get("data")).map_err(io)?;
                    let path = PathBuf::from(row.get::<String, _>("source_path"));
                    value["availability"] = json!(if !path.exists() {
                        "missing"
                    } else if row.get::<String, _>("format") != "folder"
                        && parse::stamp(&path, &AtomicBool::new(false)).ok().as_deref()
                            != Some(row.get::<String, _>("source_stamp").as_str())
                    {
                        "changed"
                    } else {
                        "ready"
                    });
                    if let Some(progress) = row.get::<Option<String>, _>("progress") {
                        value["progress"] = serde_json::from_str(&progress).map_err(io)?;
                    }
                    items.push(value);
                }
                Ok(Value::Array(items))
            })
            .await
            .map_err(io)?
        }
        "item" => {
            let row = item_row(&db, field(&args, "itemId")?).await?;
            serde_json::from_str(row.get("data")).map_err(io)
        }
        "chapters" => {
            json_rows(
                &db,
                "SELECT data FROM reader_chapters WHERE item_id=? ORDER BY ordinal",
                Some(field(&args, "itemId")?),
            )
            .await
        }
        "bookmarks" => {
            json_rows(
                &db,
                "SELECT data FROM bookmarks WHERE item_id=? ORDER BY rowid DESC",
                Some(field(&args, "itemId")?),
            )
            .await
        }
        "history" => json_rows(
            &db,
            "SELECT data FROM reading_progress WHERE history_visible=1 ORDER BY last_read_at DESC",
            None,
        )
        .await,
        "progress" => {
            let data: Option<String> =
                sqlx::query_scalar("SELECT data FROM reading_progress WHERE item_id=?")
                    .bind(field(&args, "itemId")?)
                    .fetch_optional(&db)
                    .await
                    .map_err(io)?;
            data.map(|s| serde_json::from_str(&s).map_err(io))
                .unwrap_or(Ok(Value::Null))
        }
        "saveProgress" => {
            validate_progress(&db, &args).await?;
            let mut p = args.clone();
            p["updatedAt"] = json!(now());
            sqlx::query("INSERT INTO reading_progress(item_id,data,last_read_at,history_visible) VALUES(?,?,?,1) ON CONFLICT(item_id) DO UPDATE SET data=excluded.data,last_read_at=excluded.last_read_at,history_visible=1")
                .bind(field(&p,"itemId")?).bind(p.to_string()).bind(now()).execute(&db).await.map_err(io)?;
            let _ = app.emit("reader-changed", ());
            Ok(p)
        }
        "hideHistory" => {
            if let Some(item) = args["itemId"].as_str() {
                sqlx::query("UPDATE reading_progress SET history_visible=0 WHERE item_id=?")
                    .bind(item)
                    .execute(&db)
                    .await
                    .map_err(io)?;
            } else {
                sqlx::query("UPDATE reading_progress SET history_visible=0")
                    .execute(&db)
                    .await
                    .map_err(io)?;
            }
            let _ = app.emit("reader-changed", ());
            Ok(Value::Null)
        }
        "addBookmark" => {
            validate_progress(&db, &args).await?;
            let mut p = args.clone();
            let locator = json!([
                p["chapterId"],
                p["chunk"],
                p["blockId"],
                p["offset"],
                p["page"]
            ])
            .to_string();
            p["id"] = json!(id());
            sqlx::query("INSERT OR IGNORE INTO bookmarks(id,item_id,locator,data) VALUES(?,?,?,?)")
                .bind(field(&p, "id")?)
                .bind(field(&p, "itemId")?)
                .bind(locator)
                .bind(p.to_string())
                .execute(&db)
                .await
                .map_err(io)?;
            Ok(p)
        }
        "removeBookmark" => {
            sqlx::query("DELETE FROM bookmarks WHERE id=?")
                .bind(field(&args, "id")?)
                .execute(&db)
                .await
                .map_err(io)?;
            Ok(Value::Null)
        }
        "content" => {
            let item = field(&args, "itemId")?.to_owned();
            let chapter = field(&args, "chapterId")?;
            let chunk = args["chunk"].as_u64().unwrap_or(0);
            let data: Option<String> =
                sqlx::query_scalar("SELECT data FROM reader_chapters WHERE item_id=? AND id=?")
                    .bind(&item)
                    .bind(chapter)
                    .fetch_optional(&db)
                    .await
                    .map_err(io)?;
            let ch: parse::Chapter =
                serde_json::from_str(&data.ok_or("章节不存在")?).map_err(io)?;
            if chunk >= ch.chunks as u64 {
                return Err(err("INVALID_INPUT", "正文分块不存在"));
            }
            let (path, fmt) = usable_source(&app, &db, &item).await?;
            let root = cache_root(&app)?.join(&item);
            let target = root.join(format!("{}-{chunk}.json", ch.id));
            let row = item_row(&db, &item).await?;
            let enc: Option<String> = row.get("encoding");
            let a = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let state = a.state::<ReaderState>();
                let _lock = state.asset_lock.lock().unwrap();
                if !target.exists() {
                    parse::parse(&path, &fmt, &root, enc.as_deref(), &AtomicBool::new(false))?;
                }
                let bytes = fs::read(target).map_err(io)?;
                serde_json::from_slice(&bytes).map_err(io)
            })
            .await
            .map_err(io)?
        }
        "resources" => {
            json_rows(
                &db,
                "SELECT data FROM reader_resources WHERE item_id=? ORDER BY rowid",
                Some(field(&args, "itemId")?),
            )
            .await
        }
        "resolveLink" => {
            let item = field(&args, "itemId")?;
            let href = field(&args, "href")?;
            let (target, anchor) = href.split_once('#').unwrap_or((href, ""));
            let rows: Vec<String> = sqlx::query_scalar(
                "SELECT data FROM reader_chapters WHERE item_id=? ORDER BY ordinal",
            )
            .bind(item)
            .fetch_all(&db)
            .await
            .map_err(io)?;
            for row in rows {
                let ch: parse::Chapter = serde_json::from_str(&row).map_err(io)?;
                if ch.target.as_deref() != Some(target) {
                    continue;
                }
                let (path, fmt) = usable_source(&app, &db, item).await?;
                let root = cache_root(&app)?.join(item);
                let a = app.clone();
                let anchor = anchor.to_owned();
                return tauri::async_runtime::spawn_blocking(move || {
                    let state=a.state::<ReaderState>(); let _lock=state.asset_lock.lock().unwrap();
                    if !root.join(format!("{}-0.json", ch.id)).exists() {
                        parse::parse(&path, &fmt, &root, None, &AtomicBool::new(false))?;
                    }
                    if anchor.is_empty() { return Ok(json!({"chapterId":ch.id,"chunk":0,"position":0})); }
                    for chunk in 0..ch.chunks {
                        let blocks: Vec<parse::Block> = serde_json::from_slice(&fs::read(root.join(format!("{}-{chunk}.json", ch.id))).map_err(io)?).map_err(io)?;
                        if let Some(block) = blocks.iter().find(|b| b.anchor.as_deref() == Some(anchor.as_str())) {
                            return Ok(json!({"chapterId":ch.id,"chunk":chunk,"blockId":block.id,"offset":0,"position":0}));
                        }
                    }
                    Err(err("NOT_FOUND", "书中链接目标不存在"))
                }).await.map_err(io)?;
            }
            Err(err("NOT_FOUND", "该链接不在可阅读章节中"))
        }
        "relocate" => {
            let item = field(&args, "itemId")?;
            let path = source(&app, field(&args, "sourceToken")?)?;
            let row = item_row(&db, item).await?;
            if row.get::<String, _>("storage_mode") != "reference" {
                return Err(err("INVALID_INPUT", "托管作品无需重新定位"));
            }
            let p = path.clone();
            let (fp, stamp) = tauri::async_runtime::spawn_blocking(move || {
                Ok::<_, String>((
                    parse::fingerprint(&p, &AtomicBool::new(false))?,
                    parse::stamp(&p, &AtomicBool::new(false))?,
                ))
            })
            .await
            .map_err(io)??;
            if fp != row.get::<String, _>("fingerprint") {
                return Err(err("SOURCE_CHANGED", "内容不同，请作为新作品导入"));
            }
            sqlx::query("UPDATE library_items SET source_path=?,source_stamp=? WHERE id=?")
                .bind(path.to_string_lossy().as_ref())
                .bind(stamp)
                .bind(item)
                .execute(&db)
                .await
                .map_err(io)?;
            Ok(Value::Null)
        }
        "remove" => {
            let item = field(&args, "itemId")?;
            item_row(&db, item).await?;
            let mut tx = db.begin().await.map_err(io)?;
            for table in [
                "bookmarks",
                "reading_progress",
                "reader_resources",
                "reader_chapters",
            ] {
                sqlx::query(&format!("DELETE FROM {table} WHERE item_id=?"))
                    .bind(item)
                    .execute(&mut *tx)
                    .await
                    .map_err(io)?;
            }
            sqlx::query("DELETE FROM library_items WHERE id=?")
                .bind(item)
                .execute(&mut *tx)
                .await
                .map_err(io)?;
            tx.commit().await.map_err(io)?;
            let _ = fs::remove_dir_all(data_root(&app)?.join("library").join(item));
            let _ = fs::remove_dir_all(cache_root(&app)?.join(item));
            let _ = app.emit("reader-changed", ());
            Ok(Value::Null)
        }
        "clearCache" => {
            if app.state::<ReaderState>().active.load(Ordering::Relaxed) {
                return Err(err("BUSY", "导入期间暂不能清理阅读缓存"));
            }
            let root = cache_root(&app)?;
            let a = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let state = a.state::<ReaderState>();
                let _lock = state.asset_lock.lock().unwrap();
                if root.exists() {
                    fs::remove_dir_all(root).map_err(io)?;
                }
                Ok::<_, String>(())
            })
            .await
            .map_err(io)??;
            Ok(Value::Null)
        }
        "cacheUsage" => {
            let root = cache_root(&app)?;
            fn size(p: &Path) -> u64 {
                fs::read_dir(p)
                    .into_iter()
                    .flatten()
                    .filter_map(|e| e.ok())
                    .map(|e| {
                        if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                            size(&e.path())
                        } else {
                            e.metadata().map(|m| m.len()).unwrap_or(0)
                        }
                    })
                    .sum()
            }
            Ok(json!(size(&root)))
        }
        _ => Err(err("INVALID_INPUT", "未知阅读器操作")),
    }
}
#[tauri::command]
pub async fn reader_asset(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    item_id: String,
    resource_id: String,
    thumbnail: bool,
    cache_limit_mb: u64,
) -> Result<tauri::ipc::Response> {
    authorize(&window)?;
    let db = pool(&app).await?;
    let (path, fmt) = usable_source(&app, &db, &item_id).await?;
    let data: Option<String> =
        sqlx::query_scalar("SELECT data FROM reader_resources WHERE item_id=? AND id=?")
            .bind(&item_id)
            .bind(&resource_id)
            .fetch_optional(&db)
            .await
            .map_err(io)?;
    let resource: parse::Resource = serde_json::from_str(&data.ok_or("图片不存在")?).map_err(io)?;
    if let Some(e) = resource.error {
        return Err(e);
    }
    let root = cache_root(&app)?;
    let target = root.join(uuid_path(&item_id)?).join("pages").join(format!(
        "{}-{}.png",
        resource.id,
        if thumbnail { 240 } else { 1280 }
    ));
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ReaderState>();
        let _lock = state.asset_lock.lock().unwrap();
        if let Ok(bytes) = fs::read(&target) {
            if let Ok(file) = fs::OpenOptions::new().write(true).open(&target) {
                let _ = file.set_modified(SystemTime::now());
            }
            return Ok(bytes);
        }
        let bytes = parse::display_image(
            parse::read_image(&path, &fmt, &resource.locator)?,
            if thumbnail { 240 } else { 1280 },
        )?;
        fs::create_dir_all(target.parent().ok_or("缓存路径无效")?).map_err(io)?;
        fs::write(&target, &bytes).map_err(io)?;
        // Evict only generated images. Text indexes and managed sources have separate lifetimes.
        let mut files = vec![];
        if let Ok(items) = fs::read_dir(&root) {
            for item in items.flatten() {
                if let Ok(pages) = fs::read_dir(item.path().join("pages")) {
                    for page in pages.flatten() {
                        if let Ok(m) = page.metadata() {
                            files.push((page.path(), m.len(), m.modified().unwrap_or(UNIX_EPOCH)));
                        }
                    }
                }
            }
        }
        let mut total: u64 = files.iter().map(|f| f.1).sum();
        let limit = cache_limit_mb.clamp(256, 4096) * 1024 * 1024;
        files.sort_by_key(|f| f.2);
        for (p, size, _) in files {
            if total <= limit {
                break;
            }
            if p != target && fs::remove_file(p).is_ok() {
                total = total.saturating_sub(size);
            }
        }
        Ok::<_, String>(bytes)
    })
    .await
    .map_err(io)??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod repository_tests {
    use super::*;
    fn parsed() -> parse::Parsed {
        parse::Parsed {
            title: "测试书".into(),
            author: None,
            encoding: Some("UTF-8".into()),
            warnings: vec![],
            resources: vec![],
            chapters: vec![parse::Chapter {
                id: "c0".into(),
                title: "正文".into(),
                index: 0,
                units: 100,
                pages: vec![],
                chunks: 1,
                target: None,
                navigation: vec![],
            }],
        }
    }
    #[test]
    fn import_transaction_rolls_back_and_checks_duplicate_fingerprints() {
        tauri::async_runtime::block_on(async {
            let db = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .unwrap();
            sqlx::raw_sql(include_str!("../../migrations/0001_steam.sql"))
                .execute(&db)
                .await
                .unwrap();
            sqlx::raw_sql(include_str!("../../migrations/0002_reader.sql"))
                .execute(&db)
                .await
                .unwrap();
            let first = id();
            insert_parsed(
                &db,
                &first,
                "TXT",
                "one",
                Path::new("source.txt"),
                "reference",
                "stamp",
                &parsed(),
                None,
            )
            .await
            .unwrap();
            assert!(insert_parsed(
                &db,
                &id(),
                "TXT",
                "one",
                Path::new("other.txt"),
                "copy",
                "stamp",
                &parsed(),
                None
            )
            .await
            .is_err());
            let mut bad = parsed();
            bad.chapters.push(bad.chapters[0].clone());
            assert!(insert_parsed(
                &db,
                &id(),
                "TXT",
                "two",
                Path::new("other.txt"),
                "reference",
                "stamp",
                &bad,
                None
            )
            .await
            .is_err());
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM library_items")
                .fetch_one(&db)
                .await
                .unwrap();
            assert_eq!(count, 1);
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM reader_chapters")
                .fetch_one(&db)
                .await
                .unwrap();
            assert_eq!(count, 1);
            assert!(validate_progress(
                &db,
                &json!({"itemId":first,"chapterId":"c0","position":0.3,"completion":0.3,"chunk":0})
            )
            .await
            .is_ok());
            assert!(validate_progress(
                &db,
                &json!({"itemId":first,"chapterId":"c0","position":1.1,"completion":0.3})
            )
            .await
            .is_err());
            assert!(validate_progress(
                &db,
                &json!({"itemId":first,"chapterId":"c99","position":0.3,"completion":0.3})
            )
            .await
            .is_err());
            db.close().await;
        });
    }
}
