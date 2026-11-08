use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{header, StatusCode, Uri},
    response::IntoResponse,
    routing::get,
    Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_util::{stream::FuturesUnordered, SinkExt, StreamExt};
use rand::{distr::Alphanumeric, Rng};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    net::UdpSocket,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::Duration,
};
use tauri::{Emitter, Manager};
use tokio::sync::mpsc;

const UPDATE_REPO: &str = "RainxButterfly/sgs";

#[derive(Clone, Serialize, Deserialize)]
struct PortableUpdateInfo {
    version: String,
    notes: String,
    url: String,
    #[serde(default)]
    urls: Option<Vec<String>>,
    sha256: String,
}

#[derive(Clone, Serialize)]
struct UpdateProgress {
    downloaded: u64,
    total: u64,
}

fn manifest_urls(name: &str) -> Vec<String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    vec![
        format!("https://cdn.jsdelivr.net/gh/{UPDATE_REPO}@main/{name}?t={stamp}"),
        format!("https://testingcf.jsdelivr.net/gh/{UPDATE_REPO}@main/{name}?t={stamp}"),
        format!("https://gcore.jsdelivr.net/gh/{UPDATE_REPO}@main/{name}?t={stamp}"),
        format!("https://fastly.jsdelivr.net/gh/{UPDATE_REPO}@main/{name}?t={stamp}"),
        format!("https://jsd.onmicrosoft.cn/gh/{UPDATE_REPO}@main/{name}?t={stamp}"),
        format!("https://jsd.cdn.zzko.cn/gh/{UPDATE_REPO}@main/{name}?t={stamp}"),
        format!("https://cdn.jsdelivr.net/gh/{UPDATE_REPO}@master/{name}?t={stamp}"),
        format!("https://gcore.jsdelivr.net/gh/{UPDATE_REPO}@master/{name}?t={stamp}"),
        format!(
            "https://ghfast.top/https://raw.githubusercontent.com/{UPDATE_REPO}/main/{name}?t={stamp}"
        ),
        format!(
            "https://ghproxy.net/https://raw.githubusercontent.com/{UPDATE_REPO}/main/{name}?t={stamp}"
        ),
        format!(
            "https://gh-proxy.com/https://raw.githubusercontent.com/{UPDATE_REPO}/main/{name}?t={stamp}"
        ),
        format!(
            "https://ghproxy.cc/https://raw.githubusercontent.com/{UPDATE_REPO}/main/{name}?t={stamp}"
        ),
        format!(
            "https://gh.llkk.cc/https://raw.githubusercontent.com/{UPDATE_REPO}/main/{name}?t={stamp}"
        ),
        format!("https://raw.githubusercontent.com/{UPDATE_REPO}/main/{name}?t={stamp}"),
    ]
}

fn update_manifest_urls() -> Vec<String> {
    let mut urls = Vec::new();
    if let Ok(custom) = std::env::var("SANGUOSHA_UPDATE_MANIFEST") {
        if !custom.trim().is_empty() {
            urls.push(custom);
        }
    }
    urls.extend(manifest_urls("latest-portable.json"));
    urls
}

async fn check_manifest(urls: Vec<String>) -> Result<Option<PortableUpdateInfo>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .user_agent("sanguosha-xinghe-updater/0.1")
        .build()
        .map_err(|error| error.to_string())?;
    let current = semver::Version::parse(env!("CARGO_PKG_VERSION"))
        .map_err(|error| error.to_string())?;
    let mut errors = Vec::new();
    let mut best: Option<PortableUpdateInfo> = None;
    let mut succeeded = false;
    let mut pending = FuturesUnordered::new();
    for url in urls {
        let client = client.clone();
        pending.push(async move {
            let result = async {
                let response = client
                    .get(&url)
                    .send()
                    .await
                    .map_err(|error| error.to_string())?;
                if !response.status().is_success() {
                    return Err(format!("HTTP {}", response.status()));
                }
                response
                    .json::<PortableUpdateInfo>()
                    .await
                    .map_err(|error| error.to_string())
            }
            .await;
            (url, result)
        });
    }
    let deadline = tokio::time::sleep(Duration::from_secs(8));
    tokio::pin!(deadline);
    loop {
        tokio::select! {
            _ = &mut deadline => break,
            item = pending.next() => {
                let Some((url, result)) = item else { break; };
                match result {
                    Ok(info) => {
                        succeeded = true;
                        let next = match semver::Version::parse(&info.version) {
                            Ok(next) => next,
                            Err(error) => {
                                errors.push(format!("{url}: 版本号无效 {error}"));
                                continue;
                            }
                        };
                        if next > current {
                            let replace = best
                                .as_ref()
                                .map(|existing| {
                                    semver::Version::parse(&existing.version)
                                        .map(|version| next > version)
                                        .unwrap_or(true)
                                })
                                .unwrap_or(true);
                            if replace {
                                best = Some(info);
                            }
                        }
                    }
                    Err(error) => errors.push(format!("{url}: {error}")),
                }
            }
        }
    }
    if best.is_some() {
        return Ok(best);
    }
    if succeeded {
        return Ok(None);
    }
    Err(format!(
        "无法连接更新镜像。{}",
        errors.last().cloned().unwrap_or_default()
    ))
}

#[tauri::command]
async fn check_portable_update() -> Result<Option<PortableUpdateInfo>, String> {
    check_manifest(update_manifest_urls()).await
}

#[tauri::command]
async fn check_android_update() -> Result<Option<PortableUpdateInfo>, String> {
    check_manifest(manifest_urls("latest-android.json")).await
}

#[tauri::command]
async fn prepare_portable_update(
    app: tauri::AppHandle,
    urls: Vec<String>,
    sha256: String,
) -> Result<(), String> {
    let mut errors: Vec<String> = Vec::new();
    let mut data: Option<Vec<u8>> = None;
    for url in &urls {
        match download_update(&app, url).await {
            Ok(bytes) => {
                let mut hasher = Sha256::new();
                hasher.update(&bytes);
                let actual: String = hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect();
                if actual.eq_ignore_ascii_case(&sha256) {
                    data = Some(bytes);
                    break;
                }
                errors.push(format!("{url}: 更新包校验失败"));
            }
            Err(error) => errors.push(format!("{url}: {error}")),
        }
    }
    let data = data.ok_or_else(|| {
        format!(
            "更新包下载失败。{}",
            errors.last().cloned().unwrap_or_default()
        )
    })?;

    let pid = std::process::id();
    let temp = std::env::temp_dir();
    let zip_path = temp.join(format!("sanguosha-update-{pid}.zip"));
    let extract_dir = temp.join(format!("sanguosha-update-{pid}"));
    std::fs::write(&zip_path, &data).map_err(|error| error.to_string())?;
    if extract_dir.exists() {
        let _ = std::fs::remove_dir_all(&extract_dir);
    }
    std::fs::create_dir_all(&extract_dir).map_err(|error| error.to_string())?;
    let archive_file = std::fs::File::open(&zip_path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(archive_file).map_err(|error| error.to_string())?;
    archive
        .extract(&extract_dir)
        .map_err(|error| format!("解压更新包失败：{error}"))?;

    let current = std::env::current_exe().map_err(|error| error.to_string())?;
    let app_dir = current
        .parent()
        .ok_or_else(|| "无法定位应用目录".to_string())?
        .to_path_buf();
    let new_exe = extract_dir.join("sanguosha.exe");
    if !new_exe.exists() {
        return Err("更新包中缺少 sanguosha.exe".to_string());
    }
    let new_dll = extract_dir.join("WebView2Loader.dll");
    let app_exe = app_dir.join("sanguosha.exe");
    let app_dll = app_dir.join("WebView2Loader.dll");
    let quote = |path: &std::path::Path| path.to_string_lossy().replace('\'', "''");
    let ps = format!(
        "$ErrorActionPreference='Stop'; while (Get-Process -Id {pid} -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 800 }}; try {{ Copy-Item -LiteralPath '{}' -Destination '{}' -Force; if (Test-Path -LiteralPath '{}') {{ Copy-Item -LiteralPath '{}' -Destination '{}' -Force }} }} catch {{ }}; Start-Process -FilePath '{}' -WorkingDirectory '{}'; try {{ Remove-Item -LiteralPath '{}' -Recurse -Force -ErrorAction SilentlyContinue }} catch {{ }}; try {{ Remove-Item -LiteralPath '{}' -Force -ErrorAction SilentlyContinue }} catch {{ }}",
        quote(&new_exe),
        quote(&app_exe),
        quote(&new_dll),
        quote(&new_dll),
        quote(&app_dll),
        quote(&app_exe),
        quote(&app_dir),
        quote(&extract_dir),
        quote(&zip_path),
    );
    let mut utf16 = Vec::with_capacity(ps.len() * 2);
    for unit in ps.encode_utf16() {
        utf16.extend_from_slice(&unit.to_le_bytes());
    }
    let encoded = BASE64.encode(utf16);
    std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-EncodedCommand",
            &encoded,
        ])
        .spawn()
        .map_err(|error| format!("启动更新脚本失败：{error}"))?;

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(900)).await;
        handle.exit(0);
    });
    Ok(())
}

#[cfg(target_os = "android")]
struct InstallerState(tauri::plugin::PluginHandle<tauri::Wry>);

#[cfg(target_os = "android")]
#[derive(serde::Deserialize)]
struct BatteryInfo {
    level: i32,
}

#[cfg(target_os = "android")]
fn installer_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::<tauri::Wry>::new("installer")
        .setup(|app, api| {
            match api.register_android_plugin(
                "com.rainxbutterfly.sanguosha",
                "InstallerPlugin",
            ) {
                Ok(handle) => {
                    app.manage(InstallerState(handle));
                }
                Err(error) => {
                    log::error!("installer plugin unavailable: {error}");
                }
            }
            Ok(())
        })
        .build()
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn install_android_update(
    app: tauri::AppHandle,
    urls: Vec<String>,
    sha256: String,
) -> Result<(), String> {
    let mut errors: Vec<String> = Vec::new();
    let mut data: Option<Vec<u8>> = None;
    for url in &urls {
        match download_update(&app, url).await {
            Ok(bytes) => {
                let mut hasher = Sha256::new();
                hasher.update(&bytes);
                let actual: String = hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect();
                if actual.eq_ignore_ascii_case(&sha256) {
                    data = Some(bytes);
                    break;
                }
                errors.push(format!("{url}: 更新包校验失败"));
            }
            Err(error) => errors.push(format!("{url}: {error}")),
        }
    }
    let data = data.ok_or_else(|| {
        format!(
            "更新包下载失败。{}",
            errors.last().cloned().unwrap_or_default()
        )
    })?;
    let cache = app.path().app_cache_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&cache).map_err(|error| error.to_string())?;
    let path = cache.join("siguoshan-update.apk");
    std::fs::write(&path, &data).map_err(|error| error.to_string())?;
    let state = app
        .try_state::<InstallerState>()
        .ok_or_else(|| "手机安装器未初始化，请重新安装本版本后再试".to_string())?;
    state
        .0
        .run_mobile_plugin::<serde_json::Value>(
            "install",
            serde_json::json!({ "path": path.to_string_lossy() }),
        )
        .map_err(|error| format!("打开系统安装器失败：{error}"))?;
    Ok(())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn install_android_update(_urls: Vec<String>, _sha256: String) -> Result<(), String> {
    Err("仅安卓版支持此更新方式".to_string())
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn android_battery(app: tauri::AppHandle) -> Result<i32, String> {
    let state = app
        .try_state::<InstallerState>()
        .ok_or_else(|| "电量读取不可用".to_string())?;
    state
        .0
        .run_mobile_plugin_async::<BatteryInfo>("battery", serde_json::json!({}))
        .await
        .map(|info| info.level)
        .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn android_battery() -> Result<i32, String> {
    Ok(-1)
}

async fn download_update(app: &tauri::AppHandle, url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .user_agent("sanguosha-xinghe-updater/0.1")
        .build()
        .map_err(|error| error.to_string())?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("下载更新失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("下载更新失败：{error}"))?;
    let total = response.content_length().unwrap_or(0);
    let mut data = Vec::with_capacity(total as usize);
    let mut downloaded = 0u64;
    let mut last_emit = std::time::Instant::now();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("读取更新包失败：{error}"))?
    {
        data.extend_from_slice(&chunk);
        downloaded += chunk.len() as u64;
        if last_emit.elapsed() > Duration::from_millis(120) {
            let _ = app.emit("portable-update-progress", UpdateProgress { downloaded, total });
            last_emit = std::time::Instant::now();
        }
    }
    let _ = app.emit("portable-update-progress", UpdateProgress { downloaded, total });
    Ok(data)
}

#[derive(RustEmbed)]
#[folder = "../dist/"]
struct WebAssets;

struct Peer {
    name: String,
    tx: mpsc::UnboundedSender<String>,
}

struct RoomInner {
    next_id: u64,
    host_id: Option<u64>,
    peers: HashMap<u64, Peer>,
}

struct Room {
    code: String,
    secret: String,
    inner: Mutex<RoomInner>,
}

#[derive(Clone, Serialize)]
pub struct RoomInfo {
    ip: String,
    ips: Vec<String>,
    names: Vec<String>,
    port: u16,
    code: String,
    secret: String,
}

static ROOM: OnceLock<Arc<Room>> = OnceLock::new();
static ROOM_INFO: Mutex<Option<RoomInfo>> = Mutex::new(None);

#[derive(Deserialize)]
struct WsQuery {
    room: String,
    secret: Option<String>,
    name: Option<String>,
}

fn all_ipv4() -> Vec<(String, String)> {
    let mut result: Vec<(String, String)> = Vec::new();
    if let Ok(interfaces) = if_addrs::get_if_addrs() {
        for iface in interfaces {
            if iface.is_loopback() {
                continue;
            }
            if let std::net::IpAddr::V4(ip) = iface.ip() {
                let value = ip.to_string();
                if !result.iter().any(|(existing, _)| existing == &value) {
                    result.push((value, iface.name));
                }
            }
        }
    }
    result
}

fn local_ip() -> String {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let value = addr.ip().to_string();
                if !value.starts_with("127.") {
                    return value;
                }
            }
        }
    }
    let interfaces = all_ipv4();
    interfaces
        .iter()
        .map(|(ip, _)| ip)
        .find(|ip| !ip.starts_with("169.254."))
        .cloned()
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

fn random_code() -> String {
    let rng = rand::rng();
    rng.sample_iter(&Alphanumeric)
        .take(6)
        .map(char::from)
        .collect::<String>()
        .to_uppercase()
}

fn random_secret() -> String {
    let rng = rand::rng();
    rng.sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect::<String>()
        .to_lowercase()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DataDirInfo {
    path: String,
    default_path: String,
}

fn default_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn data_dir_marker(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("data-dir.txt"))
}

fn current_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(marker) = data_dir_marker(app) {
        if let Ok(raw) = std::fs::read_to_string(&marker) {
            let value = raw.trim();
            if !value.is_empty() {
                return Ok(PathBuf::from(value));
            }
        }
    }
    default_data_dir(app)
}

async fn data_dir_info_impl(app: tauri::AppHandle) -> Result<DataDirInfo, String> {
    let default_path = default_data_dir(&app)?;
    let path = current_data_dir(&app)?;
    std::fs::create_dir_all(&path).map_err(|error| format!("无法创建数据目录：{error}"))?;
    Ok(DataDirInfo {
        path: path.to_string_lossy().to_string(),
        default_path: default_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn data_dir_info(app: tauri::AppHandle) -> Result<DataDirInfo, String> {
    data_dir_info_impl(app).await
}

#[tauri::command]
async fn set_data_dir(app: tauri::AppHandle, path: String) -> Result<DataDirInfo, String> {
    let marker = data_dir_marker(&app)?;
    let value = path.trim();
    if value.is_empty() {
        let _ = std::fs::remove_file(&marker);
    } else {
        let dir = PathBuf::from(value);
        std::fs::create_dir_all(&dir).map_err(|error| format!("无法创建目录：{error}"))?;
        std::fs::write(&marker, dir.to_string_lossy().as_bytes())
            .map_err(|error| format!("保存设置失败：{error}"))?;
    }
    data_dir_info_impl(app).await
}

#[tauri::command]
async fn write_data_snapshot(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let dir = current_data_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|error| format!("无法创建数据目录：{error}"))?;
    let target = dir.join("siguoshan-data.json");
    std::fs::write(&target, contents).map_err(|error| format!("写入数据失败：{error}"))
}

#[tauri::command]
async fn read_data_snapshot(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = current_data_dir(&app)?;
    let target = dir.join("siguoshan-data.json");
    if !target.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&target)
        .map(Some)
        .map_err(|error| format!("读取数据失败：{error}"))
}

#[tauri::command]
async fn start_room() -> Result<RoomInfo, String> {
    if let Some(info) = ROOM_INFO.lock().map_err(|e| e.to_string())?.clone() {
        return Ok(info);
    }

    let listener = tokio::net::TcpListener::bind("0.0.0.0:0")
        .await
        .map_err(|e| format!("监听端口失败：{e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let room = Arc::new(Room {
        code: random_code(),
        secret: random_secret(),
        inner: Mutex::new(RoomInner {
            next_id: 0,
            host_id: None,
            peers: HashMap::new(),
        }),
    });

    let mut entries = all_ipv4();
    let ip = entries
        .iter()
        .find(|(_, name)| name.to_lowercase().contains("zerotier"))
        .map(|(ip, _)| ip.clone())
        .unwrap_or_else(local_ip);
    if let Some(index) = entries.iter().position(|(address, _)| address == &ip) {
        let entry = entries.remove(index);
        entries.insert(0, entry);
    } else {
        entries.insert(0, (ip.clone(), String::new()));
    }
    let ips = entries.iter().map(|(ip, _)| ip.clone()).collect();
    let names = entries.iter().map(|(_, name)| name.clone()).collect();

    let info = RoomInfo {
        ip,
        ips,
        names,
        port,
        code: room.code.clone(),
        secret: room.secret.clone(),
    };

    ROOM.set(room.clone()).map_err(|_| "房间服务已启动".to_string())?;
    *ROOM_INFO.lock().map_err(|e| e.to_string())? = Some(info.clone());

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .fallback(get(static_handler))
        .with_state(room);

    tokio::spawn(async move {
        if let Err(err) = axum::serve(listener, app).await {
            log::error!("room server stopped: {err}");
        }
    });

    log::info!("room server listening on 0.0.0.0:{port}, code {}", info.code);
    Ok(info)
}

async fn static_handler(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let name = if path.is_empty() { "index.html" } else { path };
    let asset = WebAssets::get(name).or_else(|| {
        if !name.contains('.') {
            WebAssets::get("index.html")
        } else {
            None
        }
    });
    match asset {
        Some(content) => {
            let mime = mime_guess::from_path(name).first_or_octet_stream();
            (
                [
                    (header::CONTENT_TYPE, mime.as_ref()),
                    (header::CACHE_CONTROL, "no-store"),
                ],
                content.data.into_owned(),
            )
                .into_response()
        }
        None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(room): State<Arc<Room>>,
    Query(query): Query<WsQuery>,
) -> impl IntoResponse {
    if query.room != room.code {
        return (StatusCode::FORBIDDEN, "房间码错误").into_response();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, room, query))
}

async fn handle_socket(socket: WebSocket, room: Arc<Room>, query: WsQuery) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    let (id, is_host) = {
        let mut inner = match room.inner.lock() {
            Ok(inner) => inner,
            Err(_) => return,
        };
        inner.next_id += 1;
        let id = inner.next_id;
        let is_host = query.secret.as_deref() == Some(room.secret.as_str()) && inner.host_id.is_none();
        let name = query
            .name
            .clone()
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| format!("玩家{id}"));
        inner.peers.insert(
            id,
            Peer {
                name,
                tx: tx.clone(),
            },
        );
        if is_host {
            inner.host_id = Some(id);
        }
        (id, is_host)
    };

    let welcome = serde_json::json!({
        "server": "welcome",
        "id": id,
        "role": if is_host { "host" } else { "guest" },
    });
    let _ = tx.send(welcome.to_string());

    let join_event = {
        let inner = match room.inner.lock() {
            Ok(inner) => inner,
            Err(_) => return,
        };
        if !is_host {
            inner.host_id.and_then(|host_id| {
                inner.peers.get(&host_id).map(|host| {
                    let name = inner
                        .peers
                        .get(&id)
                        .map(|p| p.name.clone())
                        .unwrap_or_default();
                    let event = serde_json::json!({
                        "server": "join",
                        "id": id,
                        "name": name,
                    });
                    (host.tx.clone(), event.to_string())
                })
            })
        } else {
            None
        }
    };
    if let Some((host_tx, event)) = join_event {
        let _ = host_tx.send(event);
    }

    let writer = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if sink.send(Message::Text(message.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(message)) = stream.next().await {
        if let Message::Text(text) = message {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                route_message(&room, id, is_host, value);
            }
        }
    }

    writer.abort();

    let leave_event = {
        let mut inner = match room.inner.lock() {
            Ok(inner) => inner,
            Err(_) => return,
        };
        let removed = inner.peers.remove(&id);
        if is_host {
            inner.host_id = None;
            let event = serde_json::json!({ "server": "host-left" }).to_string();
            for peer in inner.peers.values() {
                let _ = peer.tx.send(event.clone());
            }
            None
        } else {
            inner.host_id.and_then(|host_id| {
                inner.peers.get(&host_id).map(|host| {
                    let name = removed.map(|p| p.name).unwrap_or_default();
                    let event = serde_json::json!({
                        "server": "leave",
                        "id": id,
                        "name": name,
                    });
                    (host.tx.clone(), event.to_string())
                })
            })
        }
    };
    if let Some((host_tx, event)) = leave_event {
        let _ = host_tx.send(event);
    }
}

fn route_message(room: &Arc<Room>, from: u64, is_host: bool, value: serde_json::Value) {
    let payload = value
        .get("payload")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let envelope = serde_json::json!({
        "from": from,
        "payload": payload,
    })
    .to_string();

    let inner = match room.inner.lock() {
        Ok(inner) => inner,
        Err(_) => return,
    };

    if is_host {
        if let Some(to) = value.get("to").and_then(|v| v.as_u64()) {
            if let Some(peer) = inner.peers.get(&to) {
                let _ = peer.tx.send(envelope);
            }
        } else {
            for (peer_id, peer) in inner.peers.iter() {
                if *peer_id != from {
                    let _ = peer.tx.send(envelope.clone());
                }
            }
        }
    } else if let Some(host_id) = inner.host_id {
        if let Some(host) = inner.peers.get(&host_id) {
            let _ = host.tx.send(envelope);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            start_room,
            check_portable_update,
            check_android_update,
            prepare_portable_update,
            install_android_update,
            android_battery,
            data_dir_info,
            set_data_dir,
            write_data_snapshot,
            read_data_snapshot
        ]);
    #[cfg(target_os = "android")]
    let builder = builder.plugin(installer_plugin());
    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
