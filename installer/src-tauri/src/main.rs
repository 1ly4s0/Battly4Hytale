#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::fs;
use std::path::{Path, PathBuf};
use std::io::{Cursor, Read};
use std::process::Command;
use std::env;
use tauri::Window;
use tauri_plugin_aptabase::{EventTracker, InitOptions};
use winreg::RegKey;
use winreg::enums::*;
use zip::ZipArchive;

const APP_FOLDER_NAME: &str = "BattlyLauncher4Hytale";
const APP_DISPLAY_NAME: &str = "Battly Launcher 4 Hytale";
const EXECUTABLE_NAME: &str = "Battly Launcher 4 Hytale.exe";
const UNINSTALLER_NAME: &str = "uninstall.exe";
const PAYLOAD_URL: &str = "https://github.com/1ly4s0/Battly4Hytale/releases/latest/download/BattlyLauncher-win.zip"; 
const SHORTCUT_NAME: &str = "Battly Launcher 4 Hytale";
const OPERA_SETUP_URL: &str = "https://net.geo.opera.com/opera_gx/stable/edition/std-1?utm_source=battly&utm_medium=pb&utm_campaign=gx";

#[derive(Clone, serde::Serialize)]
struct Payload {
    progress: f32,
    status_key: String,
    status_data: Option<String>,
}

fn launcher_install_path() -> Option<PathBuf> {
    dirs::data_local_dir().map(|p| p.join(APP_FOLDER_NAME))
}

fn launcher_is_installed() -> bool {
    if let Some(install_dir) = launcher_install_path() {
        return install_dir.join(EXECUTABLE_NAME).exists();
    }
    false
}

#[tauri::command]
async fn start_install(window: Window, install_opera: bool) -> Result<(), String> {
    let is_update = launcher_is_installed();
    let should_install_opera = if is_update { false } else { install_opera };

    window.track_event("install_started", None);

    if should_install_opera {
        window.track_event("opera_accepted", None);
    }

    let local_app_data = dirs::data_local_dir().ok_or("No AppData found")?;
    let install_dir = local_app_data.join(APP_FOLDER_NAME);

    // 1. Cleanup
    window.track_event("cleanup_started", None);
    window.emit("install-progress", Payload { progress: 0.1, status_key: "status_cleaning".into(), status_data: None }).unwrap();
    if install_dir.exists() {
        let _ = fs::remove_dir_all(&install_dir);
    }
    fs::create_dir_all(&install_dir).map_err(|e| e.to_string())?;
    window.track_event("cleanup_finished", None);

    // 2. Download
    window.track_event("download_started", None);
    window.emit("install-progress", Payload { progress: 0.2, status_key: "status_downloading_start".into(), status_data: None }).unwrap();
    
    // We use a thread for blocking download/extract to not freeze the async runtime too much 
    let install_dir_clone = install_dir.clone();
    let window_clone = window.clone();
    
    // Create a background thread for heavy lifting and wait for it to complete
    let handle = std::thread::spawn(move || {
        run_install_logic(install_dir_clone, window_clone, should_install_opera)
    });

    // Wait for the thread to complete and handle any errors
    match handle.join() {
        Ok(result) => result,
        Err(_) => Err("Installation thread panicked".to_string()),
    }
}

#[tauri::command]
fn is_launcher_installed() -> bool {
    launcher_is_installed()
}

fn run_install_logic(install_dir: PathBuf, window: Window, install_opera: bool) -> Result<(), String> {
    
    // Download
    let client = reqwest::blocking::Client::new();
    let mut resp = client.get(PAYLOAD_URL).send().map_err(|e| e.to_string())?;
    let total_size = resp.content_length().unwrap_or(0);
    
    let mut data = Vec::new();
    let mut buf = [0; 8192];
    let mut downloaded: u64 = 0;

    loop {
        let n = resp.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        data.extend_from_slice(&buf[..n]);
        downloaded += n as u64;
        
        if total_size > 0 && downloaded % 100000 == 0 {
             let p = 0.2 + (0.4 * (downloaded as f32 / total_size as f32));
             let pct = format!("{:.0}", (downloaded as f32 / total_size as f32) * 100.0);
             window.emit("install-progress", Payload { progress: p, status_key: "status_downloading_percent".into(), status_data: Some(pct) }).unwrap();
        }
    }
    
    window.track_event("download_finished", None);

    // Extract
    window.track_event("extract_started", None);
    window.emit("install-progress", Payload { progress: 0.6, status_key: "status_extracting".into(), status_data: None }).unwrap();
    let reader = Cursor::new(data);
    let mut zip = ZipArchive::new(reader).map_err(|e| e.to_string())?;
    let len = zip.len();

    for i in 0..len {
        let mut file = zip.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match file.enclosed_name() {
            Some(p) => install_dir.join(p),
            None => continue,
        };

        if (*file.name()).ends_with('/') {
            fs::create_dir_all(&outpath).unwrap();
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() { fs::create_dir_all(p).unwrap(); }
            }
            let mut outfile = fs::File::create(&outpath).unwrap();
            std::io::copy(&mut file, &mut outfile).unwrap();
        }
    
    window.track_event("extract_complete", None);
        
        if i % 10 == 0 {
            let local_p = i as f32 / len as f32;
            window.emit("install-progress", Payload { progress: 0.6 + (0.3 * local_p), status_key: "status_installing".into(), status_data: None }).unwrap();
        }
    }

    // Uninstaller
    if let Ok(current_exe) = env::current_exe() {
        window.track_event("uninstaller_registered", None);
        let uninstaller_path = install_dir.join(UNINSTALLER_NAME);
        let _ = fs::copy(&current_exe, &uninstaller_path);
        let _ = register_uninstaller(&install_dir, &uninstaller_path);
    }

    // Shortcuts
    window.emit("install-progress", Payload { progress: 0.95, status_key: "status_shortcuts".into(), status_data: None }).unwrap();
    let target_exe = install_dir.join(EXECUTABLE_NAME);
    window.track_event("shortcuts_created", None);
    let _ = create_shortcuts(&target_exe);

    // Opera
    if install_opera {
        window.emit("install-progress", Payload { progress: 0.98, status_key: "status_opera".into(), status_data: None }).unwrap();
        if let Some(temp_path_str) = env::temp_dir().join("OperaSetup.exe").to_str().map(|s| s.to_string()) {
             let client = reqwest::blocking::Client::new();
             if let Ok(mut resp) = client.get(OPERA_SETUP_URL).send() {
                 let mut data = Vec::new();
                 if let Ok(_) = resp.read_to_end(&mut data) {
                     if let Ok(_) = fs::write(&temp_path_str, data) {
                         let _ = Command::new(&temp_path_str).arg("/silent").arg("/launch=0").arg("/allusers=0").spawn();
                         window.track_event("opera_installed", None);
                     }
                 }
             }
        }
    }

    window.track_event("install_complete", None);
    window.emit("install-finished", ()).unwrap();
    Ok(())
}




fn create_shortcuts(target_exe: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let create_lnk = |dir: PathBuf| {
        let link_path = dir.join(format!("{}.lnk", SHORTCUT_NAME));
        let script = format!(
            "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{}'); $s.TargetPath = '{}'; $s.IconLocation = '{}'; $s.Save()",
            link_path.to_string_lossy().replace("'", "''"),
            target_exe.to_string_lossy().replace("'", "''"),
            target_exe.to_string_lossy().replace("'", "''") 
        );
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
            .output();
    };

    if let Some(desktop) = dirs::desktop_dir() { create_lnk(desktop); }
    if let Some(roaming) = dirs::data_dir() {
        let start_menu = roaming.join("Microsoft/Windows/Start Menu/Programs");
        if start_menu.exists() { create_lnk(start_menu); }
    }
    Ok(())
}

fn register_uninstaller(install_dir: &Path, uninstaller_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = format!("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}", APP_FOLDER_NAME);
    let (key, _) = hkcu.create_subkey(&path)?;

    key.set_value("DisplayName", &APP_DISPLAY_NAME)?;
    key.set_value("Publisher", &"TECNO BROS")?;
    let uninstall_cmd = format!("\"{}\" --uninstall", uninstaller_path.to_string_lossy());
    key.set_value("UninstallString", &uninstall_cmd)?;
    key.set_value("InstallLocation", &install_dir.to_string_lossy().to_string())?;
    let exe_path = install_dir.join(EXECUTABLE_NAME);
    key.set_value("DisplayIcon", &exe_path.to_string_lossy().to_string())?;
    key.set_value("NoModify", &1u32)?;
    key.set_value("NoRepair", &1u32)?;
    Ok(())
}

#[tauri::command]
fn launch_app() {
    if let Some(local) = dirs::data_local_dir() {
        let exe_path = local.join(APP_FOLDER_NAME).join(EXECUTABLE_NAME);
        if exe_path.exists() {
             let _ = Command::new(&exe_path).spawn();
        }
    }
    std::process::exit(0);
}

#[tauri::command]
fn close_installer() {
    std::process::exit(0);
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|arg| arg == "--uninstall") {
        uninstall_logic();
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_aptabase::Builder::new("A-SH-8633750963").with_options(InitOptions {
            host: Some("https://analytics-hytale.battlylauncher.com".to_string()),
        }).build())
        .invoke_handler(tauri::generate_handler![start_install, is_launcher_installed, launch_app, close_installer])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn uninstall_logic() {
    let local_app_data = match dirs::data_local_dir() {
        Some(p) => p,
        None => return,
    };
    let install_dir = local_app_data.join(APP_FOLDER_NAME);

    if let Some(desktop) = dirs::desktop_dir() {
        let sc = desktop.join(format!("{}.lnk", SHORTCUT_NAME));
        if sc.exists() { let _ = fs::remove_file(sc); }
    }
    if let Some(roaming) = dirs::data_dir() {
        let sc = roaming.join("Microsoft/Windows/Start Menu/Programs").join(format!("{}.lnk", SHORTCUT_NAME));
        if sc.exists() { let _ = fs::remove_file(sc); }
    }

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let _ = hkcu.open_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall", KEY_ALL_ACCESS)
        .and_then(|key| key.delete_subkey(APP_FOLDER_NAME));

    let install_dir_str = install_dir.to_string_lossy().replace("'", "''");
    let script = format!(
        "Start-Sleep -Seconds 2; Remove-Item -LiteralPath '{}' -Recurse -Force", 
        install_dir_str
    );
    
    let _ = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
        .spawn();
}
