#[cfg(windows)]
mod desktop_blur;
#[cfg(windows)]
mod frameless_window;
mod reader;
#[cfg(windows)]
mod rounded_window;
#[cfg(windows)]
use tauri::Manager;

#[tauri::command]
fn desktop_window_effect() -> tauri::window::Effect {
    // Windows 10's Acrylic accent paints a rectangular backdrop even when the
    // HWND region is rounded. Blur honors that region while retaining real blur.
    #[cfg(windows)]
    if windows_version::OsVersion::current().build < 22000 {
        return tauri::window::Effect::Blur;
    }
    tauri::window::Effect::Acrylic
}

#[tauri::command]
async fn set_desktop_blur(window: tauri::Window, strength: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        let (tx, mut rx) = tauri::async_runtime::channel(1);
        let target = window.clone();
        window
            .run_on_main_thread(move || {
                let _ = tx.try_send(desktop_blur::set_strength(&target, strength));
            })
            .map_err(|e| e.to_string())?;
        rx.recv()
            .await
            .ok_or_else(|| "背景渲染线程已退出".to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = (window, strength);
        Err("当前平台不支持桌面模糊强度调节".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            desktop_window_effect,
            set_desktop_blur,
            reader::reader_select,
            reader::reader_api,
            reader::reader_asset
        ])
        .manage(reader::ReaderState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:moyuhub.db",
                    vec![
                        tauri_plugin_sql::Migration {
                            version: 1,
                            description: "steam_cache_and_recent",
                            sql: include_str!("../migrations/0001_steam.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 2,
                            description: "reader_local_library",
                            sql: include_str!("../migrations/0002_reader.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::POSITION)
                .skip_initial_state("main")
                .build(),
        )
        .setup(|_app| {
            #[cfg(windows)]
            if let Some(main) = _app.get_webview_window("main") {
                frameless_window::install(&main.as_ref().window())?;
                rounded_window::apply(&main.as_ref().window())?;
            }
            Ok(())
        })
        .on_window_event(|_window, _event| {
            #[cfg(windows)]
            if _window.label() == "main" {
                match _event {
                    tauri::WindowEvent::Resized(_)
                    | tauri::WindowEvent::ScaleFactorChanged { .. }
                    | tauri::WindowEvent::Focused(true)
                    | tauri::WindowEvent::ThemeChanged(_) => {
                        if let Err(error) = rounded_window::apply(_window) {
                            eprintln!("MoyuHub: native corner clipping failed: {error}");
                        }
                    }
                    tauri::WindowEvent::Destroyed => rounded_window::reset(),
                    _ => {}
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run MoyuHub");
}
