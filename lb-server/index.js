
const path = require('path');
const dotenv = require('dotenv');

// ── Load .env TRƯỚC mọi thứ khác ─────────────────────────────────────────────
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ENABLE_AWS = process.env.ENABLE_AWS === 'true';

const fs = require('fs');
const http = require('http');
const httpProxy = require('http-proxy');    // Thư viện proxy HTTP — chuyển tiếp request đến backend

const configPath = path.join(__dirname, '../config/servers.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

console.log("CONFIG LOADED:", config);
console.log(`📦 Mode: ${ENABLE_AWS ? 'AWS (read-only, no proxy to EC2)' : 'LOCAL'}`);

const {
  getNextServer,           // Chọn server tiếp theo theo thuật toán
  getAlgorithm,            // Lấy tên thuật toán đang dùng
  setAlgorithm,            // Đổi thuật toán
  getSupportedAlgorithms,  // Danh sách thuật toán hỗ trợ
  setServerEnabled,        // Bật/tắt server khỏi pool
  getServersConfig,        // Lấy cấu hình server (id, name, enabled, weight)
  getServerStates,         // Lấy trạng thái realtime (requestCount, activeConnections, status)
  incrementConnections,    // +1 kết nối đang xử lý
  decrementConnections,    // -1 kết nối khi xong
  incrementRequestCount    // +1 tổng request đã xử lý
} = require('./balancer');

const { logRequest, logFailure, getRates, getRecentRequests, getLoadBalancingMetrics } = require('./logger');
const { startWebSocketServer } = require('./wsServer');

// ── Health check: chỉ chạy ở Local mode ──────────────────────────────────────
let startHealthChecks;
if (!ENABLE_AWS) {
  ({ startHealthChecks } = require('./healthCheck'));
}

// ── Local Auto Scaling simulation: chỉ chạy ở Local mode ─────────────────────
let startAutoScalingLoop;
if (!ENABLE_AWS) {
  ({ startAutoScalingLoop } = require('./localScaling'));
}

// ── AWS Dashboard read-only handler: chỉ load khi ENABLE_AWS=true ─────────────
let handleAwsOverview;
if (ENABLE_AWS) {
  ({ handleAwsOverview } = require('../aws/awsDashboard'));
}

// Cổng Load Balancer — lấy từ config, mặc định 8000 nếu không có
const LB_PORT = config.loadBalancer.port || 8000;

// Tạo proxy server — chỉ dùng ở local mode để forward request đến backend EC2
const proxy = httpProxy.createProxyServer({});

// ── DEBUG: Gán ID duy nhất cho mỗi request để dễ trace trong console ─────
let _reqId = 0;
const nextId = () => `[R${String(++_reqId).padStart(4,'0')}]`;

// Xử lý lỗi proxy toàn cục — khi backend không phản hồi, trả 502 Bad Gateway
proxy.on('error', (err, req, res) => {
  console.error('[LB ERROR]:', err.message);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway' }));
  }
});

// ── TẠO HTTP SERVER — Xử lý mọi request đến cổng LB_PORT ─────────────────
const server = http.createServer((req, res) => {
  const id = nextId(); // Gán ID để trace request trong log
  console.log(`${id} --> ${req.method} ${req.url} (from ${req.socket.remoteAddress})`);

  // CORS — cho phép Dashboard (port 4000) gọi API của LB (port 8000)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log(`${id} [FILTER] OPTIONS preflight`);
    res.writeHead(204);
    return res.end();
  }

  // Chặn request rác của browser (favicon, robots...) — không proxy, không đếm
  const IGNORE = [
    '/favicon.ico', '/robots.txt',
    '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png',
    '/sitemap.xml', '/manifest.json', '/browserconfig.xml'
  ];

  if (IGNORE.includes(req.url)) {
    console.log(`${id} [FILTER] browser noise -> ignored`);
    res.writeHead(204);
    return res.end();
  }

  // Health check của chính LB — trả OK nếu LB đang chạy (không proxy, không đếm)
  if (req.url === '/health') {
    console.log(`${id} [FILTER] health check`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', mode: ENABLE_AWS ? 'aws' : 'local' }));
  }

  // ── AWS Dashboard API — read-only overview (chỉ khi ENABLE_AWS=true) ────
  if (req.url === '/api/aws/overview' && req.method === 'GET') {
    console.log(`${id} [FILTER] /api/aws/overview`);
    if (!ENABLE_AWS || !handleAwsOverview) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'AWS is disabled. Set ENABLE_AWS=true in .env' }));
    }
    return handleAwsOverview(req, res);
  }

  // ── Traffic Request Log — read-only, dùng cho bảng Client IP ─────────────
  if (req.url === '/api/lb/requests' && req.method === 'GET') {
    const requests = getRecentRequests(100).map(r => ({
      time:       r.time,
      clientIp:   r.clientIp   || '0.0.0.0',
      serverId:   r.serverId   || '',
      serverName: r.serverName || r.serverId || '',
      duration:   r.duration   || 0
    }));
    res.writeHead(200, {
      'Content-Type':  'application/json',
      'Cache-Control': 'no-store'
    });
    return res.end(JSON.stringify({ requests, total: requests.length }));
  }


  // ── Serve AWS Monitor Dashboard static files ───────────────────────────
  if (req.url.startsWith('/aws-monitor')) {
    console.log(`${id} [FILTER] aws-monitor static`);
    let filePath = req.url.replace('/aws-monitor', '') || '/index.html';
    if (filePath === '/') filePath = '/index.html';
    const fullPath = path.join(__dirname, '..', 'dashboard', 'aws-monitor' + filePath);
    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
    fs.readFile(fullPath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not Found');
      }
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    });
    return;
  }

  // API thống kê cho Dashboard — trả JSON chứa trạng thái server, request gần đây, metrics
  if (req.url === '/lb/stats') {
    console.log(`${id} [FILTER] /lb/stats`);
    const states = getServerStates();
    const recent = getRecentRequests(20);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      servers: states, recentRequests: recent,
      rates: getRates(), metrics: getLoadBalancingMetrics(), algorithm: getAlgorithm()
    }));
  }

  // ── API nhận log từ EC2 backend khi traffic thật đi qua ALB ──────────────
  // EC2 gọi POST /lb/aws-log sau mỗi request thật để dashboard cập nhật
  // AWS mode: serverId có thể là bất kỳ instance ID nào (i-xxxxxxxxxxxxxxxxx)
  if (req.url === '/lb/aws-log' && req.method === 'POST') {
    if (!ENABLE_AWS) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'AWS log endpoint only available in AWS mode' }));
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { serverId, serverName, clientIp, duration } = data;

        if (!serverId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'serverId is required' }));
        }

        // Cập nhật counter và ghi log — không validate theo servers.json
        incrementRequestCount(serverId);
        logRequest({
          clientIp: clientIp || '0.0.0.0',
          serverId,
          serverName: serverName || serverId,
          timestamp: new Date(),
          duration: Number(duration) || 0
        });

        console.log(`[AWS-ALB] ${clientIp} → ${serverName || serverId} (${duration}ms) via ALB`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // API cấu hình — cho phép Dashboard đổi thuật toán hoặc bật/tắt server
  if (req.url.startsWith('/lb/config')) {
    console.log(`${id} [FILTER] /lb/config`);
    if (req.url.startsWith('/lb/config/algorithm') && req.method === 'POST') {
      const parsed = new URL(req.url, `http://localhost:${LB_PORT}`);
      const algorithm = parsed.searchParams.get('name');
      if (!algorithm || !setAlgorithm(algorithm)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Bad Request', supportedAlgorithms: getSupportedAlgorithms() }));
      }
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, algorithm: getAlgorithm() }));
    }
    if (req.url.startsWith('/lb/config/server') && req.method === 'POST') {
      const parsed = new URL(req.url, `http://localhost:${LB_PORT}`);
      const serverId = parsed.searchParams.get('id');
      const enabledValue = parsed.searchParams.get('enabled');
      if (!serverId || enabledValue == null || !setServerEnabled(serverId, enabledValue === 'true')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Bad Request' }));
      }
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, servers: getServersConfig() }));
    }
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ algorithm: getAlgorithm(), supportedAlgorithms: getSupportedAlgorithms(), servers: getServersConfig() }));
    }
  }

  // ── AWS MODE: Không proxy trực tiếp qua EC2 IP ───────────────────────────
  // Traffic thật đi theo đường: User → ALB DNS → Target Group → EC2
  // Dashboard chỉ monitor/read-only — không làm proxy
  if (ENABLE_AWS) {
    console.log(`${id} [AWS] Proxy bị tắt trong AWS mode. Dùng ALB_DNS để gửi traffic thật.`);
    const albDns = process.env.ALB_DNS || null;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: 'Direct proxy disabled in AWS mode',
      message: 'In AWS mode, send traffic to ALB DNS instead of this load balancer server.',
      albDns: albDns || 'See ALB_DNS in .env'
    }));
  }

  // ── LOCAL MODE: CÂN BẰNG TẢI CHÍNH ─────────────────────────────────────
  // Chỉ proxy request khi ENABLE_AWS=false
  console.log(`${id} [PROXY] --> routing to backend`);

  const target = getNextServer();

  if (!target) {
    logFailure();
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'No server available' }));
  }

  const targetUrl = `http://${target.host}:${target.port}`;

  // Lấy IP thật của client (chuẩn hóa IPv6 → IPv4)
  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
  if (clientIp === '::1') clientIp = '127.0.0.1';           // IPv6 loopback → IPv4
  else if (clientIp.startsWith('::ffff:')) clientIp = clientIp.slice(7); // IPv4-mapped IPv6

  // Thêm header để backend biết request đi qua LB
  req.headers['x-forwarded-for'] = clientIp;
  req.headers['x-load-balancer'] = 'IntelligentLB/1.0';

  const startTime = Date.now();
  let doneCalled = false;

  // Hàm hoàn tất: đếm +1 request + ghi log (chỉ gọi khi response gửi thành công)
  const done = () => {
    if (doneCalled) return;
    doneCalled = true;
    decrementConnections(target.id);
    incrementRequestCount(target.id);
    const duration = Date.now() - startTime;
    logRequest({ clientIp, serverId: target.id, serverName: target.name, timestamp: new Date(), duration });
    console.log(`${id} [DONE] counted +1 -> ${target.name} (${duration}ms) total=${getServerStates()[target.id]?.requestCount}`);
  };

  // Hàm xử lý khi client ngắt giữa chừng — giải phóng kết nối nhưng KHÔNG đếm request
  const abort = () => {
    if (doneCalled) return;
    doneCalled = true;
    decrementConnections(target.id);
    console.log(`${id} [ABORT] client disconnect, NOT counted`);
  };

  // Đánh dấu +1 kết nối đang xử lý, sau đó proxy request đến backend
  incrementConnections(target.id);
  proxy.web(req, res, { target: targetUrl });

  // Lắng nghe sự kiện response: finish = thành công, close = client ngắt
  res.on('finish', () => { console.log(`${id} [EVENT] finish`); done(); });
  res.on('close',  () => { console.log(`${id} [EVENT] close (doneCalled=${doneCalled})`); abort(); });
});

// ── KHỞI ĐỘNG HỆ THỐNG ──────────────────────────────────────────────────
server.listen(LB_PORT, '0.0.0.0', () => {
  console.log(`🚀 LB Dashboard running at http://0.0.0.0:${LB_PORT}`);
  console.log(`📦 Mode: ${ENABLE_AWS ? 'AWS' : 'LOCAL'}`);
  if (ENABLE_AWS) {
    const albDns = process.env.ALB_DNS;
    console.log(`☁️  AWS mode: monitoring only. Traffic path: User → ALB → Target Group → EC2`);
    console.log(`🌐 ALB DNS: ${albDns || '(not set — check ALB_DNS in .env)'}`);
    console.log(`📊 Dashboard: http://localhost:${LB_PORT}/aws-monitor`);
  }
});

if (ENABLE_AWS) {
  // AWS mode: chỉ chạy AWS read-only polling, không health-check EC2 IP
  startWebSocketServer();
  console.log('☁️  AWS mode — no direct EC2 health checks, no local proxy, no auto scaling simulation');
} else {
  // Local mode: health-check EC2 giả, auto scaling simulation, proxy
  startHealthChecks();
  startAutoScalingLoop();
  startWebSocketServer();
  console.log('🖥️  Local mode — health checks + auto scaling simulation + proxy active');
}