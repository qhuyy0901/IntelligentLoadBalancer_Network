const express = require('express');
const app = express();
const PORT = 3003;
const SERVER_NAME = 'EC2-3';

let requestCount = 0; // Tổng số request đã xử lý

// Middleware đếm request (bỏ qua request health check)
app.use((req, res, next) => {
  if (req.path !== '/health') requestCount++;
  next();
});

// Endpoint chính — trả về thông tin server và thời gian xử lý
app.get('/', (req, res) => {
  // Giả lập thời gian xử lý ngẫu nhiên (50–200ms) như server thật
  const delay = Math.floor(Math.random() * 150) + 50;
  setTimeout(() => {
    res.json({
      server: SERVER_NAME,
      port: PORT,
      domain: 'ec2-3.example.com',
      requestCount,
      message: `Xin chào từ ${SERVER_NAME}! Request #${requestCount}`,
      timestamp: new Date().toISOString(),
      processingTime: delay
    });
  }, delay);
});

// Endpoint kiểm tra sức khỏe — Load Balancer ping định kỳ vào đây
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', server: SERVER_NAME, uptime: process.uptime() });
});

// Endpoint thống kê — trả về số request và thời gian hoạt động
app.get('/stats', (req, res) => {
  res.json({ server: SERVER_NAME, requestCount, uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`[${SERVER_NAME}] Đang chạy tại http://localhost:${PORT}`);
});
