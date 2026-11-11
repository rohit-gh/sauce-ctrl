//! SauceCtrl desktop shell (Tauri 2).
//!
//! The app itself is unchanged: a Nuxt SPA served by a Nitro server running on
//! Bun, plus a separate Bun terminal WebSocket process (see AGENTS.md — those
//! must stay on Bun). This host only:
//!   1. picks ports and resolves the user's real shell `PATH` (GUI apps on
//!      macOS get a minimal one, which would hide Homebrew's `gh`),
//!   2. starts the bundled Bun runtime on the Nitro build,
//!   3. opens a native webview on it once it answers,
//!   4. stops the backend when the app quits.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    env, fs,
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicI32, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};

use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

const HOST: &str = "127.0.0.1";
/// Stable ports so the webview origin (and its localStorage, e.g. the theme)
/// survives restarts. Falls back to an OS-assigned port when taken.
const PREFERRED_HTTP_PORT: u16 = 39157;
const PREFERRED_WS_PORT: u16 = 39158;
const READY_TIMEOUT: Duration = Duration::from_secs(30);

struct Backend(Mutex<Option<Child>>);

/// PID of the running backend, readable from a signal handler.
static BACKEND_PID: AtomicI32 = AtomicI32::new(0);

/// A killed/interrupted host (Ctrl+C, `kill`, logout) never reaches
/// `RunEvent::Exit`, which would orphan the backend. Forward the signal to it
/// and leave. Only async-signal-safe calls (atomic load, kill, _exit) are used.
extern "C" fn on_signal(_sig: libc::c_int) {
    let pid = BACKEND_PID.load(Ordering::SeqCst);
    unsafe {
        if pid > 0 {
            libc::kill(pid, libc::SIGTERM);
        }
        libc::_exit(0);
    }
}

fn install_signal_handlers() {
    for sig in [libc::SIGTERM, libc::SIGINT, libc::SIGHUP] {
        unsafe {
            libc::signal(sig, on_signal as extern "C" fn(libc::c_int) as libc::sighandler_t);
        }
    }
}

fn port_free(port: u16) -> bool {
    TcpListener::bind((HOST, port)).is_ok()
}

fn pick_port(preferred: u16, avoid: Option<u16>) -> u16 {
    if Some(preferred) != avoid && port_free(preferred) {
        return preferred;
    }
    loop {
        let l = TcpListener::bind((HOST, 0)).expect("no free TCP port available");
        let p = l.local_addr().expect("local_addr").port();
        if Some(p) != avoid {
            return p;
        }
    }
}

/// Ask the user's login shell for its PATH, then merge with sane macOS defaults.
fn resolve_path() -> String {
    const MARK: &str = "__SAUCECTRL_PATH__";
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut from_shell = String::new();

    if let Ok(mut child) = Command::new(&shell)
        .args(["-ilc", &format!("printf '{MARK}%s{MARK}' \"$PATH\"")])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        // Slow shell rc files must not block startup forever.
        let deadline = Instant::now() + Duration::from_secs(5);
        let finished = loop {
            match child.try_wait() {
                Ok(Some(_)) => break true,
                Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
                _ => break false,
            }
        };
        if finished {
            if let Ok(out) = child.wait_with_output() {
                let text = String::from_utf8_lossy(&out.stdout);
                if let Some(rest) = text.split(MARK).nth(1) {
                    from_shell = rest.to_string();
                }
            }
        } else {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    let mut seen: Vec<String> = Vec::new();
    let defaults = [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ];
    let current = env::var("PATH").unwrap_or_default();
    for part in from_shell
        .split(':')
        .chain(current.split(':'))
        .chain(defaults.iter().copied())
    {
        if !part.is_empty() && !seen.iter().any(|s| s == part) {
            seen.push(part.to_string());
        }
    }
    seen.join(":")
}

/// Is the Xcode Command Line Tools (or Xcode) install present? Without it,
/// /usr/bin/git is only a stub that opens Apple's installer when executed, so
/// we must check this instead of running it.
fn developer_tools_installed() -> bool {
    match Command::new("/usr/bin/xcode-select").arg("-p").output() {
        Ok(out) if out.status.success() => {
            let dir = String::from_utf8_lossy(&out.stdout).trim().to_string();
            !dir.is_empty() && Path::new(&dir).join("usr/bin/git").is_file()
        }
        _ => false,
    }
}

/// First real `git` on `path`. SauceCtrl does not bundle git.
fn find_git(path: &str) -> Option<PathBuf> {
    for dir in path.split(':').filter(|d| !d.is_empty()) {
        let candidate = Path::new(dir).join("git");
        if !candidate.is_file() {
            continue;
        }
        if candidate == Path::new("/usr/bin/git") && !developer_tools_installed() {
            continue;
        }
        return Some(candidate);
    }
    None
}

/// Git is missing: explain, and offer Apple's interactive installer. Quits if declined.
fn prompt_install_git() {
    let script = r#"display dialog "SauceCtrl needs Git, which isn't installed on this Mac.\n\nClick Install Git to open Apple's installer for the Command Line Tools (this includes Git). When it finishes, SauceCtrl picks Git up automatically.\n\nPrefer Homebrew? Quit, run: brew install git" with title "Git is required" buttons {"Quit", "Install Git"} default button "Install Git" cancel button "Quit" with icon caution"#;
    let installing = Command::new("osascript")
        .args(["-e", script])
        .output()
        .map(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).contains("Install Git"))
        .unwrap_or(false);
    if !installing {
        std::process::exit(0);
    }
    // Opens the macOS "install command line developer tools" window and returns.
    let _ = Command::new("/usr/bin/xcode-select").arg("--install").status();
}

fn wait_until_ready(port: u16, backend: &Mutex<Option<Child>>) -> Result<(), String> {
    let addr: SocketAddr = format!("{HOST}:{port}").parse().unwrap();
    let start = Instant::now();
    while start.elapsed() < READY_TIMEOUT {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok() {
            return Ok(());
        }
        if let Some(child) = backend.lock().unwrap().as_mut() {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!("server exited early ({status})"));
            }
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err(format!("server did not respond on port {port} within {READY_TIMEOUT:?}"))
}

fn log_file() -> Option<(fs::File, PathBuf)> {
    let dir = PathBuf::from(env::var_os("HOME")?).join("Library/Logs/SauceCtrl");
    fs::create_dir_all(&dir).ok()?;
    let path = dir.join("server.log");
    let f = fs::OpenOptions::new().create(true).append(true).open(&path).ok()?;
    Some((f, path))
}

fn start_backend(app: &AppHandle, http_port: u16, ws_port: u16, path_env: &str) -> Result<Child, String> {
    // Tauri places externalBin sidecars next to the main executable.
    let exe = env::current_exe().map_err(|e| e.to_string())?;
    let bun = exe.parent().ok_or("no exe dir")?.join("bun");
    if !bun.exists() {
        return Err(format!("bundled Bun runtime not found at {}", bun.display()));
    }
    let app_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("app");
    let entry = app_dir.join("output/server/index.mjs");
    if !entry.exists() {
        return Err(format!("server build not found at {}", entry.display()));
    }

    let mut cmd = Command::new(&bun);
    cmd.arg("--bun")
        .arg(&entry)
        // The terminal plugin resolves server/terminal-server.ts from cwd.
        .current_dir(&app_dir)
        .env("PATH", path_env)
        .env("HOST", HOST)
        .env("PORT", http_port.to_string())
        .env("NITRO_PORT", http_port.to_string())
        .env("SAUCE_WS_PORT", ws_port.to_string())
        .env("NUXT_PUBLIC_WS_PORT", ws_port.to_string())
        // Tells the UI it's already the desktop app (hides "Install as an app").
        .env("NUXT_PUBLIC_DESKTOP_APP", "true")
        .env("NODE_ENV", "production")
        .stdin(Stdio::null());
    if env::var_os("SHELL").is_none() {
        cmd.env("SHELL", "/bin/zsh");
    }
    if env::var_os("LANG").is_none() {
        cmd.env("LANG", "en_US.UTF-8");
    }
    match log_file() {
        Some((f, _)) => {
            let f2 = f.try_clone().map_err(|e| e.to_string())?;
            cmd.stdout(Stdio::from(f)).stderr(Stdio::from(f2));
        }
        None => {
            cmd.stdout(Stdio::null()).stderr(Stdio::null());
        }
    }
    cmd.spawn().map_err(|e| format!("failed to start {}: {e}", bun.display()))
}

fn stop_backend(backend: &Backend) {
    let Some(mut child) = backend.0.lock().unwrap().take() else {
        return;
    };
    BACKEND_PID.store(0, Ordering::SeqCst);
    // SIGTERM first: the Nitro terminal plugin uses it to stop its WS child.
    unsafe {
        libc::kill(child.id() as i32, libc::SIGTERM);
    }
    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn fatal(message: &str) -> ! {
    eprintln!("[SauceCtrl] {message}");
    let esc = message.replace('\\', "\\\\").replace('"', "\\\"");
    let _ = Command::new("osascript")
        .args([
            "-e",
            &format!(
                "display alert \"SauceCtrl could not start\" message \"{esc}\" as critical"
            ),
        ])
        .status();
    std::process::exit(1);
}

fn open_window(app: &AppHandle, url: &str) -> tauri::Result<()> {
    let parsed = url.parse().expect("valid URL");
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
        .title("SauceCtrl")
        .inner_size(1440.0, 900.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .on_navigation(|nav| {
            // Keep the app on its local origin; send anything else to the browser.
            let local = matches!(nav.host_str(), Some("127.0.0.1") | Some("localhost"));
            if !local && matches!(nav.scheme(), "http" | "https") {
                let _ = Command::new("open").arg(nav.as_str()).spawn();
            }
            local
        })
        .build()?;
    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();

            // `tauri dev`: the Nuxt dev server (beforeDevCommand) is the backend.
            if tauri::is_dev() {
                let url = handle
                    .config()
                    .build
                    .dev_url
                    .as_ref()
                    .map(|u| u.to_string())
                    .unwrap_or_else(|| "http://localhost:3000".into());
                open_window(&handle, &url)?;
                return Ok(());
            }

            let path_env = resolve_path();
            if find_git(&path_env).is_none() {
                prompt_install_git();
            }

            let http_port = pick_port(PREFERRED_HTTP_PORT, None);
            let ws_port = pick_port(PREFERRED_WS_PORT, Some(http_port));
            let child = match start_backend(&handle, http_port, ws_port, &path_env) {
                Ok(c) => c,
                Err(e) => fatal(&e),
            };
            BACKEND_PID.store(child.id() as i32, Ordering::SeqCst);
            install_signal_handlers();
            *handle.state::<Backend>().0.lock().unwrap() = Some(child);

            // Wait off the main thread so the app stays responsive while Nitro boots.
            std::thread::spawn(move || {
                let state = handle.state::<Backend>();
                if let Err(e) = wait_until_ready(http_port, &state.0) {
                    stop_backend(&state);
                    fatal(&e);
                }
                let url = format!("http://{HOST}:{http_port}");
                let h = handle.clone();
                if let Err(e) = handle.run_on_main_thread(move || {
                    if let Err(e) = open_window(&h, &url) {
                        stop_backend(&h.state::<Backend>());
                        fatal(&format!("could not open window: {e}"));
                    }
                }) {
                    fatal(&format!("could not schedule window: {e}"));
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building SauceCtrl");

    app.run(|handle, event| {
        // Quit when the (only) window closes, like the AppImage launcher does.
        if let RunEvent::Exit = event {
            stop_backend(&handle.state::<Backend>());
        }
    });
}
