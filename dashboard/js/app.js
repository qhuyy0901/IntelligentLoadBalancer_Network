
const LB_PORT = 8000;
const LB_API_BASE = `http://${window.location.hostname}:${LB_PORT}`;
const INSTANCE_COLORS = ['#2dd4bf', '#3b82f6', '#f59e0b', '#f43f5e', '#22c55e', '#8b5cf6', '#a855f7'];

const serverTableBody = document.getElementById('serverTableBody');
const requestsTableBody = document.getElementById('requestsTableBody');
const lastUpdatedEl = document.getElementById('lastUpdated');
const alertIconEl = document.querySelector('.alert-icon');
const alertTextEl = document.querySelector('.alert-text');
const metricThroughputEl = document.getElementById('metricThroughput');
const metricThroughputHintEl = document.getElementById('metricThroughputHint');
const metricAvgLatencyEl = document.getElementById('metricAvgLatency');
const metricAvgLatencyHintEl = document.getElementById('metricAvgLatencyHint');
const metricPacketLossEl = document.getElementById('metricPacketLoss');
const metricPacketLossHintEl = document.getElementById('metricPacketLossHint');
const metricSuccessRateEl = document.getElementById('metricSuccessRate');
const metricSuccessRateHintEl = document.getElementById('metricSuccessRateHint');
const metricAlgorithmEl = document.getElementById('metricAlgorithm');
const metricPoolHealthEl = document.getElementById('metricPoolHealth');
const metricModeHintEl = document.getElementById('metricModeHint');
const awsErrorCardEl = document.getElementById('awsErrorCard');
const awsErrorMsgEl = document.getElementById('awsErrorMsg');

document.getElementById('alertClose').addEventListener('click', () => {
  document.getElementById('alertBanner').classList.add('hidden');
});

['refreshBtn', 'refreshBtn2'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    lastUpdatedEl.textContent = 'Đang làm mới...';
  });
});

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

let serverSnapshot = {};
let latestAwsPayload = null;

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
  return (value || 'AWS ALB').replace(/-/g, ' ').toUpperCase();
}

function getInstanceColor(instanceId, index) {
  const fallbackIndex = typeof index === 'number' ? index : 0;
  const hash = Array.from(String(instanceId || 'instance')).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return INSTANCE_COLORS[(hash + fallbackIndex) % INSTANCE_COLORS.length];
}

function openModal(serverId) {
  const s = serverSnapshot[serverId];
  if (!s) return;

  const target = (latestAwsPayload?.targetGroup?.registeredTargets || []).find((item) => item.targetId === serverId);
  const traffic = latestAwsPayload?.traffic?.byInstance?.[serverId] || {};

  document.getElementById('modalTitle').textContent = `${s.name} - AWS EC2 Details`;
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-stat"><span class="modal-stat-label">Instance ID</span><span class="modal-stat-value">${s.instanceId}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Name</span><span class="modal-stat-value">${s.name}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">State</span><span class="modal-stat-value">${s.state}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Public IP</span><span class="modal-stat-value">${s.publicIp || 'N/A'}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Private IP</span><span class="modal-stat-value">${s.privateIp || 'N/A'}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">AZ</span><span class="modal-stat-value">${s.availabilityZone || 'N/A'}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Target Health</span><span class="modal-stat-value">${target?.healthState || 'unknown'}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Health Reason</span><span class="modal-stat-value">${target?.healthReason || '—'}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Requests (60s)</span><span class="modal-stat-value">${traffic.requestCount || 0}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Req/s (60s)</span><span class="modal-stat-value">${Number(traffic.requestRate || 0).toFixed(2)}</span></div>
  `;
  document.getElementById('modalOverlay').classList.remove('hidden');
}

window.openModal = openModal;

document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('modalOverlay').classList.add('hidden');
});
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay'))
    document.getElementById('modalOverlay').classList.add('hidden');
});

document.getElementById('btnAllDetails').addEventListener('click', () => {
  const first = Object.keys(serverSnapshot)[0];
  if (first) openModal(first);
});

// ── AWS Error Card ─────────────────────────────────────────────────────────

function isCredentialsError(errors = []) {
  return errors.some(e =>
    e.code === 'MISSING_AWS_CREDENTIALS' ||
    /credential|token|auth|AccessDenied|UnauthorizedOperation/i.test(e.code + ' ' + e.message)
  );
}

function showAwsErrorCard(errors = []) {
  if (!awsErrorCardEl || !awsErrorMsgEl) return;
  if (!errors.length) {
    awsErrorCardEl.classList.add('hidden');
    return;
  }

  const credErr = isCredentialsError(errors);
  awsErrorCardEl.classList.remove('hidden');

  if (credErr) {
    awsErrorCardEl.querySelector('.aws-error-title').textContent = 'AWS credentials not configured';
    awsErrorMsgEl.innerHTML =
      'Attach an <strong>IAM Role</strong> with EC2/ELB/AutoScaling/CloudWatch read-only permissions to this EC2 instance, then restart the server. ' +
      '<br>Or set <code>AWS_ACCESS_KEY_ID</code> / <code>AWS_SECRET_ACCESS_KEY</code> in <code>.env</code>.';
  } else {
    awsErrorCardEl.querySelector('.aws-error-title').textContent = 'AWS API error';
    awsErrorMsgEl.textContent = errors.map(e => e.message).join(' | ');
  }
}

// ── EC2 Table ──────────────────────────────────────────────────────────────

function renderServerTable(payload) {
  const instances = payload.ec2Instances || [];
  const targetMap = new Map((payload.targetGroup?.registeredTargets || []).map((target) => [target.targetId, target]));
  const trafficMap = payload.traffic?.byInstance || {};
  const hasCredError = isCredentialsError(payload.awsErrors || []);

  serverSnapshot = {};
  instances.forEach((instance) => {
    serverSnapshot[instance.instanceId] = instance;
  });

  if (instances.length === 0) {
    const msg = hasCredError
      ? 'AWS credentials not configured — attach IAM Role to this EC2 instance'
      : 'No EC2 instances found — check AUTO_SCALING_GROUP_NAME in .env';
    serverTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center;padding:24px;color:${hasCredError ? '#fca5a5' : 'var(--text-muted)'}">
          ${hasCredError ? '⚠ ' : ''}${msg}
        </td>
      </tr>
    `;
    return;
  }

  serverTableBody.innerHTML = instances.map((instance, index) => {
    const target = targetMap.get(instance.instanceId);
    const traffic = trafficMap[instance.instanceId] || {};
    const color = getInstanceColor(instance.instanceId, index);
    const state = String(instance.state || 'unknown').toLowerCase();
    const health = target?.healthState || 'not registered';
    const isHealthy = health === 'healthy';
    const statusClass = isHealthy ? 'status-up' : 'status-down';
    const statusText = `${state} / ${health}`;

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
              <strong>${instance.name}</strong>
              <span style="color:var(--text-muted);font-weight:400">(${instance.instanceId})</span>
            </div>
            <div class="instance-id-badge">IP: ${instance.privateIp || instance.publicIp || 'N/A'} | AZ: ${instance.availabilityZone || 'N/A'}</div>
          </div>
        </td>
        <td>
          <div class="status-badge ${statusClass}">
            <span class="status-dot ${isHealthy ? 'up' : 'down'}"></span>
            ${statusText}
          </div>
        </td>
        <td><span class="req-count">${traffic.requestCount || 0}</span></td>
        <td>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn-detail" onclick="openModal('${instance.instanceId}')">Details ›</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderPerformanceMetrics(payload) {
  const cloudWatch = payload.cloudWatch || {};
  const metrics = payload.metrics || {};        // local LB fallback
  const targetGroup = payload.targetGroup || {};
  const asg = payload.autoScaling || {};
  const lb = payload.loadBalancer || {};
  const awsErrors = payload.awsErrors || [];
  const healthTotal = Number(targetGroup.healthyTargets || 0) + Number(targetGroup.unhealthyTargets || 0);

  // Show or hide the persistent AWS error card
  showAwsErrorCard(awsErrors);

  // REQ/s — CloudWatch first, fallback to local logger
  const reqRate = cloudWatch.requestRate != null ? Number(cloudWatch.requestRate)
    : (metrics.throughputRps != null ? Number(metrics.throughputRps) : null);
  metricThroughputEl.textContent = reqRate != null ? reqRate.toFixed(2) : '—';
  metricThroughputEl.className = 'mb-value';

  // LATENCY — CloudWatch first (targetResponseTime is in seconds → ms), fallback local
  const latencyMs = cloudWatch.targetResponseTime != null
    ? Number(cloudWatch.targetResponseTime) * 1000
    : (metrics.latencyAvgMs != null ? Number(metrics.latencyAvgMs) : null);
  metricAvgLatencyEl.textContent = latencyMs != null ? `${latencyMs.toFixed(0)}ms` : '—';
  metricAvgLatencyEl.className = 'mb-value';

  // ERROR — CloudWatch first, fallback local
  const errRate = cloudWatch.errorRate != null ? Number(cloudWatch.errorRate)
    : (metrics.packetLossPct != null ? Number(metrics.packetLossPct) : null);
  metricPacketLossEl.textContent = errRate != null ? formatMetricPct(errRate) : '—';
  metricPacketLossEl.className = 'mb-value' +
    (errRate == null ? '' : errRate > 5 ? ' error' : errRate > 0 ? ' warning' : '');

  // SUCCESS — derived from errRate
  const successRate = errRate != null ? Math.max(0, 100 - errRate)
    : (metrics.successRatePct != null ? Number(metrics.successRatePct) : null);
  metricSuccessRateEl.textContent = successRate != null ? formatMetricPct(successRate) : '—';
  metricSuccessRateEl.className = 'mb-value' +
    (successRate == null ? '' : successRate >= 99 ? ' healthy' : successRate >= 95 ? ' warning' : ' error');

  // TARGET — "2/3"
  const healthyCount = Number(targetGroup.healthyTargets || 0);
  metricPoolHealthEl.textContent = healthTotal > 0 ? `${healthyCount}/${healthTotal}` : '—';
  metricPoolHealthEl.className = 'mb-value' +
    (healthTotal === 0 ? '' : healthyCount === healthTotal ? ' healthy' : healthyCount === 0 ? ' error' : ' warning');

  // ALB — state
  const albState = lb.state || null;
  metricAlgorithmEl.textContent = albState ? albState.toLowerCase() : '—';
  metricAlgorithmEl.className = 'mb-value' +
    (albState === 'active' ? ' healthy' : albState ? ' warning' : '');

  // ASG — "current/desired/max"
  metricModeHintEl.textContent = asg.groupName
    ? `${asg.currentInstances ?? '—'}/${asg.desiredCapacity ?? '—'}/${asg.maxSize ?? '—'}`
    : '—';
  metricModeHintEl.className = 'mb-value';

  // Alert banner — only show if error card isn't already covering it
  if (awsErrors.length && isCredentialsError(awsErrors)) {
    // Error card is visible — keep alert banner minimal
    alertIconEl.textContent = '!';
    alertTextEl.innerHTML = 'AWS credentials error — see red card above.';
    return;
  }

  if (awsErrors.length) {
    alertIconEl.textContent = '!';
    alertTextEl.innerHTML = `<strong>AWS API error:</strong> ${awsErrors[0].message}`;
    return;
  }

  if (cloudWatch.noData) {
    alertIconEl.textContent = 'ℹ';
    alertTextEl.innerHTML = 'No CloudWatch data yet. Send traffic through AWS ALB and wait 1–2 minutes.';
    return;
  }

  if ((targetGroup.healthyTargets || 0) === 0 && healthTotal > 0) {
    alertIconEl.textContent = '!';
    alertTextEl.innerHTML = `Target Group has <strong>0 healthy targets</strong> out of ${healthTotal} registered.`;
    return;
  }

  alertIconEl.textContent = '✓';
  alertTextEl.innerHTML = `ALB healthy — <strong>${targetGroup.healthyTargets || 0}/${healthTotal || '?'}</strong> targets up · <strong>${cloudWatch.requestRate ?? 0} req/s</strong>`;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function serverChip(serverId, serverName) {
  const cls = `chip-${serverId}`;
  return `<span class="server-chip ${cls}"><span class="chip-icon">⬡</span>${serverName}</span>`;
}

function distChip(serverId, serverName) {
  const color = getInstanceColor(serverId, 0);
  return `<span class="dist-chip"><span class="dist-line" style="background:${color}"></span>${serverName}</span>`;
}

const ipHistory = {};
const processedRequests = new Set();
function addProcessedKey(key) {
  processedRequests.add(key);
  setTimeout(() => processedRequests.delete(key), 30000);
}

function renderRequestsTable(requests) {
  if (!requests || requests.length === 0) {
    requestsTableBody.innerHTML = `<tr><td colspan="4" style="color:var(--text-muted);text-align:center;padding:24px">No requests logged — traffic goes through custom LB on port 8000.</td></tr>`;
    return;
  }

  const uniqueRequests = [];
  requests.forEach(r => {
    const key = `${r.clientIp}-${r.time}-${r.serverId}`;
    if (!processedRequests.has(key)) {
      addProcessedKey(key);
      uniqueRequests.push(r);
    }
  });

  if (uniqueRequests.length === 0) return;

  requestsTableBody.innerHTML = uniqueRequests.slice(0, 10).map(r => {
    const ip = r.clientIp;
    if (!ipHistory[ip]) ipHistory[ip] = [];
    if (!ipHistory[ip].includes(r.serverId)) {
      ipHistory[ip].unshift(r.serverId);
      if (ipHistory[ip].length > 3) ipHistory[ip].pop();
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

let lastUpdateTime = 0;

window.addEventListener('lb-stats', (e) => {
  const now = Date.now();
  if (now - lastUpdateTime < 200) return;
  lastUpdateTime = now;

  const payload = e.detail;
  latestAwsPayload = payload;

  renderServerTable(payload);
  renderRequestsTable(payload.recentRequests || []);
  renderPerformanceMetrics(payload);

  if (window.updateChart) window.updateChart(payload.ec2Instances || [], payload.traffic || {});

  lastUpdatedEl.textContent = `Cập nhật lần cuối: ${new Date().toLocaleTimeString('vi-VN')}`;
});

document.addEventListener('DOMContentLoaded', () => {
  renderServerTable({ ec2Instances: [], targetGroup: { registeredTargets: [] }, traffic: { byInstance: {} }, awsErrors: [] });
  renderRequestsTable([]);
  renderPerformanceMetrics({
    cloudWatch: { noData: true },
    targetGroup: { healthyTargets: 0, unhealthyTargets: 0 },
    autoScaling: {},
    awsErrors: []
  });
});
