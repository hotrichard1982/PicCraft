mod image_ops;

use image_ops::{
    apply_transforms, batch_process, batch_process_queue, check_file_assoc, crop_image,
    get_file_meta, get_image_info, list_subdirs, make_thumbnail, read_dir, read_startup_args,
    register_file_assoc, resize_image, save_image, transform_image,
};
use serde::Serialize;
use std::path::Path;
use tauri::{Emitter, Manager};

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

    let first = match iter.next() {
        Some(a) => a,
        None => return StartupArgs::default(),
    };

    if first == "--edit" {
        let file = iter.next().map(|a| a.to_string_lossy().into_owned());
        return StartupArgs {
            mode: StartupMode::Edit,
            file,
            folder: None,
        };
    }

    let path_str = first.to_string_lossy().into_owned();
    let p = Path::new(&path_str);

    if p.is_dir() {
        StartupArgs {
            mode: StartupMode::Browse,
            file: None,
            folder: Some(path_str),
        }
    } else {
        // 文件（含不存在 / 权限问题，统一按"尝试作为文件"处理）
        StartupArgs {
            mode: StartupMode::Browse,
            file: Some(path_str),
            folder: None,
        }
    }
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

/// 从给定的 args 迭代器解析（single-instance 转发用，避免重复读 env）
fn parse_from_iter<I, S>(mut iter: I) -> StartupArgs
where
    I: Iterator<Item = S>,
    S: Into<String>,
{
    let first: String = match iter.next() {
        Some(a) => a.into(),
        None => return StartupArgs::default(),
    };

    if first == "--edit" {
        let file = iter.next().map(Into::into);
        return StartupArgs {
            mode: StartupMode::Edit,
            file,
            folder: None,
        };
    }

    let p = Path::new(&first);
    if p.is_dir() {
        StartupArgs {
            mode: StartupMode::Browse,
            file: None,
            folder: Some(first),
        }
    } else {
        StartupArgs {
            mode: StartupMode::Browse,
            file: Some(first),
            folder: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_from_iter_cold() {
        // 调用方应已跳过 exe，第一个元素就是第一个真正的参数
        let result = parse_from_iter(std::iter::empty::<String>());
        assert_eq!(result.mode, StartupMode::Cold);
        assert!(result.file.is_none());
        assert!(result.folder.is_none());
    }

    #[test]
    fn test_parse_from_iter_edit() {
        // 调用方应已跳过 exe，剩余 ["--edit", "C:/img.jpg"]
        let args = vec!["--edit".to_string(), "C:/img.jpg".to_string()];
        let result = parse_from_iter(args.into_iter());
        assert_eq!(result.mode, StartupMode::Edit);
        assert_eq!(result.file, Some("C:/img.jpg".to_string()));
    }
}
