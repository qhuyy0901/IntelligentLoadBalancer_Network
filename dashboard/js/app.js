
const LB_PORT = 8000;
const LB_API_BASE = `http://${window.location.hostname}:${LB_PORT}`;
const INSTANCE_COLORS = ['#2dd4bf', '#3b82f6', '#f59e0b', '#f43f5e', '#22c55e', '#8b5cf6', '#a855f7'];

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
const metricPacketLossEl = document.getElementById('metricPacketLoss');
const metricPacketLossHintEl = document.getElementById('metricPacketLossHint');
const metricSuccessRateEl = document.getElementById('metricSuccessRate');
const metricSuccessRateHintEl = document.getElementById('metricSuccessRateHint');
const metricAlgorithmEl = document.getElementById('metricAlgorithm');
const metricPoolHealthEl = document.getElementById('metricPoolHealth');
const metricModeHintEl = document.getElementById('metricModeHint');

// ── Đóng banner thông báo 
document.getElementById('alertClose').addEventListener('click', () => {
  document.getElementById('alertBanner').classList.add('hidden');
});

// ── Nút Refresh 
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
    <div class="modal-stat"><span class="modal-stat-label">Requests (60s)</span><span class="modal-stat-value">${traffic.requestCount || 0}</span></div>
    <div class="modal-stat"><span class="modal-stat-label">Req/s (60s)</span><span class="modal-stat-value">${Number(traffic.requestRate || 0).toFixed(2)}</span></div>
  `;
  document.getElementById('modalOverlay').classList.remove('hidden');
}

window.openModal = openModal;

// Đóng modal khi nhấn nút X hoặc click ra ngoài
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

function renderServerTable(payload) {
  const instances = payload.ec2Instances || [];
  const targetMap = new Map((payload.targetGroup?.registeredTargets || []).map((target) => [target.targetId, target]));
  const trafficMap = payload.traffic?.byInstance || {};

  serverSnapshot = {};
  instances.forEach((instance) => {
    serverSnapshot[instance.instanceId] = instance;
  });

  if (instances.length === 0) {
    serverTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted)">Loading AWS data...</td>
      </tr>
    `;
    return;
  }

  serverTableBody.innerHTML = instances.map((instance, index) => {
    const target = targetMap.get(instance.instanceId);
    const traffic = trafficMap[instance.instanceId] || {};
    const color = getInstanceColor(instance.instanceId, index);
    const state = String(instance.state || 'unknown').toLowerCase();
    const health = target?.healthState || 'unused';
    const isHealthy = health === 'healthy';
    const statusClass = isHealthy ? 'status-up' : 'status-down';
    const statusDot = isHealthy ? 'up' : 'down';
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
            <span class="status-dot ${statusDot}"></span>
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
  const targetGroup = payload.targetGroup || {};
  const asg = payload.autoScaling || {};
  const healthTotal = Number(targetGroup.healthyTargets || 0) + Number(targetGroup.unhealthyTargets || 0);

  metricThroughputEl.textContent = cloudWatch.requestRate == null ? 'No CloudWatch data yet' : formatMetricRps(cloudWatch.requestRate);
  metricThroughputHintEl.textContent = cloudWatch.requestCount == null
    ? 'RequestCount metric is not available yet'
    : `${formatMetricCount(cloudWatch.requestCount)} requests / ${cloudWatch.periodSeconds || 60}s`;

  metricAvgLatencyEl.textContent = cloudWatch.targetResponseTime == null
    ? 'No CloudWatch data yet'
    : formatMetricMs(Number(cloudWatch.targetResponseTime) * 1000);
  metricAvgLatencyHintEl.textContent = cloudWatch.targetResponseTime == null
    ? 'TargetResponseTime is pending'
    : 'CloudWatch TargetResponseTime';

  metricPacketLossEl.textContent = cloudWatch.errorRate == null ? 'No CloudWatch data yet' : formatMetricPct(cloudWatch.errorRate);
  metricPacketLossHintEl.textContent = cloudWatch.errorRate == null
    ? 'HTTPCode_Target_4XX/5XX has no datapoint yet'
    : `4XX: ${cloudWatch.httpCodeTarget4xx || 0} | 5XX: ${cloudWatch.httpCodeTarget5xx || 0}`;

  const successRate = cloudWatch.errorRate == null ? null : Math.max(0, 100 - Number(cloudWatch.errorRate));
  metricSuccessRateEl.textContent = successRate == null ? 'No CloudWatch data yet' : formatMetricPct(successRate);
  metricSuccessRateHintEl.textContent = cloudWatch.httpCodeTarget2xx == null
    ? 'HTTPCode_Target_2XX has no datapoint yet'
    : `2XX: ${cloudWatch.httpCodeTarget2xx}`;

  metricAlgorithmEl.textContent = formatAlgorithmName('aws-alb');
  metricPoolHealthEl.textContent = healthTotal > 0
    ? `${targetGroup.healthyTargets || 0}/${healthTotal} healthy`
    : 'No targets';

  metricModeHintEl.textContent = asg.groupName
    ? `ASG ${asg.groupName}: min ${asg.minSize ?? '-'} / desired ${asg.desiredCapacity ?? '-'} / max ${asg.maxSize ?? '-'} / current ${asg.currentInstances ?? 0}`
    : 'Auto Scaling group is not configured';

  if (payload.awsErrors?.length) {
    alertIconEl.textContent = '!';
    alertTextEl.innerHTML = `<strong>AWS integration error:</strong> ${payload.awsErrors[0].message}`;
    return;
  }

  if (cloudWatch.noData) {
    alertIconEl.textContent = '!';
    alertTextEl.innerHTML = 'No CloudWatch data yet. Generate traffic through AWS ALB and wait 1-2 minutes.';
    return;
  }

  if ((targetGroup.healthyTargets || 0) === 0) {
    alertIconEl.textContent = '!';
    alertTextEl.innerHTML = 'Target Group currently has <strong>0 healthy targets</strong>. Dashboard is showing live AWS state.';
    return;
  }

  alertIconEl.textContent = '✓';
  alertTextEl.innerHTML = `ALB is healthy with <strong>${targetGroup.healthyTargets}/${healthTotal}</strong> targets. Request rate: <strong>${cloudWatch.requestRate || 0} req/s</strong>.`;
}

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
  const color = getInstanceColor(serverId, 0);
  return `<span class="dist-chip"><span class="dist-line" style="background:${color}"></span>${serverName}</span>`;
}

// Lưu lịch sử IP — theo dõi server nào đã xử lý request từ IP đó
const ipHistory = {};

// Key = "clientIp-timestamp-serverId", tự động xóa sau 30 giây để không rò bộ nhớ
const processedRequests = new Set();
function addProcessedKey(key) {
  processedRequests.add(key);
  setTimeout(() => processedRequests.delete(key), 30000);
}

function renderRequestsTable(requests) {
  if (!requests || requests.length === 0) {
    requestsTableBody.innerHTML = `<tr><td colspan="4" style="color:var(--text-muted);text-align:center;padding:24px">No CloudWatch data yet or no requests were reported to LB logger.</td></tr>`;
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

  // Nếu event đến quá nhanh (< 200ms) → bỏ qua, tránh render 2 lần cùng lúc
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
  renderServerTable({ ec2Instances: [], targetGroup: { registeredTargets: [] }, traffic: { byInstance: {} } });
  renderRequestsTable([]);
  renderPerformanceMetrics({
    cloudWatch: { noData: true },
    targetGroup: { healthyTargets: 0, unhealthyTargets: 0 },
    autoScaling: {},
    awsErrors: []
  });
});
