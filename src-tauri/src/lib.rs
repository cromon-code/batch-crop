mod crop;

use crop::{get_image_info, process_batch_export, ExportSettingsPayload, ImageInfoResponse};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, State};

struct AppState {
    cancel_flag: Arc<AtomicBool>,
}

#[tauri::command]
fn load_image_info(source_path: String) -> Result<ImageInfoResponse, String> {
    get_image_info(&source_path)
}

#[tauri::command]
async fn execute_export(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: ExportSettingsPayload,
) -> Result<(), String> {
    // Reset cancel flag before starting
    state.cancel_flag.store(false, Ordering::Relaxed);

    let cancel_flag = state.cancel_flag.clone();

    // Run heavy batch export on blocking thread pool
    tokio::task::spawn_blocking(move || {
        process_batch_export(app, payload, cancel_flag)
    })
    .await
    .map_err(|e| format!("タスクの実行エラー: {}", e))?
}

#[tauri::command]
fn cancel_export(state: State<'_, AppState>) -> Result<(), String> {
    state.cancel_flag.store(true, Ordering::Relaxed);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cancel_flag = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        .manage(AppState { cancel_flag })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![execute_export, cancel_export, load_image_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
