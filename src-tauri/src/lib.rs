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

        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
}
