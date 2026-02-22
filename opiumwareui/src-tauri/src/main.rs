// src-tauri/src/main.rs
// Prevents additional console window on Windows in release mode.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Runtime};
use std::error::Error;
use std::io::Write;
use std::net::TcpStream;
use flate2::write::ZlibEncoder;
use flate2::Compression;

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
            OpiumwareExecution,
            get_downloads_version,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running Tauri application");
}

fn compress_data(data: &[u8]) -> Result<Vec<u8>, Box<dyn Error>> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(data)?;
    let compressed_data = encoder.finish()?;
    Ok(compressed_data)
}

#[tauri::command]
#[allow(non_snake_case)]
async fn OpiumwareExecution(code: String, port: String) -> String {
    let ports = ["8392", "8393", "8394", "8395", "8396", "8397"];
    let mut stream = None;
    let mut connected_port: Option<String> = None;

    let ports_to_check: Vec<String> = match port.as_str() {
        "ALL" => ports.iter().map(|s| s.to_string()).collect(),
        _ => vec![port],
    };

    for port in ports_to_check {
        let server_address = format!("127.0.0.1:{}", port);
        match TcpStream::connect(&server_address) {
            Ok(s) => {
                println!("Successfully connected to Opiumware on port: {}", port);
                stream = Some(s);
                connected_port = Some(port);
                break;
            }
            Err(e) => println!("Failed to connect to port {}: {}", port, e),
        }
    }

    let mut stream = match stream {
        Some(s) => s,
        None => return "Failed to connect on all ports".to_string(),
    };

    fn send_bytes(stream: &mut TcpStream, message: &str) -> Result<(), String> {
        let plaintext = message.as_bytes();
        let compressed = compress_data(plaintext).map_err(|e| e.to_string())?;
        stream.write_all(&compressed).map_err(|e| e.to_string())?;
        println!("Script sent ({} bytes)", compressed.len());
        Ok(())
    }

    if code != "NULL" {
        let trimmed = code.trim();
        if trimmed.is_empty() {
            drop(stream);
            return "Error sending script: empty script".to_string();
        }
        let message = if trimmed.starts_with("OpiumwareScript ")
            || trimmed.starts_with("OpiumwareSetting ")
        {
            trimmed.to_string()
        } else {
            format!("OpiumwareScript {}", trimmed)
        };
        if let Err(e) = send_bytes(&mut stream, &message) {
            drop(stream);
            return format!("Error sending script: {}", e);
        }
        drop(stream);
        match connected_port {
            Some(port) => format!("Successfully executed on Opiumware port: {}", port),
            None => "Failed to connect on all ports".to_string(),
        }
    } else {
        drop(stream);
        match connected_port {
            Some(port) => format!("Successfully attached to Opiumware port: {}", port),
            None => "Failed to connect on all ports".to_string(),
        }
    }
}

#[tauri::command]
async fn get_downloads_version(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use std::fs;
    let downloads_dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let version_path = downloads_dir.join("version.txt");
    if !version_path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(version_path).map_err(|e| e.to_string())?;
    let parsed = text.trim().to_string();
    if parsed.is_empty() {
        return Ok(None);
    }
    Ok(Some(parsed))
}
