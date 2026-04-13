/**
 * ============================================================================
 *  HEALTH CHECK — Kiểm Tra Sức Khỏe Server Định Kỳ
 * ============================================================================
 *
 *  LUỒNG HOẠT ĐỘNG:
 *  1. Mỗi 5 giây, gửi GET /health đến từng EC2 server
 *  2. Nếu trả về HTTP 200 → server "up" (khỏe mạnh)
 *  3. Nếu lỗi hoặc timeout 3s → tăng bộ đếm fail
 *  4. Sau 3 lần fail LIÊN TIẾP → đánh dấu "down" (loại khỏi pool cân bằng tải)
 *  5. Chỉ cần 1 lần success → phục hồi "up" ngay lập tức
 *
 *  Cơ chế threshold tránh "flapping" (UP/DOWN liên tục do mạng không ổn định)
 * ============================================================================
 */

const http = require('http');
const config = require('../config/servers.json');
const { updateServerStatus } = require('./balancer'); // Cập nhật trạng thái server trong balancer

// Thời gian giữa các lần kiểm tra (mặc định 5000ms = 5 giây)
const INTERVAL = config.loadBalancer.healthCheckInterval || 5000;

// Lưu trạng thái health check từng server: failCount, successCount, status
const serverState = {};

// Khởi tạo — giả định tất cả server đều "up" khi mới khởi động
config.servers.forEach(s => {
  serverState[s.id] = {
    failCount: 0,
    successCount: 2,    // Giả lập 2 lần success ban đầu → status = 'up' ngay
    status: 'up'        // Bắt đầu UP — sẽ chuyển DOWN nếu fail 3 lần liên tiếp
  };
});

// Xử lý khi health check THẤT BẠI
function handleFail(server, resolve) {
  const state = serverState[server.id];

  state.successCount = 0;
  state.failCount++;

  // Cần 3 lần fail liên tiếp mới đánh dấu DOWN (tránh false positive)
  if (state.failCount >= 3 && state.status !== 'down') {
    state.status = 'down';
    updateServerStatus(server.id, 'down');
    console.log(`❌ ${server.name} → DOWN (${state.failCount} lần thất bại liên tiếp)`);
  } else if (state.failCount < 3) {
    console.log(`⚠️  ${server.name} fail ${state.failCount}/3 — vẫn giữ UP`);
  }

  resolve('down');
}

// Kiểm tra một server bằng HTTP GET /health
function checkServer(server) {
  return new Promise((resolve) => {
    const options = {
      hostname: server.host,
      port: server.port,
      path: '/health',
      method: 'GET',
      timeout: 3000
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        const state = serverState[server.id];

        state.failCount = 0;
        state.successCount++;

        // Chỉ cần 1 lần success là UP (thay vì 2)
        if (state.successCount >= 1 && state.status !== 'up') {
          state.status = 'up';
          updateServerStatus(server.id, 'up');
          console.log(`✅ ${server.name} → UP`);
        }

        resolve('up');
      } else {
        handleFail(server, resolve);
      }
    });

    req.on('error', () => handleFail(server, resolve));

    req.on('timeout', () => {
      req.destroy();
      handleFail(server, resolve);
    });

    req.end();
  });
}

// Khởi động vòng lặp kiểm tra sức khỏe định kỳ
function startHealthChecks() {
  console.log(`[HealthCheck] chạy mỗi ${INTERVAL}ms...`);

  setInterval(async () => {
    const results = await Promise.all(
      config.servers.map(s => checkServer(s))
    );

    const summary = config.servers
      .map((s, i) => `${s.name}:${results[i]}`)
      .join(' | ');

    console.log(`[HealthCheck] ${new Date().toLocaleTimeString()} → ${summary}`);
  }, INTERVAL);
}

module.exports = { startHealthChecks, checkServer };