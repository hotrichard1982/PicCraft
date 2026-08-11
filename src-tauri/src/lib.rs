mod image_ops;

use image_ops::{
    apply_transforms, batch_process, batch_process_queue, check_file_assoc, crop_image,
    get_file_meta, get_image_info, list_subdirs, make_thumbnail, read_dir, read_startup_args,
    register_file_assoc, resize_image, save_image, transform_image,
};
use serde::Serialize;
use std::path::Path;
use tauri::{Emitter, Manager};
use image_ops::{cleanup_temp_files, cleanup_thumb_cache};

/// 启动模式
#[derive(Debug, Serialize, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StartupMode {
    #[default]
    Cold,
    Browse,
    Edit,
}

/// 启动参数结构体
#[derive(Debug, Serialize, Clone, Default)]
pub struct StartupArgs {
    pub mode: StartupMode,
    /// Edit 模式下：要编辑的文件路径
    pub file: Option<String>,
    /// Browse 模式下：要打开的目录
    pub folder: Option<String>,
}

/// 从 `std::env::args_os()` 解析（启动瞬间调用一次）
pub fn parse_startup_args() -> StartupArgs {
    let mut iter = std::env::args_os();
    let _exe = iter.next();
    // 将 OsString 转为 String 后委托公共解析函数
    let args: Vec<String> = iter.map(|a| a.to_string_lossy().into_owned()).collect();
    parse_args_from_strings(args.into_iter())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_args = parse_startup_args();
    log::info!("PicCraft 启动参数: {:?}", initial_args);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // 第二次启动：转发 args 给已运行实例
            let mut iter = args.into_iter();
            let _exe = iter.next();
            let new_args = parse_from_iter(iter);

            // 更新 State
            let state = app.state::<StartupArgsInner>();
            {
                let mut guard = state.0.lock().expect("StartupArgs mutex poisoned");
                *guard = new_args.clone();
            }

            // 通知前端
            let _ = app.emit("startup-args-updated", &new_args);

            // 焦点回到主窗口
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        .setup(move |app| {
            // 清理上次运行残留的临时文件和超额缩略图缓存
            cleanup_temp_files();
            cleanup_thumb_cache();

            // 把首次启动 args 注入 State
            app.manage(StartupArgsInner(std::sync::Mutex::new(initial_args)));

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app.handle().plugin(tauri_plugin_dialog::init())?;
            app.handle().plugin(tauri_plugin_opener::init())?;
            app.handle().plugin(tauri_plugin_store::Builder::default().build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            apply_transforms,
            get_image_info,
            list_subdirs,
            resize_image,
            crop_image,
            transform_image,
            save_image,
            batch_process,
            read_dir,
            make_thumbnail,
            get_file_meta,
            read_startup_args,
            batch_process_queue,
            check_file_assoc,
            register_file_assoc,
        ])

        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // macOS：Finder 双击打开文件（RunEvent::Opened 变体仅存在于
            // macOS/iOS/Android 编译目标，见 tauri 源码 cfg）。
            // 第二个实例被 Finder 触发时，tauri-plugin-single-instance 会拦截启动并
            // 在回调中转发 argv；已运行实例的 Opened 事件在此经同一链路处理
            // （更新 State + emit 前端 + 焦点）。
            #[cfg(target_os = "macos")]
            {
                if let tauri::RunEvent::Opened { urls } = event {
                    handle_finder_opened(app_handle, urls);
                    return;
                }
            }
            // 其它事件（及非 macOS 平台的全部事件）：忽略
            let _ = (app_handle, event);
        });
}

/// Tauri State 容器：Mutex 包一层让 single-instance 转发能 mutate
pub struct StartupArgsInner(pub std::sync::Mutex<StartupArgs>);

/// 公共解析逻辑：从字符串迭代器解析启动参数
fn parse_args_from_strings<I, S>(mut iter: I) -> StartupArgs
where
    I: Iterator<Item = S>,
    S: AsRef<str>,
{
    let first = match iter.next() {
        Some(a) => a,
        None => return StartupArgs::default(),
    };
    let first = first.as_ref();

    if first == "--edit" {
        let file = iter.next().map(|a| a.as_ref().to_string());
        return StartupArgs {
            mode: StartupMode::Edit,
            file,
            folder: None,
        };
    }

    let p = Path::new(first);
    if p.is_dir() {
        StartupArgs {
            mode: StartupMode::Browse,
            file: None,
            folder: Some(first.to_string()),
        }
    } else {
        StartupArgs {
            mode: StartupMode::Browse,
            file: Some(first.to_string()),
            folder: None,
        }
    }
}

/// 从给定的 args 迭代器解析（single-instance 转发用，避免重复读 env）
fn parse_from_iter<I, S>(iter: I) -> StartupArgs
where
    I: Iterator<Item = S>,
    S: AsRef<str>,
{
    parse_args_from_strings(iter)
}

/// 从 Finder 打开事件的 URL 列表提取本地路径（仅 `file://` 生效，保持原顺序；
/// 非 file scheme 或无效 file URL 被过滤，防御性处理）。
/// 平台无关纯函数：Windows 测试构建中可完整单测 URL 解析链路
#[cfg(any(target_os = "macos", test))]
fn urls_to_paths(urls: &[tauri::Url]) -> Vec<String> {
    urls.iter()
        .filter_map(|u| u.to_file_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// Finder 打开事件 → 启动参数：与 argv 解析复用同一语义（Browse 路由）
/// - 单文件 → Browse + file（对应现有单图参数语义：前端定位该图）
/// - 多文件 → 只取第一个路径（前端按第一张图片所在目录浏览；完整数组另行 emit 给前端）
/// - 目录 → Browse + folder（复用 parse_args_from_strings 的 is_dir 语义）
#[cfg(any(target_os = "macos", test))]
fn parse_opened_urls(urls: &[tauri::Url]) -> StartupArgs {
    let paths = urls_to_paths(urls);
    parse_args_from_strings(paths.into_iter().take(1))
}

/// Finder 打开事件处理：URL → 路径 → StartupArgs → 更新 State + emit 事件 + 焦点。
/// 与 single-instance argv 转发同一链路；与前端约定事件名 `finder-opened`，
/// payload 为完整路径数组（`Vec<String>`，原顺序，前端按第一张图片定位目录）。
/// 仅 macOS 编译（事件本身平台专属）；解析逻辑在 urls_to_paths / parse_opened_urls 上单测
#[cfg(target_os = "macos")]
fn handle_finder_opened(app: &tauri::AppHandle, urls: Vec<tauri::Url>) {
    let paths = urls_to_paths(&urls);
    if paths.is_empty() {
        return;
    }
    let new_args = parse_opened_urls(&urls);

    // 更新 State（与 single-instance 回调一致）
    let state = app.state::<StartupArgsInner>();
    {
        let mut guard = state.0.lock().expect("StartupArgs mutex poisoned");
        *guard = new_args.clone();
    }

    // 通知前端
    let _ = app.emit("finder-opened", &paths);

    // 焦点回到主窗口
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_cold() {
        let result = parse_args_from_strings(std::iter::empty::<String>());
        assert_eq!(result.mode, StartupMode::Cold);
        assert!(result.file.is_none());
        assert!(result.folder.is_none());
    }

    #[test]
    fn test_parse_edit() {
        let args = vec!["--edit".to_string(), "C:/img.jpg".to_string()];
        let result = parse_args_from_strings(args.into_iter());
        assert_eq!(result.mode, StartupMode::Edit);
        assert_eq!(result.file, Some("C:/img.jpg".to_string()));
        assert!(result.folder.is_none());
    }

    #[test]
    fn test_parse_edit_no_file() {
        // --edit 后面没有文件路径
        let result = parse_args_from_strings(std::iter::once("--edit".to_string()));
        assert_eq!(result.mode, StartupMode::Edit);
        assert!(result.file.is_none());
    }

    #[test]
    fn test_parse_browse_file() {
        // 非目录路径 → Browse 模式 + file
        let result = parse_args_from_strings(std::iter::once("D:/photos/img.jpg".to_string()));
        assert_eq!(result.mode, StartupMode::Browse);
        assert_eq!(result.file, Some("D:/photos/img.jpg".to_string()));
        assert!(result.folder.is_none());
    }

    // 保留 parse_from_iter 的委托测试，确保向后兼容
    #[test]
    fn test_parse_from_iter_cold() {
        let result = parse_from_iter(std::iter::empty::<String>());
        assert_eq!(result.mode, StartupMode::Cold);
        assert!(result.file.is_none());
        assert!(result.folder.is_none());
    }

    #[test]
    fn test_parse_from_iter_edit() {
        let args = vec!["--edit".to_string(), "C:/img.jpg".to_string()];
        let result = parse_from_iter(args.into_iter());
        assert_eq!(result.mode, StartupMode::Edit);
        assert_eq!(result.file, Some("C:/img.jpg".to_string()));
    }

    // ─── WORK-004-01 新增：Finder 打开事件（RunEvent::Opened）URL 解析 ───

    fn test_url(s: &str) -> tauri::Url {
        tauri::Url::parse(s).expect("测试 URL 应可解析")
    }

    /// 构造平台合法的 file URL 及其 to_file_path 期望路径（WORK-004-01 返工）：
    /// - Windows：`file:///C:/<rel>` → `C:\<rel>`（url crate 在 Windows 目标要求盘符，反斜杠分隔）
    /// - Unix（含 macOS）：`file:///tmp/<rel>` → `/tmp/<rel>`
    /// url crate 的 to_file_path 按编译目标解析，同一 URL 在不同平台产出不同路径，
    /// 测试数据必须按平台合法构造，断言才有意义
    fn file_url_pair(rel: &str) -> (tauri::Url, String) {
        if cfg!(windows) {
            (
                test_url(&format!("file:///C:/{rel}")),
                format!(r"C:\{}", rel.replace('/', "\\")),
            )
        } else {
            (
                test_url(&format!("file:///tmp/{rel}")),
                format!("/tmp/{rel}"),
            )
        }
    }

    #[test]
    fn test_urls_to_paths_single_file() {
        let (url, expected) = file_url_pair("Photos/a.png");
        assert_eq!(urls_to_paths(&[url]), vec![expected]);
    }

    #[test]
    fn test_urls_to_paths_multiple_keeps_order() {
        let (url_a, expected_a) = file_url_pair("Photos/a.png");
        let (url_b, expected_b) = file_url_pair("Photos/b.png");
        assert_eq!(urls_to_paths(&[url_a, url_b]), vec![expected_a, expected_b]);
    }

    #[test]
    fn test_urls_to_paths_percent_encoded() {
        // 百分号解码发生在 url crate 解析阶段，与平台无关；仅 URL 形态需平台合法
        let (url, _) = file_url_pair("Photos/My%20Pics/a%20b.png");
        let expected = if cfg!(windows) {
            r"C:\Photos\My Pics\a b.png".to_string()
        } else {
            "/tmp/Photos/My Pics/a b.png".to_string()
        };
        assert_eq!(urls_to_paths(&[url]), vec![expected]);
    }

    #[test]
    fn test_urls_to_paths_filters_non_file_scheme() {
        // 非 file:// 的 URL（Finder 理论上只给 file://，防御性过滤）不产出路径
        let (file_url, expected) = file_url_pair("Photos/a.png");
        let urls = vec![test_url("https://example.com/x.png"), file_url];
        assert_eq!(urls_to_paths(&urls), vec![expected]);
    }

    #[test]
    fn test_parse_opened_urls_single_file_browse() {
        // 单文件 → Browse + file（与 argv 单图参数同一语义：前端定位该图）
        let (url, expected) = file_url_pair("Photos/a.png");
        let args = parse_opened_urls(&[url]);
        assert_eq!(args.mode, StartupMode::Browse);
        assert_eq!(args.file, Some(expected));
        assert!(args.folder.is_none());
    }

    #[test]
    fn test_parse_opened_urls_multiple_takes_first() {
        // 多文件 → 只按第一张图片所在目录浏览：只取第一个路径
        let (url_a, expected_a) = file_url_pair("Photos/a.png");
        let (url_b, _) = file_url_pair("Photos/b.png");
        let args = parse_opened_urls(&[url_a, url_b]);
        assert_eq!(args.mode, StartupMode::Browse);
        assert_eq!(args.file, Some(expected_a));
    }

    #[test]
    fn test_parse_opened_urls_non_image_file() {
        // 非图片文件：与 argv 语义一致，不校验扩展名，仍走 Browse 定位
        let (url, expected) = file_url_pair("Photos/notes.txt");
        let args = parse_opened_urls(&[url]);
        assert_eq!(args.mode, StartupMode::Browse);
        assert_eq!(args.file, Some(expected));
    }

    #[test]
    fn test_parse_opened_urls_directory() {
        // 目录 URL → Browse + folder（复用 parse_args_from_strings 的 is_dir 语义；用真实临时目录构造）
        let dir = std::env::temp_dir();
        let url = tauri::Url::from_file_path(&dir).expect("临时目录应能构造 file URL");
        let args = parse_opened_urls(std::slice::from_ref(&url));
        assert_eq!(args.mode, StartupMode::Browse);
        assert!(args.file.is_none());
        let expected = dir.to_string_lossy().trim_end_matches('\\').to_string();
        assert_eq!(args.folder, Some(expected));
    }

    #[test]
    fn test_parse_opened_urls_empty_is_cold() {
        // 无 URL 或全部被过滤 → Cold（默认启动）
        let args = parse_opened_urls(&[]);
        assert_eq!(args.mode, StartupMode::Cold);
        assert!(args.file.is_none());
        assert!(args.folder.is_none());

        let urls = vec![test_url("https://example.com/x.png")];
        let args = parse_opened_urls(&urls);
        assert_eq!(args.mode, StartupMode::Cold);
        assert!(args.file.is_none());
        assert!(args.folder.is_none());
    }
}
