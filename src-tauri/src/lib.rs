mod image_ops;

use image_ops::{get_image_info, resize_image, crop_image, save_image, batch_process};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app.handle().plugin(tauri_plugin_dialog::init())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_image_info,
            resize_image,
            crop_image,
            save_image,
            batch_process,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
