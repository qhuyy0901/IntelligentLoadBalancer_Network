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

// ── Endpoint chính ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const startTime = Date.now();
  const delay = Math.floor(Math.random() * 150) + 50;

  // Lấy IP thật từ header ALB
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
    || req.socket.remoteAddress
    || '0.0.0.0';

  setTimeout(() => {
    res.json({
      server: SERVER_NAME,
      port: PORT,
      domain: 'ec2-1.ap-southeast-2.compute.amazonaws.com',
      requestCount,
      message: `Xin chào từ ${SERVER_NAME}! Request #${requestCount}`,
      timestamp: new Date().toISOString(),
      processingTime: delay
    });

    // ✅ Gửi log về dashboard SAU khi đã response xong
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
