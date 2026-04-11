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

app.get('/', (req, res) => {
  const startTime = Date.now();
  const delay = Math.floor(Math.random() * 150) + 50;

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
    || req.socket.remoteAddress
    || '0.0.0.0';

  setTimeout(() => {
    res.json({
      server: SERVER_NAME,
      port: PORT,
      domain: 'ec2-3.ap-southeast-2.compute.amazonaws.com',
      requestCount,
      message: `Xin chào từ ${SERVER_NAME}! Request #${requestCount}`,
      timestamp: new Date().toISOString(),
      processingTime: delay
    });

    const duration = Date.now() - startTime;
    reportToLBDashboard({ clientIp, duration, path: req.path });
  }, delay);
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', server: SERVER_NAME, uptime: process.uptime() });
});

app.get('/stats', (req, res) => {
  res.json({ server: SERVER_NAME, requestCount, uptime: process.uptime() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${SERVER_NAME}] Đang chạy tại http://0.0.0.0:${PORT}`);
  console.log(`[${SERVER_NAME}] Dashboard log → http://${DASHBOARD_HOST}:${DASHBOARD_PORT}/lb/aws-log`);
});
