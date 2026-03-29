/**
 * WebSocket Server — Máy chủ dữ liệu thời gian thực
 * Phát (broadcast) thống kê hệ thống đến tất cả client dashboard mỗi 1 giây
 */

const WebSocket = require('ws');
const config = require('../config/servers.json');
const { getServerStates, getAlgorithm, getServersConfig } = require('./balancer');
const { getRates, getRecentRequests, getLoadBalancingMetrics } = require('./logger');

let wss;

function startWebSocketServer() {
  const WS_PORT = config.loadBalancer.wsPort || 8080;
  wss = new WebSocket.Server({ port: WS_PORT });

  console.log(`[WebSocket] Máy chủ dữ liệu thực tế tại ws://localhost:${WS_PORT}`);

  wss.on('connection', (ws) => {
    console.log('[WebSocket] Dashboard đã kết nối');
    ws.on('close', () => console.log('[WebSocket] Dashboard đã ngắt kết nối'));
  });

  // Gửi dữ liệu cập nhật đến tất cả client mỗi 1 giây
  setInterval(() => {
    if (wss.clients.size === 0) return; // Không có client nào → bỏ qua

    const states = getServerStates();   // Trạng thái từng server
    const rates = getRates();           // Tốc độ request trong 2 giây gần nhất
    const recentRequests = getRecentRequests(20); // 20 request mới nhất
    const metrics = getLoadBalancingMetrics();
    const enabledServers = getServersConfig();

    // Đóng gói dữ liệu thành JSON để gửi
    const payload = JSON.stringify({
      type: 'stats',
      timestamp: new Date().toISOString(),
      algorithm: getAlgorithm(),
      metrics: {
        ...metrics,
        healthyServers: config.servers.filter(s => states[s.id]?.status === 'up' && s.enabled !== false).length,
        totalServers: config.servers.filter(s => s.enabled !== false).length
      },
      servers: config.servers.map(s => ({
        id: s.id,
        name: s.name,
        domain: s.domain,
        color: s.color,
        port: s.port,
        enabled: enabledServers.find(server => server.id === s.id)?.enabled !== false,
        status: states[s.id]?.status || 'unknown',          // Trạng thái: up / down
        requestCount: states[s.id]?.requestCount || 0,      // Tổng số request đã xử lý
        activeConnections: states[s.id]?.activeConnections || 0, // Kết nối đang xử lý
        rps: rates[s.id] || 0                               // Request trong 2s gần nhất
      })),
      recentRequests: recentRequests.map(r => ({
        time: r.time,
        clientIp: r.clientIp,
        serverId: r.serverId,
        serverName: r.serverName,
        duration: r.duration
      }))
    });

    // Gửi đến từng client đang kết nối
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }, 1000);
}

module.exports = { startWebSocketServer };
