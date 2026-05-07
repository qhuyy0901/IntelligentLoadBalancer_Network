'use strict';

const http = require('http');
const os = require('os');

// Configuration
const port = process.env.PORT || 3000;
const serverName = os.hostname();
const startedAt = new Date();
let requestCount = 0;

// AWS IMDS (Metadata Service)
let ec2Metadata = {
  instanceId: 'i-00000000000000000',
  localIpv4: '127.0.0.1',
  az: 'local-zone'
};

function fetchMetadata(path) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: '169.254.169.254',
        path: path,
        method: 'GET',
        timeout: 1000
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function initMetadata() {
  try {
    const tokenRes = await fetchMetadata('/latest/api/token');
    // For simplicity, we just fallback if IMDSv2 requires token
    const iid = await fetchMetadata('/latest/meta-data/instance-id');
    const ip = await fetchMetadata('/latest/meta-data/local-ipv4');
    const az = await fetchMetadata('/latest/meta-data/placement/availability-zone');
    if (iid) ec2Metadata.instanceId = iid;
    if (ip) ec2Metadata.localIpv4 = ip;
    if (az) ec2Metadata.az = az;
  } catch (e) { }
}

initMetadata();

function buildPage() {
  const metaInjected = JSON.stringify({ serverName, metadata: ec2Metadata });

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Network Tools HUY</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>">
  <style>
    :root {
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --primary-dark: #1e3a8a;
      --secondary: #0ea5e9;
      --accent: #38bdf8;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --success: #10b981;
      --error: #ef4444;
      --warning: #f59e0b;
      --radius: 12px;
      --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      --ipv4: #3b82f6;
      --vlsm: #10b981;
      --quiz: #ec4899;
      --ipv6: #8b5cf6;
      --cidr: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: 'Inter', system-ui, -apple-system, sans-serif; 
      background: #f8fafc; 
      color: var(--text); 
      line-height: 1.5; 
      border-top: 5px solid var(--primary);
      position: relative;
      overflow-x: hidden;
    }
    body::before {
      content: '';
      position: absolute;
      top: -100px;
      right: -100px;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(37,99,235,0.05) 0%, transparent 70%);
      z-index: -1;
    }
    body::after {
      content: '';
      position: absolute;
      bottom: -100px;
      left: -100px;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(236,72,153,0.05) 0%, transparent 70%);
      z-index: -1;
    }
    
    .navbar { background: var(--card-bg); border-bottom: 2px solid #edf2f7; position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); }
    .nav-container { max-width: 1350px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 16px; height: 60px; gap: 10px; }
    .logo { font-size: 1.1rem; font-weight: 800; color: var(--primary-dark); display: flex; align-items: center; gap: 6px; flex-shrink: 0; white-space: nowrap; }
    
    .nav-links { display: flex; gap: 2px; height: 100%; overflow-x: auto; white-space: nowrap; scrollbar-width: none; }
    .nav-links::-webkit-scrollbar { display: none; }
    .nav-link { background: none; border: none; padding: 0 8px; font-weight: 600; color: var(--text-muted); cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.2s; font-size: 0.82rem; flex-shrink: 0; white-space: nowrap; }
    .nav-link:hover { color: var(--primary); background: #f1f5f9; }
    .nav-link.active { color: var(--primary); border-bottom-color: var(--primary); }

    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; font-size: 0.875rem; }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn-outline { background: white; border: 1px solid var(--border); color: var(--text); }
    .btn-outline:hover { background: #f1f5f9; border-color: #cbd5e1; }
    .btn-danger { background: #fee2e2; color: var(--error); }
    .btn-danger:hover { background: #fecaca; }

    main { max-width: 1200px; margin: 32px auto; padding: 0 24px; }
    .hidden { display: none !important; }
    
    .tab-content { display: none; animation: fadeIn 0.3s ease; padding: 20px; border-radius: 24px; }
    .tab-content.active { display: block; }
    
    /* Subtle Tab Backgrounds */
    #tab-home { background: transparent; padding: 0; }
    #tab-ipv4 { background: #eff6ff; border: 1px solid #dbeafe; }
    #tab-split { background: #eff6ff; border: 1px solid #dbeafe; }
    #tab-vlsm { background: #ecfdf5; border: 1px solid #d1fae5; }
    #tab-ipv6 { background: #f5f3ff; border: 1px solid #ddd6fe; }
    #tab-cidr { background: #fffbeb; border: 1px solid #fef3c7; }
    #tab-quiz { background: #fdf2f8; border: 1px solid #fce7f3; }
    #tab-ec2 { background: #f1f5f9; border: 1px solid #e2e8f0; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    .card { background: var(--card-bg); border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow); padding: 24px; margin-bottom: 24px; transition: all 0.3s ease; }
    .card:hover { border-color: var(--primary); box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -2px rgb(0 0 0 / 0.05); transform: translateY(-2px); }
    .card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
    .card-header h2 { font-size: 1.125rem; font-weight: 700; color: var(--primary); }
    .card-header .icon { font-size: 1.5rem; }

    .grid { display: grid; gap: 24px; }
    .grid-2 { grid-template-columns: 1fr 1fr; }
    .grid-3 { grid-template-columns: repeat(3, 1fr); }
    .grid-4 { grid-template-columns: repeat(4, 1fr); }

    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 8px; color: var(--text); }
    input[type="text"], input[type="number"] { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px; font-family: inherit; font-size: 0.95rem; transition: border-color 0.2s; }
    input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }

    .data-table-wrapper { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
    .data-table, .result-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .result-table td { padding: 12px; border-bottom: 1px solid var(--border); }
    .result-table tr:last-child td { border-bottom: none; }
    .result-table td:first-child { font-weight: 600; color: var(--text-muted); width: 40%; }
    .result-table td:last-child { font-family: monospace; font-weight: 700; font-size: 0.95rem; }

    .data-table th { background: #f8fafc; padding: 12px; text-align: left; font-weight: 600; color: var(--text-muted); border-bottom: 1px solid var(--border); }
    .data-table td { padding: 12px; border-bottom: 1px solid var(--border); }
    .data-table tr:hover { background: #f1f5f9; }
    .data-table tr.highlight { background: #e0f2fe; border-left: 3px solid var(--secondary); }
    .data-table tr.highlight td:first-child { font-weight: 700; color: var(--primary-dark); }

    .badge { padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-green { background: #dcfce7; color: #166534; }

    .home-hero { 
      text-align: center; 
      padding: 60px 20px; 
      border-bottom: 1px solid var(--border); 
      margin-bottom: 48px; 
      border-radius: 0 0 40px 40px; 
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); 
      box-shadow: inset 0 -20px 20px -20px rgba(0,0,0,0.05);
    }
    .home-hero h1 { 
      font-size: 2.5rem; 
      font-weight: 900; 
      background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 20px;
      letter-spacing: -0.02em;
    }
    .home-hero p { 
      font-size: 1.1rem;
      color: var(--text-muted); 
      max-width: 700px; 
      margin: 0 auto 40px; 
      line-height: 1.6;
    }

    .stat-card { background: #f8fafc; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: all 0.3s ease; border: 1px solid var(--border); }
    .stat-card:hover { transform: translateY(-2px); border-color: var(--primary); background: white; }
    .stat-label { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value { font-size: 1.125rem; font-weight: 700; color: var(--text); font-family: monospace; }

    .quiz-options { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
    .quiz-option { padding: 16px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: all 0.2s; font-weight: 500; }
    .quiz-option:hover { background: #f1f5f9; border-color: var(--primary); transform: translateX(4px); }
    .quiz-option.selected { background: #eff6ff; border-color: var(--primary); color: var(--primary); }
    .quiz-option.correct { background: #dcfce7; border-color: var(--success); color: #166534; }
    .quiz-option.wrong { background: #fee2e2; border-color: var(--error); color: #991b1b; }

    .progress-bar { width: 100%; height: 6px; background: var(--border); border-radius: 3px; margin-top: 6px; overflow: hidden; }
    .progress-fill { height: 100%; background: var(--primary); transition: width 0.3s ease; }

    #toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 100; display: flex; flex-direction: column; gap: 8px; }
    .toast { padding: 12px 20px; border-radius: 8px; background: white; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1); border-left: 4px solid var(--primary); font-size: 0.875rem; font-weight: 600; animation: slideIn 0.3s ease; }
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

    /* Tooltip */
    .tooltip { position: relative; cursor: help; border-bottom: 1px dotted var(--text-muted); }
    .tooltip:hover::after {
      content: attr(data-tooltip);
      position: absolute; bottom: 125%; left: 50%; transform: translateX(-50%);
      background: #1e293b; color: #fff; padding: 10px 14px; border-radius: 8px;
      font-size: 0.75rem; white-space: pre-wrap; width: 240px; z-index: 1000;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); font-weight: 400; line-height: 1.4;
    }
    
    /* Copy Button */
    .btn-copy { 
      background: #f1f5f9; border: 1px solid var(--border); border-radius: 4px; 
      padding: 2px 6px; font-size: 0.7rem; cursor: pointer; margin-left: 8px; 
      transition: all 0.2s; color: var(--text-muted);
    }
    .btn-copy:hover { background: var(--primary); color: white; border-color: var(--primary); }

    /* Bit Bar */
    .bit-bar { display: flex; height: 26px; border-radius: 6px; overflow: hidden; margin: 15px 0; border: 1px solid var(--border); box-shadow: inset 0 1px 2px rgba(0,0,0,0.05); }
    .bit { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; }
    .bit-net { background: var(--ipv4); color: white; }
    .bit-host { background: #f1f5f9; color: #94a3b8; }
    
    /* Highlight Results */
    .bg-net { background: #eff6ff !important; font-weight: bold; }
    .bg-bc { background: #fff1f2 !important; font-weight: bold; }
    .note-small { font-size: 0.75rem; color: var(--text-muted); font-style: italic; margin-top: 4px; display: block; }
  </style>
</head>
<body>

<nav class="navbar">
  <div class="nav-container">
    <div class="logo" onclick="location.reload()" style="cursor:pointer" title="Tải lại trang">🌐 Network Tools</div>
    <div class="nav-links">
      <button class="nav-link active" data-tab="home">🏠 Trang chủ</button>
      <button class="nav-link" data-tab="ipv4">💻 Tính IPv4</button>
      <button class="nav-link" data-tab="split">✂️ Chia Subnet</button>
      <button class="nav-link" data-tab="vlsm">🎯 Chia VLSM</button>
      <button class="nav-link" data-tab="ipv6">🌍 Tính IPv6</button>
      <button class="nav-link" data-tab="cidr">📋 Bảng CIDR</button>
      <button class="nav-link" data-tab="checker">🔍 Kiểm tra IP</button>
      <button class="nav-link" data-tab="binary">💻 Đổi nhị phân</button>
      <button class="nav-link" data-tab="wildcard">🛡️ Wildcard</button>
      <button class="nav-link" data-tab="quiz">🧠 Luyện tập</button>
      <button class="nav-link" data-tab="ec2">☁️ EC2 / Đồ án</button>
      <button class="nav-link" onclick="location.reload()" title="Tải lại trang" style="margin-left:auto;color:var(--primary)">🔄 Tải lại</button>
    </div>
  </div>
</nav>

<main>
  <!-- HOME -->
  <section id="tab-home" class="tab-content active">
    <div class="home-hero">
      <h1>Hệ Thống Công Cụ Mạng 4.0</h1>
      <p>Giải pháp tính toán và chia mạng toàn diện dành cho sinh viên và quản trị viên mạng. Đơn giản, chính xác và chuyên nghiệp.</p>
      <div class="grid grid-3">
        <div class="card" style="cursor:pointer; text-align:center; border-width:2px; background:white; position:relative; overflow:hidden" onclick="switchTab('ipv4')">
          <div style="position:absolute; top:0; left:0; width:100%; height:4px; background:var(--ipv4)"></div>
          <div class="icon" style="font-size:3rem;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;width:80px;height:80px;background:linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);border-radius:50%;box-shadow:0 4px 12px rgba(59,130,246,0.2);color:var(--ipv4)">🌐</div>
          <h3 style="margin-bottom:12px;color:var(--primary-dark);font-size:1.25rem">Tính IPv4</h3>
          <p style="font-size:0.9rem;color:var(--text-muted);line-height:1.5">Tính toán Network, Broadcast, Hosts và Mask nhanh chóng.</p>
        </div>
        <div class="card" style="cursor:pointer; text-align:center; border-width:2px; background:white; position:relative; overflow:hidden" onclick="switchTab('vlsm')">
          <div style="position:absolute; top:0; left:0; width:100%; height:4px; background:var(--vlsm)"></div>
          <div class="icon" style="font-size:3rem;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;width:80px;height:80px;background:linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);border-radius:50%;box-shadow:0 4px 12px rgba(16,185,129,0.2);color:var(--vlsm)">📊</div>
          <h3 style="margin-bottom:12px;color:var(--primary-dark);font-size:1.25rem">Chia VLSM</h3>
          <p style="font-size:0.9rem;color:var(--text-muted);line-height:1.5">Tối ưu hóa dải mạng theo nhu cầu thực tế từng phòng ban.</p>
        </div>
        <div class="card" style="cursor:pointer; text-align:center; border-width:2px; background:white; position:relative; overflow:hidden" onclick="switchTab('quiz')">
          <div style="position:absolute; top:0; left:0; width:100%; height:4px; background:var(--quiz)"></div>
          <div class="icon" style="font-size:3rem;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;width:80px;height:80px;background:linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%);border-radius:50%;box-shadow:0 4px 12px rgba(236,72,153,0.2);color:var(--quiz)">🧠</div>
          <h3 style="margin-bottom:12px;color:var(--primary-dark);font-size:1.25rem">Luyện tập</h3>
          <p style="font-size:0.9rem;color:var(--text-muted);line-height:1.5">Kiểm tra kiến thức mạng qua hệ thống trắc nghiệm.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- IPv4 CALCULATOR -->
  <section id="tab-ipv4" class="tab-content">
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header">
          <span class="icon">💻</span>
          <h2>Tính toán IPv4</h2>
        </div>
        <div class="form-group">
          <label>Địa chỉ IP</label>
          <input type="text" id="ipv4-input" value="192.168.1.10" placeholder="VD: 192.168.1.10">
        </div>
        <div class="form-group">
          <label>Prefix / Subnet Mask (0-32)</label>
          <input type="number" id="ipv4-prefix" min="0" max="32" value="26">
        </div>
        <div style="display:flex;gap:12px;margin-top:24px">
          <button class="btn btn-primary" id="btn-calc-ipv4" style="flex:1">🚀 Tính toán</button>
          <button class="btn btn-outline" id="btn-reset-ipv4">Khôi phục</button>
        </div>
      </div>
      
      <div class="card">
        <div class="card-header">
          <span class="icon">📊</span>
          <h2>Kết quả</h2>
        </div>
        <div id="ipv4-results-empty" style="text-align:center;color:var(--text-muted);padding:40px 0">
          Nhập IP và Prefix để xem kết quả tính toán.
        </div>
        <div id="ipv4-results-box" class="hidden">
          <div id="ipv4-bit-bar-container"></div>
          <table class="result-table" id="ipv4-table">
            <!-- Populated by JS -->
          </table>
        </div>
      </div>
    </div>
  </section>

  <!-- SPLIT SUBNET -->
  <section id="tab-split" class="tab-content">
    <div class="card" style="max-width:800px;margin:0 auto">
      <div class="card-header">
        <span class="icon">✂️</span>
        <h2>Chia Subnet Đều (Equal Sized)</h2>
      </div>
      <div class="grid grid-3">
        <div class="form-group">
          <label>Network IP</label>
          <input type="text" id="split-net" value="192.168.1.0">
        </div>
        <div class="form-group">
          <label>Prefix Cũ (/x)</label>
          <input type="number" id="split-pfx-old" min="0" max="32" value="24">
        </div>
        <div class="form-group">
          <label>Prefix Mới (/y)</label>
          <input type="number" id="split-pfx-new" min="0" max="32" value="26">
        </div>
      </div>
      <button class="btn btn-primary" id="btn-calc-split" style="width:100%">Tạo danh sách Subnet</button>
      
      <div id="split-result-card" class="hidden" style="margin-top:24px">
        <table class="data-table" id="split-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Network / CIDR</th>
              <th>Gateway (Gợi ý)</th>
              <th>Dải Host (First - Last)</th>
              <th>Broadcast</th>
              <th>Usable Hosts</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- VLSM -->
  <section id="tab-vlsm" class="tab-content">
    <div class="card">
      <div class="card-header">
        <span class="icon">🎯</span>
        <h2>Tính VLSM (Variable Length Subnet Mask)</h2>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label>Major Network (VD: 192.168.0.0)</label>
          <input type="text" id="vlsm-net" value="192.168.0.0">
        </div>
        <div class="form-group">
          <label>Prefix (VD: 24)</label>
          <input type="number" id="vlsm-pfx" min="0" max="32" value="24">
        </div>
      </div>
      
      <div style="background:#f8fafc;padding:16px;border-radius:8px;margin-bottom:20px;border:1px solid var(--border)">
        <h3 style="margin-bottom:12px;font-size:1rem">Danh sách Phòng ban / Yêu cầu Hosts</h3>
        <div id="vlsm-depts" style="display:flex;flex-direction:column;gap:12px">
          <div class="dept-row" style="display:flex;gap:10px">
            <input type="text" value="Phòng IT" class="dept-name" style="flex:2">
            <input type="number" value="60" class="dept-hosts" style="flex:1">
            <button class="btn btn-danger btn-remove-dept">🗑️</button>
          </div>
          <div class="dept-row" style="display:flex;gap:10px">
            <input type="text" value="Phòng Kế toán" class="dept-name" style="flex:2">
            <input type="number" value="28" class="dept-hosts" style="flex:1">
            <button class="btn btn-danger btn-remove-dept">🗑️</button>
          </div>
        </div>
        <div style="margin-top:12px;font-size:0.875rem;color:var(--primary-dark);font-weight:600" id="vlsm-total-alloc"></div>
        <button class="btn btn-outline" id="btn-add-dept" style="margin-top:12px;width:100%">+ Thêm phòng ban</button>
      </div>
      <button class="btn btn-primary" id="btn-calc-vlsm" style="width:100%">🚀 Tính toán VLSM</button>

      <div id="vlsm-result-card" class="hidden" style="margin-top:24px">
        <table class="data-table" id="vlsm-table">
          <thead>
            <tr>
              <th>Phòng ban</th>
              <th>Host cần</th>
              <th>Đã cấp</th>
              <th>Network</th>
              <th>Mask</th>
              <th>Gateway (Gợi ý)</th>
              <th>Last Host</th>
              <th>Broadcast</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- IPv6 -->
  <section id="tab-ipv6" class="tab-content">
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header">
          <span class="icon">🌍</span>
          <h2>Phân tích IPv6</h2>
        </div>
        <div class="form-group">
          <label>Nhập IPv6 Address</label>
          <input type="text" id="ipv6-input" value="2001:0db8:85a3:0000:0000:8a2e:0370:7334" placeholder="VD: 2001:db8::1">
        </div>
        <div class="form-group">
          <label>Prefix Length (0-128)</label>
          <input type="number" id="ipv6-prefix" min="0" max="128" value="64">
        </div>
        <button class="btn btn-primary" id="btn-calc-ipv6" style="width:100%">Phân tích IPv6</button>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="icon">📋</span>
          <h2>Thông tin IPv6</h2>
        </div>
        <table class="result-table" id="ipv6-table">
          <tr><td colspan="2" style="text-align:center;color:var(--text-muted)">Chưa có dữ liệu tính toán.</td></tr>
        </table>
      </div>
    </div>
  </section>

  <!-- CHECKER -->
  <section id="tab-checker" class="tab-content">
    <div class="card">
      <div class="card-header">
        <span class="icon">🔍</span>
        <h2>Kiểm tra địa chỉ IP</h2>
      </div>
      <div class="form-group">
        <label>Nhập IP (IPv4 hoặc IPv6)</label>
        <div style="display:flex;gap:12px">
          <input type="text" id="check-ip-input" placeholder="VD: 10.0.0.1" style="flex:1">
          <button class="btn btn-primary" id="btn-check-ip">Kiểm tra</button>
        </div>
      </div>
      <div id="check-result-box" class="hidden">
        <table class="result-table" id="check-table"></table>
      </div>
    </div>
  </section>

  <!-- BINARY -->
  <section id="tab-binary" class="tab-content">
    <div class="grid">
      <div class="card">
        <div class="card-header">
          <span class="icon">💻</span>
          <h2>Dotted Decimal → Binary</h2>
        </div>
        <div class="form-group">
          <label>Địa chỉ IPv4</label>
          <input type="text" id="bin-ipv4" value="192.168.1.10">
        </div>
        <button class="btn btn-primary" id="btn-to-binary" style="width:100%">Chuyển đổi</button>
        <div id="bin-res-1" style="margin-top:16px;font-family:monospace;word-break:break-all;font-weight:700;color:var(--primary)"></div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="icon">🔢</span>
          <h2>Binary → Dotted Decimal</h2>
        </div>
        <div class="form-group">
          <label>Chuỗi nhị phân (32 bit, dấu chấm)</label>
          <input type="text" id="bin-input" value="11000000.10101000.00000001.00001010">
        </div>
        <button class="btn btn-primary" id="btn-to-decimal" style="width:100%">Chuyển đổi</button>
        <div id="bin-res-2" style="margin-top:16px;font-family:monospace;font-weight:700;color:var(--primary)"></div>
      </div>
    </div>
  </section>

  <!-- WILDCARD -->
  <section id="tab-wildcard" class="tab-content">
    <div class="card" style="max-width:600px;margin:0 auto">
      <div class="card-header">
        <span class="icon">🛡️</span>
        <h2>Tính Wildcard Mask</h2>
      </div>
      <div class="form-group">
        <label>Nhập Prefix (VD: 26)</label>
        <input type="number" id="wild-pfx" min="0" max="32" value="26">
      </div>
      <button class="btn btn-primary" id="btn-calc-wild" style="width:100%">⚡ Tính Mask & Wildcard</button>
      <div id="wild-result" class="hidden" style="margin-top:20px">
        <table class="result-table" id="wild-table"></table>
      </div>
    </div>
  </section>

  <!-- CIDR -->
  <section id="tab-cidr" class="tab-content">
    <div class="card">
      <div class="card-header">
        <span class="icon">📋</span>
        <h2>Bảng tra cứu CIDR</h2>
      </div>
      <div class="form-group">
        <input type="text" id="cidr-search" placeholder="Tìm kiếm prefix (VD: /24)" style="max-width:300px">
      </div>
      <div class="data-table-wrapper">
        <table class="data-table" id="cidr-full-table">
          <thead>
            <tr>
              <th>CIDR</th>
              <th>Subnet Mask</th>
              <th>Wildcard</th>
              <th>Total IPs</th>
              <th>Usable Hosts</th>
            </tr>
          </thead>
          <tbody>
            <!-- Will be populated by JS -->
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- QUIZ -->
  <section id="tab-quiz" class="tab-content">
    <div class="card" style="max-width:800px;margin:0 auto">
      <div class="card-header" style="justify-content:space-between">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="icon">🧠</span>
          <h2>Luyện tập kiến thức</h2>
        </div>
        <div style="width:140px">
          <div id="quiz-progress-text" style="font-size:0.875rem;font-weight:700;color:var(--primary);text-align:right">Câu 1/10</div>
          <div class="progress-bar"><div id="quiz-progress-fill" class="progress-fill" style="width:10%"></div></div>
        </div>
      </div>
      <div id="quiz-question-box">
        <h3 id="quiz-question" style="margin-bottom:20px;line-height:1.4">Đang tải câu hỏi...</h3>
        <div class="quiz-options" id="quiz-options"></div>
        <div id="quiz-feedback" class="hidden" style="margin-top:20px;padding:16px;border-radius:8px"></div>
        <div style="margin-top:24px;display:flex;gap:12px">
          <button class="btn btn-primary" id="btn-quiz-check">Kiểm tra đáp án</button>
          <button class="btn btn-outline hidden" id="btn-quiz-next">Câu tiếp theo ➜</button>
          <button class="btn btn-outline hidden" id="btn-quiz-restart">Làm lại từ đầu</button>
        </div>
      </div>
    </div>
  </section>

  <!-- EC2 -->
  <section id="tab-ec2" class="tab-content">
    <div class="grid">
      <div class="card">
        <div class="card-header">
          <span class="icon">☁️</span>
          <h2>Server Monitor (Live)</h2>
        </div>
        <div class="grid grid-2" style="gap:12px">
          <div class="stat-card" style="border-left:4px solid var(--secondary)">
            <div class="stat-label">Hostname</div>
            <div class="stat-value" id="ec2-hostname">---</div>
          </div>
          <div class="stat-card" style="border-left:4px solid var(--primary)">
            <div class="stat-label">Request Count</div>
            <div class="stat-value" id="ec2-requests">0</div>
          </div>
          <div class="stat-card" style="border-left:4px solid var(--warning)">
            <div class="stat-label">Instance ID</div>
            <div class="stat-value" id="ec2-instance-id" style="font-size:0.8rem">---</div>
          </div>
          <div class="stat-card" style="border-left:4px solid #8b5cf6">
            <div class="stat-label">AZ / Region</div>
            <div class="stat-value" id="ec2-az">---</div>
          </div>
          <div class="stat-card" style="border-left:4px solid var(--success)">
            <div class="stat-label">Private IP</div>
            <div class="stat-value" id="ec2-local-ip">---</div>
          </div>
          <div class="stat-card" style="border-left:4px solid var(--text-muted)">
            <div class="stat-label">Status</div>
            <div class="stat-value"><span class="badge badge-green">Running</span></div>
          </div>
        </div>
        <div style="margin-top:20px;display:flex;gap:12px">
          <button class="btn btn-primary" id="btn-ping">🏓 Health Check</button>
          <button class="btn btn-outline" id="btn-test-traffic">📡 Test Traffic</button>
          <button class="btn btn-danger" id="btn-clear-log">🗑️ Clear Log</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="icon">📜</span>
          <h2>Traffic Logs</h2>
        </div>
        <div id="ec2-logs" style="height:250px;overflow-y:auto;background:#0f172a;color:#38bdf8;padding:12px;font-family:monospace;font-size:0.75rem;border-radius:8px">
          <div>[SYSTEM] Monitor started...</div>
        </div>
      </div>
    </div>


  </section>
</main>

<div id="toast-container"></div>

<script>
  // Injected data
  const APP_DATA = ${metaInjected};

  // Helper: DOM Selector
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // Tab Switching
  function switchTab(tabId) {
    $$('.tab-content').forEach(t => t.classList.remove('active'));
    $$('.nav-link').forEach(l => l.classList.remove('active'));
    
    $('#tab-' + tabId).classList.add('active');
    const link = $('[data-tab="' + tabId + '"]');
    if(link) link.classList.add('active');

    if (tabId === 'ec2') updateEC2Monitor();
  }

  // Toast Notification
  function showToast(msg, type = 'primary') {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // Copy to Clipboard
  function copyText(text) {
    if (!navigator.clipboard) {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showToast('Đã sao chép!');
      return;
    }
    navigator.clipboard.writeText(text).then(() => showToast('Đã sao chép!'));
  }

  // IPv4 Logic
  function ip2int(ip) {
    return ip.split('.').reduce((res, octet) => (res << 8) + parseInt(octet, 10), 0) >>> 0;
  }
  function int2ip(int) {
    return [(int >>> 24) & 0xff, (int >>> 16) & 0xff, (int >>> 8) & 0xff, int & 0xff].join('.');
  }
  function getMask(p) { return (0xffffffff << (32 - p)) >>> 0; }

  function calculateIPv4() {
    const ipStr = $('#ipv4-input').value.trim();
    const prefix = parseInt($('#ipv4-prefix').value);

    if (!/^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$/.test(ipStr)) {
      showToast('IP không hợp lệ!', 'error');
      return;
    }

    const ip = ip2int(ipStr);
    const mask = getMask(prefix);
    const network = (ip & mask) >>> 0;
    const wildcard = (~mask) >>> 0;
    const broadcast = (network | wildcard) >>> 0;
    const totalHosts = Math.pow(2, 32 - prefix);
    const usableHosts = prefix >= 31 ? (prefix === 31 ? 2 : 1) : totalHosts - 2;

    const firstHost = prefix >= 31 ? network : (network + 1) >>> 0;
    const lastHost = prefix >= 31 ? broadcast : (broadcast - 1) >>> 0;

    $('#ipv4-results-empty').classList.add('hidden');
    $('#ipv4-results-box').classList.remove('hidden');

    // Bit Bar logic
    const barContainer = $('#ipv4-bit-bar-container');
    let barHtml = '<div class="bit-bar">';
    for(let i=1; i<=32; i++) {
      const isNet = i <= prefix;
      barHtml += \`<div class="bit \${isNet ? 'bit-net' : 'bit-host'}" title="\${isNet ? 'Network Bit' : 'Host Bit'} \${i}">\${isNet ? '1' : '0'}</div>\`;
    }
    barHtml += '</div>';
    barHtml += \`<div style="display:flex;justify-content:space-between;font-size:0.75rem;font-weight:600;margin-bottom:15px">
      <span style="color:var(--ipv4)">Network bits: \${prefix}</span>
      <span style="color:var(--text-muted)">Host bits: \${32-prefix}</span>
    </div>\`;
    barContainer.innerHTML = barHtml;

    const table = $('#ipv4-table');
    const netIp = int2ip(network);
    const bcIp = int2ip(broadcast);
    const maskIp = int2ip(mask);
    const wildIp = int2ip(wildcard);
    const firstIp = int2ip(firstHost);
    const lastIp = int2ip(lastHost);

    table.innerHTML = \`
      <tr class="bg-net">
        <td><span class="tooltip" data-tooltip="Địa chỉ đại diện cho mạng, không gán cho thiết bị">Network Address</span></td>
        <td>
          <strong>\${netIp}</strong>
          <button class="btn-copy" onclick="copyText('\${netIp}')">Copy</button>
          <span class="note-small">Network không gán cho thiết bị</span>
        </td>
      </tr>
      <tr class="bg-bc">
        <td><span class="tooltip" data-tooltip="Địa chỉ gửi tới toàn bộ host trong subnet, không gán cho thiết bị">Broadcast Address</span></td>
        <td>
          <strong>\${bcIp}</strong>
          <button class="btn-copy" onclick="copyText('\${bcIp}')">Copy</button>
          <span class="note-small">Broadcast không gán cho thiết bị</span>
        </td>
      </tr>
      <tr>
        <td><span class="tooltip" data-tooltip="Mặt nạ mạng dùng để xác định phần network và host">Subnet Mask</span></td>
        <td>\${maskIp} <button class="btn-copy" onclick="copyText('\${maskIp}')">Copy</button></td>
      </tr>
      <tr>
        <td><span class="tooltip" data-tooltip="Mặt nạ đảo, thường dùng trong ACL/OSPF Cisco">Wildcard Mask</span></td>
        <td>\${wildIp} <button class="btn-copy" onclick="copyText('\${wildIp}')">Copy</button></td>
      </tr>
      <tr>
        <td>First Usable Host</td>
        <td>
          <span style="color:var(--secondary);font-weight:600">\${firstIp}</span>
          <button class="btn-copy" onclick="copyText('\${firstIp}')">Copy</button>
        </td>
      </tr>
      <tr>
        <td>Last Usable Host</td>
        <td>\${lastIp} <button class="btn-copy" onclick="copyText('\${lastIp}')">Copy</button></td>
      </tr>
      <tr>
        <td><span class="tooltip" data-tooltip="Địa chỉ router để thiết bị đi ra mạng khác">Gateway (Gợi ý)</span></td>
        <td>\${firstIp} <button class="btn-copy" onclick="copyText('\${firstIp}')">Copy</button></td>
      </tr>
      <tr>
        <td>Total Addresses</td>
        <td>\${totalHosts.toLocaleString()}</td>
      </tr>
      <tr>
        <td>Usable Hosts</td>
        <td>\${usableHosts.toLocaleString()}</td>
      </tr>
      <tr>
        <td><span class="tooltip" data-tooltip="Cách viết IP kèm prefix, ví dụ 192.168.1.0/24">CIDR / Prefix</span></td>
        <td>/\${prefix}</td>
      </tr>
      <tr>
        <td>Binary IP</td>
        <td>\${ip.toString(2).padStart(32, '0').match(/.{8}/g).join('.')} <button class="btn-copy" onclick="copyText('\${$('#ipv4-input').value}')">Copy IP</button></td>
      </tr>
      <tr>
        <td style="color:var(--primary-dark)">Cấu hình Cisco</td>
        <td style="text-align:left">
          <code style="background:#f1f5f9;padding:6px;border-radius:4px;display:block;white-space:pre-wrap;font-family:monospace;color:#0f172a">interface vlan 1\\n ip address \${firstIp} \${maskIp}\\n no shutdown</code>
        </td>
      </tr>
    \`;
    showToast('Đã tính xong IPv4');
  }

  // Split Subnet Logic
  function doSplit() {
    const netStr = $('#split-net').value.trim();
    const oldP = parseInt($('#split-pfx-old').value);
    const newP = parseInt($('#split-pfx-new').value);

    if (newP <= oldP) {
      showToast('Prefix mới phải lớn hơn prefix cũ!', 'error');
      return;
    }

    const startIp = ip2int(netStr);
    const subnetsCount = Math.pow(2, newP - oldP);
    const step = Math.pow(2, 32 - newP);
    const mask = getMask(newP);
    const usable = newP >= 31 ? (newP === 31 ? 2 : 1) : step - 2;

    const tbody = $('#split-table tbody');
    tbody.innerHTML = '';
    
    // Limit to 256 subnets for performance
    const limit = Math.min(subnetsCount, 256);
    for (let i = 0; i < limit; i++) {
      const net = (startIp + i * step) >>> 0;
      const bc = (net + step - 1) >>> 0;
      const first = newP >= 31 ? net : (net + 1) >>> 0;
      const last = newP >= 31 ? bc : (bc - 1) >>> 0;

      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td>\${i + 1}</td>
        <td><strong style="color:var(--primary-dark)">\${int2ip(net)} / \${newP}</strong></td>
        <td><span style="color:var(--secondary);font-weight:600">\${int2ip(first)}</span></td>
        <td>\${int2ip(first)} - \${int2ip(last)}</td>
        <td>\${int2ip(bc)}</td>
        <td>\${usable}</td>
      \`;
      tbody.appendChild(tr);
    }
    
    $('#split-result-card').classList.remove('hidden');
    showToast('Đã chia thành ' + subnetsCount + ' subnet');
  }

  // VLSM Logic
  function calculateVLSM() {
    const mainNetStr = $('#vlsm-net').value.trim();
    const mainPfx = parseInt($('#vlsm-pfx').value);
    
    let depts = [];
    $$('.dept-row').forEach(row => {
      const name = row.querySelector('.dept-name').value;
      const hosts = parseInt(row.querySelector('.dept-hosts').value);
      if (name && hosts) depts.push({ name, hosts });
    });

    if (depts.length === 0) {
      showToast('Vui lòng thêm ít nhất 1 phòng ban!', 'error');
      return;
    }

    // Sort by hosts descending
    depts.sort((a, b) => b.hosts - a.hosts);

    let currentIp = ip2int(mainNetStr);
    const results = [];

    for (let dept of depts) {
      // Find smallest prefix that fits (hosts + 2 for net/bc)
      let p = 32;
      while (p >= 0) {
        let capacity = Math.pow(2, 32 - p);
        if (p >= 31) { if (capacity >= dept.hosts) break; }
        else { if (capacity - 2 >= dept.hosts) break; }
        p--;
      }

      const size = Math.pow(2, 32 - p);
      const mask = getMask(p);
      const net = currentIp;
      const bc = (net + size - 1) >>> 0;
      const first = p >= 31 ? net : (net + 1) >>> 0;
      const last = p >= 31 ? bc : (bc - 1) >>> 0;

      results.push({ ...dept, p, mask, net, bc, first, last });
      currentIp = (bc + 1) >>> 0;
    }

    let totalAllocated = 0;
    const tbody = $('#vlsm-table tbody');
    tbody.innerHTML = '';
    results.forEach(r => {
      const size = Math.pow(2, 32 - r.p);
      totalAllocated += size;
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td><strong>\${r.name}</strong></td>
        <td>\${r.hosts}</td>
        <td>\${size}</td>
        <td><strong style="color:var(--primary-dark)">\${int2ip(r.net)}/\${r.p}</strong></td>
        <td>\${int2ip(r.mask)}</td>
        <td><span style="color:var(--secondary);font-weight:600">\${int2ip(r.first)}</span></td>
        <td>\${int2ip(r.last)}</td>
        <td>\${int2ip(r.bc)}</td>
      \`;
      tbody.appendChild(tr);
    });

    $('#vlsm-total-alloc').textContent = 'Tổng số IP đã cấp phát: ' + totalAllocated.toLocaleString();
    $('#vlsm-result-card').classList.remove('hidden');
    showToast('Tính toán VLSM hoàn tất');
  }

  // IPv6 Logic
  function calculateIPv6() {
    const ip = $('#ipv6-input').value.trim();
    const pfx = $('#ipv6-prefix').value;
    
    // Basic expansion for visual
    let expanded = ip;
    if (ip.includes('::')) {
      const parts = ip.split('::');
      const left = parts[0] ? parts[0].split(':') : [];
      const right = parts[1] ? parts[1].split(':') : [];
      const missing = 8 - (left.length + right.length);
      expanded = [...left, ...Array(missing).fill('0000'), ...right].map(s => s.padStart(4, '0')).join(':');
    }

    $('#ipv6-table').innerHTML = \`
      <tr><td>IPv6 Address</td><td><strong>\${ip}</strong></td></tr>
      <tr><td>Expanded</td><td>\${expanded}</td></tr>
      <tr><td>Prefix Length</td><td>/\${pfx}</td></tr>
      <tr><td>Network Bits</td><td>\${pfx} bits</td></tr>
      <tr><td>Interface Bits</td><td>\${128 - pfx} bits</td></tr>
      <tr><td>Total IPs</td><td>2^\${128 - pfx}</td></tr>
      <tr><td style="color:var(--primary-dark)">Gợi ý cấu hình Cisco</td><td style="text-align:left"><code style="background:#f1f5f9;padding:6px;border-radius:4px;display:block;white-space:pre-wrap;font-family:monospace;color:#0f172a">interface vlan 1\\n ipv6 address \${ip}/\${pfx}\\n no shutdown</code></td></tr>
    \`;
    showToast('Đã cập nhật thông tin IPv6');
  }

  // Checker Logic
  function checkIP() {
    const ip = $('#check-ip-input').value.trim();
    const table = $('#check-table');
    $('#check-result-box').classList.remove('hidden');
    
    if (/^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$/.test(ip)) {
      const octets = ip.split('.').map(Number);
      const first = octets[0];
      let type = 'Public';
      let cls = 'Unknown';
      
      if (first >= 1 && first <= 126) cls = 'A';
      else if (first >= 128 && first <= 191) cls = 'B';
      else if (first >= 192 && first <= 223) cls = 'C';
      else if (first >= 224 && first <= 239) cls = 'D (Multicast)';
      else if (first >= 240) cls = 'E (Experimental)';

      if (first === 10) type = 'Private (Class A)';
      else if (first === 172 && octets[1] >= 16 && octets[1] <= 31) type = 'Private (Class B)';
      else if (first === 192 && octets[1] === 168) type = 'Private (Class C)';
      else if (first === 127) type = 'Loopback';
      else if (first === 169 && octets[1] === 254) type = 'APIPA (Link-Local)';

      table.innerHTML = \`
        <tr><td>Loại IP</td><td>IPv4</td></tr>
        <tr><td>Lớp (Class)</td><td>\${cls}</td></tr>
        <tr><td>Phân loại</td><td>\${type}</td></tr>
        <tr><td>Trạng thái</td><td>✅ Hợp lệ</td></tr>
      \`;
    } else if (ip.includes(':')) {
      table.innerHTML = \`
        <tr><td>Loại IP</td><td>IPv6</td></tr>
        <tr><td>Trạng thái</td><td>✅ Hợp lệ</td></tr>
        <tr><td>Ghi chú</td><td>IPv6 luôn là dải địa chỉ khổng lồ</td></tr>
      \`;
    } else {
      showToast('IP không đúng định dạng!', 'error');
      $('#check-result-box').classList.add('hidden');
    }
  }

  // Quiz Logic
  const questions = [
    { q: "Địa chỉ Network của 192.168.1.10/26 là gì?", o: ["192.168.1.0", "192.168.1.64", "192.168.1.32", "192.168.1.128"], a: 0 },
    { q: "Broadcast của 172.16.0.0/16 là gì?", o: ["172.16.255.0", "172.16.0.255", "172.16.255.255", "172.255.255.255"], a: 2 },
    { q: "Subnet Mask của prefix /24 là gì?", o: ["255.255.0.0", "255.255.255.0", "255.0.0.0", "255.255.255.252"], a: 1 },
    { q: "Có bao nhiêu Usable Host trong /30?", o: ["1", "2", "4", "6"], a: 1 },
    { q: "Địa chỉ 127.0.0.1 dùng để làm gì?", o: ["Gán cho server", "Cấp cho client", "Loopback (Self)", "Dự phòng"], a: 2 },
    { q: "IPv6 có bao nhiêu bit?", o: ["32 bit", "64 bit", "128 bit", "256 bit"], a: 2 },
    { q: "Wildcard mask của /26 là gì?", o: ["0.0.0.63", "0.0.0.31", "0.0.0.127", "255.255.255.192"], a: 0 },
    { q: "Dải IP 169.254.x.x gọi là gì?", o: ["Private IP", "Public IP", "APIPA", "Static IP"], a: 2 },
    { q: "Lớp C (Class C) bắt đầu từ octet nào?", o: ["1-126", "128-191", "192-223", "224-239"], a: 2 },
    { q: "Trong VLSM, subnet nào được chia trước?", o: ["Nhỏ nhất", "Lớn nhất", "Trung bình", "Ngẫu nhiên"], a: 1 }
  ];
  let currentQ = 0;
  let score = 0;

  function loadQuiz() {
    const q = questions[currentQ];
    $('#quiz-progress-text').textContent = \`Câu \${currentQ + 1} / \${questions.length}\`;
    $('#quiz-progress-fill').style.width = ((currentQ + 1) / questions.length * 100) + '%';
    $('#quiz-question').textContent = q.q;
    const opts = $('#quiz-options');
    opts.innerHTML = '';
    q.o.forEach((txt, i) => {
      const div = document.createElement('div');
      div.className = 'quiz-option';
      div.textContent = String.fromCharCode(65 + i) + '. ' + txt;
      div.onclick = () => {
        $$('.quiz-option').forEach(o => o.classList.remove('selected'));
        div.classList.add('selected');
        div.dataset.index = i;
      };
      opts.appendChild(div);
    });
    $('#quiz-feedback').classList.add('hidden');
    $('#btn-quiz-next').classList.add('hidden');
    $('#btn-quiz-check').classList.remove('hidden');
  }

  function checkQuiz() {
    const sel = $('.quiz-option.selected');
    if (!sel) { showToast('Vui lòng chọn 1 đáp án!'); return; }
    
    const ans = parseInt(sel.dataset.index);
    const correct = questions[currentQ].a;
    const feedback = $('#quiz-feedback');
    feedback.classList.remove('hidden');
    
    if (ans === correct) {
      score++;
      sel.classList.add('correct');
      feedback.textContent = '✅ Chính xác!';
      feedback.style.background = '#dcfce7';
      feedback.style.color = '#166534';
    } else {
      sel.classList.add('wrong');
      $$('.quiz-option')[correct].classList.add('correct');
      feedback.textContent = '❌ Sai rồi. Đáp án đúng là ' + String.fromCharCode(65 + correct);
      feedback.style.background = '#fee2e2';
      feedback.style.color = '#991b1b';
    }
    
    $('#btn-quiz-check').classList.add('hidden');
    if (currentQ < questions.length - 1) {
      $('#btn-quiz-next').classList.remove('hidden');
    } else {
      $('#quiz-question').textContent = \`Chúc mừng! Bạn đã hoàn thành bài thi. Điểm số: \${score}/\${questions.length}\`;
      $('#quiz-options').innerHTML = '';
      $('#btn-quiz-restart').classList.remove('hidden');
    }
  }

  // EC2 Monitor Logic
  function addLog(msg) {
    const box = $('#ec2-logs');
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.textContent = \`[\${time}] \${msg}\`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  async function updateEC2Monitor() {
    $('#ec2-hostname').textContent = APP_DATA.serverName;
    $('#ec2-instance-id').textContent = APP_DATA.metadata.instanceId;
    $('#ec2-az').textContent = APP_DATA.metadata.az;
    $('#ec2-local-ip').textContent = APP_DATA.metadata.localIpv4;
    
    try {
      const res = await fetch('/metrics');
      const data = await res.json();
      $('#ec2-requests').textContent = data.requests;
    } catch(e) {}
  }

  // CIDR Table Population
  function populateCIDR() {
    const tbody = $('#cidr-full-table tbody');
    const highlights = [24, 25, 26, 27, 28, 30];
    for (let p = 0; p <= 32; p++) {
      const mask = getMask(p);
      const total = Math.pow(2, 32 - p);
      const usable = p >= 31 ? (p === 31 ? 2 : 1) : total - 2;
      const tr = document.createElement('tr');
      if (highlights.includes(p)) tr.className = 'highlight';
      tr.innerHTML = \`
        <td>/\${p}</td>
        <td>\${int2ip(mask)}</td>
        <td>\${int2ip(~mask)}</td>
        <td>\${total.toLocaleString()}</td>
        <td>\${usable.toLocaleString()}</td>
      \`;
      tbody.appendChild(tr);
    }
  }

  // Initialization
  window.addEventListener('DOMContentLoaded', () => {
    // Nav Click
    $$('.nav-link').forEach(link => {
      link.addEventListener('click', () => switchTab(link.dataset.tab));
    });

    // IPv4 Events
    $('#btn-calc-ipv4').onclick = calculateIPv4;
    $('#btn-reset-ipv4').onclick = () => {
      $('#ipv4-input').value = '192.168.1.10';
      $('#ipv4-prefix').value = '26';
      $('#ipv4-results-box').classList.add('hidden');
      $('#ipv4-results-empty').classList.remove('hidden');
    };

    // Split Events
    $('#btn-calc-split').onclick = doSplit;

    // VLSM Events
    $('#btn-add-dept').onclick = () => {
      const div = document.createElement('div');
      div.className = 'dept-row';
      div.style.display = 'flex';
      div.style.gap = '10px';
      div.innerHTML = \`
        <input type="text" placeholder="Tên phòng" class="dept-name" style="flex:2;padding:8px;border:1px solid var(--border);border-radius:6px">
        <input type="number" placeholder="Số host" class="dept-hosts" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px">
        <button class="btn btn-danger btn-remove-dept">🗑️</button>
      \`;
      div.querySelector('.btn-remove-dept').onclick = () => div.remove();
      $('#vlsm-depts').appendChild(div);
    };
    $$('.btn-remove-dept').forEach(btn => btn.onclick = () => btn.closest('.dept-row').remove());
    $('#btn-calc-vlsm').onclick = calculateVLSM;

    // IPv6 Events
    $('#btn-calc-ipv6').onclick = calculateIPv6;

    // Checker Events
    $('#btn-check-ip').onclick = checkIP;

    // Binary Events
    $('#btn-to-binary').onclick = () => {
      const ip = $('#bin-ipv4').value;
      if (!/^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$/.test(ip)) { showToast('IP sai định dạng!', 'error'); return; }
      const bin = ip2int(ip).toString(2).padStart(32, '0').match(/.{8}/g).join('.');
      $('#bin-res-1').textContent = bin;
      showToast('Đã chuyển đổi');
    };
    $('#btn-to-decimal').onclick = () => {
      const bin = $('#bin-input').value.replace(/\\./g, '');
      if (bin.length !== 32) { showToast('Cần đúng 32 bit!', 'error'); return; }
      const ip = int2ip(parseInt(bin, 2));
      $('#bin-res-2').textContent = ip;
      showToast('Đã chuyển đổi');
    };

    // Wildcard Events
    $('#btn-calc-wild').onclick = () => {
      const p = parseInt($('#wild-pfx').value);
      const mask = getMask(p);
      const wild = (~mask) >>> 0;
      $('#wild-result').classList.remove('hidden');
      $('#wild-table').innerHTML = \`
        <tr><td>Subnet Mask</td><td>\${int2ip(mask)}</td></tr>
        <tr><td>Wildcard Mask</td><td>\${int2ip(wild)}</td></tr>
      \`;
    };

    // Quiz Events
    $('#btn-quiz-check').onclick = checkQuiz;
    $('#btn-quiz-next').onclick = () => { currentQ++; loadQuiz(); };
    $('#btn-quiz-restart').onclick = () => { currentQ = 0; score = 0; loadQuiz(); $('#btn-quiz-restart').classList.add('hidden'); };

    // EC2 Events
    $('#btn-ping').onclick = async () => {
      addLog('GET /health ...');
      try {
        const r = await fetch('/health');
        const d = await r.json();
        addLog('Response: ' + JSON.stringify(d));
        showToast('Ping thành công!');
      } catch(e) { addLog('Error: ' + e.message); }
    };
    $('#btn-test-traffic').onclick = async () => {
      addLog('GET /metrics ...');
      try {
        const r = await fetch('/metrics');
        const d = await r.json();
        addLog('Traffic: ' + d.requests + ' requests');
        updateEC2Monitor();
        showToast('Traffic check thành công!');
      } catch(e) { addLog('Error: ' + e.message); }
    };
    $('#btn-clear-log').onclick = () => {
      $('#ec2-logs').innerHTML = '<div>[SYSTEM] Log cleared.</div>';
    };

    // CIDR search
    $('#cidr-search').oninput = (e) => {
      const val = e.target.value.toLowerCase();
      $$('#cidr-full-table tbody tr').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(val) ? '' : 'none';
      });
    };

    // Initial Load
    populateCIDR();
    loadQuiz();
    updateEC2Monitor();
    setInterval(updateEC2Monitor, 5000);
  });
</script>

</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: serverName }));
    return;
  }

  if (url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      requests: requestCount,
      uptime: Math.floor(process.uptime()),
      hostname: serverName
    }));
    return;
  }

  // Main page
  requestCount++;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(buildPage());
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[Server] Running at http://0.0.0.0:${port}`);
});