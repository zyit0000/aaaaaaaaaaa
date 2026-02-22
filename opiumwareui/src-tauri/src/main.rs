// src-tauri/src/main.rs
// Prevents additional console window on Windows in release mode.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Runtime};

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

#[cfg(target_os = "windows")]
use window_vibrancy::{apply_acrylic, apply_mica};

// ─── Commands ────────────────────────────────────────────────────────────────

/// Returns the platform string so the frontend can adapt styling.
#[tauri::command]
fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

/// Saves a single note (content) to a JSON file in the app data directory.
#[tauri::command]
async fn save_notes(
    app: tauri::AppHandle,
    notes_json: String,
) -> Result<(), String> {
    use std::fs;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let notes_path = data_dir.join("notes.json");
    fs::write(notes_path, notes_json).map_err(|e| e.to_string())?;

    Ok(())
}

/// Loads all notes from the app data directory.
#[tauri::command]
async fn load_notes(app: tauri::AppHandle) -> Result<String, String> {
    use std::fs;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let notes_path = data_dir.join("notes.json");

    if notes_path.exists() {
        fs::read_to_string(notes_path).map_err(|e| e.to_string())
    } else {
        // Return empty array JSON if no file exists yet
        Ok("[]".to_string())
    }
}

// ─── Setup Helper ─────────────────────────────────────────────────────────────

fn apply_window_effects<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    #[cfg(target_os = "macos")]
    {
        // Apply sidebar vibrancy using the Under-Window Material for Catalina+.
        // NSVisualEffectMaterial::Sidebar gives the exact translucent sidebar
        // look as seen in native macOS apps (Finder, Notes, Mail, etc.).
        apply_vibrancy(
            window,
            NSVisualEffectMaterial::Sidebar,
            Some(NSVisualEffectState::FollowsWindowActiveState),
            Some(8.0), // corner radius
        )
        .expect("Failed to apply macOS vibrancy. Requires macOS 10.15+.");
    }

    #[cfg(target_os = "windows")]
    {
        // Try Mica (Windows 11 22H2+) first, fall back to Acrylic.
        if apply_mica(window, Some(false)).is_err() {
            apply_acrylic(window, Some((255, 255, 255, 180)))
                .expect("Failed to apply Windows Acrylic effect.");
        }
    }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("No window labeled 'main' found");

            // Apply platform-specific blur / vibrancy.
            // We wrap in a check so debug builds on Linux won't panic.
            #[cfg(any(target_os = "macos", target_os = "windows"))]
            apply_window_effects(&window);

            // On macOS: make the traffic-light buttons sit inside the toolbar.
            #[cfg(target_os = "macos")]
            {
                use tauri::TitleBarStyle;
                window
                    .set_title_bar_style(TitleBarStyle::Overlay)
                    .unwrap_or_default();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_platform,
            save_notes,
            load_notes,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running Tauri application");
}