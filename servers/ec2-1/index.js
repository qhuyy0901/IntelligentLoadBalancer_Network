const express = require('express');
const http = require('http');
const app = express();
const PORT = 3001;
const SERVER_ID = 'ec2-1';
const SERVER_NAME = 'EC2-1';

// ── Cấu hình Dashboard LB (nơi nhận log từ AWS ALB) ─────────────────────
// Đổi thành IP/hostname của máy chạy Node LB của bạn
const DASHBOARD_HOST = process.env.DASHBOARD_HOST || 'localhost';
const DASHBOARD_PORT = process.env.DASHBOARD_PORT || 8000;

let requestCount = 0;

// Các path KHÔNG tính vào traffic thật
const EXCLUDED_PATHS = ['/health', '/favicon.ico', '/robots.txt', '/stats'];

// ── Gửi log về Dashboard sau mỗi request thật ────────────────────────────
// Được gọi khi EC2 nhận request từ AWS ALB (không phải Node LB)
function reportToLBDashboard({ clientIp, duration, path }) {
  const payload = JSON.stringify({
    serverId: SERVER_ID,
    serverName: SERVER_NAME,
    clientIp: clientIp || '0.0.0.0',
    duration: Math.round(duration),
    path: path || '/'
  });

  const options = {
    hostname: DASHBOARD_HOST,
    port: DASHBOARD_PORT,
    path: '/lb/aws-log',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    },
    timeout: 2000  // không chờ lâu — fire & forget
  };

  const req = http.request(options);
  req.on('error', () => {}); // bỏ qua lỗi nếu dashboard không kết nối được
  req.write(payload);
  req.end();
}

// Middleware đếm request + chặn noise
app.use((req, res, next) => {
  if (!EXCLUDED_PATHS.includes(req.path)) requestCount++;
  next();
});

// 🚫 Chặn favicon
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ── Cấu hình instance ─────────────────────────────────────────────────────
const INSTANCE = {
  name: SERVER_NAME,
  id: SERVER_ID,
  ip: '3.107.233.161',
  domain: 'ec2-1.ap-southeast-2.compute.amazonaws.com',
  region: 'ap-southeast-2',
  zone: 'ap-southeast-2a',
  type: 't2.micro',
  accent: '#2dd4bf',        // teal — từ config
  accentRGB: '45,212,191',
};

// ── HTML template ─────────────────────────────────────────────────────────
function buildHTML(inst, reqCount, processingTime, clientIp) {
  const now = new Date();
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${inst.name} — Intelligent Load Balancer</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--accent:${inst.accent};--accent-rgb:${inst.accentRGB};--bg:#0b1120;--card:#141d30;--card2:#1a2540;--bd:#1e3050;--tx1:#e2e8f0;--tx2:#94a3b8;--tx3:#64748b;--r:14px}
html{font-size:15px}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--tx1);min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px;line-height:1.55;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:var(--tx3);border-radius:10px}

/* ── Hero Banner ── */
.hero{width:100%;max-width:960px;background:linear-gradient(135deg,rgba(var(--accent-rgb),.12) 0%,rgba(var(--accent-rgb),.03) 100%);border:1px solid rgba(var(--accent-rgb),.18);border-radius:var(--r);padding:32px 36px;margin-bottom:20px;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;top:-60px;right:-60px;width:200px;height:200px;background:radial-gradient(circle,rgba(var(--accent-rgb),.15),transparent 70%);border-radius:50%}
.hero-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(var(--accent-rgb),.15);color:var(--accent);padding:5px 14px;border-radius:99px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px}
.hero-badge i{font-size:.6rem}
.hero h1{font-size:2rem;font-weight:900;letter-spacing:-.5px;margin-bottom:4px}
.hero h1 span{color:var(--accent)}
.hero-sub{font-size:.85rem;color:var(--tx2)}

/* ── LB Notice ── */
.lb-notice{width:100%;max-width:960px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.18);border-radius:var(--r);padding:14px 20px;margin-bottom:20px;display:flex;align-items:center;gap:12px;font-size:.82rem;font-weight:500;color:#4ade80}
.lb-notice i{font-size:1.1rem}
.lb-notice .dismiss{margin-left:auto;cursor:pointer;opacity:.5;transition:.2s}
.lb-notice .dismiss:hover{opacity:1}

/* ── Stat Grid ── */
.stats{width:100%;max-width:960px;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:20px}
.stat{background:var(--card);border:1px solid var(--bd);border-radius:var(--r);padding:18px;position:relative;overflow:hidden;transition:transform .2s,box-shadow .2s}
.stat:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.3)}
.stat::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px}
.stat:nth-child(1)::after{background:var(--accent)}.stat:nth-child(2)::after{background:#3b82f6}
.stat:nth-child(3)::after{background:#8b5cf6}.stat:nth-child(4)::after{background:#f59e0b}
.stat:nth-child(5)::after{background:#ef4444}.stat:nth-child(6)::after{background:#22c55e}
.stat-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:.95rem;margin-bottom:12px}
.stat-val{font-size:1.3rem;font-weight:800;letter-spacing:-.3px;margin-bottom:1px}
.stat-lbl{font-size:.62rem;color:var(--tx3);font-weight:700;text-transform:uppercase;letter-spacing:.7px}

/* ── Cards ── */
.grid2{width:100%;max-width:960px;display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;transition:box-shadow .2s}
.card:hover{box-shadow:0 4px 16px rgba(0,0,0,.25)}
.card-hdr{padding:14px 20px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between}
.card-hdr h3{font-size:.85rem;font-weight:700;display:flex;align-items:center;gap:8px}
.card-hdr h3 i{color:var(--accent);font-size:.8rem}
.card-body{padding:18px 20px}

/* ── Detail rows ── */
.detail-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.detail-row:last-child{border-bottom:none}
.detail-key{font-size:.75rem;color:var(--tx3);font-weight:600;display:flex;align-items:center;gap:6px}
.detail-key i{width:14px;text-align:center;color:var(--tx3)}
.detail-val{font-size:.82rem;font-weight:600}
.detail-val code{background:rgba(var(--accent-rgb),.1);color:var(--accent);padding:2px 8px;border-radius:4px;font-size:.75rem}

/* ── Actions ── */
.actions{width:100%;max-width:960px;display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}
.abtn{display:inline-flex;align-items:center;gap:7px;padding:10px 20px;border:none;border-radius:10px;font-size:.78rem;font-weight:700;font-family:inherit;cursor:pointer;transition:all .2s;color:#fff}
.abtn:active{transform:scale(.96)}
.abtn-accent{background:linear-gradient(135deg,rgba(var(--accent-rgb),.9),rgba(var(--accent-rgb),.7));box-shadow:0 2px 10px rgba(var(--accent-rgb),.3)}
.abtn-accent:hover{box-shadow:0 4px 20px rgba(var(--accent-rgb),.4);transform:translateY(-1px)}
.abtn-blue{background:linear-gradient(135deg,#3b82f6,#2563eb);box-shadow:0 2px 10px rgba(59,130,246,.3)}
.abtn-blue:hover{box-shadow:0 4px 20px rgba(59,130,246,.4);transform:translateY(-1px)}
.abtn-purple{background:linear-gradient(135deg,#8b5cf6,#7c3aed);box-shadow:0 2px 10px rgba(139,92,246,.3)}
.abtn-purple:hover{box-shadow:0 4px 20px rgba(139,92,246,.4);transform:translateY(-1px)}
.abtn-ghost{background:transparent;border:1px solid var(--bd);color:var(--tx2)}
.abtn-ghost:hover{background:rgba(255,255,255,.04);color:var(--tx1);border-color:var(--tx3)}

/* ── Console ── */
.console{width:100%;max-width:960px;background:var(--card);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;margin-bottom:20px}
.console-hdr{padding:10px 16px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:8px;font-size:.75rem;font-weight:700;color:var(--tx3)}
.console-hdr .dots{display:flex;gap:5px}.console-hdr .dots span{width:10px;height:10px;border-radius:50%}
.console-body{padding:14px 18px;max-height:200px;overflow-y:auto;font-family:'SF Mono','Fira Code',monospace;font-size:.72rem;line-height:1.8;color:var(--tx2)}
.console-body .log-line{display:flex;gap:10px}
.console-body .log-time{color:var(--tx3);min-width:80px}
.console-body .log-ok{color:#4ade80}
.console-body .log-info{color:#60a5fa}
.console-body .log-warn{color:#fbbf24}

/* ── Footer ── */
.footer{width:100%;max-width:960px;text-align:center;padding:24px 0 8px;font-size:.7rem;color:var(--tx3);border-top:1px solid var(--bd);margin-top:auto}

/* ── Badge ── */
.tag{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:99px;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.3px}
.tag-green{background:rgba(34,197,94,.12);color:#4ade80}
.tag-amber{background:rgba(245,158,11,.12);color:#fbbf24}

/* ── Toast ── */
.toast-rack{position:fixed;top:20px;right:20px;z-index:999;display:flex;flex-direction:column;gap:8px}
.toast{padding:11px 18px;border-radius:10px;font-size:.78rem;font-weight:600;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.4);animation:tIn .3s ease,tOut .3s ease 2.5s forwards;display:flex;align-items:center;gap:8px}
.toast-ok{background:linear-gradient(135deg,#22c55e,#16a34a)}.toast-info{background:linear-gradient(135deg,#3b82f6,#2563eb)}
@keyframes tIn{from{opacity:0;transform:translateY(-12px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes tOut{from{opacity:1}to{opacity:0;transform:translateY(-12px)}}

@media(max-width:768px){
  .grid2{grid-template-columns:1fr}
  .stats{grid-template-columns:repeat(2,1fr)}
  .hero h1{font-size:1.5rem}
  .actions{flex-direction:column}
  .abtn{width:100%;justify-content:center}
}
@media(max-width:480px){.stats{grid-template-columns:1fr}}
</style>
</head>
<body>

<!-- Hero -->
<div class="hero">
  <div class="hero-badge"><i class="fas fa-circle"></i> Active Instance</div>
  <h1>⚡ <span>${inst.name}</span></h1>
  <p class="hero-sub">AWS Application Load Balancer — EC2 Backend Instance</p>
</div>

<!-- LB Notice -->
<div class="lb-notice" id="lbNotice">
  <i class="fas fa-check-circle"></i>
  <span>This page was served by <strong>${inst.name}</strong> through the <strong>Intelligent Load Balancer</strong> on port 8000</span>
  <i class="fas fa-times dismiss" onclick="document.getElementById('lbNotice').style.display='none'"></i>
</div>

<!-- Stat Cards -->
<div class="stats">
  <div class="stat">
    <div class="stat-icon" style="background:rgba(var(--accent-rgb),.12);color:var(--accent)"><i class="fas fa-server"></i></div>
    <div class="stat-val">${inst.name}</div>
    <div class="stat-lbl">Instance</div>
  </div>
  <div class="stat">
    <div class="stat-icon" style="background:rgba(59,130,246,.12);color:#60a5fa"><i class="fas fa-exchange-alt"></i></div>
    <div class="stat-val" id="reqCount">${reqCount}</div>
    <div class="stat-lbl">Total Requests</div>
  </div>
  <div class="stat">
    <div class="stat-icon" style="background:rgba(139,92,246,.12);color:#a78bfa"><i class="fas fa-clock"></i></div>
    <div class="stat-val">${processingTime} ms</div>
    <div class="stat-lbl">Response Time</div>
  </div>
  <div class="stat">
    <div class="stat-icon" style="background:rgba(245,158,11,.12);color:#fbbf24"><i class="fas fa-globe-asia"></i></div>
    <div class="stat-val" style="font-size:1rem">${inst.region}</div>
    <div class="stat-lbl">Region</div>
  </div>
  <div class="stat">
    <div class="stat-icon" style="background:rgba(239,68,68,.12);color:#f87171"><i class="fas fa-microchip"></i></div>
    <div class="stat-val">${inst.type}</div>
    <div class="stat-lbl">Instance Type</div>
  </div>
  <div class="stat">
    <div class="stat-icon" style="background:rgba(34,197,94,.12);color:#4ade80"><i class="fas fa-heart"></i></div>
    <div class="stat-val"><span class="tag tag-green"><i class="fas fa-check-circle"></i> Healthy</span></div>
    <div class="stat-lbl">Health Status</div>
  </div>
</div>

<!-- Detail Cards -->
<div class="grid2">
  <div class="card">
    <div class="card-hdr"><h3><i class="fas fa-info-circle"></i> Instance Details</h3></div>
    <div class="card-body">
      <div class="detail-row"><span class="detail-key"><i class="fas fa-tag"></i> Instance ID</span><span class="detail-val"><code>${inst.id}</code></span></div>
      <div class="detail-row"><span class="detail-key"><i class="fas fa-network-wired"></i> Private IP</span><span class="detail-val">${inst.ip}</span></div>
      <div class="detail-row"><span class="detail-key"><i class="fas fa-globe"></i> Domain</span><span class="detail-val" style="font-size:.72rem">${inst.domain}</span></div>
      <div class="detail-row"><span class="detail-key"><i class="fas fa-map-marker-alt"></i> Availability Zone</span><span class="detail-val">${inst.zone}</span></div>
      <div class="detail-row"><span class="detail-key"><i class="fas fa-plug"></i> Port</span><span class="detail-val">${PORT}</span></div>
      <div class="detail-row"><span class="detail-key"><i class="fas fa-user"></i> Client IP</span><span class="detail-val" style="font-size:.75rem">${clientIp}</span></div>
    </div>
  </div>
  <div class="card">
    <div class="card-hdr"><h3><i class="fas fa-shield-alt"></i> Health Check Config</h3></div>
    <div class="card-body">
      <div class="detail-row"><span class="detail-key"><i class="fas fa-link"></i> Protocol</span><span class="detail-val">HTTP</span></div>
      <div class="detail-row"><span class="detail-key"><i class="fas fa-route"></i> Path</span><span class="detail-val"><code>/health</code></span></div>
      <div class="detail-row"><span class="detail-key"><i class="fas fa-stopwatch"></i> Interval</span><span class="detail-val">5 seconds</span></div>
      <div class="detail-row"><span class="detail-key"><i class="fas fa-hourglass-half"></i> Timeout</span><span class="detail-val">3 seconds</span></div>
      <div class="detail-row"><span class="detail-key"><i class="fas fa-check-double"></i> Healthy Threshold</span><span class="detail-val">2 checks</span></div>
      <div class="detail-row"><span class="detail-key"><i class="fas fa-times-circle"></i> Unhealthy Threshold</span><span class="detail-val">3 checks</span></div>
    </div>
  </div>
</div>

<!-- Action Buttons -->
<div class="actions">
  <button class="abtn abtn-accent" onclick="refreshStatus()"><i class="fas fa-sync-alt"></i> Refresh Status</button>
  <button class="abtn abtn-blue" onclick="simulateAction()"><i class="fas fa-bolt"></i> Simulate Action</button>
  <button class="abtn abtn-purple" onclick="fakeRequest()"><i class="fas fa-paper-plane"></i> Fake Request</button>
  <button class="abtn abtn-ghost" onclick="window.location.reload()"><i class="fas fa-redo"></i> Reload Page (LB re-route)</button>
</div>

<!-- Console -->
<div class="console">
  <div class="console-hdr">
    <div class="dots"><span style="background:#ef4444"></span><span style="background:#f59e0b"></span><span style="background:#22c55e"></span></div>
    Activity Console
  </div>
  <div class="console-body" id="consoleBody">
    <div class="log-line"><span class="log-time">${now.toLocaleTimeString()}</span><span class="log-ok">✓ ${inst.name} ready — serving on port ${PORT}</span></div>
    <div class="log-line"><span class="log-time">${now.toLocaleTimeString()}</span><span class="log-info">◆ Request #${reqCount} from ${clientIp}</span></div>
    <div class="log-line"><span class="log-time">${now.toLocaleTimeString()}</span><span class="log-info">◆ Response time: ${processingTime}ms</span></div>
  </div>
</div>

<!-- Footer -->
<div class="footer">
  <p>© 2026 Intelligent Load Balancer — University Networking Project &nbsp;|&nbsp; ${inst.name} &nbsp;|&nbsp; All data is simulated, no database</p>
</div>

<!-- Toast rack -->
<div class="toast-rack" id="toastRack"></div>

<script>
let localReqCount = ${reqCount};

function toast(msg, type) {
  const rack = document.getElementById('toastRack');
  const t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'info');
  t.innerHTML = '<i class="fas fa-' + (type === 'ok' ? 'check-circle' : 'info-circle') + '"></i> ' + msg;
  rack.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function addLog(text, cls) {
  const body = document.getElementById('consoleBody');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = '<span class="log-time">' + new Date().toLocaleTimeString() + '</span><span class="' + (cls||'log-info') + '">' + text + '</span>';
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

function refreshStatus() {
  fetch('/health').then(r => r.json()).then(d => {
    addLog('✓ Health: ' + d.status + ' | Uptime: ' + Math.round(d.uptime) + 's', 'log-ok');
    toast('Health check: ' + d.status, 'ok');
  }).catch(() => { addLog('✗ Health check failed', 'log-warn'); });
}

function simulateAction() {
  const actions = ['Cache cleared','Config reloaded','Connections drained','Metrics exported','Logs rotated'];
  const a = actions[Math.floor(Math.random()*actions.length)];
  addLog('⚡ ' + a, 'log-warn');
  toast(a, 'ok');
}

function fakeRequest() {
  const routes = ['/api/users','/api/products','/api/orders','/api/health','/api/cart'];
  const r = routes[Math.floor(Math.random()*routes.length)];
  const lat = Math.floor(Math.random()*120)+15;
  const code = Math.random()<.9 ? 200 : 500;
  localReqCount++;
  document.getElementById('reqCount').textContent = localReqCount;
  addLog('◆ ' + (code===200?'✓':'✗') + ' ' + r + ' → ' + code + ' (' + lat + 'ms)', code===200?'log-ok':'log-warn');
  toast(r + ' → ' + code, code===200?'ok':'info');
}
</script>
</body>
</html>`;
}

// ── Endpoint chính ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const startTime = Date.now();
  const delay = Math.floor(Math.random() * 150) + 50;

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
    || req.socket.remoteAddress
    || '0.0.0.0';

  setTimeout(() => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildHTML(INSTANCE, requestCount, delay, clientIp));

    const duration = Date.now() - startTime;
    reportToLBDashboard({ clientIp, duration, path: req.path });
  }, delay);
});

// ── Health check ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', server: SERVER_NAME, uptime: process.uptime() });
});

// ── Stats ─────────────────────────────────────────────────────────────────
app.get('/stats', (req, res) => {
  res.json({ server: SERVER_NAME, requestCount, uptime: process.uptime() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${SERVER_NAME}] Đang chạy tại http://0.0.0.0:${PORT}`);
  console.log(`[${SERVER_NAME}] Dashboard log → http://${DASHBOARD_HOST}:${DASHBOARD_PORT}/lb/aws-log`);
});
