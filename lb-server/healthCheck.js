/**
 * Module Kiểm Tra Sức Khỏe Server (Health Check)
 * FIX: thêm threshold để tránh UP/DOWN liên tục
 */

const http = require('http');
const config = require('../config/servers.json');
const { updateServerStatus } = require('./balancer');

// ⏱️ thời gian check (5s là ổn)
const INTERVAL = config.loadBalancer.healthCheckInterval || 5000;

// 🧠 lưu trạng thái từng server
const serverState = {};

// init state
config.servers.forEach(s => {
  serverState[s.id] = {
    failCount: 0,
    successCount: 0,
    status: 'unknown'
  };
});

// ❌ xử lý khi fail
function handleFail(server, resolve) {
  const state = serverState[server.id];

  state.successCount = 0;
  state.failCount++;

  if (state.failCount >= 2 && state.status !== 'down') {
    state.status = 'down';
    updateServerStatus(server.id, 'down');
    console.log(`❌ ${server.name} → DOWN`);
  }

  resolve('down');
}

// ✅ check server
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

        if (state.successCount >= 2 && state.status !== 'up') {
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

// 🚀 start loop
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