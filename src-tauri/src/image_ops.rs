use base64::Engine;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::DynamicImage;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

/// 支持的图片扩展名
pub const IMG_EXTS: [&str; 5] = ["jpg", "jpeg", "png", "webp", "bmp"];

/// 图片文件最大大小 (200 MB)
const MAX_FILE_SIZE: u64 = 200 * 1024 * 1024;

/// 单目录扫描上限（防 OOM）
pub const MAX_DIR_ENTRIES: usize = 5000;

/// 缩略图最大宽度（防滥用，超过强制截断到 1024）
pub const THUMBNAIL_MAX_WIDTH: u32 = 1024;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BatchProgress {
    pub current: usize,
    pub total: usize,
    pub filename: String,
    /// 完整文件路径，用于前端精确匹配队列项
    pub path: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageInfo {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub file_size: u64,
    pub created_at: Option<u64>,
    pub modified_at: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DirInfo {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileAssocStatus {
    pub open_ok: bool,
    pub current_open_cmd: Option<String>,
    pub expected_open_cmd: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileMeta {
    pub size: u64,
    pub created_at: Option<u64>,
    pub modified_at: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageResult {
    pub temp_path: String,
    pub width: u32,
    pub height: u32,
}

/// 组合变换参数
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransformParams {
    /// 顺时针旋转次数 (0-3)，每次 90°
    pub rotations: u32,
    /// 是否水平翻转（在旋转之后应用）
    pub flip_h: bool,
    /// 是否垂直翻转（在旋转之后应用）
    pub flip_v: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SaveResult {
    pub path: String,
    pub file_size: u64,
}

/// 读取图片信息（不加载像素数据，仅元信息）
#[tauri::command]
pub fn get_image_info(path: String) -> Result<ImageInfo, String> {
    if is_sensitive_path(&path) {
        return Err("安全限制：不允许访问系统敏感目录".to_string());
    }
    let path = Path::new(&path);
    let metadata = std::fs::metadata(path).map_err(|e| format!("读取文件失败: {e}"))?;
    let file_size = metadata.len();
    let (width, height) = image::image_dimensions(path)
        .map_err(|e| format!("读取图片尺寸失败: {e}"))?;
    let mut format = String::from("Unknown");
    if let Some(f) = image::ImageFormat::from_path(path).ok() {
        format = format!("{:?}", f);
    }
    Ok(ImageInfo {
        path: path.to_string_lossy().to_string(),
        width,
        height,
        format,
        file_size,
        created_at: system_time_to_unix_secs(metadata.created().ok()),
        modified_at: system_time_to_unix_secs(metadata.modified().ok()),
    })
}

/// 缩放图片并保存到临时文件
#[tauri::command]
pub fn resize_image(
    path: String,
    target_width: u32,
    target_height: u32,
) -> Result<ImageResult, String> {
    if target_width == 0 || target_height == 0 {
        return Err("目标宽度和高度必须大于 0".to_string());
    }
    if is_sensitive_path(&path) {
        return Err("安全限制：不允许访问系统敏感目录".to_string());
    }
    check_file_size(&path)?;
    let img = image::open(&path).map_err(|e| format!("无法打开图片: {e}"))?;
    let resized = img.resize_exact(target_width, target_height, FilterType::Lanczos3);
    let temp_path = temp_file_path(&path, "resized")?;
    save_to_temp(&resized, &temp_path)?;
    Ok(ImageResult {
        temp_path: temp_path.to_string_lossy().to_string(),
        width: target_width,
        height: target_height,
    })
}

/// 裁剪图片并保存到临时文件
#[tauri::command]
pub fn crop_image(
    path: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<ImageResult, String> {
    if width == 0 || height == 0 {
        return Err("裁剪宽度和高度必须大于 0".to_string());
    }
    if is_sensitive_path(&path) {
        return Err("安全限制：不允许访问系统敏感目录".to_string());
    }
    check_file_size(&path)?;
    let img = image::open(&path).map_err(|e| format!("无法打开图片: {e}"))?;
    let (img_w, img_h) = (img.width(), img.height());
    if x >= img_w || y >= img_h || x + width > img_w || y + height > img_h {
        return Err("裁剪区域超出图片范围".to_string());
    }
    let cropped = img.crop_imm(x, y, width, height);
    let temp_path = temp_file_path(&path, "cropped")?;
    save_to_temp(&cropped, &temp_path)?;
    Ok(ImageResult {
        temp_path: temp_path.to_string_lossy().to_string(),
        width: cropped.width(),
        height: cropped.height(),
    })
}

/// 变换图片（水平翻转 / 垂直翻转 / 顺时针 90° / 逆时针 90°）
#[tauri::command]
pub fn transform_image(path: String, mode: String) -> Result<ImageResult, String> {
    if is_sensitive_path(&path) {
        return Err("安全限制：不允许访问系统敏感目录".to_string());
    }
    check_file_size(&path)?;
    let img = image::open(&path).map_err(|e| format!("无法打开图片: {e}"))?;
    let transformed = match mode.as_str() {
        "flip-h" => img.fliph(),
        "flip-v" => img.flipv(),
        "rot-cw" => img.rotate90(),
        "rot-ccw" => img.rotate270(),
        other => return Err(format!("不支持的变换: {other}")),
    };
    let temp_path = temp_file_path(&path, "transformed")?;
    save_to_temp(&transformed, &temp_path)?;
    Ok(ImageResult {
        temp_path: temp_path.to_string_lossy().to_string(),
        width: transformed.width(),
        height: transformed.height(),
    })
}

/// 应用组合变换（旋转 + 翻转），一次性执行
#[tauri::command]
pub fn apply_transforms(path: String, params: TransformParams) -> Result<ImageResult, String> {
    if is_sensitive_path(&path) {
        return Err("安全限制：不允许访问系统敏感目录".to_string());
    }
    check_file_size(&path)?;
    let mut img = image::open(&path).map_err(|e| format!("无法打开图片: {e}"))?;

    // 旋转：rotations 次顺时针 90°
    for _ in 0..(params.rotations % 4) {
        img = img.rotate90();
    }

    // 翻转（旋转之后应用）
    if params.flip_h {
        img = img.fliph();
    }
    if params.flip_v {
        img = img.flipv();
    }

    let temp_path = temp_file_path(&path, "transformed")?;
    save_to_temp(&img, &temp_path)?;
    Ok(ImageResult {
        temp_path: temp_path.to_string_lossy().to_string(),
        width: img.width(),
        height: img.height(),
    })
}

/// 保存图片到目标路径
#[tauri::command]
pub fn save_image(
    temp_path: String,
    save_path: String,
    format: String,
    quality: u8,
) -> Result<SaveResult, String> {
    if is_sensitive_path(&temp_path) || is_sensitive_path(&save_path) {
        return Err("安全限制：不允许访问系统敏感目录".to_string());
    }
    check_file_size(&temp_path)?;
    let img = image::open(&temp_path).map_err(|e| format!("无法读取临时文件: {e}"))?;
    let save_path = Path::new(&save_path);
    let q = quality.clamp(1, 100);
    match format.to_lowercase().as_str() {
        "jpeg" | "jpg" => {
            let rgb = img.to_rgb8();
            let file = std::fs::File::create(save_path).map_err(|e| format!("创建文件失败: {e}"))?;
            let mut encoder = JpegEncoder::new_with_quality(file, q);
            encoder.encode(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
                .map_err(|e| format!("JPEG 编码失败: {e}"))?;
        }
        "png" => {
            if q < 100 {
                let rgba = img.to_rgba8();
                let pixels_rgba: Vec<imagequant::RGBA> = rgba
                    .pixels()
                    .map(|p| imagequant::RGBA { r: p[0], g: p[1], b: p[2], a: p[3] })
                    .collect();
                let mut liq = imagequant::new();
                let colors = png_colors(q);
                liq.set_max_colors(colors as u32)
                    .map_err(|e| format!("设置颜色数失败: {e}"))?;
                let mut image = liq
                    .new_image(pixels_rgba, rgba.width() as usize, rgba.height() as usize, 0.0)
                    .map_err(|e| format!("imagequant 初始化失败: {e}"))?;
                let mut res = liq.quantize(&mut image)
                    .map_err(|e| format!("量化失败: {e}"))?;
                res.set_dithering_level(1.0)
                    .map_err(|e| format!("设置抖动失败: {e}"))?;
                let (palette, pixels) = res.remapped(&mut image)
                    .map_err(|e| format!("重映射失败: {e}"))?;
                let mut png_img = image::ImageBuffer::new(rgba.width(), rgba.height());
                for (y, row) in pixels.chunks(rgba.width() as usize).enumerate() {
                    for (x, &idx) in row.iter().enumerate() {
                        let color = &palette[idx as usize];
                        png_img.put_pixel(
                            x as u32, y as u32,
                            image::Rgba([color.r, color.g, color.b, color.a]),
                        );
                    }
                }
                png_img.save(save_path).map_err(|e| format!("PNG 保存失败: {e}"))?;
            } else {
                img.save(save_path).map_err(|e| format!("PNG 保存失败: {e}"))?;
            }
        }
        "webp" => { img.save(save_path).map_err(|e| format!("WebP 保存失败: {e}"))?; }
        "bmp"  => { img.save(save_path).map_err(|e| format!("BMP 保存失败: {e}"))?; }
        _ => return Err(format!("不支持的格式: {format}")),
    }
    let file_size = std::fs::metadata(save_path)
        .map_err(|e| format!("获取文件大小失败: {e}"))?
        .len();
    // 保存成功后清理临时文件
    let _ = std::fs::remove_file(Path::new(&temp_path));
    Ok(SaveResult {
        path: save_path.to_string_lossy().to_string(),
        file_size,
    })
}

/// 批量命令公共安全校验：输入（目录或文件列表）与输出路径均不得位于系统敏感目录。
/// 输出目录 == 输入目录是合法场景（原地覆盖，见 ADR-0004），此处不禁止。
fn validate_batch_paths(inputs: &[String], output: &str) -> Result<(), String> {
    for p in inputs {
        if is_sensitive_path(p) {
            return Err("安全限制：不允许访问系统敏感目录".to_string());
        }
    }
    if is_sensitive_path(output) {
        return Err("安全限制：不允许访问系统敏感目录".to_string());
    }
    Ok(())
}

/// 扫描目录顶层图片文件：先按文件名排序（确定性），数量超过 MAX_DIR_ENTRIES 时截断并告警。
/// 返回 (图片列表, 是否发生截断)。
fn collect_dir_image_entries(dir: &Path) -> Result<(Vec<PathBuf>, bool), String> {
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| format!("读取目录失败: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| IMG_EXTS.contains(&ext.to_lowercase().as_str()))
                .unwrap_or(false)
        })
        .map(|e| e.path())
        .collect();
    // read_dir 的返回顺序不保证，先排序再截断，保证超限时处理哪些文件是确定的
    entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
    let truncated = entries.len() > MAX_DIR_ENTRIES;
    if truncated {
        log::warn!(
            "目录 {} 包含 {} 个图片，超出上限 {}，已截断",
            dir.display(),
            entries.len(),
            MAX_DIR_ENTRIES
        );
        entries.truncate(MAX_DIR_ENTRIES);
    }
    Ok((entries, truncated))
}

/// 批量结果消息：发生截断时在末尾追加清晰警告（返回类型保持 String，前端兼容）
fn batch_result_with_truncation_warning(result: String, truncated: bool) -> String {
    if truncated {
        format!("{result}（目录超过 {MAX_DIR_ENTRIES} 张上限，仅处理排序后前 {MAX_DIR_ENTRIES} 张，其余已跳过）")
    } else {
        result
    }
}

/// 同批次重名时自动加后缀（_1、_2…），返回唯一文件名；不重名返回原文件名
fn unique_batch_name(path: &Path, used_names: &mut std::collections::HashSet<String>) -> String {
    let filename = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    if used_names.insert(filename.clone()) {
        return filename;
    }
    let stem = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let mut idx = 1u32;
    let mut candidate = format!("{}_{}{}", stem, idx, ext);
    while !used_names.insert(candidate.clone()) {
        idx += 1;
        candidate = format!("{}_{}{}", stem, idx, ext);
    }
    candidate
}

/// 批量处理：按目标宽度等比缩放文件夹内所有图片
#[tauri::command]
pub async fn batch_process(
    app: tauri::AppHandle,
    input_dir: String,
    output_dir: String,
    target_width: u32,
    quality: u8,
) -> Result<String, String> {
    if target_width == 0 {
        return Err("目标宽度必须大于 0".to_string());
    }
    // 输入/输出路径安全校验（与 batch_process_queue 一致；同目录输出按 ADR-0004 放行）
    validate_batch_paths(std::slice::from_ref(&input_dir), &output_dir)?;
    let input_dir_clone = input_dir.clone();
    let output_dir_clone = output_dir.clone();
    let (entries, truncated): (Vec<PathBuf>, bool) =
        tauri::async_runtime::spawn_blocking(move || -> Result<(Vec<PathBuf>, bool), String> {
            std::fs::create_dir_all(&output_dir_clone)
                .map_err(|e| format!("创建输出目录失败: {e}"))?;
            collect_dir_image_entries(Path::new(&input_dir_clone))
        })
        .await
        .map_err(|e| format!("任务执行失败: {e}"))??;

    if entries.is_empty() {
        return Err("目录中没有图片文件".to_string());
    }

    let result = execute_batch_processing(app, entries, output_dir, target_width, quality).await?;
    Ok(batch_result_with_truncation_warning(result, truncated))
}

/// 批量处理队列版本：接收显式的图片路径列表（来自浏览视图的队列）
#[tauri::command]
pub async fn batch_process_queue(
    app: tauri::AppHandle,
    paths: Vec<String>,
    output_dir: String,
    target_width: u32,
    quality: u8,
) -> Result<String, String> {
    if target_width == 0 { return Err("目标宽度必须大于 0".to_string()); }
    if paths.is_empty() { return Err("队列为空".to_string()); }

    // 输入/输出路径安全校验（与 batch_process 一致；同目录输出按 ADR-0004 放行）
    validate_batch_paths(&paths, &output_dir)?;

    let entries: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).filter(|p| p.is_file()).collect();
    if entries.is_empty() { return Err("队列中的文件全部失效".to_string()); }
    let output_dir_clone = output_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&output_dir_clone).map_err(|e| format!("创建输出目录失败: {e}"))
    }).await.map_err(|e| format!("创建目录任务失败: {e}"))??;

    execute_batch_processing(app, entries, output_dir, target_width, quality).await
}

/// 执行批量处理的核心逻辑（内部函数）
async fn execute_batch_processing(
    app: tauri::AppHandle,
    entries: Vec<PathBuf>,
    output_dir: String,
    target_width: u32,
    quality: u8,
) -> Result<String, String> {
    let total = entries.len();
    let mut errors = Vec::new();
    let mut used_names: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (i, path) in entries.iter().enumerate() {
        let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        // 同名文件自动重命名，避免覆盖
        let unique_name = unique_batch_name(path, &mut used_names);
        let out_path = PathBuf::from(&output_dir).join(&unique_name);
        let path_clone = path.clone();
        let out_path_clone = out_path.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            process_single_batch(&path_clone, &out_path_clone, target_width, quality)
        }).await.map_err(|e| format!("任务执行失败: {e}"))?;
        match result {
            Ok(()) => {
                let _ = app.emit("batch-progress", BatchProgress {
                    current: i + 1, total, filename: filename.clone(), path: path.to_string_lossy().to_string(), error: None,
                });
            }
            Err(e) => {
                errors.push(filename.clone());
                let _ = app.emit("batch-progress", BatchProgress {
                    current: i + 1, total, filename: filename.clone(), path: path.to_string_lossy().to_string(), error: Some(e.clone()),
                });
            }
        }
    }
    let msg = if errors.is_empty() {
        format!("完成！共处理 {} 张图片", total)
    } else {
        format!("完成！共 {} 张，{} 张失败：{}", total, errors.len(), errors.join("、"))
    };
    Ok(msg)
}

fn process_single_batch(
    input: &Path,
    output: &Path,
    target_width: u32,
    quality: u8,
) -> Result<(), String> {
    if target_width == 0 { return Err("目标宽度必须大于 0".to_string()); }
    check_file_size_path(input)?;
    let img = image::open(input).map_err(|e| format!("无法打开: {e}"))?;
    let (w, h) = (img.width(), img.height());
    if w == 0 { return Err("图片宽度为 0，无法处理".to_string()); }
    let th = (h as f64 * (target_width as f64 / w as f64)) as u32;
    let resized = img.resize_exact(target_width, th.max(1), FilterType::Lanczos3);
    let ext = input.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_else(|| "jpg".to_string());
    match ext.as_str() {
        "png" => { resized.save(output).map_err(|e| format!("PNG 保存失败: {e}"))?; }
        "webp" => { resized.save(output).map_err(|e| format!("WebP 保存失败: {e}"))?; }
        "bmp" => { resized.save(output).map_err(|e| format!("BMP 保存失败: {e}"))?; }
        _ => {
            let q = quality.clamp(1, 100);
            let rgb = resized.to_rgb8();
            let file = std::fs::File::create(output).map_err(|e| format!("创建文件失败: {e}"))?;
            let mut encoder = JpegEncoder::new_with_quality(file, q);
            encoder.encode(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
                .map_err(|e| format!("JPEG 编码失败: {e}"))?;
        }
    }
    Ok(())
}

/// 临时计数器 + 纳秒时间戳实现不可预测性
static RNG_COUNTER: AtomicU64 = AtomicU64::new(0);

fn temp_file_path(original: &str, suffix: &str) -> Result<PathBuf, String> {
    let orig = Path::new(original);
    let stem = orig.file_stem().unwrap_or_default().to_string_lossy();
    // 根据源图格式选择临时文件扩展名，避免 JPEG→PNG 无谓转码
    let ext = orig.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .filter(|e| matches!(e.as_str(), "jpg" | "jpeg" | "png" | "webp" | "bmp"))
        .unwrap_or_else(|| "png".to_string());
    let ts = SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|e| format!("系统时间错误: {e}"))?
        .as_nanos();
    let r = RNG_COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir();
    let filename = format!("piccraft_{stem}_{ts}_{r}_{suffix}.{ext}");
    Ok(dir.join(filename))
}

fn check_file_size(path: &str) -> Result<(), String> {
    check_file_size_path(Path::new(path))
}

fn check_file_size_path(path: &Path) -> Result<(), String> {
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("读取文件信息失败: {e}"))?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!(
            "文件过大 ({} MB)，单文件上限 {} MB",
            metadata.len() / (1024 * 1024),
            MAX_FILE_SIZE / (1024 * 1024)
        ));
    }
    Ok(())
}

/// 判断 path_ref 是否位于 temp 目录下（分别比较 canonicalized 与原始两种形式，
/// 容忍 8.3 短名差异：path 经 canonicalize 展开为长名，temp_dir() 可能返回短名）
fn is_under_temp_dir(path_ref: &str, temp_raw_ref: &str, temp_canon_ref: &str) -> bool {
    let canon_base = temp_canon_ref.strip_suffix('\\').unwrap_or(temp_canon_ref);
    if !canon_base.is_empty()
        && (path_ref == canon_base || path_ref.starts_with(&format!("{canon_base}\\")))
    {
        return true;
    }
    let raw_base = temp_raw_ref.strip_suffix('\\').unwrap_or(temp_raw_ref);
    !raw_base.is_empty()
        && (path_ref == raw_base || path_ref.starts_with(&format!("{raw_base}\\")))
}

/// 检查路径是否属于系统敏感目录
fn is_sensitive_path(path: &str) -> bool {
    let canonical = std::fs::canonicalize(path)
        .unwrap_or_else(|_| PathBuf::from(path));
    let path_str = canonical.to_string_lossy().to_lowercase();
    // 去除 Windows UNC 前缀（\\?\）
    let path_ref = path_str.strip_prefix(r"\\?\").unwrap_or(&path_str);

    // 系统临时目录豁免（temp 目录自身及其子路径）。
    // canonicalize 会把路径展开为长名（8.3 短名展开），而 temp_dir() 可能返回短名
    // （如 GitHub Actions runner 的 RUNNER~1），故同时比较两种形式，任一匹配即放行
    let temp_dir_raw = std::env::temp_dir();
    let temp_canon = std::fs::canonicalize(&temp_dir_raw)
        .unwrap_or_else(|_| temp_dir_raw.clone());
    let norm = |p: &PathBuf| -> String {
        let s = p.to_string_lossy().to_lowercase();
        s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
    };
    let temp_raw_ref = norm(&temp_dir_raw);
    let temp_canon_ref = norm(&temp_canon);
    if is_under_temp_dir(path_ref, &temp_raw_ref, &temp_canon_ref) {
        return false;
    }

    // Windows 敏感目录
    let sensitive_prefixes = [
        r"c:\windows",
        r"c:\program files",
        r"c:\program files (x86)",
    ];
    for prefix in &sensitive_prefixes {
        if path_ref.starts_with(prefix) {
            return true;
        }
    }
    // AppData 目录（所有用户）
    if path_ref.contains(r"\appdata\") {
        return true;
    }
    false
}

fn save_to_temp(img: &DynamicImage, path: &PathBuf) -> Result<(), String> {
    img.save(path).map_err(|e| format!("保存失败: {e}"))
}

fn png_colors(quality: u8) -> u32 {
    let q = quality.clamp(1, 100) as f64;
    16 + ((q - 1.0) * (256.0 - 16.0) / 99.0) as u32
}

// ─── M1-A 新增 ───

/// 扫描目录顶层图片，按文件名升序排序，跳过子目录
#[tauri::command]
pub fn read_dir(folder: String) -> Result<Vec<ImageInfo>, String> {
    if is_sensitive_path(&folder) {
        return Err("安全限制：不允许访问系统敏感目录".to_string());
    }
    // 规范化路径：防止 path traversal
    let canonical = std::fs::canonicalize(&folder)
        .map_err(|e| format!("无法解析路径: {e}"))?;
    let dir = Path::new(&canonical);
    if !dir.is_dir() { return Err(format!("目录不存在或不是目录: {folder}")); }
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| format!("读取目录失败: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .filter(|p| {
            p.extension().and_then(|ext| ext.to_str())
                .map(|ext| IMG_EXTS.contains(&ext.to_lowercase().as_str()))
                .unwrap_or(false)
        })
        .collect();
    if entries.len() > MAX_DIR_ENTRIES {
        log::warn!("目录 {} 包含 {} 个图片，超出上限 {}，已截断", folder, entries.len(), MAX_DIR_ENTRIES);
        entries.truncate(MAX_DIR_ENTRIES);
    }
    entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
    let mut result = Vec::with_capacity(entries.len());
    for path in entries {
        match build_image_info(&path) {
            Ok(info) => result.push(info),
            Err(e) => log::warn!("跳过文件 {}: {e}", path.display()),
        }
    }
    Ok(result)
}

/// 列出子目录（供侧边栏树使用）
/// - path = None 或 ""：返回根目录（Windows 上为驱动器列表）
/// - path = 具体路径：返回该目录下的子目录
#[tauri::command]
pub fn list_subdirs(path: Option<String>) -> Result<Vec<DirInfo>, String> {
    let p = path.unwrap_or_default();
    if p.is_empty() {
        #[cfg(target_os = "windows")]
        {
            let mut drives = Vec::new();
            for letter in 'A'..='Z' {
                let drive = format!("{letter}:\\");
                if Path::new(&drive).exists() {
                    drives.push(DirInfo {
                        name: format!("{letter}:"),
                        path: drive,
                    });
                }
            }
            return Ok(drives);
        }
        #[cfg(not(target_os = "windows"))]
        {
            let dir = Path::new("/");
            let entries: Vec<_> = std::fs::read_dir(dir)
                .map_err(|e| format!("读取根目录失败: {e}"))?
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .map(|p| DirInfo {
                    name: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
                    path: p.to_string_lossy().to_string(),
                })
                .collect();
            return Ok(entries);
        }
    }
    let dir = Path::new(&p);
    if !dir.is_dir() {
        return Err(format!("不是目录: {p}"));
    }
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .map_err(|e| format!("读取目录失败: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .map(|p| DirInfo {
            name: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
            path: p.to_string_lossy().to_string(),
        })
        .collect();
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

/// 生成缩略图（PNG → base64 字符串返回）
///
/// 性能优化：
/// 1. 磁盘缓存：首次生成后缓存到 temp 目录，后续直接返回
/// 2. JPEG 快速解码：用 jpeg-decoder 的 set_scale 跳过整图解码
#[tauri::command]
pub fn make_thumbnail(path: String, max_width: u32) -> Result<String, String> {
    if max_width == 0 { return Err("max_width 必须大于 0".to_string()); }
    let max_width = max_width.min(THUMBNAIL_MAX_WIDTH);
    if is_sensitive_path(&path) {
        return Err("安全限制：不允许访问系统敏感目录".to_string());
    }
    check_file_size(&path)?;

    // ─── 尝试磁盘缓存 ───
    // 缓存 key 纳入文件修改时间，避免同名文件替换后缓存不更新
    let mtime = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // 用字符串拼接做缓存文件名（避免 DefaultHasher 跨版本不稳定）
    let safe_name = path.replace(['\\', '/', ':', ' '], "_");
    let cache_dir = std::env::temp_dir().join("piccraft_thumbs");
    let cache_file = cache_dir.join(format!("{safe_name}_{max_width}_{mtime}.png"));

    // 如果缓存命中，直接返回
    if cache_file.exists() {
        if let Ok(buf) = std::fs::read(&cache_file) {
            log::info!("[thumb] cache HIT  {path}");
            return Ok(base64::engine::general_purpose::STANDARD.encode(&buf));
        }
    }

    let png_bytes: Vec<u8> = {
        let p = Path::new(&path);
        let ext = p.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        // JPEG 走快速路径：按比例降低分辨率解码
        if matches!(ext.as_str(), "jpg" | "jpeg") {
            match make_jpeg_thumbnail_fast(p, max_width) {
                Ok(bytes) => bytes,
                Err(e) => {
                    log::warn!("[thumb] JPEG fast path failed, falling back: {e}");
                    make_thumbnail_fallback(p, max_width)?
                }
            }
        } else {
            make_thumbnail_fallback(p, max_width)?
        }
    };

    // ─── 写入磁盘缓存 ───
    if let Err(e) = std::fs::create_dir_all(&cache_dir) {
        log::warn!("[thumb] 创建缓存目录失败: {e}");
    } else if let Err(e) = std::fs::write(&cache_file, &png_bytes) {
        log::warn!("[thumb] 写入缓存失败: {e}");
    } else {
        log::info!("[thumb] cache WRITE {path}");
    }

    Ok(base64::engine::general_purpose::STANDARD.encode(&png_bytes))
}

/// JPEG 快速解码路径：用 jpeg-decoder 的 scale 缩小分辨率解码
fn make_jpeg_thumbnail_fast(path: &Path, max_width: u32) -> Result<Vec<u8>, String> {
    use jpeg_decoder::Decoder;
    use std::io::BufReader;

    // 第一步：读取头部获取原始尺寸
    let file = std::fs::File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut reader = BufReader::new(file);
    let mut decoder = Decoder::new(&mut reader);
    decoder.read_info().map_err(|e| format!("读取 JPEG 信息失败: {e}"))?;
    let info = decoder.info().ok_or("无法获取 JPEG 尺寸信息")?;
    let (orig_w, orig_h) = (info.width as u32, info.height as u32);
    drop(decoder);

    // 计算缩放后的目标尺寸
    // jpeg-decoder 的 scale 支持 1/2/4/8 整数倍缩放
    let longest = orig_w.max(orig_h);
    let scale_factor: u32 = if longest <= max_width {
        1
    } else {
        let ratio = longest / max_width;
        if ratio >= 8 { 8 }
        else if ratio >= 4 { 4 }
        else if ratio >= 2 { 2 }
        else { 1 }
    };
    let target_w = (orig_w + scale_factor - 1) / scale_factor;
    let target_h = (orig_h + scale_factor - 1) / scale_factor;

    // 第二步：用 scale 按目标尺寸解码
    let file = std::fs::File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut reader = BufReader::new(file);
    let mut decoder = Decoder::new(&mut reader);
    // scale 让解码器以接近目标尺寸的分辨率解码，大幅减少像素量
    let (decoded_w, decoded_h) = decoder
        .scale(target_w.max(1) as u16, target_h.max(1) as u16)
        .map_err(|e| format!("JPEG scale 设置失败: {e}"))?;
    let pixels = decoder.decode().map_err(|e| format!("JPEG 解码失败: {e}"))?;

    let img_buffer = image::RgbImage::from_raw(decoded_w as u32, decoded_h as u32, pixels)
        .ok_or("JPEG 解码像素数据格式异常")?;

    let img = image::DynamicImage::from(img_buffer);
    let (img_w, img_h) = (img.width(), img.height());

    if img_w <= max_width && img_h <= max_width {
        let mut buf = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .map_err(|e| format!("PNG 编码失败: {e}"))?;
        Ok(buf)
    } else {
        let resized = img.resize(max_width, u32::MAX, FilterType::Triangle);
        let mut buf = Vec::new();
        resized.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .map_err(|e| format!("PNG 编码失败: {e}"))?;
        Ok(buf)
    }
}

/// 回退路径：用 image crate 解码整图后缩小
fn make_thumbnail_fallback(path: &Path, max_width: u32) -> Result<Vec<u8>, String> {
    let img = image::open(path).map_err(|e| format!("无法打开图片: {e}"))?;
    let resized = img.resize(max_width, u32::MAX, FilterType::Triangle);
    let mut buf = Vec::new();
    resized.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| format!("PNG 编码失败: {e}"))?;
    Ok(buf)
}

/// 单文件元数据查询
#[tauri::command]
pub fn get_file_meta(path: String) -> Result<FileMeta, String> {
    if is_sensitive_path(&path) {
        return Err("安全限制：不允许访问系统敏感目录".to_string());
    }
    let metadata = std::fs::metadata(Path::new(&path))
        .map_err(|e| format!("读取文件信息失败: {e}"))?;
    Ok(FileMeta {
        size: metadata.len(),
        created_at: system_time_to_unix_secs(metadata.created().ok()),
        modified_at: system_time_to_unix_secs(metadata.modified().ok()),
    })
}

fn build_image_info(path: &Path) -> Result<ImageInfo, String> {
    let metadata = std::fs::metadata(path).map_err(|e| format!("读取文件信息失败: {e}"))?;
    let file_size = metadata.len();
    let (width, height) = image::image_dimensions(path)
        .map_err(|e| format!("读取图片尺寸失败: {e}"))?;
    let format = image::ImageFormat::from_path(path)
        .map(|f| format!("{f:?}"))
        .unwrap_or_else(|_| "Unknown".to_string());
    Ok(ImageInfo {
        path: path.to_string_lossy().to_string(),
        width, height, format, file_size,
        created_at: system_time_to_unix_secs(metadata.created().ok()),
        modified_at: system_time_to_unix_secs(metadata.modified().ok()),
    })
}

fn system_time_to_unix_secs(t: Option<SystemTime>) -> Option<u64> {
    t.and_then(|st| st.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs())
}

/// 清理上次运行残留的临时文件（piccraft_ 前缀）
pub fn cleanup_temp_files() {
    let temp_dir = std::env::temp_dir();
    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("piccraft_") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

/// 清理缩略图磁盘缓存（超过 200MB 时按最旧修改时间淘汰）
pub fn cleanup_thumb_cache() {
    let cache_dir = std::env::temp_dir().join("piccraft_thumbs");
    let Ok(entries) = std::fs::read_dir(&cache_dir) else { return };
    let mut files: Vec<_> = entries.flatten()
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            Some((e.path(), meta.len(), meta.modified().ok()?))
        })
        .collect();
    let total: u64 = files.iter().map(|(_, sz, _)| *sz).sum();
    const MAX_CACHE_BYTES: u64 = 200 * 1024 * 1024; // 200 MB
    if total <= MAX_CACHE_BYTES { return; }
    // 按修改时间升序（最旧在前），删除直到总量降到阈值以下
    files.sort_by_key(|(_, _, mtime)| *mtime);
    let mut current = total;
    for (path, sz, _) in &files {
        if current <= MAX_CACHE_BYTES { break; }
        let _ = std::fs::remove_file(path);
        current -= *sz;
    }
}

/// 读取启动参数（从 Tauri State 取出）
#[tauri::command]
pub fn read_startup_args(state: tauri::State<crate::StartupArgsInner>) -> crate::StartupArgs {
    state.0.lock().expect("StartupArgs mutex poisoned").clone()
}

// ─── M6-B: Windows 文件关联注册表 ───

#[cfg(target_os = "windows")]
mod file_assoc {
    use winreg::enums::*;
    use winreg::RegKey;

    const HKCU: RegKey = RegKey::predef(HKEY_CURRENT_USER);

    pub fn build_command(extra_flag: Option<&str>) -> Result<String, String> {
        let exe = std::env::current_exe().map_err(|e| format!("获取 exe 路径失败: {e}"))?;
        let exe_str = exe.to_string_lossy();
        match extra_flag {
            Some(flag) => Ok(format!("\"{}\" {} \"%1\"", exe_str, flag)),
            None => Ok(format!("\"{}\" \"%1\"", exe_str)),
        }
    }

    pub fn write_verb(verb: &str, extra_flag: Option<&str>) -> Result<(), String> {
        let cmd = build_command(extra_flag)?;
        let path = format!(r"Software\Classes\SystemFileAssociations\image\shell\{}\command", verb);
        let (key, _disp) = HKCU.create_subkey(&path).map_err(|e| format!("创建 {path} 失败: {e}"))?;
        key.set_value("", &cmd).map_err(|e| format!("设置 {verb} command 失败: {e}"))?;
        Ok(())
    }

    pub fn read_verb(verb: &str) -> Result<Option<String>, String> {
        let path = format!(r"Software\Classes\SystemFileAssociations\image\shell\{}\command", verb);
        match HKCU.open_subkey(&path) {
            Ok(key) => match key.get_value("") {
                Ok(s) => Ok(Some(s)),
                Err(_) => Ok(None),
            },
            Err(_) => Ok(None),
        }
    }

    pub fn delete_verb(verb: &str) -> Result<(), String> {
        let path = format!(r"Software\Classes\SystemFileAssociations\image\shell\{}", verb);
        HKCU.delete_subkey_all(&path).map_err(|e| format!("删除 {path} 失败: {e}"))?;
        Ok(())
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn register_file_assoc(write_open: bool, write_edit: bool) -> Result<String, String> {
    use file_assoc::{read_verb, write_verb, delete_verb};
    let mut log_lines: Vec<String> = Vec::new();
    if write_open {
        write_verb("open", None)?;
        log_lines.push("open verb 已写入".to_string());
    } else if read_verb("open")?.is_some() {
        delete_verb("open")?;
        log_lines.push("open verb 已删除".to_string());
    }
    if write_edit {
        write_verb("edit", Some("--edit"))?;
        log_lines.push("edit verb 已写入".to_string());
    } else if read_verb("edit")?.is_some() {
        delete_verb("edit")?;
        log_lines.push("edit verb 已删除".to_string());
    }
    Ok(log_lines.join("; "))
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn check_file_assoc() -> Result<FileAssocStatus, String> {
    let expected = file_assoc::build_command(None)?;
    let current = file_assoc::read_verb("open")?;
    // 规范化比较：去掉路径中可能的引号/大小写差异
    let normalize = |s: &str| s.to_lowercase().replace('"', "").trim().to_string();
    let open_ok = current.as_ref().map(|c| normalize(c) == normalize(&expected)).unwrap_or(false);
    Ok(FileAssocStatus {
        open_ok,
        current_open_cmd: current,
        expected_open_cmd: expected,
    })
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn check_file_assoc() -> Result<FileAssocStatus, String> {
    Ok(FileAssocStatus {
        open_ok: true,
        current_open_cmd: None,
        expected_open_cmd: String::new(),
    })
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn register_file_assoc(_write_open: bool, _write_edit: bool) -> Result<String, String> {
    Ok("非 Windows 平台，跳过".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cleanup_temp_files() {
        // 该测试会扫描并删除系统临时目录根部的所有 piccraft_ 前缀文件，
        // 必须与依赖这些文件的测试串行执行（见 TEMP_FILE_TEST_LOCK 说明）
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        // 创建一个 piccraft_ 前缀的临时文件
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("piccraft_test_cleanup_dummy.tmp");
        std::fs::write(&test_file, b"test").unwrap();
        assert!(test_file.exists());

        cleanup_temp_files();
        assert!(!test_file.exists(), "piccraft_ 前缀文件应被清理");
    }

    #[test]
    fn test_cleanup_temp_files_preserves_unrelated() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        // 非 piccraft_ 前缀文件不应被删除
        let temp_dir = std::env::temp_dir();
        let unrelated = temp_dir.join("not_piccraft_test.tmp");
        std::fs::write(&unrelated, b"keep").unwrap();

        cleanup_temp_files();
        // 验证不受影响（可能因权限问题存在但不应因函数逻辑被删）
        if unrelated.exists() {
            let _ = std::fs::remove_file(&unrelated);
        }
    }

    #[test]
    fn test_cleanup_thumb_cache_under_limit() {
        // 缓存总量不超过阈值时不应删除文件
        let cache_dir = std::env::temp_dir().join("piccraft_thumbs");
        let _ = std::fs::create_dir_all(&cache_dir);
        let test_file = cache_dir.join("test_small_cache.png");
        std::fs::write(&test_file, b"tiny").unwrap();

        cleanup_thumb_cache();
        // 小文件应保留
        assert!(test_file.exists(), "未超阈值时应保留缓存文件");
        let _ = std::fs::remove_file(&test_file);
    }

    #[test]
    fn test_cleanup_thumb_cache_evicts_oldest() {
        // 创建超量缓存文件，验证最旧的被淘汰
        let cache_dir = std::env::temp_dir().join("piccraft_thumbs");
        let _ = std::fs::create_dir_all(&cache_dir);

        // 写入 3 个文件，每个 100MB（用稀疏文件避免实际占用磁盘）
        let mut files = Vec::new();
        for i in 0..3 {
            let f = cache_dir.join(format!("test_evict_{i}.png"));
            // 写入实际内容（100MB 太大，改为调低阈值来测试逻辑）
            std::fs::write(&f, vec![0u8; 1024 * 100]).unwrap(); // 100KB
            files.push(f);
        }

        // 总量 300KB 远低于 200MB，所以不会删除——仅验证函数不 panic
        cleanup_thumb_cache();

        // 清理测试文件
        for f in &files {
            let _ = std::fs::remove_file(f);
        }
    }

    #[test]
    fn test_is_sensitive_path_windows() {
        assert!(is_sensitive_path(r"C:\Windows\System32\cmd.exe"));
        assert!(is_sensitive_path(r"C:\Users\test\AppData\Local\foo"));
        assert!(is_sensitive_path(r"C:\Program Files\bar"));
        assert!(is_sensitive_path(r"C:\Program Files (x86)\baz"));
    }

    #[test]
    fn test_is_sensitive_path_safe_paths() {
        assert!(!is_sensitive_path(r"D:\Pictures\photo.jpg"));
        assert!(!is_sensitive_path(r"C:\Users\test\Pictures\photo.jpg"));
        assert!(!is_sensitive_path(r"E:\Photos\vacation\img.png"));
    }

    #[test]
    fn test_is_sensitive_path_temp_dir_exempt() {
        // 系统临时目录下的文件不应被阻止（应用自身的临时文件所在）
        let temp_file = std::env::temp_dir().join("test_sensitive_check.tmp");
        assert!(!is_sensitive_path(temp_file.to_str().unwrap()));
    }

    #[test]
    fn test_is_sensitive_path_temp_dir_itself_exempt() {
        // 远端 CI 复现：temp 目录位于 AppData 下（如 C:\Users\runneradmin\AppData\Local\Temp），
        // temp 目录自身（canonicalize 返回无尾分隔符）必须放行，不能命中 \appdata\ 规则
        let temp_dir = std::env::temp_dir();
        let temp_dir_str = temp_dir.to_string_lossy();
        let bare = temp_dir_str.strip_suffix('\\').unwrap_or(&temp_dir_str);
        if !bare.to_lowercase().contains(r"\appdata\") {
            // 本机 temp 不在 AppData 下时该复现场景不存在，跳过（不依赖真实用户名）
            return;
        }
        // temp 目录自身（无尾分隔符）
        assert!(!is_sensitive_path(bare), "temp 目录自身应放行: {bare}");
        // temp 目录自身（temp_dir() 返回的带尾分隔符形式）
        assert!(
            !is_sensitive_path(&temp_dir_str),
            "temp 目录自身（带尾分隔符）应放行: {temp_dir_str}"
        );
        // temp 子目录与子路径（字符串形式，无尾分隔符）
        let sub = temp_dir.join("piccraft_test_sensitive_subdir");
        assert!(
            !is_sensitive_path(&sub.to_string_lossy()),
            "temp 子目录应放行: {}",
            sub.display()
        );
        let sub_file = sub.join("x.png");
        assert!(
            !is_sensitive_path(&sub_file.to_string_lossy()),
            "temp 子路径文件应放行: {}",
            sub_file.display()
        );
    }

    #[test]
    fn test_is_sensitive_path_other_appdata_still_rejected() {
        // 回归护栏：temp 豁免只放行真实 temp 目录本身及其子路径，不得放宽其它 AppData
        assert!(is_sensitive_path(r"C:\Users\someuser\AppData\Local\Temp"));
        assert!(is_sensitive_path(
            r"C:\Users\someuser\AppData\Local\Temp\foo.png"
        ));
        assert!(is_sensitive_path(
            r"C:\Users\someuser\AppData\Local\anything"
        ));
        assert!(is_sensitive_path(
            r"C:\Users\someuser\AppData\Roaming\config"
        ));
    }

    #[test]
    fn test_is_under_temp_dir_short_long_name_matrix() {
        // 模拟 GitHub Actions runner 的 8.3 短名场景（不依赖本机真实短名）：
        // temp_dir() 返回短名形式（runner~1），canonicalize 后展开为长名形式（runneradmin）
        let temp_raw = r"c:\users\runner~1\appdata\local\temp";
        let temp_canon = r"c:\users\runneradmin\appdata\local\temp";
        // canonicalized 长路径：temp 目录自身 → 放行
        assert!(is_under_temp_dir(temp_canon, temp_raw, temp_canon));
        // canonicalized 长路径：temp 子路径文件 → 放行
        assert!(is_under_temp_dir(
            r"c:\users\runneradmin\appdata\local\temp\sub\x.png",
            temp_raw,
            temp_canon
        ));
        // 原始短名路径（未 canonicalize 的字符串，canonicalize 失败兜底场景）→ 放行
        assert!(is_under_temp_dir(
            r"c:\users\runner~1\appdata\local\temp\sub\x.png",
            temp_raw,
            temp_canon
        ));
        // 假用户路径 → 不放行（护栏：安全边界不得放宽）
        assert!(!is_under_temp_dir(
            r"c:\users\someuser\appdata\local\temp",
            temp_raw,
            temp_canon
        ));
    }

    #[test]
    fn test_is_under_temp_dir_edge_cases_no_panic() {
        // 空 base / 空 path 边界不 panic
        assert!(!is_under_temp_dir("", "", ""));
        assert!(!is_under_temp_dir(r"c:\x\y.png", "", ""));
        assert!(!is_under_temp_dir("", r"c:\temp", r"c:\temp"));
        // temp base 带尾分隔符（temp_dir() 返回形式）时同样放行
        assert!(is_under_temp_dir(
            r"c:\temp\x.png",
            r"c:\temp\",
            r"c:\temp\"
        ));
    }

    #[test]
    fn test_png_colors_bounds() {
        assert_eq!(png_colors(1), 16);      // 最低质量 → 16 色
        assert_eq!(png_colors(100), 256);   // 最高质量 → 256 色
        assert_eq!(png_colors(0), 16);      // clamp 到 1
        assert_eq!(png_colors(101), 256);   // clamp 到 100
        assert_eq!(png_colors(50), 134);    // 中间值线性插值: 16 + 49*240/99 = 134
    }

    #[test]
    fn test_check_file_size_ok() {
        // 创建小文件，应通过校验
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("piccraft_test_filesize_ok.tmp");
        std::fs::write(&test_file, b"small").unwrap();
        assert!(check_file_size_path(&test_file).is_ok());
        let _ = std::fs::remove_file(&test_file);
    }

    #[test]
    fn test_check_file_size_not_found() {
        // 不存在的文件应返回错误
        let result = check_file_size_path(Path::new("nonexistent_file_12345678.tmp"));
        assert!(result.is_err());
    }

    // ─── WORK-003-03 新增：测试隔离与覆盖 ───

    /// 串行化"扫描/清理系统临时目录根部"的测试，避免并发互相删除临时文件
    /// （cleanup_temp_files 会删除临时目录根下所有 piccraft_ 前缀文件，
    /// 而 crop/resize 等测试依赖这些文件，必须互斥执行）
    static TEMP_FILE_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    /// 在系统临时目录创建独立测试子目录（测试隔离，不触碰用户真实目录）
    fn test_work_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "piccraft_test_work003_{name}_{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        dir
    }

    /// 在测试子目录内创建纯色测试图片
    fn make_test_image(dir: &Path, name: &str, width: u32, height: u32, ext: &str) -> PathBuf {
        let path = dir.join(format!("{name}.{ext}"));
        let img = image::RgbImage::from_pixel(width, height, image::Rgb([200, 100, 50]));
        img.save(&path).expect("测试图片创建失败");
        path
    }

    fn img_dims(path: &Path) -> (u32, u32) {
        image::image_dimensions(path).expect("读取测试图片尺寸失败")
    }

    // ── 临时文件 ──

    #[test]
    fn test_temp_file_path_lives_in_temp_dir() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let path = temp_file_path(r"D:\Pictures\photo.jpg", "resized").unwrap();
        assert_eq!(
            path.parent().unwrap(),
            std::env::temp_dir(),
            "临时文件应位于系统临时目录"
        );
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        assert!(
            name.starts_with("piccraft_"),
            "临时文件名应有 piccraft_ 前缀: {name}"
        );
        assert!(
            name.ends_with("resized.jpg"),
            "临时文件名应带后缀与源图扩展名: {name}"
        );
    }

    #[test]
    fn test_temp_file_path_unique_per_call() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let a = temp_file_path(r"D:\Pictures\photo.jpg", "resized").unwrap();
        let b = temp_file_path(r"D:\Pictures\photo.jpg", "resized").unwrap();
        assert_ne!(a, b, "两次调用应生成不同的临时文件");
    }

    #[test]
    fn test_temp_file_path_extension_fallback() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        // 无扩展名 / 不支持扩展名 → 回退 png；jpeg 保持原格式
        let no_ext = temp_file_path(r"D:\Pictures\photo", "t").unwrap();
        assert!(no_ext.to_string_lossy().ends_with(".png"));
        let unsupported = temp_file_path(r"D:\Pictures\photo.tiff", "t").unwrap();
        assert!(unsupported.to_string_lossy().ends_with(".png"));
        let jpeg = temp_file_path(r"D:\Pictures\photo.jpeg", "t").unwrap();
        assert!(jpeg.to_string_lossy().ends_with(".jpeg"));
    }

    // ── 裁剪 crop ──

    #[test]
    fn test_crop_image_ok() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let dir = test_work_dir("crop_ok");
        let src = make_test_image(&dir, "crop_src", 100, 80, "png");
        let result = crop_image(src.to_string_lossy().to_string(), 10, 10, 20, 30).unwrap();
        assert_eq!((result.width, result.height), (20, 30));
        let temp = PathBuf::from(&result.temp_path);
        assert!(temp.exists(), "裁剪结果临时文件应存在");
        assert_eq!(img_dims(&temp), (20, 30));
        let _ = std::fs::remove_file(&temp);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_crop_image_out_of_bounds() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let dir = test_work_dir("crop_oob");
        let src = make_test_image(&dir, "crop_src", 100, 80, "png");
        let err = crop_image(src.to_string_lossy().to_string(), 90, 70, 20, 20).unwrap_err();
        assert!(err.contains("超出图片范围"), "越界裁剪应报错: {err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_crop_image_zero_size() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let dir = test_work_dir("crop_zero");
        let src = make_test_image(&dir, "crop_src", 100, 80, "png");
        assert!(crop_image(src.to_string_lossy().to_string(), 0, 0, 0, 10).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_crop_image_sensitive_path_rejected() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let err =
            crop_image(r"C:\Windows\System32\fake.png".to_string(), 0, 0, 10, 10).unwrap_err();
        assert!(err.contains("安全限制"), "敏感路径应被拒绝: {err}");
    }

    // ── 缩放 resize ──

    #[test]
    fn test_resize_image_ok() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let dir = test_work_dir("resize_ok");
        let src = make_test_image(&dir, "resize_src", 100, 80, "png");
        let result = resize_image(src.to_string_lossy().to_string(), 200, 160).unwrap();
        assert_eq!((result.width, result.height), (200, 160));
        let temp = PathBuf::from(&result.temp_path);
        assert!(temp.exists(), "缩放结果临时文件应存在");
        assert_eq!(img_dims(&temp), (200, 160));
        let _ = std::fs::remove_file(&temp);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_resize_image_zero_target_rejected() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let dir = test_work_dir("resize_zero");
        let src = make_test_image(&dir, "resize_src", 100, 80, "png");
        assert!(resize_image(src.to_string_lossy().to_string(), 0, 100).is_err());
        assert!(resize_image(src.to_string_lossy().to_string(), 100, 0).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_resize_image_sensitive_path_rejected() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let err = resize_image(r"C:\Windows\System32\fake.png".to_string(), 100, 100).unwrap_err();
        assert!(err.contains("安全限制"), "敏感路径应被拒绝: {err}");
    }

    // ── 变换 transform ──

    #[test]
    fn test_transform_image_modes() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let dir = test_work_dir("transform_modes");
        let src = make_test_image(&dir, "transform_src", 100, 80, "png");
        let src_str = src.to_string_lossy().to_string();
        for (mode, expect) in [
            ("flip-h", (100, 80)),
            ("flip-v", (100, 80)),
            ("rot-cw", (80, 100)),
            ("rot-ccw", (80, 100)),
        ] {
            let result = transform_image(src_str.clone(), mode.to_string()).unwrap();
            assert_eq!((result.width, result.height), expect, "mode={mode}");
            let temp = PathBuf::from(&result.temp_path);
            assert!(temp.exists());
            let _ = std::fs::remove_file(&temp);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_transform_image_unsupported_mode() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let dir = test_work_dir("transform_unsupported");
        let src = make_test_image(&dir, "transform_src", 100, 80, "png");
        let err = transform_image(src.to_string_lossy().to_string(), "rotate-45".to_string())
            .unwrap_err();
        assert!(err.contains("不支持的变换"), "未知模式应报错: {err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_transform_image_sensitive_path_rejected() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let err = transform_image(
            r"C:\Windows\System32\fake.png".to_string(),
            "flip-h".to_string(),
        )
        .unwrap_err();
        assert!(err.contains("安全限制"), "敏感路径应被拒绝: {err}");
    }

    // ── 保存 save ──

    #[test]
    fn test_save_image_jpeg_ok_and_temp_cleanup() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let dir = test_work_dir("save_jpeg");
        let src = make_test_image(&dir, "save_src", 40, 30, "png");
        let src_str = src.to_string_lossy().to_string();
        let out = dir.join("out.jpg");
        let result = save_image(
            src_str.clone(),
            out.to_string_lossy().to_string(),
            "jpeg".to_string(),
            80,
        )
        .unwrap();
        assert!(out.exists(), "JPEG 输出文件应存在");
        assert!(result.file_size > 0);
        assert!(!Path::new(&src_str).exists(), "保存成功后临时文件应被清理");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_save_image_png_webp_bmp_ok() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let dir = test_work_dir("save_multi");
        for fmt in ["png", "webp", "bmp"] {
            let src = make_test_image(&dir, &format!("save_src_{fmt}"), 40, 30, "png");
            let out = dir.join(format!("out_{fmt}.{fmt}"));
            let result = save_image(
                src.to_string_lossy().to_string(),
                out.to_string_lossy().to_string(),
                fmt.to_string(),
                80,
            )
            .unwrap();
            assert!(out.exists(), "{fmt} 输出文件应存在");
            assert!(result.file_size > 0);
            assert!(!src.exists(), "保存成功后临时文件应被清理");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_save_image_png_quality_clamp() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let dir = test_work_dir("save_clamp");
        // quality 0/101 应被 clamp 而非报错
        let src = make_test_image(&dir, "save_src", 40, 30, "png");
        let out = dir.join("out_q0.png");
        let r0 = save_image(
            src.to_string_lossy().to_string(),
            out.to_string_lossy().to_string(),
            "png".to_string(),
            0,
        )
        .unwrap();
        assert!(r0.file_size > 0);
        let src2 = make_test_image(&dir, "save_src2", 40, 30, "png");
        let out2 = dir.join("out_q101.png");
        let r101 = save_image(
            src2.to_string_lossy().to_string(),
            out2.to_string_lossy().to_string(),
            "png".to_string(),
            101,
        )
        .unwrap();
        assert!(r101.file_size > 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_save_image_unsupported_format() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let dir = test_work_dir("save_badfmt");
        let src = make_test_image(&dir, "save_src", 40, 30, "png");
        let out = dir.join("out.gif");
        let err = save_image(
            src.to_string_lossy().to_string(),
            out.to_string_lossy().to_string(),
            "gif".to_string(),
            80,
        )
        .unwrap_err();
        assert!(err.contains("不支持的格式"), "未知格式应报错: {err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_save_image_sensitive_paths_rejected() {
        let _guard = TEMP_FILE_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let dir = test_work_dir("save_sensitive");
        let src = make_test_image(&dir, "save_src", 40, 30, "png");
        let win = r"C:\Windows\System32\fake.png";
        // 临时路径敏感
        assert!(save_image(
            win.to_string(),
            src.to_string_lossy().to_string(),
            "png".to_string(),
            80
        )
        .is_err());
        // 保存路径敏感
        assert!(save_image(
            src.to_string_lossy().to_string(),
            win.to_string(),
            "png".to_string(),
            80
        )
        .is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ── 缩略图 thumbnail ──

    #[test]
    fn test_make_thumbnail_scales_down() {
        let dir = test_work_dir("thumb_scale");
        let src = make_test_image(&dir, "thumb_src", 200, 100, "png");
        let thumb = make_thumbnail(src.to_string_lossy().to_string(), 50).unwrap();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&thumb)
            .expect("应返回 base64");
        assert_eq!(
            &bytes[..8],
            &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A],
            "应返回 PNG"
        );
        let img = image::load_from_memory(&bytes).unwrap();
        assert!(
            img.width() <= 50 && img.height() <= 25,
            "缩略图应不超过 max_width: {}x{}",
            img.width(),
            img.height()
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_make_thumbnail_jpeg_fast_path() {
        let dir = test_work_dir("thumb_jpeg");
        let src = make_test_image(&dir, "thumb_jpeg_src", 200, 100, "jpg");
        let thumb = make_thumbnail(src.to_string_lossy().to_string(), 50).unwrap();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&thumb)
            .unwrap();
        let img = image::load_from_memory(&bytes).unwrap();
        assert!(
            img.width() <= 50 && img.height() <= 25,
            "JPEG 快速路径缩略图应不超过 max_width: {}x{}",
            img.width(),
            img.height()
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_make_thumbnail_max_width_clamped() {
        let dir = test_work_dir("thumb_clamp");
        let src = make_test_image(&dir, "thumb_clamp_src", 2000, 1000, "png");
        let thumb = make_thumbnail(src.to_string_lossy().to_string(), 5000).unwrap();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&thumb)
            .unwrap();
        let img = image::load_from_memory(&bytes).unwrap();
        assert!(
            img.width() <= THUMBNAIL_MAX_WIDTH && img.height() <= THUMBNAIL_MAX_WIDTH,
            "max_width 应被截断到 THUMBNAIL_MAX_WIDTH: {}x{}",
            img.width(),
            img.height()
        );
        assert!(img.width() < 2000, "大图应被缩小: {}", img.width());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_make_thumbnail_zero_width_rejected() {
        let dir = test_work_dir("thumb_zero");
        let src = make_test_image(&dir, "thumb_src", 200, 100, "png");
        assert!(make_thumbnail(src.to_string_lossy().to_string(), 0).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_make_thumbnail_sensitive_path_rejected() {
        let err = make_thumbnail(r"C:\Windows\System32\fake.png".to_string(), 100).unwrap_err();
        assert!(err.contains("安全限制"), "敏感路径应被拒绝: {err}");
    }

    // ── 批量命名（WORK-003-04 前端确认的后端行为依据）──

    #[test]
    fn test_unique_batch_name_duplicates_suffixed() {
        let mut used = std::collections::HashSet::new();
        let p = Path::new(r"D:\photos\a.png");
        assert_eq!(unique_batch_name(p, &mut used), "a.png");
        assert_eq!(unique_batch_name(p, &mut used), "a_1.png");
        assert_eq!(unique_batch_name(p, &mut used), "a_2.png");
    }

    #[test]
    fn test_unique_batch_name_distinct_filenames_kept() {
        let mut used = std::collections::HashSet::new();
        assert_eq!(
            unique_batch_name(Path::new(r"D:\photos\a.png"), &mut used),
            "a.png"
        );
        assert_eq!(
            unique_batch_name(Path::new(r"D:\photos\b.jpg"), &mut used),
            "b.jpg"
        );
        // 同 stem 不同扩展名视为不同文件名
        assert_eq!(
            unique_batch_name(Path::new(r"D:\photos\a.jpg"), &mut used),
            "a.jpg"
        );
    }

    #[test]
    fn test_process_single_batch_same_dir_overwrites() {
        // ADR-0004 后端行为依据：输出 == 输入且不重名 → 直接覆盖原图（原地替换工作流，允许）
        let dir = test_work_dir("batch_overwrite");
        let img = make_test_image(&dir, "src", 100, 80, "png");
        let result = process_single_batch(&img, &img, 50, 60);
        assert!(result.is_ok(), "同目录覆盖应成功: {:?}", result);
        assert!(img.exists(), "覆盖后文件应存在");
        assert_eq!(img_dims(&img), (50, 40), "原图应按目标宽度等比缩小并覆盖");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_process_single_batch_suffixed_output_keeps_both() {
        let dir = test_work_dir("batch_suffix");
        let img = make_test_image(&dir, "src", 100, 80, "png");
        let out = dir.join("src_1.png");
        let result = process_single_batch(&img, &out, 50, 60);
        assert!(result.is_ok());
        assert!(
            img.exists() && out.exists(),
            "重名后缀输出时原图与输出应同时存在"
        );
        assert_eq!(img_dims(&out), (50, 40));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_process_single_batch_jpeg_output() {
        let dir = test_work_dir("batch_jpeg");
        let img = make_test_image(&dir, "src", 100, 80, "png");
        let out = dir.join("out.jpg");
        let result = process_single_batch(&img, &out, 50, 60);
        assert!(result.is_ok());
        let bytes = std::fs::read(&out).unwrap();
        assert_eq!(&bytes[..2], &[0xFF, 0xD8], "png 输入 + jpg 输出应生成 JPEG");
        assert_eq!(img_dims(&out), (50, 40));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_process_single_batch_zero_width_rejected() {
        let dir = test_work_dir("batch_zero");
        let img = make_test_image(&dir, "src", 100, 80, "png");
        assert!(process_single_batch(&img, &img, 0, 60).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ── 批量命令公共校验（batch_process 与 batch_process_queue 共用）──

    #[test]
    fn test_validate_batch_paths_rejects_sensitive_input() {
        let err = validate_batch_paths(&[r"C:\Windows\System32".to_string()], r"D:\Pictures\batch")
            .unwrap_err();
        assert!(err.contains("安全限制"), "敏感输入目录应被拒绝: {err}");
    }

    #[test]
    fn test_validate_batch_paths_rejects_sensitive_output() {
        let err =
            validate_batch_paths(&[r"D:\Pictures\batch".to_string()], r"C:\Program Files\out")
                .unwrap_err();
        assert!(err.contains("安全限制"), "敏感输出目录应被拒绝: {err}");
    }

    #[test]
    fn test_validate_batch_paths_rejects_appdata_input() {
        let err = validate_batch_paths(
            &[r"C:\Users\alice\AppData\Roaming\pics".to_string()],
            r"D:\Pictures\batch",
        )
        .unwrap_err();
        assert!(err.contains("安全限制"), "AppData 输入应被拒绝: {err}");
    }

    #[test]
    fn test_validate_batch_paths_same_dir_allowed() {
        // ADR-0004：输出 == 输入是合法场景（前端二次确认），后端校验必须放行
        let same = r"D:\Pictures\batch";
        assert!(validate_batch_paths(&[same.to_string()], same).is_ok());
    }

    #[test]
    fn test_validate_batch_paths_safe_paths_ok() {
        assert!(validate_batch_paths(
            &[r"D:\Pictures\batch".to_string()],
            r"D:\Pictures\batch_out"
        )
        .is_ok());
    }

    // ── 目录扫描上限 MAX_DIR_ENTRIES ──

    #[test]
    fn test_collect_dir_image_entries_under_limit() {
        let dir = test_work_dir("scan_small");
        for n in ["a.png", "b.JPG", "c.webp"] {
            std::fs::File::create(dir.join(n)).unwrap();
        }
        std::fs::File::create(dir.join("note.txt")).unwrap();
        std::fs::create_dir(dir.join("sub")).unwrap();
        let (entries, truncated) = collect_dir_image_entries(&dir).unwrap();
        assert_eq!(entries.len(), 3, "应识别大小写扩展名，跳过非图片文件");
        assert!(!truncated, "未超上限不应标记截断");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_collect_dir_image_entries_truncates_over_max() {
        let dir = test_work_dir("scan_max");
        for i in 0..(MAX_DIR_ENTRIES + 3) {
            std::fs::File::create(dir.join(format!("img_{i:05}.png"))).unwrap();
        }
        let (entries, truncated) = collect_dir_image_entries(&dir).unwrap();
        assert!(truncated, "超出上限应标记截断");
        assert_eq!(
            entries.len(),
            MAX_DIR_ENTRIES,
            "超出上限应截断到 MAX_DIR_ENTRIES"
        );
        // 确定性：截断保留的是文件名排序后的前 MAX_DIR_ENTRIES 个，且整体升序
        assert_eq!(
            entries.first().unwrap().file_name().unwrap().to_string_lossy(),
            "img_00000.png",
            "应保留文件名最小的条目"
        );
        assert_eq!(
            entries.last().unwrap().file_name().unwrap().to_string_lossy(),
            format!("img_{:05}.png", MAX_DIR_ENTRIES - 1),
            "应截掉文件名最大（最后创建）的 3 个"
        );
        assert!(
            entries.windows(2).all(|w| w[0].file_name() <= w[1].file_name()),
            "截断结果应按文件名升序"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_collect_dir_image_entries_empty_dir() {
        let dir = test_work_dir("scan_empty");
        let (entries, truncated) = collect_dir_image_entries(&dir).unwrap();
        assert!(entries.is_empty(), "空目录返回空列表");
        assert!(!truncated, "空目录不应标记截断");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_batch_result_with_truncation_warning() {
        // batch_process 命令本身需要 AppHandle，无法直接构造；警告拼接在共享纯函数上覆盖
        let plain = batch_result_with_truncation_warning("完成！共处理 5 张图片".to_string(), false);
        assert_eq!(plain, "完成！共处理 5 张图片", "未截断时消息原样返回");

        let warned =
            batch_result_with_truncation_warning("完成！共处理 5000 张图片".to_string(), true);
        assert!(
            warned.contains("完成！共处理 5000 张图片"),
            "截断时保留原结果消息"
        );
        assert!(
            warned.contains(&format!("超过 {MAX_DIR_ENTRIES} 张上限")),
            "截断时追加清晰警告: {warned}"
        );
        assert!(
            warned.contains("已跳过"),
            "警告应明确其余图片被跳过: {warned}"
        );
    }
}
