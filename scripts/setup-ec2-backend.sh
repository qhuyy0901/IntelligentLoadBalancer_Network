#!/bin/bash
# ========================================
# Setup Backend Server cho EC2-2 hoặc EC2-3
# Chạy script này trên EC2-2 VÀ EC2-3
# ========================================

# Tên server (EC2-2 hoặc EC2-3) — truyền qua tham số
SERVER_NAME=${1:-EC2-2}

echo "=== Cài đặt Node.js ==="
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

echo "=== Tạo thư mục project ==="
mkdir -p ~/backend && cd ~/backend

echo "=== Tạo package.json ==="
cat > package.json << 'EOF'
{
  "name": "ec2-backend",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.21.2"
  }
}
EOF

echo "=== Cài đặt dependencies ==="
npm install

echo "=== Tạo server.js ==="
cat > server.js << SERVEREOF
const express = require('express');
const app = express();
const PORT = 3000;
const SERVER_NAME = '$SERVER_NAME';

let requestCount = 0;

app.use((req, res, next) => {
  if (req.path !== '/health') requestCount++;
  next();
});

app.get('/', (req, res) => {
  const delay = Math.floor(Math.random() * 150) + 50;
  setTimeout(() => {
    res.json({
      server: SERVER_NAME,
      port: PORT,
      requestCount,
      message: 'Hello from ' + SERVER_NAME + '! Request #' + requestCount,
      timestamp: new Date().toISOString(),
      processingTime: delay,
      clientIp: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    });
  }, delay);
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', server: SERVER_NAME, uptime: process.uptime() });
});

app.get('/stats', (req, res) => {
  res.json({ server: SERVER_NAME, requestCount, uptime: process.uptime() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('[' + SERVER_NAME + '] Running at http://0.0.0.0:' + PORT);
});
SERVEREOF

echo "=== Khởi chạy server ==="
nohup node server.js > ~/backend/server.log 2>&1 &
echo "Server $SERVER_NAME đang chạy ở port 3000 (background)"
echo "Log: ~/backend/server.log"
echo "Test: curl http://localhost:3000/health"
