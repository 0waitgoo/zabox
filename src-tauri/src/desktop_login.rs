use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{atomic::{AtomicBool, Ordering}, mpsc, Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::State;

struct Attempt {
    cancelled: Arc<AtomicBool>,
    receiver: Option<mpsc::Receiver<Result<String, String>>>,
}

#[derive(Default)]
pub struct LoginState(Mutex<Option<Attempt>>);

fn callback_code(target: &str, expected: &str) -> Result<Option<String>, String> {
    if !target.starts_with('/') || target.starts_with("//") { return Err("无效回调地址".into()); }
    let url = url::Url::parse(&format!("http://127.0.0.1{target}")).map_err(|_| "无效回调地址")?;
    if url.path() != "/callback" { return Err("无效回调路径".into()); }
    let pairs: Vec<_> = url.query_pairs().collect();
    let states: Vec<_> = pairs.iter().filter(|(key, _)| key == "state").collect();
    if states.len() != 1 || states[0].1 != expected { return Err("登录校验失败".into()); }
    if pairs.iter().any(|(key, _)| key == "error") { return Ok(None); }
    let codes: Vec<_> = pairs.iter().filter(|(key, _)| key == "code").collect();
    if codes.len() != 1 || codes[0].1.is_empty() { return Err("缺少授权码".into()); }
    Ok(Some(codes[0].1.to_string()))
}

fn respond(stream: &mut TcpStream, ok: bool) {
    let body = if ok { "授权已返回杂盒，请回到软件查看登录结果。" } else { "无效的授权回调，请回到杂盒重新登录。" };
    let status = if ok { "200 OK" } else { "400 Bad Request" };
    let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'\r\nConnection: close\r\n\r\n{body}", body.len());
}

fn serve(listener: TcpListener, state: String, cancelled: Arc<AtomicBool>) -> Result<String, String> {
    let deadline = Instant::now() + Duration::from_secs(180);
    while Instant::now() < deadline && !cancelled.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_millis(250)));
                let _ = stream.set_write_timeout(Some(Duration::from_millis(250)));
                let mut request = Vec::new();
                let mut chunk = [0u8; 1024];
                while request.len() < 8192 && !request.windows(4).any(|v| v == b"\r\n\r\n") {
                    match stream.read(&mut chunk) {
                        Ok(0) | Err(_) => break,
                        Ok(count) => request.extend_from_slice(&chunk[..count]),
                    }
                }
                let request = String::from_utf8_lossy(&request);
                let parts: Vec<_> = request.lines().next().unwrap_or("").split_whitespace().collect();
                if parts.len() != 3 || parts[0] != "GET" {
                    respond(&mut stream, false);
                    continue;
                }
                match callback_code(parts[1], &state) {
                    Ok(code) => {
                        respond(&mut stream, true);
                        return code.ok_or_else(|| "GitHub 授权已取消".into());
                    }
                    Err(_) => respond(&mut stream, false),
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => return Err("无法接收浏览器授权，请重试".into()),
        }
    }
    Err(if cancelled.load(Ordering::Relaxed) { "登录已取消" } else { "登录超时，请重试" }.into())
}

#[tauri::command]
pub fn start_desktop_login(state: String, login: State<'_, LoginState>) -> Result<u16, String> {
    if state.len() != 64 || !state.bytes().all(|byte| byte.is_ascii_hexdigit()) { return Err("无效登录校验码".into()); }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| "无法启动本机授权回调")?;
    listener.set_nonblocking(true).map_err(|_| "无法设置授权回调")?;
    let port = listener.local_addr().map_err(|_| "无法读取授权回调端口")?.port();
    let cancelled = Arc::new(AtomicBool::new(false));
    let signal = cancelled.clone();
    let (sender, receiver) = mpsc::channel();
    let mut slot = login.0.lock().map_err(|_| "登录状态不可用")?;
    if let Some(previous) = slot.take() { previous.cancelled.store(true, Ordering::Relaxed); }
    *slot = Some(Attempt { cancelled, receiver: Some(receiver) });
    std::thread::spawn(move || { let _ = sender.send(serve(listener, state, signal)); });
    Ok(port)
}

#[tauri::command]
pub async fn wait_desktop_login(login: State<'_, LoginState>) -> Result<String, String> {
    let receiver = login.0.lock().map_err(|_| "登录状态不可用")?
        .as_mut().and_then(|attempt| attempt.receiver.take()).ok_or("请重新开始登录")?;
    tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(185)))
        .await.map_err(|_| "登录回调异常")?.map_err(|_| "登录已中断，请重试")?
}

#[tauri::command]
pub fn cancel_desktop_login(login: State<'_, LoginState>) {
    if let Ok(mut slot) = login.0.lock() {
        if let Some(attempt) = slot.take() { attempt.cancelled.store(true, Ordering::Relaxed); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn packaged_opener_scope_allows_the_login_url_only_on_our_site() {
        // Use the same glob matcher as tauri-plugin-opener, against the actual
        // packaged capability. Merely granting allow-open-url grants NO URLs.
        let capability: serde_json::Value = serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let permission = capability["permissions"].as_array().unwrap().iter()
            .find(|permission| permission["identifier"] == "opener:allow-open-url")
            .expect("browser login needs an explicit URL scope");
        let patterns: Vec<_> = permission["allow"].as_array().unwrap().iter()
            .map(|entry| glob::Pattern::new(entry["url"].as_str().unwrap()).unwrap()).collect();
        let allowed = |url: &str| patterns.iter().any(|pattern| pattern.matches(url));
        for port in [1024, 54321, 65535] {
            let url = format!("https://zahe.hiitun.top/?desktop_port={port}&desktop_state={}", "a".repeat(64));
            assert!(allowed(&url), "login URL must be allowed: {url}");
        }
        for url in ["https://zahe.hiitun.top.evil.test/", "http://zahe.hiitun.top/", "file:///C:/Windows/notepad.exe", "https://example.com/"] {
            assert!(!allowed(url), "unrelated URLs should remain blocked");
        }
    }
    #[test]
    fn callback_requires_path_state_and_one_code() {
        assert_eq!(callback_code("/callback?state=secret&code=abc", "secret").unwrap(), Some("abc".into()));
        for target in ["/callback?state=other&code=abc", "/other?state=secret&code=abc", "/callback?state=secret&code=a&code=b", "//other/callback?state=secret&code=a"] {
            assert!(callback_code(target, "secret").is_err());
        }
        assert_eq!(callback_code("/callback?state=secret&error=access_denied", "secret").unwrap(), None);
    }
    #[test]
    fn invalid_request_does_not_consume_login() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let worker = std::thread::spawn(move || serve(listener, "secret".into(), Arc::new(AtomicBool::new(false))));
        for state in ["wrong", "secret"] {
            let mut stream = TcpStream::connect(address).unwrap();
            write!(stream, "GET /callback?state={state}&code=abc HTTP/1.1\r\nHost: {address}\r\n\r\n").unwrap();
            let mut response = String::new();
            stream.read_to_string(&mut response).unwrap();
            assert!(response.starts_with(if state == "secret" { "HTTP/1.1 200" } else { "HTTP/1.1 400" }));
        }
        assert_eq!(worker.join().unwrap().unwrap(), "abc");
    }
}
