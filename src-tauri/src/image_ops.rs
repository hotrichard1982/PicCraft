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
    check_file_size(&path)?;
    let mut img = image::open(&path).map_err(|e| format!("无法打开图片: {e}"))?;
    let (img_w, img_h) = (img.width(), img.height());
    if x >= img_w || y >= img_h || x + width > img_w || y + height > img_h {
        return Err("裁剪区域超出图片范围".to_string());
    }
    let cropped = img.crop(x, y, width, height);
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
    let input_dir_clone = input_dir.clone();
    let output_dir_clone = output_dir.clone();
    let entries: Vec<PathBuf> = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<PathBuf>, String> {
        std::fs::create_dir_all(&output_dir_clone).map_err(|e| format!("创建输出目录失败: {e}"))?;
        let entries: Vec<_> = std::fs::read_dir(&input_dir_clone)
            .map_err(|e| format!("读取目录失败: {e}"))?
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path().extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| IMG_EXTS.contains(&ext.to_lowercase().as_str()))
                    .unwrap_or(false)
            })
            .map(|e| e.path())
            .collect();
        Ok(entries)
    }).await.map_err(|e| format!("任务执行失败: {e}"))??;

    if entries.is_empty() {
        return Err("目录中没有图片文件".to_string());
    }

    execute_batch_processing(app, entries, output_dir, target_width, quality).await
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
        let unique_name = if used_names.contains(&filename) {
            let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let ext = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
            let mut idx = 1u32;
            let mut candidate = format!("{}_{}{}", stem, idx, ext);
            while used_names.contains(&candidate) {
                idx += 1;
                candidate = format!("{}_{}{}", stem, idx, ext);
            }
            candidate
        } else {
            filename.clone()
        };
        used_names.insert(unique_name.clone());
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
    check_file_size(&path)?;

    // ─── 尝试磁盘缓存 ───
    let cache_key = {
        use std::hash::{Hash, Hasher};
        let mut s = std::collections::hash_map::DefaultHasher::new();
        path.hash(&mut s);
        max_width.hash(&mut s);
        s.finish()
    };
    let cache_dir = std::env::temp_dir().join("piccraft_thumbs");
    let cache_file = cache_dir.join(format!("{cache_key:x}.png"));

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
