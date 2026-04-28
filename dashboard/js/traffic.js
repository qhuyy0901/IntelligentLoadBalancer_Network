const TFC_MAX_POINTS = 60;
const TFC_LABELS = Array.from({ length: TFC_MAX_POINTS }, (_, index) => `-${TFC_MAX_POINTS - index}s`);
TFC_LABELS[TFC_MAX_POINTS - 1] = 'Now';

const TFC_COLORS = ['#2dd4bf', '#3b82f6', '#f59e0b', '#f43f5e', '#22c55e', '#8b5cf6'];
const tfcState = {
  chart: null,
  queues: {},
  order: [],
  logs: [],
  filter: 'all',
  seenKeys: new Set()
};

const MAX_LOGS = 250;

function getColor(index) {
  return TFC_COLORS[index % TFC_COLORS.length];
}

function ensureQueue(instanceId) {
  if (!tfcState.queues[instanceId]) tfcState.queues[instanceId] = new Array(TFC_MAX_POINTS).fill(0);
  return tfcState.queues[instanceId];
}

function initTrafficChart() {
  const canvas = document.getElementById('tfc-chart');
  if (!canvas || tfcState.chart) return;

  tfcState.chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: [...TFC_LABELS],
      datasets: []
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
            label: (context) => ` ${context.dataset.label}: ${context.parsed.y} req/s`
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

function ensureDatasets(instanceIds) {
  const chart = tfcState.chart;
  if (!chart) return;

  const nextOrder = [...instanceIds].sort();
  const changed =
    nextOrder.length !== tfcState.order.length ||
    nextOrder.some((id, index) => id !== tfcState.order[index]);

  if (!changed) return;
  tfcState.order = nextOrder;

  chart.data.datasets = nextOrder.map((instanceId, index) => ({
    label: instanceId,
    data: [...ensureQueue(instanceId)],
    borderColor: getColor(index),
    backgroundColor: `${getColor(index)}20`,
    borderWidth: 2.5,
    pointRadius: 0,
    pointHoverRadius: 5,
    tension: 0.45,
    fill: true
  }));

  renderTrafficFilterButtons(nextOrder);
}

function updateTrafficChart(payload) {
  const chart = tfcState.chart;
  if (!chart) return;

  const ids = (payload.ec2Instances || []).map((instance) => instance.instanceId).filter(Boolean);
  ensureDatasets(ids);

  tfcState.order.forEach((instanceId, index) => {
    const queue = ensureQueue(instanceId);
    const rps = Number(payload.traffic?.byInstance?.[instanceId]?.requestRate || 0);
    queue.push(rps);
    if (queue.length > TFC_MAX_POINTS) queue.shift();

    if (chart.data.datasets[index]) {
      chart.data.datasets[index].data = [...queue];
      chart.data.datasets[index].label = instanceId;
    }
  });

  chart.update('none');
}

function updateTrafficStats(payload) {
  const cloudWatch = payload.cloudWatch || {};
  const targetGroup = payload.targetGroup || {};

  const throughput = cloudWatch.requestRate;
  const totalRequest = cloudWatch.requestCount;
  const healthy = Number(targetGroup.healthyTargets || 0);
  const unhealthy = Number(targetGroup.unhealthyTargets || 0);
  const totalTargets = healthy + unhealthy;

  document.getElementById('tfc-total-rps').textContent = throughput == null ? 'No data' : Number(throughput).toFixed(2);
  document.getElementById('tfc-total-req').textContent = totalRequest == null ? 'No data' : Number(totalRequest).toLocaleString();
  document.getElementById('tfc-healthy').textContent = totalTargets ? `${healthy}/${totalTargets}` : 'No targets';
  document.getElementById('tfc-avg-latency').textContent = cloudWatch.targetResponseTime == null
    ? 'No data'
    : `${(Number(cloudWatch.targetResponseTime) * 1000).toFixed(2)} ms`;
  document.getElementById('tfc-active-conn').textContent = '-';
  document.getElementById('tfc-error-rate').textContent = cloudWatch.errorRate == null
    ? 'No data'
    : `${Number(cloudWatch.errorRate).toFixed(2)}%`;
}

function updateServerBars(payload) {
  const container = document.getElementById('tfc-server-bars');
  if (!container) return;

  const entries = tfcState.order.map((instanceId) => ({
    instanceId,
    requestCount: Number(payload.traffic?.byInstance?.[instanceId]?.requestCount || 0),
    requestRate: Number(payload.traffic?.byInstance?.[instanceId]?.requestRate || 0),
    state: payload.ec2Instances?.find((item) => item.instanceId === instanceId)?.state || 'unknown'
  }));

  if (!entries.length) {
    container.innerHTML = `<div class="tfc-empty">Loading AWS data...</div>`;
    return;
  }

  const maxRps = Math.max(...entries.map((entry) => entry.requestRate), 1);
  container.innerHTML = entries
    .map((entry, index) => {
      const pct = Math.min(100, (entry.requestRate / maxRps) * 100);
      const color = getColor(index);
      const up = entry.state === 'running';

      return `
      <div class="tfc-server-bar-row">
        <div class="tfc-server-bar-label">
          <span class="tfc-server-dot" style="background:${color}"></span>
          <span>${entry.instanceId}</span>
          <span class="tfc-server-status ${up ? 'tfc-up' : 'tfc-down'}">${entry.state}</span>
        </div>
        <div class="tfc-bar-track">
          <div class="tfc-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="tfc-server-bar-meta">${entry.requestRate.toFixed(2)} req/s · ${entry.requestCount.toLocaleString()} req</div>
      </div>`;
    })
    .join('');
}

function addTrafficLogs(payload) {
  const requests = payload.recentRequests || [];
  requests.forEach((request) => {
    const key = `${request.clientIp}-${request.time}-${request.serverId}`;
    if (tfcState.seenKeys.has(key)) return;
    tfcState.seenKeys.add(key);
    setTimeout(() => tfcState.seenKeys.delete(key), 60000);

    tfcState.logs.unshift({
      time: request.time,
      clientIp: request.clientIp,
      serverId: request.serverId,
      serverName: request.serverName,
      duration: request.duration
    });
  });

  if (tfcState.logs.length > MAX_LOGS) tfcState.logs.splice(MAX_LOGS);
  renderTrafficLogTable();
}

function renderTrafficLogTable() {
  const tbody = document.getElementById('tfc-log-body');
  if (!tbody) return;

  const logs = tfcState.filter === 'all'
    ? tfcState.logs
    : tfcState.logs.filter((row) => row.serverId === tfcState.filter);

  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="tfc-empty">No CloudWatch data yet</td></tr>`;
    document.getElementById('tfc-log-count').textContent = 'Log records: 0';
    return;
  }

  tbody.innerHTML = logs.slice(0, 50).map((row) => {
    const time = new Date(row.time);
    const timeText = Number.isFinite(time.getTime()) ? time.toLocaleTimeString('vi-VN', { hour12: false }) : '-';
    const duration = Number(row.duration || 0);

    return `
      <tr class="tfc-log-row">
        <td class="tfc-log-cell tfc-time">${timeText}</td>
        <td class="tfc-log-cell tfc-ip">${row.clientIp || '-'}</td>
        <td class="tfc-log-cell"><span class="tfc-chip">${row.serverName || row.serverId || '-'}</span></td>
        <td class="tfc-log-cell">${duration} ms</td>
        <td class="tfc-log-cell"><span class="tfc-badge-ok">200 OK</span></td>
      </tr>`;
  }).join('');

  document.getElementById('tfc-log-count').textContent = `Log records: ${tfcState.logs.length}`;
}

function renderTrafficFilterButtons(instanceIds) {
  const group = document.querySelector('.tfc-filter-group');
  if (!group) return;

  const html = ['<button class="tfc-filter-btn tfc-filter-active" data-tfc-filter="all">All</button>']
    .concat(instanceIds.map((id) => `<button class="tfc-filter-btn" data-tfc-filter="${id}">${id}</button>`))
    .join('');

  group.innerHTML = html;
  group.querySelectorAll('[data-tfc-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      tfcState.filter = button.dataset.tfcFilter;
      group.querySelectorAll('[data-tfc-filter]').forEach((item) => item.classList.remove('tfc-filter-active'));
      button.classList.add('tfc-filter-active');
      renderTrafficLogTable();
    });
  });
}

function setupActions() {
  const clearBtn = document.getElementById('tfc-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      tfcState.logs.length = 0;
      tfcState.seenKeys.clear();
      renderTrafficLogTable();
    });
  }

  const generateBtn = document.getElementById('tfc-generate-btn');
  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      if (generateBtn.disabled) return;
      generateBtn.disabled = true;
      generateBtn.textContent = 'Generating...';

      const tasks = Array.from({ length: 20 }, (_, index) =>
        new Promise((resolve) => setTimeout(() => fetch(`http://${window.location.hostname}:8000`).catch(() => null).finally(resolve), index * 120))
      );

      await Promise.all(tasks);
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate Traffic';
    });
  }
}

window.addEventListener('lb-stats', (event) => {
  updateTrafficChart(event.detail);
  if (document.getElementById('page-traffic')?.classList.contains('hidden')) return;

  updateTrafficStats(event.detail);
  updateServerBars(event.detail);
  addTrafficLogs(event.detail);
});

document.addEventListener('DOMContentLoaded', () => {
  initTrafficChart();
  setupActions();
  renderTrafficLogTable();
});

window._initTrafficChart = initTrafficChart;
