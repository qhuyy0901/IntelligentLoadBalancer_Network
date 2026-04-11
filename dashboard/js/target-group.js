/**
 * Target Group Page — Hiển thị AWS-style Target Group
 * Danh sách EC2, status healthy/unhealthy, request count, RPS, active connections
 */

/* ── AWS Health Check History per instance ────────────────── */
const healthHistory = {}; // { serverId: [ 'healthy' | 'unhealthy', ... ] (last 30) }
const MAX_HISTORY = 30;

function pushHealth(serverId, isHealthy) {
  if (!healthHistory[serverId]) healthHistory[serverId] = [];
  healthHistory[serverId].push(isHealthy ? 'healthy' : 'unhealthy');
  if (healthHistory[serverId].length > MAX_HISTORY) healthHistory[serverId].shift();
}

/* ── Render health sparkbar ───────────────────────────────── */
function renderHealthBar(serverId) {
  const history = healthHistory[serverId] || [];
  if (history.length === 0) {
    return `<span style="color:var(--text-muted);font-size:11px">No data</span>`;
  }
  const bars = history.map(h => {
    const color = h === 'healthy' ? '#22c55e' : '#ef4444';
    return `<span style="display:inline-block;width:5px;height:16px;background:${color};border-radius:2px;opacity:0.85;margin:0 1px"></span>`;
  }).join('');
  return `<div style="display:flex;align-items:flex-end;gap:0">${bars}</div>`;
}

/* ── Render summary badges ────────────────────────────────── */
function renderTGSummary(servers) {
  const total = servers.length;
  const healthy = servers.filter(s => s.status === 'up' && s.enabled !== false).length;
  const unhealthy = total - healthy;
  const totalReq = servers.reduce((a, s) => a + (s.requestCount || 0), 0);
  const totalRps = servers.reduce((a, s) => a + (Number(s.rps) || 0), 0);
  const totalConn = servers.reduce((a, s) => a + (s.activeConnections || 0), 0);

  document.getElementById('tg-healthy-count').textContent = healthy;
  document.getElementById('tg-unhealthy-count').textContent = unhealthy;
  document.getElementById('tg-total-req').textContent = totalReq.toLocaleString();
  document.getElementById('tg-total-rps').textContent = totalRps.toFixed(1);
  document.getElementById('tg-total-conn').textContent = totalConn;
  document.getElementById('tg-healthy-pct').textContent =
    total > 0 ? `${Math.round((healthy / total) * 100)}%` : '—';
}

/* ── Render main target group table ──────────────────────── */
function renderTargetGroupTable(servers) {
  const tbody = document.getElementById('tg-table-body');
  if (!tbody) return;

  servers.forEach(s => pushHealth(s.id, s.status === 'up' && s.enabled !== false));

  tbody.innerHTML = servers.map(s => {
    const isEnabled = s.enabled !== false;
    const isHealthy = s.status === 'up' && isEnabled;
    const healthClass = !isEnabled ? 'tg-status-draining' : (isHealthy ? 'tg-status-healthy' : 'tg-status-unhealthy');
    const healthLabel = !isEnabled ? 'draining' : (isHealthy ? 'healthy' : 'unhealthy');
    const rps = Number(s.rps || 0).toFixed(1);
    const conn = s.activeConnections || 0;
    const reqCount = (s.requestCount || 0).toLocaleString();

    const color = { 'ec2-1': '#2dd4bf', 'ec2-2': '#3b82f6', 'ec2-3': '#f59e0b' }[s.id] || '#8fa3c0';

    return `
      <tr class="tg-row" data-id="${s.id}">
        <td class="tg-cell">
          <div class="tg-instance">
            <div class="tg-instance-avatar" style="background:${color}22;border-color:${color}55;color:${color}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="2" y="3" width="20" height="14" rx="3" opacity=".7"/>
                <rect x="4" y="19" width="4" height="2" rx="1"/>
                <rect x="10" y="19" width="4" height="2" rx="1"/>
                <rect x="16" y="19" width="4" height="2" rx="1"/>
                <rect x="4" y="19" width="16" height="1" rx=".5" opacity=".4"/>
              </svg>
            </div>
            <div>
              <div class="tg-instance-name">${s.name}</div>
              <div class="tg-instance-id">${s.id} · ${s.domain || s.id + '.local'}</div>
            </div>
          </div>
        </td>
        <td class="tg-cell">
          <div class="tg-health ${healthClass}">
            <span class="tg-health-dot"></span>
            ${healthLabel}
          </div>
        </td>
        <td class="tg-cell tg-num">${reqCount}</td>
        <td class="tg-cell">${renderHealthBar(s.id)}</td>
        <td class="tg-cell">
          <div class="tg-actions">
            <button class="tg-btn-detail" onclick="openTGModal('${s.id}')">Details</button>
            <button class="tg-btn-toggle ${isEnabled ? 'tg-btn-deregister' : 'tg-btn-register'}"
              onclick="toggleTGServer('${s.id}', ${isEnabled})">
              ${isEnabled ? 'Deregister' : 'Register'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/* ── Server Snapshot for modal ────────────────────────────── */
let tgServerSnapshot = {};

function openTGModal(serverId) {
  const s = tgServerSnapshot[serverId];
  if (!s) return;
  const isHealthy = s.status === 'up' && s.enabled !== false;
  const healthColor = isHealthy ? '#22c55e' : '#ef4444';
  const histArr = healthHistory[serverId] || [];
  const healthyCount = histArr.filter(h => h === 'healthy').length;
  const pct = histArr.length > 0 ? Math.round((healthyCount / histArr.length) * 100) : 0;

  document.getElementById('tg-modal-title').textContent = `${s.name} — Target Details`;
  document.getElementById('tg-modal-body').innerHTML = `
    <div class="tg-modal-grid">
      <div class="tg-modal-stat"><span class="tg-modal-label">Instance ID</span><span class="tg-modal-value">${s.id}</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Name</span><span class="tg-modal-value">${s.name}</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Domain</span><span class="tg-modal-value">${s.domain || '—'}</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Port</span><span class="tg-modal-value">${s.port || '—'}</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Health Status</span>
        <span class="tg-modal-value" style="color:${healthColor};font-weight:700">${isHealthy ? '✓ healthy' : '✗ unhealthy'}</span>
      </div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Uptime (30 checks)</span><span class="tg-modal-value">${pct}%</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Total Requests</span><span class="tg-modal-value">${(s.requestCount || 0).toLocaleString()}</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Active Connections</span><span class="tg-modal-value">${s.activeConnections || 0}</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Requests / sec</span><span class="tg-modal-value">${Number(s.rps || 0).toFixed(2)} req/s</span></div>
      <div class="tg-modal-stat" style="grid-column:1/-1"><span class="tg-modal-label">Health Check History (last ${histArr.length})</span>
        <div style="margin-top:6px">${renderHealthBar(serverId)}</div>
      </div>
    </div>
  `;
  document.getElementById('tg-modal-overlay').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('tg-modal-close');
  const overlay = document.getElementById('tg-modal-overlay');
  if (closeBtn) closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
  if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
});

/* ── Toggle server (register / deregister) ────────────────── */
const LB_PORT_TG = 8000;
const LB_API_TG = `http://${window.location.hostname}:${LB_PORT_TG}`;

async function toggleTGServer(serverId, currentEnabled) {
  try {
    await fetch(`${LB_API_TG}/lb/config/server?id=${encodeURIComponent(serverId)}&enabled=${!currentEnabled}`, { method: 'POST' });
  } catch (e) {
    console.warn('[TG] Không thể kết nối LB:', e);
  }
}

/* ── Listen to lb-stats events (from ws.js) ───────────────── */
window.addEventListener('lb-stats', (e) => {
  if (document.getElementById('page-target-group')?.classList.contains('hidden')) return;
  const { servers } = e.detail;
  tgServerSnapshot = {};
  servers.forEach(s => { tgServerSnapshot[s.id] = s; });
  renderTargetGroupTable(servers);
  renderTGSummary(servers);
});

/* ── Init skeleton ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const skeleton = ['ec2-1', 'ec2-2', 'ec2-3'].map((id, i) => ({
    id,
    name: `EC2-${i + 1}`,
    domain: `${id}.local`,
    port: 3001 + i,
    status: 'up',
    requestCount: 0,
    activeConnections: 0,
    rps: 0,
    enabled: true
  }));
  skeleton.forEach(s => { tgServerSnapshot[s.id] = s; });
  if (!document.getElementById('page-target-group')?.classList.contains('hidden')) {
    renderTargetGroupTable(skeleton);
    renderTGSummary(skeleton);
  }
});
