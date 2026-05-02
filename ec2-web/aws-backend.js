'use strict';

const http = require('http');
const os   = require('os');

const port       = 3000;
const serverName = os.hostname();
const startedAt  = new Date();
let requestCount = 0;

// ── IMDSv2 helpers ─────────────────────────────────────────────────────────────

function imdsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '169.254.169.254', ...options, timeout: 1200 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data.trim()));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('IMDS timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function getImdsToken() {
  return imdsRequest({
    path: '/latest/api/token', method: 'PUT',
    headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
  });
}

async function getImdsMeta(token, path) {
  return imdsRequest({
    path: `/latest/meta-data/${path}`, method: 'GET',
    headers: { 'X-aws-ec2-metadata-token': token },
  });
}

// ── Cached metadata ────────────────────────────────────────────────────────────

let cachedMeta = null;

async function loadMetadata() {
  try {
    const token = await getImdsToken();
    const [instanceId, az, localIpv4] = await Promise.all([
      getImdsMeta(token, 'instance-id'),
      getImdsMeta(token, 'placement/availability-zone'),
      getImdsMeta(token, 'local-ipv4'),
    ]);
    cachedMeta = { instanceId, az, localIpv4 };
    console.log(`[aws-backend] metadata: ${instanceId} @ ${az}`);
  } catch {
    cachedMeta = null;
    console.log('[aws-backend] not on EC2 — using hostname fallback');
  }
}

function getMeta() {
  const m = cachedMeta || {};
  return {
    instanceId: m.instanceId || serverName,
    az:         m.az         || 'N/A',
    localIpv4:  m.localIpv4  || '127.0.0.1 (Local)', 
  };
}

// ── HTML ───────────────────────────────────────────────────────────────────────

function renderHtml() {
  const m = getMeta();

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${serverName} | Intelligent Load Balancer</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --bg: #f1f5f9;
      --nav-bg: #ffffff;
      --card-bg: #ffffff;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --accent: #10b981;
      --accent-alt: #f59e0b;
      --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      --radius: 10px;
    }
    body.dark {
      --primary: #3b82f6;
      --primary-hover: #60a5fa;
      --bg: #0b1120;
      --nav-bg: #1e293b;
      --card-bg: #1e293b;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
      --shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: var(--bg); color: var(--text-main); transition: background-color 0.3s; line-height: 1.5; }
    
    /* Navbar */
    .navbar { background: var(--nav-bg); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; box-shadow: var(--shadow); }
    .nav-container { max-width: 1000px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 20px; height: 64px; }
    .logo { font-size: 18px; font-weight: 800; display: flex; align-items: center; gap: 8px; color: var(--primary); }
    .pulse { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); animation: blink 2s infinite; }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    
    .nav-tabs { display: flex; gap: 5px; height: 100%; }
    .tab-btn { background: transparent; border: none; color: var(--text-muted); font-weight: 600; font-size: 14px; padding: 0 16px; cursor: pointer; transition: 0.2s; border-bottom: 3px solid transparent; height: 100%; }
    .tab-btn:hover { color: var(--primary); background: rgba(0,0,0,0.02); }
    .tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
    body.dark .tab-btn:hover { background: rgba(255,255,255,0.05); }

    .nav-actions { display: flex; gap: 8px; }
    .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-weight: 600; transition: 0.2s; font-size: 13px; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text-main); }
    .btn-outline:hover { border-color: var(--text-muted); }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-hover); }

    /* Main Container - Thu hẹp lại để nội dung đậm đặc hơn */
    .container { max-width: 1000px; margin: 24px auto; padding: 0 20px; }
    .tab-content { display: none; animation: fadeIn 0.3s ease; }
    .tab-content.active { display: block; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

    /* Layouts */
    .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; box-shadow: var(--shadow); }
    .card-title { font-size: 16px; font-weight: bold; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    
    /* Top Metrics Stats Cards */
    .stat-card { text-align: center; padding: 16px; display: flex; flex-direction: column; justify-content: center; }
    .metric-value { font-size: 28px; font-weight: 900; color: var(--primary); word-break: break-all; line-height: 1.2; margin-top: 4px; }
    .metric-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }

    /* Bảng Key-Value cho Node Info (Tránh trống trải) */
    .kv-list { display: flex; flex-direction: column; gap: 0; }
    .kv-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed var(--border); font-size: 14px; }
    .kv-item:last-child { border-bottom: none; padding-bottom: 0; }
    .kv-label { color: var(--text-muted); }
    .kv-value { font-weight: 600; text-align: right; }

    /* Info & Tools CSS */
    .profile-header { display: flex; gap: 20px; align-items: center; margin-bottom: 20px; }
    .avatar { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), #8b5cf6); color: white; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; }
    .info-list { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .info-item { background: var(--bg); padding: 10px 14px; border-radius: 6px; border: 1px solid var(--border); }
    .info-item span { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 2px; }
    .info-item strong { display: block; font-size: 14px; }
    .chip { display: inline-block; padding: 4px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 20px; font-size: 12px; margin: 0 4px 0 0; }

    .tool-box { margin-bottom: 16px; }
    .input-group { margin-bottom: 12px; }
    .input-group label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 13px; }
    textarea, input { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text-main); font-family: inherit; resize: vertical; font-size: 13px; }
    textarea:focus, input:focus { outline: none; border-color: var(--primary); }
    .tool-result { background: var(--bg); border: 1px solid var(--border); padding: 12px; border-radius: 6px; min-height: 40px; margin-top: 8px; word-break: break-all; font-family: monospace; font-size: 13px; }
    .flex-row { display: flex; gap: 8px; align-items: center; }

    .roadmap-box { background: var(--bg); padding: 16px; border-radius: 8px; border: 1px solid var(--border); height: 100%; }
    .roadmap-box h3 { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; font-size: 15px; }
    .roadmap-box ul { padding-left: 20px; color: var(--text-muted); font-size: 13px; margin-top: 6px; }
    .roadmap-box li { margin-bottom: 4px; }

    @media (max-width: 900px) {
      .nav-container { flex-wrap: wrap; height: auto; padding: 8px 16px; justify-content: center; gap: 8px; }
      .nav-tabs { width: 100%; overflow-x: auto; justify-content: center; }
      .tab-btn { padding: 8px 12px; white-space: nowrap; }
    }
    @media (max-width: 600px) {
      .grid-2, .grid-3 { grid-template-columns: 1fr; gap: 12px; }
      .info-list { grid-template-columns: 1fr; }
      .profile-header { flex-direction: column; text-align: center; }
      .kv-item { flex-direction: column; align-items: flex-start; gap: 4px; }
      .kv-value { text-align: left; }
    }
  </style>
</head>
<body>
  
  <nav class="navbar">
    <div class="nav-container">
      <div class="logo"><span class="pulse"></span> ALB Demo</div>
      <div class="nav-tabs">
        <button class="tab-btn active" onclick="switchTab('tab-system')">System Monitor</button>
        <button class="tab-btn" onclick="switchTab('tab-profile')">Hồ sơ cá nhân</button>
        <button class="tab-btn" onclick="switchTab('tab-tools')">Công cụ Test</button>
      </div>
      <div class="nav-actions">
        <button class="btn btn-outline" onclick="toggleTheme()">🌓 Theme</button>
        <button class="btn btn-primary" onclick="location.reload()">🔄 Refresh</button>
      </div>
    </div>
  </nav>

  <div class="container">
    
    <!-- TAB 1: SYSTEM MONITOR -->
    <div id="tab-system" class="tab-content active">
      
      <!-- 3 Card Thông số riêng biệt, gọn gàng -->
      <div class="grid-3">
        <div class="card stat-card">
          <div class="metric-label">Server Hostname</div>
          <div class="metric-value" style="font-size: 24px;">${serverName}</div>
        </div>
        <div class="card stat-card">
          <div class="metric-label">Tổng Requests</div>
          <div class="metric-value" style="color: var(--accent);">${requestCount}</div>
        </div>
        <div class="card stat-card">
          <div class="metric-label">Thời gian Server</div>
          <div class="metric-value" id="clock" style="font-size: 22px;">--:--:--</div>
        </div>
      </div>

      <div class="grid-2">
        <!-- NODE INFO: Sử dụng Layout bảng (Key-Value) để xóa khoảng trống -->
        <div class="card">
          <div class="card-title">Node Info</div>
          <div class="kv-list">
            <div class="kv-item">
              <span class="kv-label">Instance ID</span>
              <span class="kv-value">${m.instanceId}</span>
            </div>
            <div class="kv-item">
              <span class="kv-label">Private IP</span>
              <span class="kv-value">${m.localIpv4}</span>
            </div>
            <div class="kv-item">
              <span class="kv-label">Port Phục Vụ</span>
              <span class="kv-value">${port}</span>
            </div>
            <div class="kv-item">
              <span class="kv-label">Target Status</span>
              <span class="kv-value" style="color: var(--accent);">Healthy (InService)</span>
            </div>
            <div class="kv-item" style="border: none; padding-top: 14px;">
              <span class="kv-label" style="font-size: 12px; line-height: 1.4; width: 100%;">
                <i>* Node đang hoạt động phía sau AWS ALB. Chờ nhận traffic điều phối.</i>
              </span>
            </div>
          </div>
        </div>

        <!-- TRAFFIC MONITOR -->
        <div class="card">
          <div class="card-title">Traffic Monitor</div>
          <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="addLog('ALB Health Check: 200 OK')">Ping Health Check</button>
            <button class="btn btn-outline" onclick="addLog('ALB Router: Nhận request thành công')">Test Traffic</button>
            <button class="btn btn-outline" onclick="clearLogs()" style="color: #ef4444; border-color: #fca5a5;">Xóa Log</button>
          </div>
          <div id="trafficLogs" style="background: var(--bg); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 12px; height: 125px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">
            <div>> [Khởi động] Sẵn sàng nhận traffic từ ALB...</div>
          </div>
        </div>
      </div>

      <!-- ROADMAP SECTION -->
      <div class="card" style="margin-top: 16px;">
        <div class="card-title">
          <span>🚀 15. Intelligent Load Balancing</span>
          <span class="chip" style="background: rgba(37, 99, 235, 0.1); color: var(--primary); font-weight: bold; margin: 0;">Roadmap</span>
        </div>
        
        <div class="grid-2" style="margin-top: 12px;">
          <!-- Khối Đồ án cơ sở -->
          <div class="roadmap-box">
            <h3 style="color: var(--primary);">📚 Đồ án cơ sở</h3>
            <p style="font-size: 13px; margin-bottom: 8px;"><strong>Yêu cầu:</strong> Cấu hình Load Balancer.</p>
            <div style="font-weight: 600; font-size: 13px;">Thực hiện (AWS):</div>
            <ul>
              <li>Deploy nhiều EC2 server (Autoscaling).</li>
              <li>Tạo Elastic Load Balancer.</li>
              <li>Tạo target group.</li>
              <li>Test phân phối traffic.</li>
            </ul>
          </div>

          <!-- Khối Đồ án chuyên ngành -->
          <div class="roadmap-box">
            <h3 style="color: var(--accent);">🎓 Đồ án chuyên ngành</h3>
            <p style="font-size: 13px; margin-bottom: 8px;"><strong>Yêu cầu:</strong> AI điều chỉnh thuật toán load balancing.</p>
            <div style="font-weight: 600; font-size: 13px;">Thực hiện:</div>
            <ul>
              <li>Thu thập log truy cập.</li>
              <li>Phân tích traffic pattern.</li>
              <li>AI phân phối traffic.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: PROFILE -->
    <div id="tab-profile" class="tab-content">
      <div class="grid-2">
        <div class="card">
          <div class="profile-header">
            <div class="avatar">QH</div>
            <div>
              <h2 style="font-size: 22px; margin-bottom: 4px;">Nguyễn Quang Huy</h2>
              <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 6px;">Sinh viên CNTT / Network</p>
              <div>
                <span class="chip">Từ Quy Nhơn</span>
                <span class="chip">HUTECH</span>
              </div>
            </div>
          </div>
          <p style="margin-bottom: 16px; font-size: 13px;">
            Thực hiện đồ án cơ sở về Intelligent Load Balancer trên AWS, triển khai nhiều EC2 server, Target Group và theo dõi traffic.
          </p>
          
          <div class="card-title" style="border: none; padding: 0; margin-bottom: 10px;">Tiến độ dự án</div>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;"><span>AWS / ALB</span> <span>35%</span></div>
              <div style="height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden;"><div style="width: 35%; height: 100%; background: var(--primary);"></div></div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;"><span>CCNA / Networking</span> <span>38%</span></div>
              <div style="height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden;"><div style="width: 38%; height: 100%; background: var(--accent);"></div></div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;"><span>Lập trình mạng</span> <span>30%</span></div>
              <div style="height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden;"><div style="width: 30%; height: 100%; background: var(--accent-alt);"></div></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Thông tin chi tiết</div>
          <div class="info-list">
            <div class="info-item"><span>MSSV</span><strong>2380614932</strong></div>
            <div class="info-item"><span>Lớp</span><strong>23DTHA4</strong></div>
            <div class="info-item"><span>Khoa</span><strong>Công nghệ thông tin</strong></div>
            <div class="info-item"><span>Trường</span><strong>ĐH HUTECH</strong></div>
            <div class="info-item"><span>Đồng đội</span><strong>Đoàn Trọng Nghĩa</strong></div>
            <div class="info-item"><span>GitHub</span><strong>qhuyy0901</strong></div>
            <div class="info-item" style="grid-column: span 2;">
              <span>Project Repository</span>
              <strong><a href="https://github.com/qhuyy0901/IntelligentLoadBalancer_Network.git" target="_blank" style="color: var(--primary); text-decoration: none;">IntelligentLoadBalancer_Network</a></strong>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 3: TOOLS -->
    <div id="tab-tools" class="tab-content">
      <div class="card">
        <div class="card-title">Công cụ Client-side</div>
        
        <div class="grid-2" style="margin-top: 16px;">
          <!-- Tool Mạng -->
          <div class="tool-box">
            <div class="card-title" style="font-size: 14px; color: var(--accent);">Cisco MAC Formatter</div>
            <div class="input-group flex-row">
              <input type="text" id="macInput" placeholder="Ví dụ: AA:BB:CC:DD:EE:FF">
              <button class="btn btn-primary" onclick="formatMac()">Đổi</button>
            </div>
            <div class="tool-result" id="macResult">Chuyển đổi MAC sang chuẩn Cisco...</div>
          </div>

          <!-- Tool 2: Password Generator -->
          <div class="tool-box">
            <div class="card-title" style="font-size: 14px;">Tạo Mật Khẩu Random</div>
            <div class="input-group flex-row">
              <label style="margin: 0;">Độ dài (8-64):</label>
              <input type="number" id="pwdLength" value="16" min="8" max="64" style="width: 70px;">
              <button class="btn btn-primary" onclick="generatePassword()">Tạo</button>
            </div>
            <div class="tool-result" id="pwdResult" style="font-weight: bold; color: var(--accent-alt);">...</div>
          </div>
          
          <!-- Tool 1: Base64 -->
          <div class="tool-box">
            <div class="card-title" style="font-size: 14px;">Mã hóa Base64</div>
            <div class="input-group">
              <textarea id="base64Input" rows="2" placeholder="Nhập văn bản..."></textarea>
            </div>
            <div class="flex-row">
              <button class="btn btn-primary" onclick="encodeBase64()">Mã hóa</button>
              <button class="btn btn-outline" onclick="decodeBase64()">Giải mã</button>
            </div>
            <div class="tool-result" id="base64Result">Kết quả...</div>
          </div>

          <!-- Tool 3: JSON Formatter -->
          <div class="tool-box">
            <div class="card-title" style="font-size: 14px;">JSON Formatter</div>
            <div class="input-group">
              <textarea id="jsonInput" rows="2" placeholder='{"status":"ok"}'></textarea>
            </div>
            <button class="btn btn-primary" onclick="formatJson()">Format</button>
            <textarea id="jsonResult" rows="5" class="tool-result" readonly style="width:100%; margin-top: 8px;"></textarea>
          </div>
        </div>
      </div>
    </div>

  </div>

  <script>
    function switchTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      event.currentTarget.classList.add('active');
    }

    function toggleTheme() {
      document.body.classList.toggle('dark');
      localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
    }
    if(localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');

    setInterval(() => {
      document.getElementById('clock').textContent = new Date().toLocaleTimeString('vi-VN');
    }, 1000);

    // Logs
    function addLog(message) {
      const logContainer = document.getElementById('trafficLogs');
      const timeStr = new Date().toLocaleTimeString('vi-VN');
      const newLog = document.createElement('div');
      newLog.textContent = \`> [\${timeStr}] \${message}\`;
      logContainer.appendChild(newLog);
      logContainer.scrollTop = logContainer.scrollHeight;
    }
    function clearLogs() {
      document.getElementById('trafficLogs').innerHTML = '<div>> Logs đã được làm sạch.</div>';
    }

    // Tools
    function formatMac() {
      let mac = document.getElementById('macInput').value.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
      if (mac.length !== 12) {
         document.getElementById('macResult').innerHTML = "<span style='color:red'>Lỗi: Yêu cầu 12 ký tự Hex.</span>";
         return;
      }
      let cisco = mac.match(/.{1,4}/g).join('.');
      let standard = mac.match(/.{1,2}/g).join(':');
      document.getElementById('macResult').innerHTML = \`
        Cisco: <span style="color:var(--primary)">\${cisco}</span> <br> 
        Chuẩn: <span style="color:var(--accent)">\${standard}</span>
      \`;
    }

    function encodeBase64() {
      try {
        const input = document.getElementById('base64Input').value;
        document.getElementById('base64Result').textContent = btoa(unescape(encodeURIComponent(input)));
      } catch(e) { document.getElementById('base64Result').textContent = "Lỗi!"; }
    }
    function decodeBase64() {
      try {
        const input = document.getElementById('base64Input').value;
        document.getElementById('base64Result').textContent = decodeURIComponent(escape(atob(input)));
      } catch(e) { document.getElementById('base64Result').textContent = "Lỗi chuỗi!"; }
    }

    function generatePassword() {
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
      let len = parseInt(document.getElementById('pwdLength').value) || 16;
      if(len < 8) len = 8; if(len > 64) len = 64;
      let pass = "";
      for (let i = 0; i < len; i++) {
        pass += chars[Math.floor(Math.random() * chars.length)];
      }
      document.getElementById('pwdResult').textContent = pass;
    }

    function formatJson() {
      const input = document.getElementById('jsonInput').value;
      const resultEl = document.getElementById('jsonResult');
      try {
        const parsed = JSON.parse(input);
        resultEl.value = JSON.stringify(parsed, null, 4);
        resultEl.style.color = "var(--text-main)";
      } catch(e) {
        resultEl.value = "LỖI JSON.\\n" + e.message;
        resultEl.style.color = "red";
      }
    }
  </script>
</body>
</html>`;
}

// ── HTTP server ────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (url === '/metrics') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({
      serverName,
      requests: requestCount,
      uptime: Math.floor(process.uptime()),
    }));
    return;
  }

  requestCount += 1;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(renderHtml());
});

// ── Start ──────────────────────────────────────────────────────────────────────

loadMetadata().finally(() => {
  server.listen(port, '0.0.0.0', () => {
    console.log(`[aws-backend] ${serverName} listening on :${port}`);
  });
});