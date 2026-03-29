/**
 * Các Thuật Toán Cân Bằng Tải
 * Hỗ trợ: round-robin, least-connections (ít kết nối nhất)
 */

const config = require('../config/servers.json');

let currentIndex = 0;
let lastPickedIndex = -1;

// Danh sách trạng thái từng server (được cập nhật bởi healthCheck)
let serverStates = {};

function initStates() {
  // Khởi tạo trạng thái ban đầu: tất cả server đều 'up'
  config.servers.forEach(s => {
    serverStates[s.id] = { ...s, status: 'up', activeConnections: 0, requestCount: 0 };
  });
}

initStates();

const SUPPORTED_ALGORITHMS = ['round-robin', 'least-connections', 'weighted-round-robin'];
const weightedCurrent = {};

function normalizeWeight(server) {
  const w = Number(server.weight);
  if (!Number.isFinite(w) || w <= 0) return 1;
  return w;
}

function getEligibleServers() {
  return config.servers.filter(s =>
    s.enabled !== false && serverStates[s.id] && serverStates[s.id].status === 'up'
  );
}

/**
 * Round-Robin: phân phối request lần lượt đến từng server khỏe mạnh
 */
function roundRobin() {
  const healthy = getEligibleServers();
  if (healthy.length === 0) return null; // Không có server nào hoạt động
  const server = healthy[currentIndex % healthy.length];
  currentIndex = (currentIndex + 1) % healthy.length;
  return server;
}

/**
 * Weighted Round-Robin (Smooth WRR): tôn trọng trọng số server mà vẫn chia đều theo thời gian
 */
function weightedRoundRobin() {
  const healthy = getEligibleServers();
  if (healthy.length === 0) return null;

  let best = null;
  let totalWeight = 0;

  healthy.forEach((server) => {
    const weight = normalizeWeight(server);
    totalWeight += weight;
    weightedCurrent[server.id] = (weightedCurrent[server.id] || 0) + weight;

    if (!best || weightedCurrent[server.id] > weightedCurrent[best.id]) {
      best = server;
    }
  });

  if (!best) return null;
  weightedCurrent[best.id] -= totalWeight;
  return best;
}

/**
 * Least-Connection: chọn server đang có ít kết nối đang xử lý nhất
 */
function leastConnections() {
  const healthy = getEligibleServers();
  if (healthy.length === 0) return null;

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  healthy.forEach((server, idx) => {
    const state = serverStates[server.id];
    const weight = normalizeWeight(server);
    const score = state.activeConnections / weight;

    if (score < bestScore) {
      best = server;
      bestScore = score;
      lastPickedIndex = idx;
      return;
    }

    // Tie-breaker: xoay vòng nhẹ để tránh dồn vào server đầu danh sách
    if (score === bestScore && idx > lastPickedIndex) {
      best = server;
      lastPickedIndex = idx;
    }
  });

  if (best && lastPickedIndex >= healthy.length - 1) lastPickedIndex = -1;
  return best;
}

/**
 * Lấy server tiếp theo dựa trên thuật toán đã cấu hình trong servers.json
 */
function getNextServer() {
  const algo = getAlgorithm();
  if (algo === 'least-connections') return leastConnections();
  if (algo === 'weighted-round-robin') return weightedRoundRobin();
  return roundRobin(); // Mặc định: round-robin
}

function getAlgorithm() {
  const algo = config.loadBalancer.algorithm;
  return SUPPORTED_ALGORITHMS.includes(algo) ? algo : 'round-robin';
}

function setAlgorithm(algorithm) {
  if (!SUPPORTED_ALGORITHMS.includes(algorithm)) return false;
  config.loadBalancer.algorithm = algorithm;
  return true;
}

function getSupportedAlgorithms() {
  return [...SUPPORTED_ALGORITHMS];
}

function setServerEnabled(serverId, enabled) {
  const server = config.servers.find((item) => item.id === serverId);
  if (!server) return false;

  server.enabled = enabled;
  if (serverStates[serverId]) serverStates[serverId].enabled = enabled;
  return true;
}

function getServersConfig() {
  return config.servers.map((server) => ({
    id: server.id,
    name: server.name,
    enabled: server.enabled !== false,
    weight: normalizeWeight(server)
  }));
}

// Tăng số kết nối đang hoạt động của server
function incrementConnections(serverId) {
  if (serverStates[serverId]) serverStates[serverId].activeConnections++;
}

// Giảm số kết nối đang hoạt động khi request hoàn tất
function decrementConnections(serverId) {
  if (serverStates[serverId] && serverStates[serverId].activeConnections > 0)
    serverStates[serverId].activeConnections--;
}

// Tăng tổng số request đã xử lý của server
function incrementRequestCount(serverId) {
  if (serverStates[serverId]) serverStates[serverId].requestCount++;
}

// Cập nhật trạng thái server: 'up' hoặc 'down'
function updateServerStatus(serverId, status) {
  if (serverStates[serverId]) serverStates[serverId].status = status;
}

// Trả về toàn bộ trạng thái hiện tại của các server
function getServerStates() {
  return serverStates;
}

module.exports = {
  getNextServer,
  getAlgorithm,
  setAlgorithm,
  getSupportedAlgorithms,
  setServerEnabled,
  getServersConfig,
  updateServerStatus,
  incrementConnections,
  decrementConnections,
  incrementRequestCount,
  getServerStates
};
