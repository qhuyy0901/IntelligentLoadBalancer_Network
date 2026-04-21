

const http = require('http');
const httpProxy = require('http-proxy');    // Thư viện proxy HTTP — chuyển tiếp request đến backend
const config = require('../config/servers.json'); // Cấu hình trung tâm: port, thuật toán, danh sách server


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

const { startHealthChecks } = require('./healthCheck');
const { logRequest, logFailure, getRates, getRecentRequests, getLoadBalancingMetrics } = require('./logger');
const { startWebSocketServer } = require('./wsServer');
const { startAutoScalingLoop } = require('./autoScaling');

// Cổng Load Balancer — lấy từ config, mặc định 3000 nếu không có
const LB_PORT = config.loadBalancer.port || 3000;

// Tạo proxy server — xử lý việc chuyển tiếp HTTP request đến backend
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
    return res.end(JSON.stringify({ status: 'ok' }));
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

  // ── API nhận log từ EC2 backend khi traffic đến qua AWS ALB ───────────
  // EC2 gọi POST /lb/aws-log sau mỗi request thật để dashboard cập nhật
  if (req.url === '/lb/aws-log' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { serverId, serverName, clientIp, duration, path: reqPath } = data;

        // Validate: chỉ chấp nhận server đã biết
        const knownIds = config.servers.map(s => s.id);
        if (!serverId || !knownIds.includes(serverId)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Unknown serverId' }));
        }

        // Cập nhật counter và ghi log — giống hệt khi request đi qua Node LB
        incrementRequestCount(serverId);
        logRequest({
          clientIp: clientIp || '0.0.0.0',
          serverId,
          serverName: serverName || serverId,
          timestamp: new Date(),
          duration: Number(duration) || 0
        });

        console.log(`[AWS-ALB] ${clientIp} → ${serverName} (${duration}ms) via ALB`);
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


  // CÂN BẰNG TẢI CHÍNH — Chỉ đến đây mới thực sự proxy và đếm request
  // Thuật toán chọn server ở balancer.js: round-robin / least-connections / weighted
  
  console.log(`${id} [PROXY] --> routing to backend`);

  // Gọi balancer để chọn server backend tiếp theo
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
  console.log(`🚀 LB running at http://0.0.0.0:${LB_PORT}`);
});

startHealthChecks();      // Bắt đầu kiểm tra sức khỏe server mỗi 5 giây
startWebSocketServer();   // Bắt đầu WebSocket server phát dữ liệu cho Dashboard
startAutoScalingLoop();   // Mô phỏng Auto Scaling: tăng/giảm số EC2 đang tham gia pool