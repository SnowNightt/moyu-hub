use encoding_rs::Encoding;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    cmp::Ordering,
    collections::{BTreeMap, HashMap},
    fs::{self, File},
    io::{BufRead, BufReader, Read, Write},
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering as AtomicOrdering},
};

pub type Result<T> = std::result::Result<T, String>;
pub const MAX_ENTRIES: usize = 20_000;
pub const MAX_IMAGE: u64 = 32 * 1024 * 1024;
const MAX_XML: u64 = 16 * 1024 * 1024;
pub fn err(code: &str, message: &str) -> String {
    format!("{code}: {message}")
}
pub fn io(e: impl std::fmt::Display) -> String {
    err("IO_ERROR", &e.to_string())
}
pub fn check(cancel: &AtomicBool) -> Result<()> {
    if cancel.load(AtomicOrdering::Relaxed) {
        Err(err("CANCELLED", "已取消导入"))
    } else {
        Ok(())
    }
}
pub fn name(path: &Path) -> String {
    path.file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}
pub fn format(path: &Path) -> Result<String> {
    if path.is_dir() {
        return Ok("folder".into());
    }
    match path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "txt" => Ok("TXT".into()),
        "epub" => Ok("EPUB".into()),
        "cbz" => Ok("CBZ".into()),
        _ => Err(err(
            "UNSUPPORTED_FORMAT",
            "仅支持 TXT、EPUB、CBZ 和图片文件夹",
        )),
    }
}
pub fn image_name(s: &str) -> bool {
    matches!(
        s.rsplit('.')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "jpg" | "jpeg" | "png" | "webp"
    )
}
pub fn safe_member(s: &str) -> bool {
    !s.is_empty()
        && !s.contains(['\\', ':', '\0'])
        && !s.starts_with('/')
        && s.split('/').all(|s| s != "..")
        && Path::new(s)
            .components()
            .all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
}
fn hidden(s: &str) -> bool {
    s.split('/').any(|s| s.starts_with('.') || s == "__MACOSX")
}
pub fn natural(a: &str, b: &str) -> Ordering {
    let aa: Vec<char> = a.to_lowercase().chars().collect();
    let bb: Vec<char> = b.to_lowercase().chars().collect();
    let (mut i, mut j) = (0, 0);
    while i < aa.len() && j < bb.len() {
        if aa[i].is_ascii_digit() && bb[j].is_ascii_digit() {
            let (si, sj) = (i, j);
            while i < aa.len() && aa[i].is_ascii_digit() {
                i += 1;
            }
            while j < bb.len() && bb[j].is_ascii_digit() {
                j += 1;
            }
            let x: String = aa[si..i].iter().collect();
            let y: String = bb[sj..j].iter().collect();
            let (x, y) = (x.trim_start_matches('0'), y.trim_start_matches('0'));
            let ord = x.len().cmp(&y.len()).then(x.cmp(y));
            if ord != Ordering::Equal {
                return ord;
            }
        } else {
            let ord = aa[i].cmp(&bb[j]);
            if ord != Ordering::Equal {
                return ord;
            }
            i += 1;
            j += 1;
        }
    }
    aa.len().cmp(&bb.len()).then(a.cmp(b))
}
fn reparse(m: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        m.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        m.file_type().is_symlink()
    }
}
pub fn folder_files(root: &Path, cancel: &AtomicBool) -> Result<Vec<String>> {
    fn walk(
        root: &Path,
        p: &Path,
        depth: usize,
        out: &mut Vec<String>,
        cancel: &AtomicBool,
    ) -> Result<()> {
        if depth > 16 {
            return Err(err("LIMIT_EXCEEDED", "目录超过 16 层"));
        }
        for entry in fs::read_dir(p).map_err(io)? {
            check(cancel)?;
            let entry = entry.map_err(io)?;
            let path = entry.path();
            let m = fs::symlink_metadata(&path).map_err(io)?;
            if reparse(&m) {
                continue;
            }
            let rel = path
                .strip_prefix(root)
                .map_err(io)?
                .to_string_lossy()
                .replace('\\', "/");
            if hidden(&rel) {
                continue;
            }
            if m.is_dir() {
                walk(root, &path, depth + 1, out, cancel)?;
            } else if m.is_file() && image_name(&rel) {
                out.push(rel);
            }
            if out.len() > MAX_ENTRIES {
                return Err(err("LIMIT_EXCEEDED", "图片超过 20,000 张"));
            }
        }
        Ok(())
    }
    let mut out = vec![];
    walk(root, root, 0, &mut out, cancel)?;
    out.sort_by(|a, b| natural(a, b));
    Ok(out)
}
pub fn stamp(path: &Path, cancel: &AtomicBool) -> Result<String> {
    let paths = if path.is_dir() {
        folder_files(path, cancel)?
    } else {
        vec![String::new()]
    };
    let mut hash = Sha256::new();
    for rel in paths {
        check(cancel)?;
        let m = fs::metadata(if rel.is_empty() {
            path.to_owned()
        } else {
            path.join(&rel)
        })
        .map_err(|_| err("SOURCE_MISSING", "源文件不存在或无法访问"))?;
        hash.update(rel.as_bytes());
        hash.update(m.len().to_le_bytes());
        hash.update(
            m.modified()
                .map_err(io)?
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(io)?
                .as_nanos()
                .to_le_bytes(),
        );
    }
    Ok(format!("{:x}", hash.finalize()))
}
pub fn fingerprint(path: &Path, cancel: &AtomicBool) -> Result<String> {
    let paths = if path.is_dir() {
        folder_files(path, cancel)?
    } else {
        vec![String::new()]
    };
    let mut hash = Sha256::new();
    let mut total = 0u64;
    for rel in paths {
        check(cancel)?;
        let p = if rel.is_empty() {
            path.to_owned()
        } else {
            path.join(&rel)
        };
        let mut file = File::open(p).map_err(io)?;
        hash.update((rel.len() as u64).to_le_bytes());
        hash.update(rel.as_bytes());
        hash.update(file.metadata().map_err(io)?.len().to_le_bytes());
        let mut buf = [0u8; 65536];
        loop {
            check(cancel)?;
            let n = file.read(&mut buf).map_err(io)?;
            if n == 0 {
                break;
            }
            total += n as u64;
            if total > 8 * 1024 * 1024 * 1024 {
                return Err(err("LIMIT_EXCEEDED", "源内容超过 8 GiB"));
            }
            hash.update(&buf[..n]);
        }
    }
    Ok(format!("{:x}", hash.finalize()))
}
pub fn copy_source(src: &Path, target: &Path, cancel: &AtomicBool) -> Result<()> {
    let paths = if src.is_dir() {
        folder_files(src, cancel)?
    } else {
        vec![String::new()]
    };
    for rel in paths {
        let from = if rel.is_empty() {
            src.to_owned()
        } else {
            src.join(&rel)
        };
        let to = if rel.is_empty() {
            target.to_owned()
        } else {
            target.join(&rel)
        };
        fs::create_dir_all(to.parent().ok_or("路径不可用")?).map_err(io)?;
        let mut input = File::open(from).map_err(io)?;
        let mut output = File::create(to).map_err(io)?;
        let mut b = [0u8; 65536];
        loop {
            check(cancel)?;
            let n = input.read(&mut b).map_err(io)?;
            if n == 0 {
                break;
            }
            output.write_all(&b[..n]).map_err(io)?;
        }
        output.sync_all().map_err(io)?;
    }
    Ok(())
}
pub fn source_size(path: &Path, fmt: &str, cancel: &AtomicBool) -> Result<u64> {
    let size = if path.is_dir() {
        folder_files(path, cancel)?
            .iter()
            .try_fold(0u64, |total, rel| {
                check(cancel)?;
                Ok::<_, String>(
                    total.saturating_add(fs::metadata(path.join(rel)).map_err(io)?.len()),
                )
            })?
    } else {
        fs::metadata(path).map_err(io)?.len()
    };
    let limit = match fmt {
        "TXT" => 200 * 1024 * 1024,
        "EPUB" => 512 * 1024 * 1024,
        _ => 8 * 1024 * 1024 * 1024u64,
    };
    if size > limit {
        return Err(err("LIMIT_EXCEEDED", "文件体积超过该格式的导入上限"));
    }
    Ok(size)
}
pub fn check_space(directory: &Path, required: u64) -> Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = directory.as_os_str().encode_wide().chain(Some(0)).collect();
        let mut free = 0;
        if unsafe {
            windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut free,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        } == 0
        {
            return Err(io(std::io::Error::last_os_error()));
        }
        if free < required.saturating_add(32 * 1024 * 1024) {
            return Err(err("DISK_FULL", "应用书库所在磁盘空间不足"));
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (directory, required);
    }
    Ok(())
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub id: String,
    pub kind: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_id: Option<String>,
    #[serde(default)]
    pub anchor: Option<String>,
    #[serde(default)]
    pub runs: Vec<Inline>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Inline {
    pub text: String,
    pub strong: bool,
    pub emphasis: bool,
    pub href: Option<String>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Navigation {
    pub title: String,
    pub href: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub id: String,
    pub title: String,
    pub index: usize,
    pub units: usize,
    pub pages: Vec<String>,
    pub chunks: usize,
    pub target: Option<String>,
    #[serde(default)]
    pub navigation: Vec<Navigation>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Resource {
    pub id: String,
    pub locator: String,
    pub width: u32,
    pub height: u32,
    pub error: Option<String>,
}
pub struct Parsed {
    pub title: String,
    pub author: Option<String>,
    pub chapters: Vec<Chapter>,
    pub resources: Vec<Resource>,
    pub encoding: Option<String>,
    pub warnings: Vec<String>,
}
impl Parsed {
    fn new(path: &Path) -> Self {
        Self {
            title: name(path),
            author: None,
            chapters: vec![],
            resources: vec![],
            encoding: None,
            warnings: vec![],
        }
    }
}
pub fn detect(path: &Path, label: Option<&str>) -> Result<(&'static Encoding, String, bool)> {
    let mut bytes = vec![];
    File::open(path)
        .map_err(io)?
        .take(65536)
        .read_to_end(&mut bytes)
        .map_err(io)?;
    let enc = if let Some(label) = label {
        Encoding::for_label(label.as_bytes())
            .ok_or_else(|| err("ENCODING_REQUIRED", "不支持的编码"))?
    } else if let Some((enc, _)) = Encoding::for_bom(&bytes) {
        enc
    } else {
        let mut detector = chardetng::EncodingDetector::new();
        detector.feed(&bytes, false);
        detector.guess(None, true)
    };
    let (text, _, errors) = enc.decode(&bytes);
    let preview: String = text.chars().take(600).collect();
    Ok((enc, preview, errors))
}
struct ChapterWriter {
    root: PathBuf,
    blocks: Vec<Block>,
    size: usize,
    count: usize,
    chapter: Chapter,
}
impl ChapterWriter {
    fn new(root: &Path, index: usize, title: String) -> Self {
        Self {
            root: root.to_owned(),
            blocks: vec![],
            size: 0,
            count: 0,
            chapter: Chapter {
                id: format!("c{index}"),
                title,
                index,
                units: 0,
                pages: vec![],
                chunks: 0,
                target: None,
                navigation: vec![],
            },
        }
    }
    fn push(
        &mut self,
        kind: &str,
        text: String,
        resource: Option<String>,
        anchor: Option<String>,
    ) -> Result<()> {
        self.rich(kind, text, resource, anchor, vec![])
    }
    fn rich(
        &mut self,
        kind: &str,
        text: String,
        resource: Option<String>,
        anchor: Option<String>,
        runs: Vec<Inline>,
    ) -> Result<()> {
        // Bound both text nodes and IPC payloads, including a file with a single enormous paragraph.
        if text.len() > 32 * 1024 {
            let mut piece = String::new();
            for c in text.chars() {
                piece.push(c);
                if piece.len() >= 16 * 1024 {
                    self.push(kind, std::mem::take(&mut piece), None, None)?;
                }
            }
            if !piece.is_empty() {
                self.push(kind, piece, None, None)?;
            }
            return Ok(());
        }
        self.chapter.units += text.encode_utf16().count().max(1);
        self.size += text.len()
            + runs
                .iter()
                .map(|r| r.text.len() + r.href.as_ref().map_or(0, String::len) + 128)
                .sum::<usize>()
            + 256;
        self.blocks.push(Block {
            id: format!("b{}", self.count),
            kind: kind.into(),
            text,
            resource_id: resource,
            anchor,
            runs,
        });
        self.count += 1;
        if self.size >= 96 * 1024 {
            self.flush()?;
        }
        Ok(())
    }
    fn flush(&mut self) -> Result<()> {
        if self.blocks.is_empty() {
            return Ok(());
        }
        fs::create_dir_all(&self.root).map_err(io)?;
        fs::write(
            self.root
                .join(format!("{}-{}.json", self.chapter.id, self.chapter.chunks)),
            serde_json::to_vec(&self.blocks).map_err(io)?,
        )
        .map_err(io)?;
        self.chapter.chunks += 1;
        self.blocks.clear();
        self.size = 0;
        Ok(())
    }
    fn finish(mut self) -> Result<Chapter> {
        self.flush()?;
        Ok(self.chapter)
    }
}
fn txt(path: &Path, root: &Path, label: Option<&str>, cancel: &AtomicBool) -> Result<Parsed> {
    if fs::metadata(path).map_err(io)?.len() > 200 * 1024 * 1024 {
        return Err(err("LIMIT_EXCEEDED", "TXT 超过 200 MiB"));
    }
    let (enc, _, _) = detect(path, label)?;
    let mut parsed = Parsed::new(path);
    parsed.encoding = Some(enc.name().into());
    let decoder = encoding_rs_io::DecodeReaderBytesBuilder::new()
        .encoding(Some(enc))
        .build(File::open(path).map_err(io)?);
    let mut reader = BufReader::new(decoder);
    let heading=Regex::new(r"(?i)^(第[零〇一二三四五六七八九十百千万两0-9]+[章回节卷部]|chapter\s+[0-9ivxlc]+|序章|序言|前言|楔子|番外|尾声|后记)").unwrap();
    let mut writer = ChapterWriter::new(root, 0, "正文".into());
    let mut line = String::new();
    let mut buf = vec![];
    let mut carry = vec![];
    loop {
        check(cancel)?; // read_until through a bounded take prevents an unbounded one-line allocation.
        buf.clear();
        let n = reader
            .by_ref()
            .take(32 * 1024)
            .read_until(b'\n', &mut buf)
            .map_err(io)?;
        if n == 0 {
            break;
        }
        if !carry.is_empty() {
            carry.extend_from_slice(&buf);
            buf = std::mem::take(&mut carry);
        }
        let valid = match std::str::from_utf8(&buf) {
            Ok(_) => buf.len(),
            Err(e) if e.error_len().is_none() => e.valid_up_to(),
            Err(_) => return Err(err("ENCODING_REQUIRED", "解码异常，请重新选择编码")),
        };
        carry.extend_from_slice(&buf[valid..]);
        line.push_str(std::str::from_utf8(&buf[..valid]).map_err(io)?);
        if line.contains('\u{fffd}') && label.is_none() {
            return Err(err(
                "ENCODING_REQUIRED",
                "编码可能不正确，请选择编码并检查预览",
            ));
        }
        let value = line.trim_matches(['\u{feff}', '\r', '\n']).trim();
        if !value.is_empty() {
            if value.chars().count() <= 80 && heading.is_match(value) {
                if writer.count > 0 {
                    if parsed.chapters.len() >= MAX_ENTRIES {
                        return Err(err("LIMIT_EXCEEDED", "章节超过 20,000 个"));
                    }
                    parsed.chapters.push(writer.finish()?);
                    writer = ChapterWriter::new(root, parsed.chapters.len(), value.into());
                } else {
                    writer.chapter.title = value.into();
                }
                writer.push("heading", value.into(), None, None)?;
            } else {
                writer.push("paragraph", value.into(), None, None)?;
            }
        }
        line.clear();
    }
    if !carry.is_empty() {
        return Err(err("ENCODING_REQUIRED", "文本末尾编码不完整"));
    }
    if writer.count > 0 {
        parsed.chapters.push(writer.finish()?);
    }
    if parsed.chapters.is_empty() {
        return Err(err("EMPTY_CONTENT", "TXT 没有正文"));
    }
    Ok(parsed)
}
pub fn archive(path: &Path) -> Result<zip::ZipArchive<File>> {
    let mut z = zip::ZipArchive::new(File::open(path).map_err(io)?)
        .map_err(|_| err("CORRUPT_ARCHIVE", "压缩包无法打开"))?;
    if z.len() > MAX_ENTRIES {
        return Err(err("LIMIT_EXCEEDED", "压缩条目超过 20,000 个"));
    }
    let mut total = 0u64;
    for i in 0..z.len() {
        let f = z.by_index(i).map_err(io)?;
        if !safe_member(f.name().trim_end_matches('/'))
            || f.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000)
        {
            return Err(err("INVALID_PATH", "压缩包包含不安全路径"));
        }
        total = total.checked_add(f.size()).ok_or("解压体积溢出")?;
        if total > 16 * 1024 * 1024 * 1024 {
            return Err(err("LIMIT_EXCEEDED", "解压体积超过 16 GiB"));
        }
    }
    Ok(z)
}
pub fn zip_bytes(z: &mut zip::ZipArchive<File>, member: &str, limit: u64) -> Result<Vec<u8>> {
    let mut f = z.by_name(member).map_err(io)?;
    if f.size() > limit {
        return Err(err("LIMIT_EXCEEDED", "单个资源过大"));
    }
    let mut b = vec![];
    f.by_ref().take(limit + 1).read_to_end(&mut b).map_err(io)?;
    if b.len() as u64 > limit {
        return Err(err("LIMIT_EXCEEDED", "资源实际体积过大"));
    }
    Ok(b)
}
fn dimensions(bytes: &[u8]) -> Result<(u32, u32)> {
    let reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(io)?;
    if !matches!(
        reader.format(),
        Some(image::ImageFormat::Png | image::ImageFormat::Jpeg | image::ImageFormat::WebP)
    ) {
        return Err(err("CORRUPT_IMAGE", "不支持的图片内容"));
    }
    let (w, h) = reader
        .into_dimensions()
        .map_err(|_| err("CORRUPT_IMAGE", "图片损坏"))?;
    if w == 0 || h == 0 || w as u64 * h as u64 > 40_000_000 {
        return Err(err("LIMIT_EXCEEDED", "图片超过 4000 万像素"));
    }
    Ok((w, h))
}
pub fn read_image(path: &Path, format: &str, loc: &str) -> Result<Vec<u8>> {
    if !safe_member(loc) {
        return Err(err("INVALID_PATH", "资源路径无效"));
    }
    if format == "folder" {
        let target = path.join(loc).canonicalize().map_err(io)?;
        let root = path.canonicalize().map_err(io)?;
        if !target.starts_with(root) {
            return Err(err("INVALID_PATH", "图片超出作品目录"));
        }
        let mut b = vec![];
        File::open(target)
            .map_err(io)?
            .take(MAX_IMAGE + 1)
            .read_to_end(&mut b)
            .map_err(io)?;
        if b.len() as u64 > MAX_IMAGE {
            return Err(err("LIMIT_EXCEEDED", "图片超过 32 MiB"));
        }
        Ok(b)
    } else {
        zip_bytes(&mut archive(path)?, loc, MAX_IMAGE)
    }
}
fn comic(path: &Path, fmt: &str, cancel: &AtomicBool) -> Result<Parsed> {
    let mut parsed = Parsed::new(path);
    let mut z = if fmt == "CBZ" {
        Some(archive(path)?)
    } else {
        None
    };
    let mut names = if let Some(z) = &z {
        z.file_names()
            .filter(|s| image_name(s) && !hidden(s))
            .map(str::to_owned)
            .collect()
    } else {
        folder_files(path, cancel)?
    };
    names.sort_by(|a, b| natural(a, b));
    let mut groups: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut valid = 0;
    for loc in names {
        check(cancel)?;
        let bytes = if let Some(z) = &mut z {
            zip_bytes(z, &loc, MAX_IMAGE)
        } else {
            read_image(path, fmt, &loc)
        };
        let size = bytes.and_then(|b| dimensions(&b));
        let (w, h, error) = match size {
            Ok((w, h)) => {
                valid += 1;
                (w, h, None)
            }
            Err(e) => {
                parsed.warnings.push(format!("{loc}：无法读取，将显示占位"));
                (800, 1200, Some(e))
            }
        };
        let id = format!("r{}", parsed.resources.len());
        groups
            .entry(
                loc.rsplit_once('/')
                    .map(|(p, _)| p)
                    .unwrap_or("正文")
                    .into(),
            )
            .or_default()
            .push(id.clone());
        parsed.resources.push(Resource {
            id,
            locator: loc,
            width: w,
            height: h,
            error,
        });
    }
    if valid == 0 {
        return Err(err("EMPTY_CONTENT", "没有可读的 JPEG、PNG 或 WebP 图片"));
    }
    let mut groups: Vec<_> = groups.into_iter().collect();
    groups.sort_by(|a, b| natural(&a.0, &b.0));
    for (title, pages) in groups {
        let i = parsed.chapters.len();
        parsed.chapters.push(Chapter {
            id: format!("c{i}"),
            title,
            index: i,
            units: pages.len(),
            pages,
            chunks: 0,
            target: None,
            navigation: vec![],
        });
    }
    Ok(parsed)
}
fn resolve(base: &str, href: &str) -> Result<String> {
    let decoded = percent_encoding::percent_decode_str(href.split('#').next().unwrap_or(""))
        .decode_utf8()
        .map_err(io)?;
    if decoded.contains([':', '\\']) || decoded.starts_with('/') {
        return Err(err("INVALID_PATH", "EPUB 资源路径无效"));
    }
    let mut parts: Vec<&str> = base
        .rsplit_once('/')
        .map(|(p, _)| p.split('/').collect())
        .unwrap_or_default();
    for p in decoded.split('/') {
        match p {
            "" | "." => {}
            ".." => {
                if parts.pop().is_none() {
                    return Err(err("INVALID_PATH", "EPUB 资源越界"));
                }
            }
            _ => parts.push(p),
        }
    }
    let value = parts.join("/");
    if !safe_member(&value) {
        return Err(err("INVALID_PATH", "EPUB 资源路径无效"));
    }
    Ok(value)
}
fn xml(z: &mut zip::ZipArchive<File>, loc: &str) -> Result<String> {
    String::from_utf8(zip_bytes(z, loc, MAX_XML)?)
        .map_err(|_| err("CORRUPT_ARCHIVE", "EPUB XML 必须是 UTF-8"))
}
fn node_text(n: roxmltree::Node) -> String {
    n.descendants()
        .filter(|n| {
            n.is_text()
                && !n.ancestors().any(|a| {
                    matches!(
                        a.tag_name().name(),
                        "script" | "style" | "iframe" | "object"
                    )
                })
        })
        .filter_map(|n| n.text())
        .collect::<Vec<_>>()
        .join("")
}
fn internal_href(base: &str, href: &str) -> Result<String> {
    let (file, anchor) = href.split_once('#').unwrap_or((href, ""));
    let path = if file.is_empty() {
        base.to_owned()
    } else {
        resolve(base, file)?
    };
    Ok(if anchor.is_empty() {
        path
    } else {
        format!(
            "{path}#{}",
            percent_encoding::percent_decode_str(anchor)
                .decode_utf8()
                .map_err(io)?
        )
    })
}
fn epub(path: &Path, root: &Path, cancel: &AtomicBool) -> Result<Parsed> {
    if fs::metadata(path).map_err(io)?.len() > 512 * 1024 * 1024 {
        return Err(err("LIMIT_EXCEEDED", "EPUB 超过 512 MiB"));
    }
    let mut z = archive(path)?;
    let container = xml(&mut z, "META-INF/container.xml")?;
    let doc = roxmltree::Document::parse(&container).map_err(io)?;
    let opf = doc
        .descendants()
        .find(|n| n.has_tag_name("rootfile"))
        .and_then(|n| n.attribute("full-path"))
        .ok_or("EPUB 缺少 package")?;
    if !safe_member(opf) {
        return Err(err("INVALID_PATH", "EPUB package 路径无效"));
    }
    let package = xml(&mut z, opf)?;
    let doc = roxmltree::Document::parse(&package).map_err(io)?;
    let mut parsed = Parsed::new(path);
    for n in doc.descendants() {
        if n.has_tag_name("title") {
            parsed.title = node_text(n);
        }
        if n.has_tag_name("creator") {
            parsed.author = Some(node_text(n));
        }
        if n.attribute("property") == Some("rendition:layout") && n.text() == Some("pre-paginated")
        {
            return Err(err("UNSUPPORTED_EPUB", "暂不支持固定版式 EPUB"));
        }
    }
    let mut manifest = HashMap::new();
    let mut resource_map = HashMap::new();
    let mut nav = None;
    let mut ncx = None;
    for n in doc.descendants().filter(|n| n.has_tag_name("item")) {
        if let (Some(id), Some(href)) = (n.attribute("id"), n.attribute("href")) {
            let loc = resolve(opf, href)?;
            manifest.insert(id.to_owned(), loc.clone());
            if image_name(&loc) {
                let id = format!("r{}", parsed.resources.len());
                resource_map.insert(loc.clone(), id.clone());
                parsed.resources.push(Resource {
                    id,
                    locator: loc.clone(),
                    width: 800,
                    height: 1000,
                    error: None,
                });
            }
            if n.attribute("properties")
                .unwrap_or("")
                .split_whitespace()
                .any(|v| v == "nav")
            {
                nav = Some(loc.clone());
            }
            if n.attribute("media-type") == Some("application/x-dtbncx+xml") {
                ncx = Some(loc);
            }
        }
    }
    let mut titles = HashMap::new();
    let mut navigation = vec![];
    if let Some(loc) = nav.or(ncx) {
        if let Ok(text) = xml(&mut z, &loc) {
            if let Ok(d) = roxmltree::Document::parse(&text) {
                for n in d.descendants() {
                    if n.has_tag_name("a") {
                        if let Some(href) = n.attribute("href") {
                            if let Ok(p) = internal_href(&loc, href) {
                                let title = node_text(n);
                                titles
                                    .entry(p.split('#').next().unwrap_or("").to_owned())
                                    .or_insert(title.clone());
                                navigation.push(Navigation { title, href: p });
                            }
                        }
                    }
                    if n.has_tag_name("navPoint") {
                        let label = n
                            .descendants()
                            .find(|n| n.has_tag_name("navLabel"))
                            .map(node_text);
                        let href = n
                            .descendants()
                            .find(|n| n.has_tag_name("content"))
                            .and_then(|n| n.attribute("src"));
                        if let (Some(label), Some(href)) = (label, href) {
                            if let Ok(p) = internal_href(&loc, href) {
                                titles
                                    .entry(p.split('#').next().unwrap_or("").to_owned())
                                    .or_insert(label.clone());
                                navigation.push(Navigation {
                                    title: label,
                                    href: p,
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    let mut text_units = 0;
    for n in doc
        .descendants()
        .filter(|n| n.has_tag_name("itemref") && n.attribute("linear") != Some("no"))
    {
        check(cancel)?;
        let loc = n
            .attribute("idref")
            .and_then(|id| manifest.get(id))
            .ok_or("EPUB spine 资源不存在")?;
        let text = xml(&mut z, loc)?;
        let d = roxmltree::Document::parse(&text)
            .map_err(|_| err("CORRUPT_ARCHIVE", "EPUB 正文 XML 损坏或包含外部实体"))?;
        let body = d
            .descendants()
            .find(|n| n.has_tag_name("body"))
            .ok_or("EPUB 正文缺少 body")?;
        let title = titles
            .get(loc)
            .cloned()
            .or_else(|| {
                body.descendants()
                    .find(|n| matches!(n.tag_name().name(), "h1" | "h2"))
                    .map(node_text)
            })
            .unwrap_or_else(|| format!("第 {} 节", parsed.chapters.len() + 1));
        let mut writer = ChapterWriter::new(root, parsed.chapters.len(), title);
        writer.chapter.target = Some(loc.clone());
        fn walk(
            n: roxmltree::Node,
            writer: &mut ChapterWriter,
            loc: &str,
            map: &HashMap<String, String>,
            units: &mut usize,
        ) -> Result<()> {
            if matches!(
                n.tag_name().name(),
                "script" | "style" | "iframe" | "object" | "audio" | "video" | "svg"
            ) {
                return Ok(());
            }
            if n.has_tag_name("img") {
                if let Some(src) = n.attribute("src") {
                    if let Ok(p) = resolve(loc, src) {
                        if let Some(id) = map.get(&p) {
                            writer.push(
                                "image",
                                n.attribute("alt").unwrap_or("").into(),
                                Some(id.clone()),
                                n.attribute("id").map(str::to_owned),
                            )?;
                        }
                    }
                }
                return Ok(());
            }
            let block = matches!(
                n.tag_name().name(),
                "p" | "h1" | "h2" | "h3" | "h4" | "li" | "blockquote" | "pre"
            );
            if block {
                let value = node_text(n);
                if !value.trim().is_empty() {
                    *units += value.len();
                    let runs = n
                        .descendants()
                        .filter(|v| {
                            v.is_text()
                                && !v.ancestors().any(|a| {
                                    matches!(
                                        a.tag_name().name(),
                                        "script" | "style" | "iframe" | "object"
                                    )
                                })
                        })
                        .map(|v| Inline {
                            text: v.text().unwrap_or("").into(),
                            strong: v
                                .ancestors()
                                .any(|a| matches!(a.tag_name().name(), "b" | "strong")),
                            emphasis: v
                                .ancestors()
                                .any(|a| matches!(a.tag_name().name(), "i" | "em")),
                            href: v
                                .ancestors()
                                .find(|a| a.has_tag_name("a"))
                                .and_then(|a| a.attribute("href"))
                                .and_then(|h| internal_href(loc, h).ok()),
                        })
                        .collect();
                    writer.rich(
                        if n.tag_name().name().starts_with('h') {
                            "heading"
                        } else {
                            "paragraph"
                        },
                        value,
                        None,
                        n.attribute("id").map(str::to_owned),
                        runs,
                    )?;
                }
                for img in n.descendants().filter(|n| n.has_tag_name("img")) {
                    walk(img, writer, loc, map, units)?;
                }
                return Ok(());
            }
            if let Some(anchor) = n.attribute("id") {
                writer.push("anchor", String::new(), None, Some(anchor.into()))?;
            }
            for child in n.children() {
                if child.is_element() {
                    walk(child, writer, loc, map, units)?;
                } else if child.is_text() {
                    let value = child.text().unwrap_or("").trim();
                    if !value.is_empty() {
                        *units += value.len();
                        writer.push("paragraph", value.into(), None, None)?;
                    }
                }
            }
            Ok(())
        }
        walk(body, &mut writer, loc, &resource_map, &mut text_units)?;
        if writer.count > 0 {
            let mut ch = writer.finish()?;
            ch.navigation = navigation
                .iter()
                .filter(|n| n.href.split('#').next() == Some(loc.as_str()))
                .cloned()
                .collect();
            parsed.chapters.push(ch);
        }
    }
    if text_units == 0 {
        return Err(err(
            "UNSUPPORTED_EPUB",
            "暂不支持图片型或没有文字正文的 EPUB",
        ));
    }
    if parsed.chapters.is_empty() {
        return Err(err("EMPTY_CONTENT", "EPUB 没有正文"));
    }
    Ok(parsed)
}
pub fn parse(
    path: &Path,
    fmt: &str,
    root: &Path,
    label: Option<&str>,
    cancel: &AtomicBool,
) -> Result<Parsed> {
    check(cancel)?;
    match fmt {
        "TXT" => txt(path, root, label, cancel),
        "EPUB" => epub(path, root, cancel),
        "CBZ" | "folder" => comic(path, fmt, cancel),
        _ => Err(err("UNSUPPORTED_FORMAT", "不支持的格式")),
    }
}
pub fn display_image(bytes: Vec<u8>, max_width: u32) -> Result<Vec<u8>> {
    dimensions(&bytes)?;
    let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(io)?;
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(192 * 1024 * 1024);
    reader.limits(limits);
    let img = reader.decode().map_err(io)?;
    let img = img.resize(max_width, 8192, image::imageops::FilterType::Triangle);
    let mut out = std::io::Cursor::new(vec![]);
    img.write_to(&mut out, image::ImageFormat::Png)
        .map_err(io)?;
    Ok(out.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn natural_numbers() {
        let mut v = vec!["第10话", "第2话", "第1话"];
        v.sort_by(|a, b| natural(a, b));
        assert_eq!(v, vec!["第1话", "第2话", "第10话"]);
    }
    #[test]
    fn rejects_archive_escape() {
        for p in ["../x", "/x", "C:/x", "a/../../x", "a\\x"] {
            assert!(!safe_member(p));
        }
        assert!(safe_member("书/001.png"));
    }
    #[test]
    fn epub_relative_resources() {
        assert_eq!(
            resolve("OPS/text/ch.xhtml", "../img/a.png#x").unwrap(),
            "OPS/img/a.png"
        );
        assert!(resolve("a.xhtml", "../x").is_err());
        assert!(resolve("a.xhtml", "https://a").is_err());
    }
}

#[cfg(test)]
mod format_tests {
    use super::*;
    struct Temp(PathBuf);
    impl Temp {
        fn new() -> Self {
            let p =
                std::env::temp_dir().join(format!("moyuhub-reader-test-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(&p).unwrap();
            Self(p)
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn all_blocks(root: &Path, chapters: &[Chapter]) -> Vec<Block> {
        chapters
            .iter()
            .flat_map(|c| {
                (0..c.chunks).flat_map(move |i| {
                    serde_json::from_slice::<Vec<Block>>(
                        &fs::read(root.join(format!("{}-{i}.json", c.id))).unwrap(),
                    )
                    .unwrap()
                })
            })
            .collect()
    }
    fn zip_at(path: &Path, files: Vec<(&str, Vec<u8>)>) {
        let mut z = zip::ZipWriter::new(File::create(path).unwrap());
        for (name, bytes) in files {
            z.start_file(
                name,
                zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Deflated),
            )
            .unwrap();
            z.write_all(&bytes).unwrap();
        }
        z.finish().unwrap();
    }
    fn png() -> Vec<u8> {
        let mut b = std::io::Cursor::new(vec![]);
        image::DynamicImage::new_rgb8(8, 12)
            .write_to(&mut b, image::ImageFormat::Png)
            .unwrap();
        b.into_inner()
    }
    #[test]
    fn txt_chapters_encoding_and_large_unicode_line() {
        let temp = Temp::new();
        let p = temp.0.join("中文.txt");
        let text = format!(
            "前言内容\n第一章 相遇\n{}\n第二章 结束\n尾段",
            "测试😀".repeat(20000)
        );
        fs::write(&p, &text).unwrap();
        let cache = temp.0.join("cache");
        let parsed = parse(&p, "TXT", &cache, Some("UTF-8"), &AtomicBool::new(false)).unwrap();
        assert_eq!(parsed.chapters.len(), 3);
        assert_eq!(parsed.chapters[1].title, "第一章 相遇");
        let joined = all_blocks(&cache, &parsed.chapters)
            .iter()
            .map(|b| b.text.as_str())
            .collect::<Vec<_>>()
            .join("");
        assert_eq!(joined.chars().filter(|c| *c == '😀').count(), 20000);
        assert!(!joined.contains('\u{fffd}'));
        assert!(parsed.chapters[1].chunks > 1);
    }
    #[test]
    fn gb18030_and_utf16() {
        let temp = Temp::new();
        let p = temp.0.join("编码.txt");
        let (bytes, _, _) = encoding_rs::GBK.encode("第一章 开始\n这是一段中文正文。");
        fs::write(&p, &bytes).unwrap();
        assert_eq!(
            parse(
                &p,
                "TXT",
                &temp.0.join("c"),
                Some("GB18030"),
                &AtomicBool::new(false)
            )
            .unwrap()
            .chapters
            .len(),
            1
        );
        let mut b = vec![0xff, 0xfe];
        for c in "正文测试".encode_utf16() {
            b.extend_from_slice(&c.to_le_bytes());
        }
        fs::write(&p, b).unwrap();
        assert!(parse(&p, "TXT", &temp.0.join("d"), None, &AtomicBool::new(false)).is_ok());
    }
    #[test]
    fn folder_and_cbz_have_same_natural_order() {
        let temp = Temp::new();
        let folder = temp.0.join("comic");
        fs::create_dir(&folder).unwrap();
        for n in ["10.png", "1.png", "2.png"] {
            fs::write(folder.join(n), png()).unwrap();
        }
        fs::write(folder.join("说明.txt"), "ignore").unwrap();
        let p = comic(&folder, "folder", &AtomicBool::new(false)).unwrap();
        assert_eq!(
            p.resources
                .iter()
                .map(|r| r.locator.as_str())
                .collect::<Vec<_>>(),
            vec!["1.png", "2.png", "10.png"]
        );
        let cbz = temp.0.join("漫画.cbz");
        zip_at(
            &cbz,
            vec![("10.png", png()), ("2.png", png()), ("1.png", png())],
        );
        let p = comic(&cbz, "CBZ", &AtomicBool::new(false)).unwrap();
        assert_eq!(p.resources[1].locator, "2.png");
        assert_eq!(p.chapters[0].pages.len(), 3);
    }
    #[test]
    fn rejects_escape_and_empty_content() {
        let temp = Temp::new();
        let p = temp.0.join("bad.cbz");
        zip_at(&p, vec![("../escape.png", png())]);
        assert!(archive(&p).unwrap_err().contains("INVALID_PATH"));
        let text = temp.0.join("empty.txt");
        fs::write(&text, " \n").unwrap();
        assert!(txt(&text, &temp.0.join("c"), None, &AtomicBool::new(false))
            .err()
            .unwrap()
            .contains("EMPTY_CONTENT"));
    }
    #[test]
    fn cancellation_and_fingerprint() {
        let temp = Temp::new();
        let p = temp.0.join("a.txt");
        let q = temp.0.join("b.txt");
        fs::write(&p, "相同内容").unwrap();
        fs::copy(&p, &q).unwrap();
        assert_eq!(
            fingerprint(&p, &AtomicBool::new(false)).unwrap(),
            fingerprint(&q, &AtomicBool::new(false)).unwrap()
        );
        assert!(fingerprint(&p, &AtomicBool::new(true))
            .unwrap_err()
            .contains("CANCELLED"));
    }
    #[test]
    fn epub_spine_metadata_images_and_script_removal() {
        let temp = Temp::new();
        let p = temp.0.join("book.epub");
        zip_at(&p,vec![
 ("META-INF/container.xml",br#"<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>"#.to_vec()),
 ("OPS/book.opf",br#"<package><metadata><title>Example</title><creator>Author</creator></metadata><manifest><item id="a" href="10.xhtml"/><item id="b" href="2.xhtml"/><item id="img" href="pic.png"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>"#.to_vec()),
 ("OPS/10.xhtml",br#"<html><body><h1>First</h1><p>Hello <em>reader</em></p><script>BAD()</script><img src="pic.png"/><img src="https://tracker/p.png"/></body></html>"#.to_vec()),
 ("OPS/2.xhtml",br#"<html><body><h1>Second</h1><p>End</p></body></html>"#.to_vec()),("OPS/pic.png",png())]);
        let cache = temp.0.join("c");
        let parsed = epub(&p, &cache, &AtomicBool::new(false)).unwrap();
        assert_eq!(parsed.title, "Example");
        assert_eq!(parsed.author.as_deref(), Some("Author"));
        assert_eq!(parsed.chapters[0].title, "First");
        assert_eq!(parsed.chapters[1].title, "Second");
        let blocks = all_blocks(&cache, &parsed.chapters);
        assert_eq!(blocks.iter().filter(|b| b.kind == "image").count(), 1);
        assert!(!blocks.iter().any(|b| b.text.contains("BAD")));
    }
}
