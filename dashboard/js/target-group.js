const tgHealthHistory = {};
const TG_MAX_HISTORY = 30;
let tgSnapshot = {
  ec2Instances: [],
  targetGroup: { registeredTargets: [] }
};

function pushHealthHistory(targetId, healthState) {
  if (!tgHealthHistory[targetId]) tgHealthHistory[targetId] = [];
  tgHealthHistory[targetId].push(healthState === 'healthy' ? 'healthy' : 'unhealthy');
  if (tgHealthHistory[targetId].length > TG_MAX_HISTORY) tgHealthHistory[targetId].shift();
}

function renderHealthBar(targetId) {
  const history = tgHealthHistory[targetId] || [];
  if (!history.length) return `<span style="color:var(--text-muted);font-size:11px">No data</span>`;
  return `<div style="display:flex;align-items:flex-end;gap:0">${history
    .map((item) => {
      const color = item === 'healthy' ? '#22c55e' : '#ef4444';
      return `<span style="display:inline-block;width:5px;height:16px;background:${color};border-radius:2px;opacity:.85;margin:0 1px"></span>`;
    })
    .join('')}</div>`;
}

function getTargetRows(payload) {
  const ec2Map = new Map((payload.ec2Instances || []).map((instance) => [instance.instanceId, instance]));
  return (payload.targetGroup?.registeredTargets || []).map((target) => ({
    ...target,
    instance: ec2Map.get(target.targetId) || null
  }));
}

function updateTargetGroupHeader(payload) {
  const arnEl = document.querySelector('.tg-arn');
  const badgeEls = document.querySelectorAll('.tg-protocol-badge');
  if (arnEl) {
    arnEl.textContent = payload.targetGroup?.arn || 'No TARGET_GROUP_ARN configured';
  }

  if (badgeEls[0]) {
    const protocol = payload.targetGroup?.protocol || 'HTTP';
    const port = payload.targetGroup?.port || 80;
    badgeEls[0].textContent = `${protocol} · Port ${port}`;
  }

  if (badgeEls[1]) {
    badgeEls[1].textContent = payload.loadBalancer?.dnsName
      ? `ALB: ${payload.loadBalancer.dnsName}`
      : 'ALB DNS unavailable';
  }
}

function renderTGSummary(payload, rows) {
  const healthy = rows.filter((row) => row.healthState === 'healthy').length;
  const unhealthy = rows.length - healthy;
  const healthyPct = rows.length ? Math.round((healthy / rows.length) * 100) : 0;

  const totalReq = rows.reduce((sum, row) => {
    const traffic = payload.traffic?.byInstance?.[row.targetId];
    return sum + Number(traffic?.requestCount || 0);
  }, 0);

  const totalRps = rows.reduce((sum, row) => {
    const traffic = payload.traffic?.byInstance?.[row.targetId];
    return sum + Number(traffic?.requestRate || 0);
  }, 0);

  document.getElementById('tg-healthy-count').textContent = String(healthy);
  document.getElementById('tg-unhealthy-count').textContent = String(unhealthy);
  document.getElementById('tg-total-req').textContent = totalReq.toLocaleString();
  document.getElementById('tg-total-rps').textContent = totalRps.toFixed(2);
  document.getElementById('tg-total-conn').textContent = '-';
  document.getElementById('tg-healthy-pct').textContent = rows.length ? `${healthyPct}%` : '0%';
}

function renderTargetGroupTable(payload) {
  const tbody = document.getElementById('tg-table-body');
  if (!tbody) return;

  const rows = getTargetRows(payload);
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">Loading AWS data...</td></tr>`;
    renderTGSummary(payload, []);
    return;
  }

  rows.forEach((row) => pushHealthHistory(row.targetId, row.healthState));

  tbody.innerHTML = rows
    .map((row) => {
      const health = row.healthState || 'unknown';
      const healthClass = health === 'healthy' ? 'tg-status-healthy' : 'tg-status-unhealthy';
      const requestCount = Number(payload.traffic?.byInstance?.[row.targetId]?.requestCount || 0).toLocaleString();
      const instance = row.instance;
      const label = instance?.name || row.targetId;
      const subtitle = instance ? `${instance.state} · ${instance.privateIp || instance.publicIp || 'N/A'}` : 'Instance data unavailable';

      return `
      <tr class="tg-row" data-id="${row.targetId}">
        <td class="tg-cell">
          <div class="tg-instance">
            <div class="tg-instance-avatar" style="background:#3b82f622;border-color:#3b82f655;color:#60a5fa">EC2</div>
            <div>
              <div class="tg-instance-name">${label}</div>
              <div class="tg-instance-id">${row.targetId} · ${subtitle}</div>
            </div>
          </div>
        </td>
        <td class="tg-cell">
          <div class="tg-health ${healthClass}">
            <span class="tg-health-dot"></span>
            ${health}
          </div>
        </td>
        <td class="tg-cell tg-num">${requestCount}</td>
        <td class="tg-cell">${renderHealthBar(row.targetId)}</td>
        <td class="tg-cell">
          <div class="tg-actions">
            <button class="tg-btn-detail" onclick="openTGModal('${row.targetId}')">Details</button>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  renderTGSummary(payload, rows);
}

function openTGModal(targetId) {
  const row = getTargetRows(tgSnapshot).find((item) => item.targetId === targetId);
  if (!row) return;

  const history = tgHealthHistory[targetId] || [];
  const healthyCount = history.filter((state) => state === 'healthy').length;
  const uptimePct = history.length ? Math.round((healthyCount / history.length) * 100) : 0;
  const traffic = tgSnapshot.traffic?.byInstance?.[targetId] || {};

  const instance = row.instance;
  document.getElementById('tg-modal-title').textContent = `${instance?.name || targetId} - Target Details`;
  document.getElementById('tg-modal-body').innerHTML = `
    <div class="tg-modal-grid">
      <div class="tg-modal-stat"><span class="tg-modal-label">Target ID</span><span class="tg-modal-value">${targetId}</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Health Status</span><span class="tg-modal-value">${row.healthState || 'unknown'}</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Health Reason</span><span class="tg-modal-value">${row.healthReason || 'N/A'}</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">AZ</span><span class="tg-modal-value">${row.availabilityZone || instance?.availabilityZone || 'N/A'}</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Port</span><span class="tg-modal-value">${row.port || tgSnapshot.targetGroup?.port || 'N/A'}</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Requests (60s)</span><span class="tg-modal-value">${Number(traffic.requestCount || 0).toLocaleString()}</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Req/s</span><span class="tg-modal-value">${Number(traffic.requestRate || 0).toFixed(2)}</span></div>
      <div class="tg-modal-stat"><span class="tg-modal-label">Uptime (last ${history.length})</span><span class="tg-modal-value">${uptimePct}%</span></div>
      <div class="tg-modal-stat" style="grid-column:1/-1"><span class="tg-modal-label">Health Check History</span><div style="margin-top:6px">${renderHealthBar(targetId)}</div></div>
    </div>
  `;

  document.getElementById('tg-modal-overlay').classList.remove('hidden');
}

window.openTGModal = openTGModal;

function setupModalClose() {
  const closeBtn = document.getElementById('tg-modal-close');
  const overlay = document.getElementById('tg-modal-overlay');
  if (closeBtn) closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
  if (overlay) overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.classList.add('hidden');
  });
}

window.addEventListener('lb-stats', (event) => {
  if (document.getElementById('page-target-group')?.classList.contains('hidden')) return;
  tgSnapshot = event.detail;
  updateTargetGroupHeader(tgSnapshot);
  renderTargetGroupTable(tgSnapshot);
});

document.addEventListener('DOMContentLoaded', () => {
  setupModalClose();
  renderTargetGroupTable({ ec2Instances: [], targetGroup: { registeredTargets: [] }, traffic: { byInstance: {} } });
});
