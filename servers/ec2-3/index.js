const express = require('express');
const http = require('http');
const app = express();
const PORT = 3003;
const SERVER_ID = 'ec2-3';
const SERVER_NAME = 'EC2-3';

// ── Cấu hình Dashboard LB ─────────────────────────────────────────────────
const DASHBOARD_HOST = process.env.DASHBOARD_HOST || 'localhost';
const DASHBOARD_PORT = process.env.DASHBOARD_PORT || 8000;

let requestCount = 0;

const EXCLUDED_PATHS = ['/health', '/favicon.ico', '/robots.txt', '/stats'];

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
    timeout: 2000
  };

  const req = http.request(options);
  req.on('error', () => {});
  req.write(payload);
  req.end();
}

app.use((req, res, next) => {
  if (!EXCLUDED_PATHS.includes(req.path)) requestCount++;
  next();
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// ── Cấu hình instance ─────────────────────────────────────────────────────
const INSTANCE = {
  name: SERVER_NAME,
  id: SERVER_ID,
  ip: '15.134.221.126',
  domain: 'ec2-3.ap-southeast-2.compute.amazonaws.com',
  region: 'ap-southeast-2',
  zone: 'ap-southeast-2c',
  type: 't2.micro',
  accent: '#f59e0b',
  accentRGB: '245,158,11',
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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --accent:${inst.accent};--accent-rgb:${inst.accentRGB};
  --bg:#060a13;--surface:#0d1321;--card:#111827;--card-hover:#151d2e;
  --border:rgba(255,255,255,.06);--border-accent:rgba(var(--accent-rgb),.2);
  --text:#f0f4f8;--text2:#8892a4;--text3:#505a6b;
  --radius:16px;--radius-sm:10px;--radius-xs:6px;
  --shadow:0 4px 24px rgba(0,0,0,.4);
  --glow:0 0 30px rgba(var(--accent-rgb),.15);
}
html{font-size:15px;scroll-behavior:smooth}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased;overflow-x:hidden}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--text3);border-radius:10px}

.bg-mesh{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.bg-mesh .orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.35;animation:orbFloat 20s ease-in-out infinite}
.bg-mesh .orb-1{width:400px;height:400px;background:rgba(var(--accent-rgb),.3);top:-10%;left:-5%;animation-delay:0s}
.bg-mesh .orb-2{width:350px;height:350px;background:rgba(99,102,241,.25);bottom:10%;right:-5%;animation-delay:-7s}
.bg-mesh .orb-3{width:300px;height:300px;background:rgba(168,85,247,.2);top:50%;left:40%;animation-delay:-14s}
@keyframes orbFloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(30px,-40px) scale(1.05)}66%{transform:translate(-20px,30px) scale(.95)}}

.navbar{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 28px;height:56px;background:rgba(13,19,33,.75);backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
.nav-brand{display:flex;align-items:center;gap:10px}
.nav-dot{width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px var(--accent);animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.85)}}
.nav-name{font-weight:800;font-size:.95rem;letter-spacing:-.3px}
.nav-tag{font-size:.6rem;font-weight:700;padding:3px 8px;border-radius:99px;background:rgba(var(--accent-rgb),.12);color:var(--accent);text-transform:uppercase;letter-spacing:.5px}
.nav-links{display:flex;gap:4px}
.nav-link{padding:6px 14px;border-radius:var(--radius-xs);font-size:.75rem;font-weight:600;color:var(--text2);cursor:pointer;transition:all .2s;border:none;background:none;font-family:inherit}
.nav-link:hover{color:var(--text);background:rgba(255,255,255,.05)}
.nav-link.active{color:var(--accent);background:rgba(var(--accent-rgb),.1)}
.nav-right{display:flex;align-items:center;gap:14px}
.req-badge{display:flex;align-items:center;gap:6px;padding:5px 14px;border-radius:99px;background:rgba(var(--accent-rgb),.1);border:1px solid rgba(var(--accent-rgb),.15);font-size:.72rem;font-weight:700;color:var(--accent)}
.req-badge i{font-size:.65rem}

.container{position:relative;z-index:1;max-width:1060px;margin:0 auto;padding:28px 20px 40px}
.section-hdr{display:flex;align-items:center;gap:10px;margin-bottom:18px;margin-top:36px}
.section-hdr:first-child{margin-top:0}
.section-hdr .icon-box{width:34px;height:34px;border-radius:var(--radius-xs);display:flex;align-items:center;justify-content:center;font-size:.8rem}
.section-hdr h2{font-size:1.05rem;font-weight:800;letter-spacing:-.3px}
.section-hdr .line{flex:1;height:1px;background:var(--border)}

.hero{position:relative;border-radius:var(--radius);overflow:hidden;padding:40px 44px;margin-bottom:10px;border:1px solid var(--border-accent);background:linear-gradient(135deg,rgba(var(--accent-rgb),.08),rgba(var(--accent-rgb),.02) 60%,transparent)}
.hero::before{content:'';position:absolute;top:-80px;right:-80px;width:260px;height:260px;background:radial-gradient(circle,rgba(var(--accent-rgb),.18),transparent 70%);border-radius:50%}
.hero::after{content:'';position:absolute;bottom:-40px;left:30%;width:180px;height:180px;background:radial-gradient(circle,rgba(99,102,241,.1),transparent 70%);border-radius:50%}
.hero-eyebrow{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:99px;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--accent);background:rgba(var(--accent-rgb),.1);margin-bottom:16px}
.hero h1{font-size:2.4rem;font-weight:900;letter-spacing:-.8px;line-height:1.15;margin-bottom:6px}
.hero h1 span{background:linear-gradient(135deg,var(--accent),#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero-sub{color:var(--text2);font-size:.88rem;max-width:500px;line-height:1.6}
.hero-chips{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:99px;font-size:.65rem;font-weight:600;background:rgba(255,255,255,.04);border:1px solid var(--border);color:var(--text2)}
.chip i{font-size:.6rem}
.chip-green{color:#4ade80;border-color:rgba(34,197,94,.15);background:rgba(34,197,94,.06)}

.notice{display:flex;align-items:center;gap:12px;padding:14px 20px;border-radius:var(--radius-sm);margin-bottom:10px;font-size:.8rem;font-weight:500}
.notice-success{background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.12);color:#4ade80}
.notice .dismiss{margin-left:auto;cursor:pointer;opacity:.4;transition:.2s;background:none;border:none;color:inherit;font-size:.85rem}
.notice .dismiss:hover{opacity:1}

.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:22px;position:relative;overflow:hidden;transition:all .25s;cursor:default}
.stat-card:hover{background:var(--card-hover);border-color:rgba(255,255,255,.08);transform:translateY(-2px);box-shadow:var(--shadow)}
.stat-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;border-radius:0 0 var(--radius) var(--radius)}
.sc-1::after{background:var(--accent)}.sc-2::after{background:#6366f1}.sc-3::after{background:#8b5cf6}
.sc-4::after{background:#f59e0b}.sc-5::after{background:#ef4444}.sc-6::after{background:#22c55e}
.stat-icon{width:40px;height:40px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font-size:.9rem;margin-bottom:14px}
.stat-val{font-size:1.55rem;font-weight:900;letter-spacing:-.5px;margin-bottom:2px;line-height:1.2}
.stat-lbl{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:var(--text3)}
.stat-change{font-size:.62rem;font-weight:600;margin-top:6px;display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:99px}
.stat-up{color:#4ade80;background:rgba(34,197,94,.1)}
.tag{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:99px;font-size:.62rem;font-weight:700;text-transform:uppercase}
.tag-green{background:rgba(34,197,94,.1);color:#4ade80}

.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.d-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;transition:box-shadow .25s}
.d-card:hover{box-shadow:var(--shadow)}
.d-card-hdr{padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;font-size:.82rem;font-weight:700}
.d-card-hdr i{color:var(--accent);font-size:.75rem}
.d-card-body{padding:6px 20px}
.d-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.03)}
.d-row:last-child{border-bottom:none}
.d-key{font-size:.72rem;color:var(--text3);font-weight:600;display:flex;align-items:center;gap:6px}
.d-key i{width:14px;text-align:center}
.d-val{font-size:.78rem;font-weight:600}
.d-val code{background:rgba(var(--accent-rgb),.08);color:var(--accent);padding:2px 8px;border-radius:4px;font-size:.7rem;font-family:'JetBrains Mono',monospace}

.products-filter{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
.filter-btn{padding:6px 14px;border-radius:99px;font-size:.68rem;font-weight:700;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;transition:all .2s;font-family:inherit}
.filter-btn:hover{border-color:rgba(255,255,255,.12);color:var(--text)}
.filter-btn.active{background:rgba(var(--accent-rgb),.1);border-color:rgba(var(--accent-rgb),.2);color:var(--accent)}
.products-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.p-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;transition:all .3s;position:relative}
.p-card:hover{transform:translateY(-3px);box-shadow:var(--shadow);border-color:rgba(255,255,255,.1)}
.p-thumb{height:110px;position:relative;display:flex;align-items:center;justify-content:center;font-size:2rem}
.p-cat{position:absolute;top:10px;right:10px;padding:3px 10px;border-radius:99px;font-size:.55rem;font-weight:800;text-transform:uppercase;letter-spacing:.5px;background:rgba(0,0,0,.5);backdrop-filter:blur(8px);color:#fff}
.p-body{padding:16px}
.p-name{font-size:.88rem;font-weight:800;margin-bottom:4px;letter-spacing:-.2px}
.p-desc{font-size:.68rem;color:var(--text3);line-height:1.5;margin-bottom:12px}
.p-footer{display:flex;align-items:center;justify-content:space-between}
.p-price{font-size:1rem;font-weight:900;color:var(--accent)}
.p-price span{font-size:.6rem;font-weight:600;color:var(--text3)}
.deploy-btn{padding:7px 16px;border-radius:var(--radius-xs);font-size:.7rem;font-weight:700;border:none;cursor:pointer;transition:all .2s;font-family:inherit;color:#fff;background:linear-gradient(135deg,rgba(var(--accent-rgb),.85),rgba(var(--accent-rgb),.65));box-shadow:0 2px 8px rgba(var(--accent-rgb),.2)}
.deploy-btn:hover{box-shadow:0 4px 16px rgba(var(--accent-rgb),.35);transform:translateY(-1px)}
.deploy-btn:active{transform:scale(.96)}
.deploy-btn.loading{opacity:.6;pointer-events:none}

.lt-panel{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:28px;position:relative;overflow:hidden}
.lt-panel::before{content:'';position:absolute;top:0;right:0;width:200px;height:200px;background:radial-gradient(circle,rgba(var(--accent-rgb),.05),transparent 70%);border-radius:50%}
.lt-config{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin-bottom:24px}
.lt-field{display:flex;flex-direction:column;gap:5px}
.lt-field label{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text3)}
.lt-field input,.lt-field select{padding:9px 14px;border-radius:var(--radius-xs);border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:.82rem;font-weight:600;font-family:inherit;outline:none;transition:border-color .2s;min-width:100px}
.lt-field input:focus,.lt-field select:focus{border-color:var(--accent)}
.lt-start{padding:10px 28px;border-radius:var(--radius-xs);border:none;font-size:.8rem;font-weight:800;font-family:inherit;cursor:pointer;color:#fff;background:linear-gradient(135deg,rgba(var(--accent-rgb),.9),rgba(var(--accent-rgb),.7));box-shadow:0 2px 12px rgba(var(--accent-rgb),.25);transition:all .2s;text-transform:uppercase;letter-spacing:.5px}
.lt-start:hover{box-shadow:0 4px 20px rgba(var(--accent-rgb),.4);transform:translateY(-1px)}
.lt-start:active{transform:scale(.97)}
.lt-start:disabled{opacity:.5;pointer-events:none}
.lt-progress{margin-bottom:20px;display:none}
.lt-progress.show{display:block}
.lt-pbar-outer{height:8px;border-radius:99px;background:rgba(255,255,255,.04);overflow:hidden;margin-top:8px}
.lt-pbar-inner{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent),#818cf8);transition:width .15s;width:0%}
.lt-pbar-label{display:flex;justify-content:space-between;font-size:.68rem;font-weight:600;color:var(--text2);margin-top:6px}
.lt-results{display:none}
.lt-results.show{display:block}
.lt-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
.lt-stat{background:var(--surface);border-radius:var(--radius-sm);padding:14px;text-align:center}
.lt-stat-val{font-size:1.2rem;font-weight:900;margin-bottom:2px}
.lt-stat-lbl{font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text3)}
.lt-dist{display:flex;flex-direction:column;gap:8px}
.lt-bar{display:flex;align-items:center;gap:10px}
.lt-bar-label{font-size:.72rem;font-weight:700;min-width:50px;color:var(--text2)}
.lt-bar-track{flex:1;height:24px;border-radius:var(--radius-xs);background:rgba(255,255,255,.03);overflow:hidden;position:relative}
.lt-bar-fill{height:100%;border-radius:var(--radius-xs);transition:width .4s ease;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;font-size:.65rem;font-weight:800;color:#fff;min-width:fit-content}
.lt-bar-count{font-size:.72rem;font-weight:700;min-width:30px;text-align:right}

.console{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.console-hdr{padding:10px 18px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
.console-dots{display:flex;gap:6px}
.console-dots span{width:11px;height:11px;border-radius:50%}
.console-title{font-size:.72rem;font-weight:700;color:var(--text3);font-family:'JetBrains Mono',monospace}
.console-actions{margin-left:auto;display:flex;gap:6px}
.console-act{padding:3px 10px;border-radius:4px;font-size:.6rem;font-weight:700;border:1px solid var(--border);background:transparent;color:var(--text3);cursor:pointer;font-family:inherit;transition:all .2s}
.console-act:hover{color:var(--text);border-color:rgba(255,255,255,.12)}
.console-body{padding:14px 18px;max-height:260px;overflow-y:auto;font-family:'JetBrains Mono',monospace;font-size:.7rem;line-height:2}
.log-line{display:flex;gap:10px;opacity:0;animation:logIn .3s ease forwards}
@keyframes logIn{to{opacity:1}}
.log-time{color:var(--text3);min-width:72px;flex-shrink:0}
.log-ok{color:#4ade80}.log-info{color:#60a5fa}.log-warn{color:#fbbf24}.log-err{color:#f87171}

.footer{text-align:center;padding:32px 0 16px;font-size:.68rem;color:var(--text3);border-top:1px solid var(--border);margin-top:40px}
.footer a{color:var(--accent);text-decoration:none}

.toast-rack{position:fixed;top:66px;right:20px;z-index:200;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.toast{padding:12px 18px;border-radius:var(--radius-sm);font-size:.76rem;font-weight:600;color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.5);display:flex;align-items:center;gap:8px;animation:tIn .35s cubic-bezier(.21,1.02,.73,1),tOut .4s ease 2.5s forwards;backdrop-filter:blur(10px);pointer-events:auto}
.toast-ok{background:rgba(34,197,94,.9)}.toast-info{background:rgba(59,130,246,.9)}.toast-warn{background:rgba(245,158,11,.9)}
@keyframes tIn{from{opacity:0;transform:translateX(40px) scale(.9)}to{opacity:1;transform:translateX(0) scale(1)}}
@keyframes tOut{to{opacity:0;transform:translateX(40px) scale(.9)}}

@media(max-width:800px){
  .stats-grid{grid-template-columns:repeat(2,1fr)}
  .detail-grid{grid-template-columns:1fr}
  .lt-stats{grid-template-columns:repeat(2,1fr)}
  .lt-config{flex-direction:column;align-items:stretch}
  .hero h1{font-size:1.7rem}
  .hero{padding:28px 24px}
}
@media(max-width:500px){
  .stats-grid{grid-template-columns:1fr}
  .products-grid{grid-template-columns:1fr}
  .navbar{padding:0 14px}
  .nav-links{display:none}
}
</style>
</head>
<body>

<div class="bg-mesh">
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>
</div>

<nav class="navbar">
  <div class="nav-brand">
    <div class="nav-dot"></div>
    <span class="nav-name">${inst.name}</span>
    <span class="nav-tag">${inst.type}</span>
  </div>
  <div class="nav-links">
    <button class="nav-link active" onclick="scrollTo('#sec-overview')">Overview</button>
    <button class="nav-link" onclick="scrollTo('#sec-market')">Marketplace</button>
    <button class="nav-link" onclick="scrollTo('#sec-test')">Load Test</button>
    <button class="nav-link" onclick="scrollTo('#sec-console')">Console</button>
  </div>
  <div class="nav-right">
    <div class="req-badge"><i class="fas fa-exchange-alt"></i> <span id="navReq">${reqCount}</span> reqs</div>
  </div>
</nav>

<div class="container">

  <div class="hero" id="sec-overview">
    <div class="hero-eyebrow"><i class="fas fa-circle" style="font-size:.45rem"></i> Active Instance — ${inst.zone}</div>
    <h1>Welcome to <span>${inst.name}</span></h1>
    <p class="hero-sub">This response was served by <strong>${inst.name}</strong> via the Intelligent Load Balancer. Every page load and interaction generates traffic for load distribution testing.</p>
    <div class="hero-chips">
      <span class="chip chip-green"><i class="fas fa-heart"></i> Healthy</span>
      <span class="chip"><i class="fas fa-map-marker-alt"></i> ${inst.region}</span>
      <span class="chip"><i class="fas fa-network-wired"></i> ${inst.ip}</span>
      <span class="chip"><i class="fas fa-clock"></i> ${processingTime}ms</span>
      <span class="chip"><i class="fas fa-user"></i> ${clientIp}</span>
    </div>
  </div>

  <div class="notice notice-success" id="lbNotice">
    <i class="fas fa-check-circle"></i>
    <span>Routed through <strong>Intelligent Load Balancer :8000</strong> &rarr; <strong>${inst.name} :${PORT}</strong> &nbsp;|&nbsp; Processing: ${processingTime}ms</span>
    <button class="dismiss" onclick="document.getElementById('lbNotice').style.display='none'"><i class="fas fa-times"></i></button>
  </div>

  <div class="section-hdr"><div class="icon-box" style="background:rgba(var(--accent-rgb),.1);color:var(--accent)"><i class="fas fa-chart-bar"></i></div><h2>Statistics</h2><div class="line"></div></div>
  <div class="stats-grid">
    <div class="stat-card sc-1">
      <div class="stat-icon" style="background:rgba(var(--accent-rgb),.1);color:var(--accent)"><i class="fas fa-exchange-alt"></i></div>
      <div class="stat-val" id="statReqs">${reqCount}</div>
      <div class="stat-lbl">Total Requests</div>
      <div class="stat-change stat-up"><i class="fas fa-arrow-up"></i> live</div>
    </div>
    <div class="stat-card sc-2">
      <div class="stat-icon" style="background:rgba(99,102,241,.1);color:#818cf8"><i class="fas fa-bolt"></i></div>
      <div class="stat-val">${processingTime}<span style="font-size:.7rem;color:var(--text3)"> ms</span></div>
      <div class="stat-lbl">Response Time</div>
      <div class="stat-change stat-up"><i class="fas fa-arrow-up"></i> fast</div>
    </div>
    <div class="stat-card sc-3">
      <div class="stat-icon" style="background:rgba(139,92,246,.1);color:#a78bfa"><i class="fas fa-clock"></i></div>
      <div class="stat-val" id="statUptime">0s</div>
      <div class="stat-lbl">Uptime</div>
    </div>
    <div class="stat-card sc-4">
      <div class="stat-icon" style="background:rgba(245,158,11,.1);color:#fbbf24"><i class="fas fa-globe-asia"></i></div>
      <div class="stat-val" style="font-size:1.1rem">${inst.region}</div>
      <div class="stat-lbl">Region</div>
    </div>
    <div class="stat-card sc-5">
      <div class="stat-icon" style="background:rgba(239,68,68,.1);color:#f87171"><i class="fas fa-microchip"></i></div>
      <div class="stat-val">${inst.type}</div>
      <div class="stat-lbl">Instance Type</div>
    </div>
    <div class="stat-card sc-6">
      <div class="stat-icon" style="background:rgba(34,197,94,.1);color:#4ade80"><i class="fas fa-heart"></i></div>
      <div class="stat-val"><span class="tag tag-green"><i class="fas fa-check-circle"></i> Healthy</span></div>
      <div class="stat-lbl">Health Status</div>
    </div>
  </div>

  <div class="section-hdr"><div class="icon-box" style="background:rgba(99,102,241,.1);color:#818cf8"><i class="fas fa-info-circle"></i></div><h2>Instance Details</h2><div class="line"></div></div>
  <div class="detail-grid">
    <div class="d-card">
      <div class="d-card-hdr"><i class="fas fa-server"></i> Configuration</div>
      <div class="d-card-body">
        <div class="d-row"><span class="d-key"><i class="fas fa-tag"></i> Instance ID</span><span class="d-val"><code>${inst.id}</code></span></div>
        <div class="d-row"><span class="d-key"><i class="fas fa-network-wired"></i> Private IP</span><span class="d-val">${inst.ip}</span></div>
        <div class="d-row"><span class="d-key"><i class="fas fa-globe"></i> Domain</span><span class="d-val" style="font-size:.68rem">${inst.domain}</span></div>
        <div class="d-row"><span class="d-key"><i class="fas fa-map-marker-alt"></i> AZ</span><span class="d-val">${inst.zone}</span></div>
        <div class="d-row"><span class="d-key"><i class="fas fa-plug"></i> Port</span><span class="d-val">${PORT}</span></div>
        <div class="d-row"><span class="d-key"><i class="fas fa-user"></i> Client IP</span><span class="d-val">${clientIp}</span></div>
      </div>
    </div>
    <div class="d-card">
      <div class="d-card-hdr"><i class="fas fa-shield-alt"></i> Health Check</div>
      <div class="d-card-body">
        <div class="d-row"><span class="d-key"><i class="fas fa-link"></i> Protocol</span><span class="d-val">HTTP</span></div>
        <div class="d-row"><span class="d-key"><i class="fas fa-route"></i> Path</span><span class="d-val"><code>/health</code></span></div>
        <div class="d-row"><span class="d-key"><i class="fas fa-stopwatch"></i> Interval</span><span class="d-val">5 seconds</span></div>
        <div class="d-row"><span class="d-key"><i class="fas fa-hourglass-half"></i> Timeout</span><span class="d-val">3 seconds</span></div>
        <div class="d-row"><span class="d-key"><i class="fas fa-check-double"></i> Healthy</span><span class="d-val">2 consecutive</span></div>
        <div class="d-row"><span class="d-key"><i class="fas fa-times-circle"></i> Unhealthy</span><span class="d-val">3 consecutive</span></div>
      </div>
    </div>
  </div>

  <div class="section-hdr" id="sec-market"><div class="icon-box" style="background:rgba(168,85,247,.1);color:#c084fc"><i class="fas fa-store"></i></div><h2>Cloud Marketplace</h2><div class="line"></div></div>
  <p style="font-size:.78rem;color:var(--text2);margin-bottom:16px">Each <strong>Deploy</strong> sends an API request through the Load Balancer — watch the server distribution in real-time!</p>
  <div class="products-filter">
    <button class="filter-btn active" onclick="filterProducts('all',this)">All</button>
    <button class="filter-btn" onclick="filterProducts('compute',this)">Compute</button>
    <button class="filter-btn" onclick="filterProducts('storage',this)">Storage</button>
    <button class="filter-btn" onclick="filterProducts('network',this)">Network</button>
    <button class="filter-btn" onclick="filterProducts('database',this)">Database</button>
    <button class="filter-btn" onclick="filterProducts('security',this)">Security</button>
  </div>
  <div class="products-grid" id="productsGrid">
    <div class="p-card" data-cat="compute">
      <div class="p-thumb" style="background:linear-gradient(135deg,#6366f1,#8b5cf6)"><span class="p-cat">Compute</span>&#9889;</div>
      <div class="p-body"><div class="p-name">Lambda Pro</div><div class="p-desc">Serverless compute with auto-scaling and zero cold starts</div><div class="p-footer"><span class="p-price">$29<span>/mo</span></span><button class="deploy-btn" onclick="deployProduct(this,'Lambda Pro')"><i class="fas fa-rocket"></i> Deploy</button></div></div>
    </div>
    <div class="p-card" data-cat="storage">
      <div class="p-thumb" style="background:linear-gradient(135deg,#0ea5e9,#06b6d4)"><span class="p-cat">Storage</span>&#128230;</div>
      <div class="p-body"><div class="p-name">S3 Infinite</div><div class="p-desc">Unlimited object storage with 99.999% durability guarantee</div><div class="p-footer"><span class="p-price">$19<span>/mo</span></span><button class="deploy-btn" onclick="deployProduct(this,'S3 Infinite')"><i class="fas fa-rocket"></i> Deploy</button></div></div>
    </div>
    <div class="p-card" data-cat="network">
      <div class="p-thumb" style="background:linear-gradient(135deg,#10b981,#34d399)"><span class="p-cat">Network</span>&#127760;</div>
      <div class="p-body"><div class="p-name">CloudFront CDN</div><div class="p-desc">Global content delivery with edge locations worldwide</div><div class="p-footer"><span class="p-price">$39<span>/mo</span></span><button class="deploy-btn" onclick="deployProduct(this,'CloudFront CDN')"><i class="fas fa-rocket"></i> Deploy</button></div></div>
    </div>
    <div class="p-card" data-cat="database">
      <div class="p-thumb" style="background:linear-gradient(135deg,#f59e0b,#f97316)"><span class="p-cat">Database</span>&#128202;</div>
      <div class="p-body"><div class="p-name">RDS Aurora</div><div class="p-desc">MySQL-compatible relational database with multi-AZ failover</div><div class="p-footer"><span class="p-price">$49<span>/mo</span></span><button class="deploy-btn" onclick="deployProduct(this,'RDS Aurora')"><i class="fas fa-rocket"></i> Deploy</button></div></div>
    </div>
    <div class="p-card" data-cat="compute">
      <div class="p-thumb" style="background:linear-gradient(135deg,#ec4899,#f43f5e)"><span class="p-cat">Compute</span>&#9881;&#65039;</div>
      <div class="p-body"><div class="p-name">ECS Fargate</div><div class="p-desc">Serverless container orchestration without managing clusters</div><div class="p-footer"><span class="p-price">$35<span>/mo</span></span><button class="deploy-btn" onclick="deployProduct(this,'ECS Fargate')"><i class="fas fa-rocket"></i> Deploy</button></div></div>
    </div>
    <div class="p-card" data-cat="security">
      <div class="p-thumb" style="background:linear-gradient(135deg,#64748b,#475569)"><span class="p-cat">Security</span>&#128274;</div>
      <div class="p-body"><div class="p-name">WAF Shield</div><div class="p-desc">Web application firewall with DDoS protection and rate limiting</div><div class="p-footer"><span class="p-price">$44<span>/mo</span></span><button class="deploy-btn" onclick="deployProduct(this,'WAF Shield')"><i class="fas fa-rocket"></i> Deploy</button></div></div>
    </div>
    <div class="p-card" data-cat="network">
      <div class="p-thumb" style="background:linear-gradient(135deg,#2dd4bf,#14b8a6)"><span class="p-cat">Network</span>&#128268;</div>
      <div class="p-body"><div class="p-name">API Gateway</div><div class="p-desc">Managed REST and WebSocket APIs with authentication</div><div class="p-footer"><span class="p-price">$25<span>/mo</span></span><button class="deploy-btn" onclick="deployProduct(this,'API Gateway')"><i class="fas fa-rocket"></i> Deploy</button></div></div>
    </div>
    <div class="p-card" data-cat="storage">
      <div class="p-thumb" style="background:linear-gradient(135deg,#a78bfa,#7c3aed)"><span class="p-cat">Storage</span>&#128200;</div>
      <div class="p-body"><div class="p-name">ElastiCache</div><div class="p-desc">In-memory caching with Redis and Memcached compatibility</div><div class="p-footer"><span class="p-price">$34<span>/mo</span></span><button class="deploy-btn" onclick="deployProduct(this,'ElastiCache')"><i class="fas fa-rocket"></i> Deploy</button></div></div>
    </div>
  </div>

  <div class="section-hdr" id="sec-test"><div class="icon-box" style="background:rgba(239,68,68,.1);color:#f87171"><i class="fas fa-vial"></i></div><h2>Load Test</h2><div class="line"></div></div>
  <p style="font-size:.78rem;color:var(--text2);margin-bottom:16px">Fire multiple requests through the Load Balancer and see how traffic is distributed across EC2 instances.</p>
  <div class="lt-panel">
    <div class="lt-config">
      <div class="lt-field">
        <label>Requests</label>
        <input type="number" id="ltCount" value="20" min="1" max="200">
      </div>
      <div class="lt-field">
        <label>Concurrency</label>
        <select id="ltConc">
          <option value="1">1 (Sequential)</option>
          <option value="5" selected>5 Parallel</option>
          <option value="10">10 Parallel</option>
          <option value="20">20 Parallel</option>
        </select>
      </div>
      <div class="lt-field">
        <label>Target</label>
        <input type="text" value="Load Balancer :8000" readonly style="color:var(--text3);min-width:160px">
      </div>
      <button class="lt-start" id="ltStartBtn" onclick="startLoadTest()"><i class="fas fa-play"></i> &nbsp;Start Test</button>
    </div>
    <div class="lt-progress" id="ltProgress">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:.72rem;font-weight:700;color:var(--accent)">Running...</span>
        <span style="font-size:.68rem;color:var(--text3)" id="ltProgressText">0 / 0</span>
      </div>
      <div class="lt-pbar-outer"><div class="lt-pbar-inner" id="ltBar"></div></div>
    </div>
    <div class="lt-results" id="ltResults">
      <div class="lt-stats">
        <div class="lt-stat"><div class="lt-stat-val" id="ltSent" style="color:var(--accent)">0</div><div class="lt-stat-lbl">Sent</div></div>
        <div class="lt-stat"><div class="lt-stat-val" id="ltOk" style="color:#4ade80">0</div><div class="lt-stat-lbl">Success</div></div>
        <div class="lt-stat"><div class="lt-stat-val" id="ltFail" style="color:#f87171">0</div><div class="lt-stat-lbl">Failed</div></div>
        <div class="lt-stat"><div class="lt-stat-val" id="ltAvg" style="color:#818cf8">0ms</div><div class="lt-stat-lbl">Avg Time</div></div>
      </div>
      <div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:10px">Server Distribution</div>
      <div class="lt-dist" id="ltDist"></div>
    </div>
  </div>

  <div class="section-hdr" id="sec-console"><div class="icon-box" style="background:rgba(34,197,94,.1);color:#4ade80"><i class="fas fa-terminal"></i></div><h2>Activity Console</h2><div class="line"></div></div>
  <div class="console">
    <div class="console-hdr">
      <div class="console-dots"><span style="background:#ef4444"></span><span style="background:#f59e0b"></span><span style="background:#22c55e"></span></div>
      <span class="console-title">${inst.id}@${inst.zone} ~</span>
      <div class="console-actions">
        <button class="console-act" onclick="clearConsole()">Clear</button>
        <button class="console-act" onclick="toggleAutoScroll()">Auto-scroll</button>
      </div>
    </div>
    <div class="console-body" id="consoleBody">
      <div class="log-line"><span class="log-time">${now.toLocaleTimeString()}</span><span class="log-ok">[BOOT] ${inst.name} ready — serving on port ${PORT}</span></div>
      <div class="log-line"><span class="log-time">${now.toLocaleTimeString()}</span><span class="log-info">[REQ]  #${reqCount} from ${clientIp} — ${processingTime}ms</span></div>
    </div>
  </div>

  <div class="footer">
    <p style="margin-bottom:4px"><strong>${inst.name}</strong> &nbsp;&bull;&nbsp; ${inst.ip} &nbsp;&bull;&nbsp; ${inst.zone}</p>
    <p>&copy; 2026 Intelligent Load Balancer &mdash; University Networking Project &nbsp;|&nbsp; No data is stored, all interactions are simulated</p>
  </div>
</div>

<div class="toast-rack" id="toastRack"></div>

<script>
var localReq = ${reqCount};
var autoScroll = true;
var testRunning = false;

function scrollTo(sel) {
  var el = document.querySelector(sel);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelectorAll('.nav-link').forEach(function(n) { n.classList.remove('active'); });
  event.target.classList.add('active');
}

function toast(msg, type) {
  var rack = document.getElementById('toastRack');
  var t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'info');
  t.innerHTML = '<i class="fas fa-' + (type==='ok'?'check-circle':type==='warn'?'exclamation-triangle':'info-circle') + '"></i> ' + msg;
  rack.appendChild(t);
  setTimeout(function() { t.remove(); }, 3200);
}

function addLog(text, cls) {
  var body = document.getElementById('consoleBody');
  var line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = '<span class="log-time">' + new Date().toLocaleTimeString() + '</span><span class="' + (cls||'log-info') + '">' + text + '</span>';
  body.appendChild(line);
  if (autoScroll) body.scrollTop = body.scrollHeight;
}

function clearConsole() { document.getElementById('consoleBody').innerHTML = ''; addLog('[SYS]  Console cleared', 'log-warn'); }
function toggleAutoScroll() { autoScroll = !autoScroll; toast('Auto-scroll: ' + (autoScroll ? 'ON' : 'OFF'), 'info'); }

function bumpReq() {
  localReq++;
  document.getElementById('navReq').textContent = localReq;
  document.getElementById('statReqs').textContent = localReq;
}

var bootTime = Date.now();
setInterval(function() {
  var s = Math.floor((Date.now() - bootTime) / 1000);
  var m = Math.floor(s / 60); s = s % 60;
  document.getElementById('statUptime').textContent = (m > 0 ? m + 'm ' : '') + s + 's';
}, 1000);

function filterProducts(cat, btn) {
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  document.querySelectorAll('.p-card').forEach(function(c) {
    c.style.display = (cat === 'all' || c.dataset.cat === cat) ? '' : 'none';
  });
}

function deployProduct(btn, name) {
  if (btn.classList.contains('loading')) return;
  btn.classList.add('loading');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deploying...';
  var start = Date.now();

  fetch('/api/deploy?product=' + encodeURIComponent(name))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var ms = Date.now() - start;
      bumpReq();
      addLog('[DEPLOY] ' + name + ' -> ' + d.server + ' (' + ms + 'ms)', 'log-ok');
      toast(name + ' deployed via ' + d.server, 'ok');
      btn.classList.remove('loading');
      btn.innerHTML = '<i class="fas fa-check"></i> Deployed';
      setTimeout(function() { btn.innerHTML = '<i class="fas fa-rocket"></i> Deploy'; }, 1800);
    })
    .catch(function() {
      addLog('[DEPLOY] ' + name + ' FAILED', 'log-err');
      toast('Deploy failed — server may be down', 'warn');
      btn.classList.remove('loading');
      btn.innerHTML = '<i class="fas fa-rocket"></i> Deploy';
    });
}

function startLoadTest() {
  if (testRunning) return;
  testRunning = true;

  var total = Math.min(Math.max(parseInt(document.getElementById('ltCount').value) || 20, 1), 200);
  var conc = parseInt(document.getElementById('ltConc').value) || 5;

  document.getElementById('ltStartBtn').disabled = true;
  document.getElementById('ltProgress').classList.add('show');
  document.getElementById('ltResults').classList.remove('show');
  document.getElementById('ltBar').style.width = '0%';

  var sent = 0, ok = 0, fail = 0, times = [];
  var dist = {};

  addLog('[TEST]  Starting load test: ' + total + ' requests, concurrency ' + conc, 'log-warn');

  function updateProgress() {
    var pct = Math.round((sent / total) * 100);
    document.getElementById('ltBar').style.width = pct + '%';
    document.getElementById('ltProgressText').textContent = sent + ' / ' + total;
  }

  function showResults() {
    testRunning = false;
    document.getElementById('ltStartBtn').disabled = false;
    document.getElementById('ltProgress').classList.remove('show');
    document.getElementById('ltResults').classList.add('show');

    document.getElementById('ltSent').textContent = sent;
    document.getElementById('ltOk').textContent = ok;
    document.getElementById('ltFail').textContent = fail;

    var avg = times.length ? Math.round(times.reduce(function(a,b){return a+b;},0) / times.length) : 0;
    document.getElementById('ltAvg').textContent = avg + 'ms';

    var distEl = document.getElementById('ltDist');
    distEl.innerHTML = '';
    var maxCount = Math.max.apply(null, Object.values(dist).concat([1]));
    var colors = { 'EC2-1': '#2dd4bf', 'EC2-2': '#3b82f6', 'EC2-3': '#f59e0b' };

    Object.keys(dist).sort().forEach(function(srv) {
      var count = dist[srv];
      var pct = Math.round((count / maxCount) * 100);
      var bar = document.createElement('div');
      bar.className = 'lt-bar';
      bar.innerHTML = '<span class="lt-bar-label">' + srv + '</span>' +
        '<div class="lt-bar-track"><div class="lt-bar-fill" style="width:' + pct + '%;background:' + (colors[srv]||'var(--accent)') + '">' + count + '</div></div>' +
        '<span class="lt-bar-count">' + Math.round((count/sent)*100) + '%</span>';
      distEl.appendChild(bar);
    });

    addLog('[TEST]  Completed — ' + ok + ' ok, ' + fail + ' fail, avg ' + avg + 'ms', ok > fail ? 'log-ok' : 'log-err');
    toast('Load test done: ' + ok + '/' + total + ' success', ok === total ? 'ok' : 'warn');
  }

  var queue = [];
  for (var i = 0; i < total; i++) queue.push(i);

  function runBatch() {
    if (queue.length === 0 && sent >= total) { showResults(); return; }
    var batch = queue.splice(0, conc);
    var promises = batch.map(function() {
      var start = Date.now();
      return fetch('/api/ping?t=' + Date.now())
        .then(function(r) { return r.json(); })
        .then(function(d) {
          var ms = Date.now() - start;
          sent++; ok++; times.push(ms);
          var srv = d.server || 'unknown';
          dist[srv] = (dist[srv] || 0) + 1;
          bumpReq();
          updateProgress();
        })
        .catch(function() { sent++; fail++; updateProgress(); });
    });
    Promise.all(promises).then(function() { setTimeout(runBatch, 50); });
  }
  runBatch();
}
</script>
</body>
</html>`;
}

// ── API routes (mỗi request qua LB đều được đếm) ─────────────────────────
app.get('/api/:action', (req, res) => {
  const start = Date.now();
  const delay = Math.floor(Math.random() * 80) + 10;
  setTimeout(() => {
    res.json({
      ok: true,
      server: SERVER_NAME,
      id: SERVER_ID,
      action: req.params.action,
      query: req.query,
      timestamp: Date.now(),
      processingTime: Date.now() - start
    });
  }, delay);
});

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

    // Chỉ gửi log khi request KHÔNG đi qua Node LB (tức đi qua AWS ALB thật)
    const viaNodeLB = req.headers['x-load-balancer'];
    if (!viaNodeLB) {
      const duration = Date.now() - startTime;
      reportToLBDashboard({ clientIp, duration, path: req.path });
    }
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
