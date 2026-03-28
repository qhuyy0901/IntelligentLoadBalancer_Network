/**
 * Module Ghi Log Request
 * Lưu trữ vòng tròn (circular buffer) các request gần nhất
 * và tính tốc độ request theo từng server để hiển thị trên biểu đồ
 */

const config = require('../config/servers.json');

// Số lượng request tối đa giữ trong bộ nhớ
const BUFFER_SIZE = config.loadBalancer.logBufferSize || 100;
const recentRequests = [];

// Theo dõi timestamp của từng request theo serverId: { serverId: [timestamps] }
const rateTracker = {};
config.servers.forEach(s => { rateTracker[s.id] = []; });

/**
 * Ghi lại một request đã được xử lý vào buffer
 */
function logRequest({ clientIp, serverId, serverName, timestamp, duration }) {
  const entry = {
    time: timestamp || new Date(),
    clientIp: clientIp || '0.0.0.0',
    serverId,
    serverName,
    duration
  };

  // Thêm vào đầu danh sách (request mới nhất ở trên cùng)
  recentRequests.unshift(entry);
  if (recentRequests.length > BUFFER_SIZE) recentRequests.pop(); // Xóa entry cũ nhất nếu đầy

  // Lưu timestamp để tính tốc độ (RPS)
  if (rateTracker[serverId]) {
    rateTracker[serverId].push(Date.now());
    // Chỉ giữ lại các timestamp trong 60 giây gần nhất để tiết kiệm bộ nhớ
    const cutoff = Date.now() - 60000;
    rateTracker[serverId] = rateTracker[serverId].filter(t => t > cutoff);
  }
}

/**
 * Lấy số lượng request của mỗi server trong cửa sổ 2 giây gần nhất
 * Trả về số nguyên (vd: 0, 1, 3, 5) — hiển thị rõ ràng trên biểu đồ
 */
function getRates() {
  const now = Date.now();
  const windowMs = 2000; // Cửa sổ thời gian 2 giây
  const rates = {};
  config.servers.forEach(s => {
    // Đếm số timestamp nằm trong khoảng windowMs gần nhất
    const count = (rateTracker[s.id] || []).filter(t => t > now - windowMs).length;
    rates[s.id] = count; // Số nguyên: 0, 1, 2, 3... dễ nhìn trên biểu đồ
  });
  return rates;
}

/**
 * Lấy danh sách N request gần nhất để hiển thị trên bảng Recent Requests
 */
function getRecentRequests(limit = 20) {
  return recentRequests.slice(0, limit);
}

module.exports = { logRequest, getRates, getRecentRequests };
