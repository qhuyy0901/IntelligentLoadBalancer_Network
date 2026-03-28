/**
 * Bộ Điều Khiển Chính Dashboard
 * Nhận sự kiện lb-stats từ ws.js và cập nhật toàn bộ giao diện
 */

// ── Bảng màu tương ứng từng EC2 server ────────────────────────────────────
const COLORS = {
  'ec2-1': '#2dd4bf',
  'ec2-2': '#3b82f6',
  'ec2-3': '#f59e0b'
};

// ── Lưu tham chiếu các phần tử DOM ────────────────────────────────────────
const serverTableBody    = document.getElementById('serverTableBody');
const requestsTableBody  = document.getElementById('requestsTableBody');
const lastUpdatedEl      = document.getElementById('lastUpdated');

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

// ── Logic Modal Chi Tiết Server ───────────────────────────────────────────
let serverSnapshot = {}; // Lưu bản sao dữ liệu server mới nhất

function openModal(serverId) {
  const s = serverSnapshot[serverId];
  if (!s) return;
  document.getElementById('modalTitle').textContent = `${s.name} — Chi tiết`;
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-stat"><span class="modal-stat-label">Tên server</span><span class="modal-stat-value">${s.name}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Domain</span><span class="modal-stat-value">${s.domain}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Cổng (Port)</span><span class="modal-stat-value">${s.port}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Trạng thái</span><span class="modal-stat-value" style="color:${s.status==='up'?'#86efac':'#fca5a5'}">${s.status === 'up' ? 'HOẠT ĐỘNG' : 'NGỪNG'}</span></div>
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
    const isUp = s.status === 'up';
    const color = COLORS[s.id] || '#fff';
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
            <div class="instance-id-badge">● Req: ${s.requestCount} | Conn: ${s.activeConnections}</div>
          </div>
        </td>
        <td>
          <div class="status-badge ${isUp ? 'status-up' : 'status-down'}">
            <span class="status-dot ${s.status}"></span>
            ${isUp ? 'Hoạt động' : 'Ngừng'}
          </div>
        </td>
        <td><span class="req-count">${s.requestCount}</span></td>
        <td>
          <button class="btn-detail" onclick="openModal('${s.id}')">Chi tiết ›</button>
        </td>
      </tr>
    `;
  }).join('');
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

function renderRequestsTable(requests) {
  if (!requests || requests.length === 0) {
    requestsTableBody.innerHTML = `<tr><td colspan="4" style="color:var(--text-muted);text-align:center;padding:24px">Chưa có request — hãy gửi traffic đến http://localhost:3000</td></tr>`;
    return;
  }

  requestsTableBody.innerHTML = requests.slice(0, 10).map(r => {
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
window.addEventListener('lb-stats', (e) => {
  const { servers, recentRequests } = e.detail;

  renderServerTable(servers);          // Cập nhật bảng trạng thái server
  renderRequestsTable(recentRequests); // Cập nhật bảng lịch sử request

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
});
