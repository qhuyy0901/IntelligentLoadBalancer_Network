const MAX_POINTS = 45;
const labels = Array.from({ length: MAX_POINTS }, (_, i) => `-${MAX_POINTS - i} s`);
labels[MAX_POINTS - 1] = 'Now';

const DATA_COLORS = ['#2dd4bf', '#3b82f6', '#f59e0b', '#f43f5e', '#22c55e', '#8b5cf6'];

const dataQueues = {};
const trafficChartState = {
  chart: null,
  datasetOrder: []
};

function getColor(index) {
  return DATA_COLORS[index % DATA_COLORS.length];
}

function ensureQueue(instanceId) {
  if (!dataQueues[instanceId]) dataQueues[instanceId] = new Array(MAX_POINTS).fill(0);
  return dataQueues[instanceId];
}

function buildDataset(instanceId, index) {
  return {
    id: instanceId,
    label: instanceId,
    data: [...ensureQueue(instanceId)],
    borderColor: getColor(index),
    backgroundColor: `${getColor(index)}18`,
    borderWidth: 2.5,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.4,
    fill: true
  };
}

function initChart() {
  const canvas = document.getElementById('trafficChart');
  if (!canvas || trafficChartState.chart) return;

  const ctx = canvas.getContext('2d');
  trafficChartState.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [...labels],
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
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
          backgroundColor: '#1e2a45',
          borderColor: 'rgba(255,255,255,0.1)',
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
          ticks: { color: '#5a78a0', font: { size: 11 }, maxTicksLimit: 6 },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { color: 'rgba(255,255,255,0.06)' }
        },
        y: {
          min: 0,
          suggestedMax: 5,
          ticks: {
            color: '#5a78a0',
            font: { size: 11 },
            precision: 0,
            callback: (value) => value
          },
          title: {
            display: true,
            text: 'Requests / second',
            color: '#5a78a0',
            font: { size: 11 }
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { color: 'rgba(255,255,255,0.06)' }
        }
      }
    }
  });
}

function ensureDatasets(instanceIds) {
  const chart = trafficChartState.chart;
  if (!chart) return;

  const nextOrder = [...instanceIds].sort();
  const changed =
    nextOrder.length !== trafficChartState.datasetOrder.length ||
    nextOrder.some((id, idx) => id !== trafficChartState.datasetOrder[idx]);

  if (!changed) return;

  trafficChartState.datasetOrder = nextOrder;
  chart.data.datasets = nextOrder.map((instanceId, index) => buildDataset(instanceId, index));
}

function updateChart(ec2Instances = [], traffic = {}) {
  const chart = trafficChartState.chart;
  if (!chart) return;

  const ids = ec2Instances.map((instance) => instance.instanceId).filter(Boolean);
  ensureDatasets(ids);

  trafficChartState.datasetOrder.forEach((instanceId, index) => {
    const queue = ensureQueue(instanceId);
    const rate = Number(traffic?.byInstance?.[instanceId]?.requestRate || 0);
    queue.push(rate);
    if (queue.length > MAX_POINTS) queue.shift();

    if (chart.data.datasets[index]) {
      chart.data.datasets[index].data = [...queue];
      chart.data.datasets[index].label = instanceId;
    }
  });

  chart.update('none');
}

function updateChartTheme() {
  const chart = trafficChartState.chart;
  if (!chart) return;

  const style = getComputedStyle(document.documentElement);
  const gridColor = style.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.04)';
  const borderColor = style.getPropertyValue('--chart-border').trim() || 'rgba(255,255,255,0.06)';
  const tickColor = style.getPropertyValue('--chart-tick').trim() || '#5a78a0';
  const tooltipBg = style.getPropertyValue('--tooltip-bg').trim() || '#1e2a45';
  const tooltipBorder = style.getPropertyValue('--tooltip-border').trim() || 'rgba(255,255,255,0.1)';
  const textPrimary = style.getPropertyValue('--text-primary').trim() || '#e8edf5';
  const textSecondary = style.getPropertyValue('--text-secondary').trim() || '#8fa3c0';

  chart.options.scales.x.ticks.color = tickColor;
  chart.options.scales.x.grid.color = gridColor;
  chart.options.scales.x.border.color = borderColor;
  chart.options.scales.y.ticks.color = tickColor;
  chart.options.scales.y.grid.color = gridColor;
  chart.options.scales.y.border.color = borderColor;
  chart.options.scales.y.title.color = tickColor;
  chart.options.plugins.legend.labels.color = textSecondary;
  chart.options.plugins.tooltip.backgroundColor = tooltipBg;
  chart.options.plugins.tooltip.borderColor = tooltipBorder;
  chart.options.plugins.tooltip.titleColor = textPrimary;
  chart.options.plugins.tooltip.bodyColor = textSecondary;
  chart.update();
}

document.addEventListener('DOMContentLoaded', initChart);
window.updateChart = updateChart;
window._updateChartTheme = updateChartTheme;
