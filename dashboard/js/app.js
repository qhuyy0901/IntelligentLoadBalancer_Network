/**
 * Bộ Điều Khiển Chính Dashboard
 * Nhận sự kiện lb-stats từ ws.js và cập nhật toàn bộ giao diện
 */

// ── LB API base URL — dùng host hiện tại để hoạt động cả local lẫn EC2 public
const LB_PORT = 8000;
const LB_API_BASE = `http://${window.location.hostname}:${LB_PORT}`;

// ── Bảng màu tương ứng từng EC2 server ────────────────────────────────────
const COLORS = {
  'ec2-1': '#2dd4bf',
  'ec2-2': '#3b82f6',
  'ec2-3': '#f59e0b'
};

// ── Lưu tham chiếu các phần tử DOM ────────────────────────────────────────
const serverTableBody = document.getElementById('serverTableBody');
const requestsTableBody = document.getElementById('requestsTableBody');
const lastUpdatedEl = document.getElementById('lastUpdated');
const alertIconEl = document.querySelector('.alert-icon');
const alertTextEl = document.querySelector('.alert-text');
const metricThroughputEl = document.getElementById('metricThroughput');
const metricThroughputHintEl = document.getElementById('metricThroughputHint');
const metricAvgLatencyEl = document.getElementById('metricAvgLatency');
const metricAvgLatencyHintEl = document.getElementById('metricAvgLatencyHint');
const metricP95LatencyEl = document.getElementById('metricP95Latency');
const metricP95LatencyHintEl = document.getElementById('metricP95LatencyHint');
const metricPacketLossEl = document.getElementById('metricPacketLoss');
const metricPacketLossHintEl = document.getElementById('metricPacketLossHint');
const metricSuccessRateEl = document.getElementById('metricSuccessRate');
const metricSuccessRateHintEl = document.getElementById('metricSuccessRateHint');
const metricAlgorithmEl = document.getElementById('metricAlgorithm');
const metricPoolHealthEl = document.getElementById('metricPoolHealth');
const metricModeHintEl = document.getElementById('metricModeHint');

// ── Đóng banner thông báo ─────────────────────────────────────────────────
document.getElementById('alertClose').addEventListener('click', () => {
  document.getElementById('alertBanner').classList.add('hidden');
});

// ── Nút Refresh ───────────────────────────────────────────────────────────
['refreshBtn', 'refreshBtn2'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    lastUpdatedEl.textContent = 'Đang làm mới...';
  });
});

// Nut tao traffic nhanh de kiem tra chart ngay tren dashboard
const generateBtn = document.getElementById('btnGenerateTraffic');
if (generateBtn) {
  generateBtn.addEventListener('click', async () => {
    if (generateBtn.disabled) return;
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

    const totalRequests = 30;
    const tasks = [];
    for (let i = 0; i < totalRequests; i += 1) {
      const task = new Promise((resolve) => {
        setTimeout(() => {
          fetch(LB_API_BASE)
            .catch(() => null)
            .finally(resolve);
        }, i * 80);
      });
      tasks.push(task);
    }

    await Promise.all(tasks);
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate Traffic';
  });
}

// ── Bật/Tắt EC2 Server từ Dashboard ─────────────────────────────────────
async function toggleServer(serverId, currentEnabled) {
  const newEnabled = !currentEnabled;
  try {
    await fetch(`${LB_API_BASE}/lb/config/server?id=${encodeURIComponent(serverId)}&enabled=${newEnabled}`, { method: 'POST' });
  } catch (e) {
    console.warn('[toggleServer] Không thể kết nối đến LB:', e);
  }
}

// ── Logic Modal Chi Tiết Server ───────────────────────────────────────────
let serverSnapshot = {}; // Lưu bản sao dữ liệu server mới nhất

function formatMetricCount(value) {
  return `${Math.round(Number(value || 0))}`;
}

function formatMetricPct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatMetricRps(value) {
  return `${Number(value || 0).toFixed(2)} req/s`;
}

function formatMetricMs(value) {
  return `${Number(value || 0).toFixed(2)} ms`;
}

function formatAlgorithmName(value) {
  return (value || 'round-robin').replace(/-/g, ' ').toUpperCase();
}

function calculateDistributionBalance(servers = []) {
  const enabled = servers.filter((server) => server.enabled !== false);
  if (enabled.length <= 1) return 100;

  const counts = enabled.map((server) => Number(server.requestCount || 0));
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total === 0) return 100;

  const ideal = total / enabled.length;
  const deviation = counts.reduce((sum, value) => sum + Math.abs(value - ideal), 0) / enabled.length;
  const ratio = Math.max(0, 1 - (deviation / ideal));
  return Number((ratio * 100).toFixed(2));
}

function openModal(serverId) {
  const s = serverSnapshot[serverId];
  if (!s) return;
  document.getElementById('modalTitle').textContent = `${s.name} — Chi tiết`;
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-stat"><span class="modal-stat-label">Tên server</span><span class="modal-stat-value">${s.name}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Domain</span><span class="modal-stat-value">${s.domain}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Cổng (Port)</span><span class="modal-stat-value">${s.port}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Trạng thái</span><span class="modal-stat-value" style="color:${s.status === 'up' ? '#86efac' : '#fca5a5'}">${s.status === 'up' ? 'HOẠT ĐỘNG' : 'NGỪNG'}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Tổng request đã xử lý</span><span class="modal-stat-value">${s.requestCount}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Kết nối đang xử lý</span><span class="modal-stat-value">${s.activeConnections}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Request / 2 giây</span><span class="modal-stat-value">${s.rps}</span></div>
  `;
  document.getElementById('modalOverlay').classList.remove('hidden');
}

// Đóng modal khi nhấn nút X hoặc click ra ngoài
document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('modalOverlay').classList.add('hidden');
});
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay'))
    document.getElementById('modalOverlay').classList.add('hidden');
});

// Nút "Details" tổng — mở chi tiết server đầu tiên
document.getElementById('btnAllDetails').addEventListener('click', () => {
  const first = Object.keys(serverSnapshot)[0];
  if (first) openModal(first);
});

// ── Render Bảng Trạng Thái Server ─────────────────────────────────────────
function renderServerTable(servers) {
  serverSnapshot = {};
  servers.forEach(s => { serverSnapshot[s.id] = s; });

  serverTableBody.innerHTML = servers.map(s => {
    const isEnabled = s.enabled !== false;
    const isUp = s.status === 'up' && isEnabled;
    const color = COLORS[s.id] || '#fff';
    const statusClass = !isEnabled ? 'status-disabled' : (isUp ? 'status-up' : 'status-down');
    const statusDot = !isEnabled ? 'disabled' : s.status;
    const statusText = !isEnabled ? 'Tạm loại' : (isUp ? 'Hoạt động' : 'Ngừng');
    return `
      <tr>
        <td>
          <div class="instance-cell">
            <div class="instance-name">
              <svg class="instance-icon" viewBox="0 0 24 16" fill="none" style="background:${color}22;border:1px solid ${color}44;padding:2px 4px;border-radius:3px">
                <rect x="1" y="2" width="22" height="12" rx="2" fill="${color}" opacity="0.7"/>
                <rect x="3" y="4" width="4" height="8" rx="1" fill="${color}dd"/>
                <rect x="9" y="4" width="4" height="8" rx="1" fill="${color}dd"/>
                <rect x="15" y="4" width="6" height="8" rx="1" fill="${color}dd"/>
              </svg>
              <strong>${s.name}</strong>
              <span style="color:var(--text-muted);font-weight:400">(${s.domain})</span>
            </div>
            <div class="instance-id-badge">● Req: ${s.requestCount} | Conn: ${s.activeConnections}${!isEnabled ? ' | Excluded from pool' : ''}</div>
          </div>
        </td>
        <td>
          <div class="status-badge ${statusClass}">
            <span class="status-dot ${statusDot}"></span>
            ${statusText}
          </div>
        </td>
        <td><span class="req-count">${s.requestCount}</span></td>
        <td>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn-detail" onclick="openModal('${s.id}')">Chi tiết ›</button>
            <button class="btn-toggle ${isEnabled ? 'btn-toggle-off' : 'btn-toggle-on'}"
              onclick="toggleServer('${s.id}', ${isEnabled})"
              title="${isEnabled ? 'Loại khỏi target group' : 'Thêm vào target group'}">
              ${isEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderPerformanceMetrics(metrics = {}, algorithm = 'round-robin', servers = []) {
  const enabledServers = servers.filter((server) => server.enabled !== false);
  const healthyServers = enabledServers.filter((server) => server.status === 'up');

  metricThroughputEl.textContent = formatMetricRps(metrics.throughputRps);
  metricThroughputHintEl.textContent = `${formatMetricCount(metrics.requestsInWindow || 0)} requests in ${Math.round((metrics.windowMs || 10000) / 1000)}s window`;
  metricAvgLatencyEl.textContent = formatMetricMs(metrics.latencyAvgMs);
  metricAvgLatencyHintEl.textContent = `p50 ${formatMetricMs(metrics.latencyP50Ms)} | stdev ${formatMetricMs(metrics.latencyStdevMs)}`;
  metricP95LatencyEl.textContent = formatMetricMs(metrics.latencyP99Ms);
  metricP95LatencyHintEl.textContent = `p97.5 ${formatMetricMs(metrics.latencyP975Ms)} | max ${formatMetricMs(metrics.latencyMaxMs)}`;
  metricPacketLossEl.textContent = formatMetricPct(metrics.packetLossPct);
  metricPacketLossHintEl.textContent = `${formatMetricCount(metrics.failureCount || 0)} failed attempts in window`;
  metricSuccessRateEl.textContent = formatMetricPct(metrics.successRatePct);
  metricSuccessRateHintEl.textContent = `${formatMetricCount(metrics.totalAttempts || 0)} total attempts`;
  metricAlgorithmEl.textContent = formatAlgorithmName(algorithm);
  metricPoolHealthEl.textContent = `${healthyServers.length}/${enabledServers.length} healthy`;
  metricModeHintEl.textContent = `${enabledServers.length} target members, ${algorithm || 'round-robin'} mode`;

  const healthyCount = metrics.healthyServers || 0;
  const totalCount = metrics.totalServers || 0;
  const loss = Number(metrics.packetLossPct || 0);

  if (healthyCount === 0) {
    alertIconEl.textContent = '!';
    alertTextEl.innerHTML = 'Load balancer is <strong>degraded</strong>: no healthy backend is currently available.';
    return;
  }

  if (loss > 0 || healthyCount < totalCount) {
    alertIconEl.textContent = '!';
    alertTextEl.innerHTML = `Load balancer is <strong>handling failover</strong> with ${healthyCount}/${totalCount} healthy backends and ${formatMetricPct(loss)} request loss.`;
    return;
  }

  alertIconEl.textContent = '✓';
  alertTextEl.innerHTML = `Load balancer is <strong>running</strong> in ${formatAlgorithmName(algorithm)} mode with ${healthyCount}/${totalCount} healthy backends.`;
}

// ── Render Bảng Lịch Sử Request ───────────────────────────────────────────

// Định dạng thời gian hiển thị
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Tạo chip hiển thị tên server đã xử lý
function serverChip(serverId, serverName) {
  const cls = `chip-${serverId}`;
  return `<span class="server-chip ${cls}"><span class="chip-icon">⬡</span>${serverName}</span>`;
}

// Tạo chip nhỏ cho cột phân phối
function distChip(serverId, serverName) {
  const color = COLORS[serverId] || '#fff';
  return `<span class="dist-chip"><span class="dist-line" style="background:${color}"></span>${serverName}</span>`;
}

// Lưu lịch sử IP — theo dõi server nào đã xử lý request từ IP đó
const ipHistory = {};

// ✅ FIX ANTI-DUPLICATE: Lưu các request đã render để tránh hiển thị trùng
// Key = "clientIp-timestamp-serverId", tự động xóa sau 30 giây để không rò bộ nhớ
const processedRequests = new Set();
function addProcessedKey(key) {
  processedRequests.add(key);
  setTimeout(() => processedRequests.delete(key), 30000);
}

function renderRequestsTable(requests) {
  if (!requests || requests.length === 0) {
    requestsTableBody.innerHTML = `<tr><td colspan="4" style="color:var(--text-muted);text-align:center;padding:24px">Chưa có request — hãy gửi traffic đến ${LB_API_BASE}</td></tr>`;
    return;
  }

  // Lọc trùng: mỗi request chỉ được render 1 lần dựa theo key ip+time+server
  const uniqueRequests = [];
  requests.forEach(r => {
    const key = `${r.clientIp}-${r.time}-${r.serverId}`;
    if (!processedRequests.has(key)) {
      addProcessedKey(key);
      uniqueRequests.push(r);
    }
  });

  if (uniqueRequests.length === 0) return; // Không có gì mới → không re-render

  requestsTableBody.innerHTML = uniqueRequests.slice(0, 10).map(r => {
    const ip = r.clientIp;
    // Cập nhật lịch sử server đã xử lý request từ IP này
    if (!ipHistory[ip]) ipHistory[ip] = [];
    if (!ipHistory[ip].includes(r.serverId)) {
      ipHistory[ip].unshift(r.serverId);
      if (ipHistory[ip].length > 3) ipHistory[ip].pop(); // Giữ tối đa 3 server gần nhất
    }

    const distChips = ipHistory[ip].map(sid => distChip(sid, sid.toUpperCase())).join('');

    return `
      <tr>
        <td class="time-cell">${formatTime(r.time)}</td>
        <td class="ip-cell">${ip}</td>
        <td>${serverChip(r.serverId, r.serverName)}</td>
        <td><div class="dist-chips">${distChips}</div></td>
      </tr>
    `;
  }).join('');
}

// ── Xử Lý Sự Kiện WebSocket Stats ─────────────────────────────────────────
// ✅ FIX THROTTLE: Chặn WebSocket spam — nếu event đến trong vòng 200ms thì bỏ qua
let lastUpdateTime = 0;

window.addEventListener('lb-stats', (e) => {
  const now = Date.now();

  // Nếu event đến quá nhanh (< 200ms) → bỏ qua, tránh render 2 lần cùng lúc
  if (now - lastUpdateTime < 200) return;
  lastUpdateTime = now;

  const { servers, recentRequests, metrics, algorithm } = e.detail;

  renderServerTable(servers);          // Cập nhật bảng trạng thái server
  renderRequestsTable(recentRequests); // Cập nhật bảng lịch sử request
  renderPerformanceMetrics(metrics, algorithm, servers);

  if (window.updateChart) window.updateChart(servers); // Cập nhật biểu đồ

  lastUpdatedEl.textContent = `Cập nhật lần cuối: ${new Date().toLocaleTimeString('vi-VN')}`;
});

// ── Hiển Thị Dữ Liệu Mặc Định Trước Khi Nhận Dữ Liệu WebSocket ───────────
document.addEventListener('DOMContentLoaded', () => {
  const skeleton = ['ec2-1', 'ec2-2', 'ec2-3'].map((id, i) => ({
    id,
    name: `EC2-${i + 1}`,
    domain: `${id}.example.com`,
    port: 3001 + i,
    status: 'up',
    requestCount: 0,
    activeConnections: 0,
    rps: 0
  }));
  renderServerTable(skeleton);
  renderRequestsTable([]);
  renderPerformanceMetrics({ healthyServers: 3, totalServers: 3, successRatePct: 100, throughputRps: 0 }, 'round-robin', skeleton);
});
