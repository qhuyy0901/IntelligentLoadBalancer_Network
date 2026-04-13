/**
 * ============================================================================
 *  TRAFFIC — Trang Giám Sát Traffic Thời Gian Thực (Kiểu AWS ALB)
 * ============================================================================
 *
 *  Trang này hiển thị chi tiết traffic đi qua Load Balancer:
 *  - Biểu đồ RPS realtime theo từng server (cửa sổ 60 giây)
 *  - Bảng log request với filter theo server
 *  - Thống kê: tổng RPS, tổng request, server khỏe, latency, connections, error rate
 *  - Thanh RPS mini cho từng server
 *  - Nút tạo traffic test (20 request liên tiếp)
 *
 *  NGUỒN DỮ LIỆU: Lắng nghe sự kiện 'lb-stats' từ ws.js
 * ============================================================================
 */

const LB_BASE_TRAFFIC = `http://${window.location.hostname}:8000`;

/* ── Traffic log store ────────────────────────────────────── */
const MAX_TRAFFIC_LOGS = 200;
const trafficLogs = []; // [ { time, clientIp, serverId, serverName, duration } ]

/* ── Traffic chart (per-server RPS timeline) ──────────────── */
const TFC_MAX_PTS = 60;
const tfcLabels = Array.from({ length: TFC_MAX_PTS }, (_, i) => `-${TFC_MAX_PTS - i}s`);
tfcLabels[TFC_MAX_PTS - 1] = 'Now';

const TFC_COLORS = {
  'ec2-1': '#2dd4bf',
  'ec2-2': '#3b82f6',
  'ec2-3': '#f59e0b'
};

const tfcQueues = {
  'ec2-1': new Array(TFC_MAX_PTS).fill(0),
  'ec2-2': new Array(TFC_MAX_PTS).fill(0),
  'ec2-3': new Array(TFC_MAX_PTS).fill(0)
};

const tfcPrevCounts = { 'ec2-1': null, 'ec2-2': null, 'ec2-3': null };

let tfcChart = null;

function initTrafficChart() {
  const canvas = document.getElementById('tfc-chart');
  if (!canvas || tfcChart) return;

  tfcChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: [...tfcLabels],
      datasets: ['ec2-1', 'ec2-2', 'ec2-3'].map(id => ({
        label: id.toUpperCase(),
        data: [...tfcQueues[id]],
        borderColor: TFC_COLORS[id],
        backgroundColor: TFC_COLORS[id] + '20',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.45,
        fill: true
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            color: '#8fa3c0',
            boxWidth: 22,
            boxHeight: 2,
            font: { family: 'Inter', size: 12 },
            padding: 16,
            usePointStyle: false
          }
        },
        tooltip: {
          backgroundColor: '#1a2035',
          borderColor: 'rgba(255,255,255,0.12)',
          borderWidth: 1,
          titleColor: '#e8edf5',
          bodyColor: '#8fa3c0',
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} req/s`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#5a78a0', font: { size: 10 }, maxTicksLimit: 8 },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { color: 'rgba(255,255,255,0.06)' }
        },
        y: {
          min: 0,
          suggestedMax: 5,
          ticks: { color: '#5a78a0', font: { size: 11 }, precision: 0 },
          title: { display: true, text: 'req/s', color: '#5a78a0', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { color: 'rgba(255,255,255,0.06)' }
        }
      }
    }
  });
}

function updateTrafficChart(servers) {
  if (!tfcChart) return;
  const idToIdx = { 'ec2-1': 0, 'ec2-2': 1, 'ec2-3': 2 };
  servers.forEach(s => {
    const idx = idToIdx[s.id];
    if (idx === undefined) return;
    const curr = Number(s.requestCount || 0);
    const prev = tfcPrevCounts[s.id];
    const delta = (prev != null) ? Math.max(0, curr - prev) : 0;
    tfcPrevCounts[s.id] = curr;
    tfcQueues[s.id].push(delta);
    if (tfcQueues[s.id].length > TFC_MAX_PTS) tfcQueues[s.id].shift();
    tfcChart.data.datasets[idx].data = [...tfcQueues[s.id]];
  });
  tfcChart.update('none');
}

/* ── Traffic Stat Cards ───────────────────────────────────── */
function updateTrafficStats(servers, metrics) {
  const totalRps = servers.reduce((a, s) => a + Number(s.rps || 0), 0);
  const totalReq = servers.reduce((a, s) => a + (s.requestCount || 0), 0);
  const healthy = servers.filter(s => s.status === 'up' && s.enabled !== false).length;
  const totalConn = servers.reduce((a, s) => a + (s.activeConnections || 0), 0);

  const el = id => document.getElementById(id);
  if (el('tfc-total-rps')) el('tfc-total-rps').textContent = totalRps.toFixed(2);
  if (el('tfc-total-req')) el('tfc-total-req').textContent = totalReq.toLocaleString();
  if (el('tfc-healthy')) el('tfc-healthy').textContent = `${healthy}/${servers.length}`;
  if (el('tfc-avg-latency')) el('tfc-avg-latency').textContent = `${Number(metrics?.latencyAvgMs || 0).toFixed(0)} ms`;
  if (el('tfc-active-conn')) el('tfc-active-conn').textContent = totalConn;
  if (el('tfc-error-rate')) el('tfc-error-rate').textContent = `${Number(metrics?.packetLossPct || 0).toFixed(2)}%`;
}

/* ── Per-server mini RPS bars ─────────────────────────────── */
function updateServerRpsBars(servers) {
  const container = document.getElementById('tfc-server-bars');
  if (!container) return;
  const maxRps = Math.max(...servers.map(s => Number(s.rps || 0)), 1);

  container.innerHTML = servers.map(s => {
    const rps = Number(s.rps || 0);
    const pct = Math.min(100, (rps / maxRps) * 100);
    const color = TFC_COLORS[s.id] || '#8fa3c0';
    const isUp = s.status === 'up' && s.enabled !== false;
    return `
      <div class="tfc-server-bar-row">
        <div class="tfc-server-bar-label">
          <span class="tfc-server-dot" style="background:${color}"></span>
          <span>${s.name}</span>
          <span class="tfc-server-status ${isUp ? 'tfc-up' : 'tfc-down'}">${isUp ? 'UP' : 'DOWN'}</span>
        </div>
        <div class="tfc-bar-track">
          <div class="tfc-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="tfc-server-bar-meta">${rps.toFixed(1)} req/s · ${(s.requestCount||0).toLocaleString()} total</div>
      </div>
    `;
  }).join('');
}

/* ── Traffic Log Table ────────────────────────────────────── */
let trafficFilter = 'all';
const seenTrafficKeys = new Set();

function addTrafficLog(recentRequests) {
  recentRequests.forEach(r => {
    const key = `${r.clientIp}-${r.time}-${r.serverId}`;
    if (!seenTrafficKeys.has(key)) {
      seenTrafficKeys.add(key);
      setTimeout(() => seenTrafficKeys.delete(key), 60000);
      trafficLogs.unshift({
        time: r.time,
        clientIp: r.clientIp,
        serverId: r.serverId,
        serverName: r.serverName,
        duration: r.duration
      });
    }
  });
  if (trafficLogs.length > MAX_TRAFFIC_LOGS) trafficLogs.splice(MAX_TRAFFIC_LOGS);
  renderTrafficLogTable();

  // Update log count display
  const countEl = document.getElementById('tfc-log-count');
  if (countEl) countEl.textContent = `Log records: ${trafficLogs.length}`;
}

function renderTrafficLogTable() {
  const tbody = document.getElementById('tfc-log-body');
  if (!tbody) return;

  const filtered = trafficFilter === 'all'
    ? trafficLogs
    : trafficLogs.filter(r => r.serverId === trafficFilter);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="tfc-empty">Chưa có traffic — hãy gửi request đến ${LB_BASE_TRAFFIC}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.slice(0, 50).map(r => {
    const color = TFC_COLORS[r.serverId] || '#8fa3c0';
    const dur = Number(r.duration || 0);
    const durColor = dur < 50 ? '#22c55e' : dur < 200 ? '#f59e0b' : '#ef4444';
    const t = new Date(r.time);
    const timeStr = isNaN(t) ? '—' : t.toLocaleTimeString('vi-VN', { hour12: false });
    return `
      <tr class="tfc-log-row">
        <td class="tfc-log-cell tfc-time">${timeStr}</td>
        <td class="tfc-log-cell tfc-ip">${r.clientIp || '—'}</td>
        <td class="tfc-log-cell">
          <span class="tfc-chip" style="background:${color}20;border-color:${color}44;color:${color}">
            ${r.serverName || r.serverId}
          </span>
        </td>
        <td class="tfc-log-cell" style="color:${durColor};font-variant-numeric:tabular-nums">${dur} ms</td>
        <td class="tfc-log-cell"><span class="tfc-badge-ok">200 OK</span></td>
      </tr>
    `;
  }).join('');
}

/* ── Filter buttons ───────────────────────────────────────── */
function setupTrafficFilterBtns() {
  document.querySelectorAll('[data-tfc-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      trafficFilter = btn.dataset.tfcFilter;
      document.querySelectorAll('[data-tfc-filter]').forEach(b => b.classList.remove('tfc-filter-active'));
      btn.classList.add('tfc-filter-active');
      renderTrafficLogTable();
    });
  });
}

/* ── Clear logs ───────────────────────────────────────────── */
function setupClearBtn() {
  const btn = document.getElementById('tfc-clear-btn');
  if (btn) btn.addEventListener('click', () => {
    trafficLogs.length = 0;
    seenTrafficKeys.clear();
    renderTrafficLogTable();
  });
}

/* ── Generate test traffic ────────────────────────────────── */
function setupTfcGenerateBtn() {
  const btn = document.getElementById('tfc-generate-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Generating...';
    const tasks = Array.from({ length: 20 }, (_, i) =>
      new Promise(resolve => setTimeout(() => fetch(LB_BASE_TRAFFIC).catch(() => null).finally(resolve), i * 120))
    );
    await Promise.all(tasks);
    btn.disabled = false;
    btn.textContent = '⚡ Generate Traffic';
  });
}

/* ── Listen to lb-stats ───────────────────────────────────── */
window.addEventListener('lb-stats', (e) => {
  if (document.getElementById('page-traffic')?.classList.contains('hidden')) {
    // Still update chart queues even off-page for continuity
    updateTrafficChart(e.detail.servers);
    return;
  }
  const { servers, recentRequests, metrics } = e.detail;
  updateTrafficChart(servers);
  updateTrafficStats(servers, metrics);
  updateServerRpsBars(servers);
  addTrafficLog(recentRequests);
});

/* ── Init on DOM ready ────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initTrafficChart();
  setupTrafficFilterBtns();
  setupClearBtn();
  setupTfcGenerateBtn();
});

window._initTrafficChart = initTrafficChart;

// Update traffic chart theme colors
const origUpdateChartTheme = window._updateChartTheme;
window._updateChartTheme = function() {
  if (origUpdateChartTheme) origUpdateChartTheme();
  if (!tfcChart) return;
  const style = getComputedStyle(document.documentElement);
  const gridColor = style.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.04)';
  const borderColor = style.getPropertyValue('--chart-border').trim() || 'rgba(255,255,255,0.06)';
  const tickColor = style.getPropertyValue('--chart-tick').trim() || '#5a78a0';
  const tooltipBg = style.getPropertyValue('--tooltip-bg').trim() || '#1a2035';
  const tooltipBorder = style.getPropertyValue('--tooltip-border').trim() || 'rgba(255,255,255,0.12)';
  const textPrimary = style.getPropertyValue('--text-primary').trim() || '#e8edf5';
  const textSecondary = style.getPropertyValue('--text-secondary').trim() || '#8fa3c0';

  tfcChart.options.scales.x.ticks.color = tickColor;
  tfcChart.options.scales.x.grid.color = gridColor;
  tfcChart.options.scales.x.border.color = borderColor;
  tfcChart.options.scales.y.ticks.color = tickColor;
  tfcChart.options.scales.y.grid.color = gridColor;
  tfcChart.options.scales.y.border.color = borderColor;
  tfcChart.options.scales.y.title.color = tickColor;
  tfcChart.options.plugins.legend.labels.color = textSecondary;
  tfcChart.options.plugins.tooltip.backgroundColor = tooltipBg;
  tfcChart.options.plugins.tooltip.borderColor = tooltipBorder;
  tfcChart.options.plugins.tooltip.titleColor = textPrimary;
  tfcChart.options.plugins.tooltip.bodyColor = textSecondary;
  tfcChart.update();
};
