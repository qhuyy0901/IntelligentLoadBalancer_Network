/**
 * Module Ghi Log Request
 * Lưu trữ vòng tròn (circular buffer) các request gần nhất
 * và tính tốc độ request theo từng server để hiển thị trên biểu đồ
 */

const config = require('../config/servers.json');

// Số lượng request tối đa giữ trong bộ nhớ
const BUFFER_SIZE = config.loadBalancer.logBufferSize || 100;
const recentRequests = [];
const METRICS_WINDOW_MS = 10000;
const DISTRIBUTION_WINDOW_MS = config.loadBalancer.distributionWindowMs || 8000;

// Theo dõi timestamp của từng request theo serverId: { serverId: [timestamps] }
const rateTracker = {};
const globalRateTracker = [];
const failureTracker = [];
config.servers.forEach(s => { rateTracker[s.id] = []; });

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  const weight = rank - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function pruneTrackers(now = Date.now()) {
  const rateCutoff = now - 60000;
  const metricsCutoff = now - METRICS_WINDOW_MS;

  config.servers.forEach((s) => {
    rateTracker[s.id] = (rateTracker[s.id] || []).filter(t => t > rateCutoff);
  });

  while (globalRateTracker.length && globalRateTracker[0] <= metricsCutoff) globalRateTracker.shift();
  while (failureTracker.length && failureTracker[0] <= metricsCutoff) failureTracker.shift();
}

/**
 * Ghi lại một request đã được xử lý vào buffer
 */
function logRequest({ clientIp, serverId, serverName, timestamp, duration }) {
  const now = Date.now();
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
    rateTracker[serverId].push(now);
  }

  globalRateTracker.push(now);
  pruneTrackers(now);
}

function logFailure() {
  failureTracker.push(Date.now());
  pruneTrackers();
}

/**
 * Lấy số lượng request của mỗi server trong cửa sổ distribution gần nhất
 * Trả về số nguyên (vd: 0, 1, 3, 5) — hiển thị rõ ràng trên biểu đồ
 */
function getRates() {
  const now = Date.now();
  pruneTrackers(now);
  const rates = {};
  config.servers.forEach(s => {
    // Đếm số timestamp nằm trong khoảng distribution window gần nhất
    const count = (rateTracker[s.id] || []).filter(t => t > now - DISTRIBUTION_WINDOW_MS).length;
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

function getLoadBalancingMetrics() {
  const now = Date.now();
  pruneTrackers(now);

  const successCount = globalRateTracker.length;
  const failureCount = failureTracker.length;
  const totalAttempts = successCount + failureCount;
  const throughputRps = successCount / (METRICS_WINDOW_MS / 1000);

  const latencySamples = recentRequests
    .filter((entry) => {
      const ts = new Date(entry.time).getTime();
      return Number.isFinite(ts) && ts > now - METRICS_WINDOW_MS;
    })
    .map((entry) => Number(entry.duration || 0))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  const latencyCount = latencySamples.length;
  const latencyAvg = latencyCount
    ? latencySamples.reduce((sum, value) => sum + value, 0) / latencyCount
    : 0;
  const latencyVariance = latencyCount
    ? latencySamples.reduce((sum, value) => sum + ((value - latencyAvg) ** 2), 0) / latencyCount
    : 0;
  const latencyStdev = Math.sqrt(latencyVariance);
  const latencyMin = latencyCount ? latencySamples[0] : 0;
  const latencyMax = latencyCount ? latencySamples[latencyCount - 1] : 0;

  return {
    windowMs: METRICS_WINDOW_MS,
    requestsInWindow: successCount,
    throughputRps: round2(throughputRps),
    packetLossPct: totalAttempts === 0 ? 0 : round2((failureCount / totalAttempts) * 100),
    successRatePct: totalAttempts === 0 ? 100 : round2((successCount / totalAttempts) * 100),
    latencySamples: latencyCount,
    latencyMinMs: round2(latencyMin),
    latencyAvgMs: round2(latencyAvg),
    latencyStdevMs: round2(latencyStdev),
    latencyP50Ms: round2(percentile(latencySamples, 50)),
    latencyP975Ms: round2(percentile(latencySamples, 97.5)),
    latencyP99Ms: round2(percentile(latencySamples, 99)),
    latencyMaxMs: round2(latencyMax),
    totalAttempts,
    failureCount
  };
}

module.exports = { logRequest, logFailure, getRates, getRecentRequests, getLoadBalancingMetrics };
