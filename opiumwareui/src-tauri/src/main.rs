// src-tauri/src/main.rs
// Prevents additional console window on Windows in release mode.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Runtime};
use std::error::Error;
use std::io::Write;
use std::net::TcpStream;
use std::process::Command;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
#[cfg(target_os = "macos")]
use std::fs;
#[cfg(target_os = "macos")]
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
#[cfg(target_os = "macos")]
use base64::Engine as _;

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
            write_downloads_version,
            open_terminal,
            run_install_script,
            fetch_url_text,
            roblox_get_account_basic,
            roblox_launch_instance,
            request_screen_capture_access,
            capture_screen_preview,
            read_functions_txt,
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

#[tauri::command]
async fn write_downloads_version(app: tauri::AppHandle, version: String) -> Result<(), String> {
    use std::fs;
    let downloads_dir = app.path().download_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&downloads_dir).map_err(|e| e.to_string())?;
    let version_path = downloads_dir.join("version.txt");
    fs::write(version_path, format!("{}\n", version.trim())).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn open_terminal() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-a")
            .arg("Terminal")
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg("powershell")
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Open terminal is not supported on this platform".to_string())
}

#[tauri::command]
async fn run_install_script(repo: Option<String>) -> Result<String, String> {
    let repo_value = repo
        .unwrap_or_else(|| "zyit0000/aaaaaaaaaaa".to_string())
        .trim()
        .to_string();
    if repo_value.is_empty() {
        return Err("Repo cannot be empty".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        let raw_url = format!("https://raw.githubusercontent.com/{}/main/install.sh", repo_value);
        let cmd = format!("curl -fsSL '{}' | bash", raw_url);
        let output = Command::new("bash")
            .arg("-lc")
            .arg(cmd)
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            let mut text = String::from_utf8_lossy(&output.stdout).to_string();
            if text.trim().is_empty() {
                text = "Installer completed successfully.".to_string();
            }
            return Ok(text);
        }
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if err.trim().is_empty() {
            "Installer failed.".to_string()
        } else {
            err
        });
    }

    #[allow(unreachable_code)]
    Err("Install script fallback is only available on macOS".to_string())
}

#[tauri::command]
async fn fetch_url_text(url: String) -> Result<String, String> {
    let response = reqwest::get(url)
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    response.text().await.map_err(|e| e.to_string())
}

#[derive(Deserialize)]
struct RobloxAuthUser {
    id: u64,
    name: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}

#[derive(Deserialize)]
struct RobloxUserInfo {
    description: Option<String>,
    created: Option<String>,
}

#[derive(Deserialize)]
struct RobloxThumbItem {
    #[serde(rename = "imageUrl")]
    image_url: Option<String>,
}

#[derive(Deserialize)]
struct RobloxThumbResponse {
    data: Vec<RobloxThumbItem>,
}

#[derive(Serialize)]
struct RobloxBasicAccount {
    id: u64,
    username: String,
    #[serde(rename = "displayName")]
    display_name: String,
    description: String,
    created: String,
    #[serde(rename = "avatarUrl")]
    avatar_url: String,
}

#[tauri::command]
async fn roblox_get_account_basic(token: String) -> Result<RobloxBasicAccount, String> {
    let cookie = format!(".ROBLOSECURITY={}", token.trim());
    let client = reqwest::Client::builder()
        .user_agent("OpiumwareUi/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let auth_user = client
        .get("https://users.roblox.com/v1/users/authenticated")
        .header(reqwest::header::COOKIE, cookie.clone())
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !auth_user.status().is_success() {
        return Err(format!("Auth failed: HTTP {}", auth_user.status()));
    }
    let auth_data = auth_user
        .json::<RobloxAuthUser>()
        .await
        .map_err(|e| e.to_string())?;

    let user_info = client
        .get(format!("https://users.roblox.com/v1/users/{}", auth_data.id))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let user_info_data = if user_info.status().is_success() {
        user_info.json::<RobloxUserInfo>().await.ok()
    } else {
        None
    };

    let avatar = client
        .get(format!("https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds={}&size=150x150&format=Png&isCircular=false", auth_data.id))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let avatar_url = if avatar.status().is_success() {
        avatar
            .json::<RobloxThumbResponse>()
            .await
            .ok()
            .and_then(|parsed| parsed.data.first().and_then(|i| i.image_url.clone()))
            .unwrap_or_default()
    } else {
        String::new()
    };

    Ok(RobloxBasicAccount {
        id: auth_data.id,
        username: auth_data.name.clone(),
        display_name: auth_data
            .display_name
            .unwrap_or_else(|| auth_data.name.clone()),
        description: user_info_data
            .as_ref()
            .and_then(|v| v.description.clone())
            .unwrap_or_default(),
        created: user_info_data
            .as_ref()
            .and_then(|v| v.created.clone())
            .unwrap_or_default(),
        avatar_url,
    })
}

#[tauri::command]
async fn roblox_launch_instance(token: String) -> Result<String, String> {
    let token_trimmed = token.trim().to_string();
    if token_trimmed.is_empty() {
        return Err("Token is required".to_string());
    }

    let cookie = format!(".ROBLOSECURITY={}", token_trimmed);
    let client = reqwest::Client::builder()
        .user_agent("OpiumwareUi/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let ticket_resp = client
        .post("https://auth.roblox.com/v1/authentication-ticket")
        .header(reqwest::header::COOKIE, cookie)
        .header(reqwest::header::REFERER, "https://www.roblox.com/")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !ticket_resp.status().is_success() {
        return Err(format!("Auth ticket failed: HTTP {}", ticket_resp.status()));
    }

    let ticket = ticket_resp
        .headers()
        .get("rbx-authentication-ticket")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    if ticket.is_empty() {
        return Err("Missing auth ticket in response".to_string());
    }

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let launcher_url = format!(
        "roblox-player:1+launchmode:play+gameinfo:{}+launchtime:{}+placelauncherurl:https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestGame&placeId=920587237+browsertrackerid:0+robloxLocale:en_us+gameLocale:en_us+channel:",
        ticket, now_ms
    );

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&launcher_url)
            .status()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg("")
            .arg(&launcher_url)
            .status()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        return Err("Launching Roblox is not supported on this platform".to_string());
    }

    Ok("Launched Roblox instance".to_string())
}

#[tauri::command]
async fn request_screen_capture_access() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        // Use screencapture itself to trigger/check the macOS permission prompt.
        // This avoids CoreGraphics symbol issues on older Catalina installations.
        let probe_path = std::env::temp_dir().join("opiumware_screen_probe.jpg");
        let status = Command::new("screencapture")
            .arg("-x")
            .arg("-t")
            .arg("jpg")
            .arg(&probe_path)
            .status()
            .map_err(|e| e.to_string())?;
        let granted = status.success() && probe_path.exists();
        if granted {
            let _ = fs::remove_file(&probe_path);
        }
        return Ok(granted);
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}

#[tauri::command]
async fn capture_screen_preview() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        fn roblox_window_rect() -> Result<Option<(i32, i32, i32, i32)>, String> {
            // Try both common process names seen for Roblox desktop client.
            let script = r#"
set targetNames to {"Roblox", "RobloxPlayer"}
tell application "System Events"
  repeat with n in targetNames
    if exists (first process whose name is n) then
      set p to first process whose name is n
      if (count of windows of p) > 0 then
        set w to front window of p
        set winPos to position of w
        set winSize to size of w
        return (item 1 of winPos as text) & "," & (item 2 of winPos as text) & "," & (item 1 of winSize as text) & "," & (item 2 of winSize as text)
      end if
    end if
  end repeat
end tell
return ""
"#;

            let output = Command::new("osascript")
                .arg("-e")
                .arg(script)
                .output()
                .map_err(|e| e.to_string())?;
            if !output.status.success() {
                return Ok(None);
            }
            let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if raw.is_empty() {
                return Ok(None);
            }
            let parts: Vec<&str> = raw.split(',').collect();
            if parts.len() != 4 {
                return Ok(None);
            }
            let x = parts[0].trim().parse::<i32>().map_err(|e| e.to_string())?;
            let y = parts[1].trim().parse::<i32>().map_err(|e| e.to_string())?;
            let w = parts[2].trim().parse::<i32>().map_err(|e| e.to_string())?;
            let h = parts[3].trim().parse::<i32>().map_err(|e| e.to_string())?;
            if w <= 0 || h <= 0 {
                return Ok(None);
            }
            Ok(Some((x, y, w, h)))
        }

        let temp_path = std::env::temp_dir().join("opiumware_screen_preview.jpg");
        let mut capture_cmd = Command::new("screencapture");
        capture_cmd.arg("-x").arg("-t").arg("jpg");

        if let Some((x, y, w, h)) = roblox_window_rect()? {
            capture_cmd.arg("-R").arg(format!("{},{},{},{}", x, y, w, h));
        }

        let status = capture_cmd
            .arg(&temp_path)
            .status()
            .map_err(|e| e.to_string())?;

        if !status.success() {
            return Ok(None);
        }

        // Keep payload small to avoid memory spikes on older Intel Macs.
        let _ = Command::new("sips")
            .arg("-Z")
            .arg("640")
            .arg(&temp_path)
            .status();

        let bytes = fs::read(&temp_path).map_err(|e| e.to_string())?;
        let encoded = BASE64_STANDARD.encode(bytes);
        let _ = fs::remove_file(&temp_path);
        return Ok(Some(format!("data:image/jpeg;base64,{}", encoded)));
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(None)
    }
}

#[tauri::command]
async fn read_functions_txt(app: tauri::AppHandle) -> Result<String, String> {
    let mut candidates = Vec::new();

    if let Ok(current) = std::env::current_dir() {
        candidates.push(current.join("functions.txt"));
        if let Some(parent) = current.parent() {
            candidates.push(parent.join("functions.txt"));
            if let Some(grand) = parent.parent() {
                candidates.push(grand.join("functions.txt"));
            }
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("functions.txt"));
    }

    for path in candidates {
        if path.exists() {
            let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            return Ok(text);
        }
    }

    Ok(String::new())
}
