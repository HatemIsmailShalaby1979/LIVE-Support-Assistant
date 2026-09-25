// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The shell deliberately contains no native commands: the entire engine —
// embedder, vector store, gate, sync — is the web bundle in apps/web, executed
// by the system WebView2 runtime. One engine, three platforms; the shell's only
// jobs are the window and the encrypted on-disk store, and the latter arrives
// with the Phase 7 persistence binding.
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running the LIVE Support Assistant shell");
}
