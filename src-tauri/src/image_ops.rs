use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::DynamicImage;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use tauri::Emitter;

/// 支持的图片扩展名
pub const IMG_EXTS: [&str; 5] = ["jpg", "jpeg", "png", "webp", "bmp"];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BatchProgress {
    pub current: usize,
    pub total: usize,
    pub filename: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageInfo {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub file_size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageResult {
    pub temp_path: String,
    pub width: u32,
    pub height: u32,
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
    })
}

/// 缩放图片并保存到临时文件
#[tauri::command]
pub fn resize_image(
    path: String,
    target_width: u32,
    target_height: u32,
    keep_aspect: bool,
    quality: u8,
) -> Result<ImageResult, String> {
    if target_width == 0 || target_height == 0 {
        return Err("目标宽度和高度必须大于 0".to_string());
    }

    let img = image::open(&path).map_err(|e| format!("无法打开图片: {e}"))?;

    let (tw, th) = if keep_aspect {
        let (ow, oh) = (img.width(), img.height());
        let ratio = (target_width as f64 / ow as f64).min(target_height as f64 / oh as f64);
        ((ow as f64 * ratio) as u32, (oh as f64 * ratio) as u32)
    } else {
        (target_width, target_height)
    };

    let resized = img.resize_exact(tw, th, FilterType::Lanczos3);

    let temp_path = temp_file_path(&path, "resized")?;
    save_to_temp(&resized, &temp_path, quality)?;

    Ok(ImageResult {
        temp_path: temp_path.to_string_lossy().to_string(),
        width: tw,
        height: th,
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

    let mut img = image::open(&path).map_err(|e| format!("无法打开图片: {e}"))?;

    let (img_w, img_h) = (img.width(), img.height());
    if x >= img_w || y >= img_h {
        return Err("裁剪起点超出图片范围".to_string());
    }

    let cropped = img.crop(x, y, width, height);

    let temp_path = temp_file_path(&path, "cropped")?;
    save_to_temp(&cropped, &temp_path, 95)?;

    Ok(ImageResult {
        temp_path: temp_path.to_string_lossy().to_string(),
        width: cropped.width(),
        height: cropped.height(),
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
                // PNG quantization via imagequant
                let rgba = img.to_rgba8();
                let pixels_rgba: Vec<imagequant::RGBA> = rgba
                    .pixels()
                    .map(|p| imagequant::RGBA {
                        r: p[0],
                        g: p[1],
                        b: p[2],
                        a: p[3],
                    })
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
        "webp" => {
            img.save(save_path).map_err(|e| format!("WebP 保存失败: {e}"))?;
        }
        "bmp" => {
            img.save(save_path).map_err(|e| format!("BMP 保存失败: {e}"))?;
        }
        _ => return Err(format!("不支持的格式: {format}")),
    }

    let file_size = std::fs::metadata(save_path)
        .map_err(|e| format!("获取文件大小失败: {e}"))?
        .len();

    Ok(SaveResult {
        path: save_path.to_string_lossy().to_string(),
        file_size,
    })
}

// ─── 内部工具函数 ───

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

    let total = entries.len();
    let mut errors = Vec::new();

    for (i, path) in entries.iter().enumerate() {
        let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let out_path = PathBuf::from(&output_dir).join(&filename);

        let path_clone = path.clone();
        let out_path_clone = out_path.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            process_single_batch(&path_clone, &out_path_clone, target_width, quality)
        }).await.map_err(|e| format!("任务执行失败: {e}"))?;

        match result {
            Ok(()) => {
                let _ = app.emit("batch-progress", BatchProgress {
                    current: i + 1,
                    total,
                    filename: filename.clone(),
                    error: None,
                });
            }
            Err(e) => {
                errors.push(filename.clone());
                let _ = app.emit("batch-progress", BatchProgress {
                    current: i + 1,
                    total,
                    filename: filename.clone(),
                    error: Some(e.clone()),
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
    if target_width == 0 {
        return Err("目标宽度必须大于 0".to_string());
    }
    let img = image::open(input).map_err(|e| format!("无法打开: {e}"))?;
    let (w, h) = (img.width(), img.height());
    let th = (h as f64 * (target_width as f64 / w as f64)) as u32;
    let resized = img.resize_exact(target_width, th.max(1), FilterType::Lanczos3);

    let ext = input.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_else(|| "jpg".to_string());

    match ext.as_str() {
        "png" => {
            resized.save(output).map_err(|e| format!("PNG 保存失败: {e}"))?;
        }
        "webp" => {
            resized.save(output).map_err(|e| format!("WebP 保存失败: {e}"))?;
        }
        "bmp" => {
            resized.save(output).map_err(|e| format!("BMP 保存失败: {e}"))?;
        }
        _ => {
            let q = quality.clamp(1, 100);
            let rgb = resized.to_rgb8();
            let file = std::fs::File::create(output).map_err(|e| format!("创建文件失败: {e}"))?;
            let mut encoder = JpegEncoder::new_with_quality(file, q);
            encoder
                .encode(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
                .map_err(|e| format!("JPEG 编码失败: {e}"))?;
        }
    }
    Ok(())
}

fn temp_file_path(original: &str, suffix: &str) -> Result<PathBuf, String> {
    let orig = Path::new(original);
    let stem = orig
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy();
    let mut hasher = DefaultHasher::new();
    original.hash(&mut hasher);
    let hash = format!("{:08x}", hasher.finish());
    let dir = std::env::temp_dir();
    let filename = format!("piccraft_{stem}_{hash}_{suffix}.png");
    Ok(dir.join(filename))
}

fn save_to_temp(img: &DynamicImage, path: &PathBuf, quality: u8) -> Result<(), String> {
    let q = quality.clamp(1, 100);
    match path.extension().and_then(|e| e.to_str()) {
        Some("png") => img.save(path).map_err(|e| format!("保存失败: {e}")),
        _ => {
            let rgb = img.to_rgb8();
            let file = std::fs::File::create(path).map_err(|e| format!("创建文件失败: {e}"))?;
            let mut encoder = JpegEncoder::new_with_quality(file, q);
            encoder.encode(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
                .map_err(|e| format!("编码失败: {e}"))
        }
    }
}

fn png_colors(quality: u8) -> u32 {
    let q = quality.clamp(1, 100) as f64;
    16 + ((q - 1.0) * (256.0 - 16.0) / 99.0) as u32
}
