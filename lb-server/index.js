/**
 * Điểm Khởi Động Load Balancer
 * Máy chủ HTTP Proxy trên cổng 3000 — phân phối request đến các EC2 server
 */

const http = require('http');
const httpProxy = require('http-proxy');
const config = require('../config/servers.json');
const {
  getNextServer,
  getAlgorithm,
  setAlgorithm,
  getSupportedAlgorithms,
  incrementConnections,
  decrementConnections,
  incrementRequestCount
} = require('./balancer');
const { startHealthChecks } = require('./healthCheck');
const { logRequest, getRates } = require('./logger');
const { startWebSocketServer } = require('./wsServer');

const LB_PORT = config.loadBalancer.port || 3000;
const proxy = httpProxy.createProxyServer({});

// Xử lý lỗi proxy — trả về 502 Bad Gateway nếu không đến được server đích
proxy.on('error', (err, req, res) => {
  console.error('[LB] Lỗi proxy:', err.message);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway', message: 'Server đích không phản hồi' }));
  }
});

// ── Máy chủ HTTP chính ────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Cho phép dashboard truy cập từ bất kỳ origin nào (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Xử lý preflight request của trình duyệt
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API nội bộ — lấy thống kê cho dashboard (không qua proxy)
  if (req.url === '/lb/stats') {
    const states = require('./balancer').getServerStates();
    const recent = require('./logger').getRecentRequests(20);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ servers: states, recentRequests: recent, rates: getRates() }));
    return;
  }

  // API nội bộ — xem/cập nhật thuật toán cân bằng tải khi hệ thống đang chạy
  if (req.url === '/lb/config' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      algorithm: getAlgorithm(),
      supportedAlgorithms: getSupportedAlgorithms()
    }));
    return;
  }

  if (req.url.startsWith('/lb/config/algorithm') && req.method === 'POST') {
    const parsed = new URL(req.url, `http://${req.headers.host || `localhost:${LB_PORT}`}`);
    const algorithm = parsed.searchParams.get('name');

    if (!algorithm) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request', message: 'Thiếu query param: name' }));
      return;
    }

    if (!setAlgorithm(algorithm)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Bad Request',
        message: 'Thuật toán không hợp lệ',
        supportedAlgorithms: getSupportedAlgorithms()
      }));
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, algorithm: getAlgorithm() }));
    return;
  }

  // Chọn server tiếp theo theo thuật toán cân bằng tải
  const target = getNextServer();
  if (!target) {
    // Không có server nào khả dụng → trả lỗi 503
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service Unavailable', message: 'Không có server nào hoạt động' }));
    return;
  }

  const targetUrl = `http://${target.host}:${target.port}`;

  // Chuẩn hóa địa chỉ IP client — chuyển IPv6 loopback sang IPv4
  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
  if (clientIp === '::1')                  clientIp = '127.0.0.1';        // IPv6 loopback → IPv4
  else if (clientIp.startsWith('::ffff:')) clientIp = clientIp.slice(7); // IPv4 ánh xạ qua IPv6

  const startTime = Date.now();
  let released = false;

  // Bảo vệ để không trừ kết nối nhiều lần khi cùng lúc xảy ra lỗi proxy + finish/close
  const releaseConnection = () => {
    if (released) return;
    released = true;
    decrementConnections(target.id);
  };

  // Tăng đếm kết nối đang hoạt động
  incrementConnections(target.id);

  // Đính kèm header để EC2 server biết request đến qua Load Balancer
  req.headers['x-forwarded-for'] = clientIp;
  req.headers['x-load-balancer'] = 'IntelligentLB/1.0';

  // Chuyển tiếp request đến server đích
  proxy.web(req, res, { target: targetUrl }, (err) => {
    releaseConnection();
    console.error(`[LB] Không thể kết nối đến ${target.name}:`, err.message);
  });

  // Ghi log sau khi response hoàn tất
  res.on('finish', () => {
    releaseConnection();
    incrementRequestCount(target.id);
    const duration = Date.now() - startTime;

    logRequest({
      clientIp,
      serverId: target.id,
      serverName: target.name,
      timestamp: new Date(),
      duration
    });

    console.log(`[LB] ${clientIp} → ${target.name} (${duration}ms) HTTP ${res.statusCode}`);
  });

  // Trường hợp client ngắt kết nối sớm trước khi finish
  res.on('close', releaseConnection);
});

// ── Khởi động toàn bộ hệ thống ───────────────────────────────────────────
server.listen(LB_PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Intelligent Load Balancer v1.0       ║');
  console.log(`║   Đang lắng nghe: http://localhost:${LB_PORT}  ║`);
  console.log('╚════════════════════════════════════════╝');
  console.log('');
});

startHealthChecks();      // Bắt đầu kiểm tra sức khỏe server định kỳ
startWebSocketServer();   // Khởi động WebSocket để đẩy dữ liệu lên dashboard
