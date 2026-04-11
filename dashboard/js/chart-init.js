/**
 * Khởi Tạo Biểu Đồ Phân Phối Lưu Lượng (Traffic Distribution)
 * Biểu đồ đường thời gian thực dùng Chart.js — cửa sổ 45 điểm
 */

const MAX_POINTS = 45; // Số điểm dữ liệu hiển thị trên biểu đồ (mỗi điểm ~1s)

// Nhãn trục X: từ -45s đến Now
const labels = Array.from({ length: MAX_POINTS }, (_, i) => `-${MAX_POINTS - i} s`);
labels[MAX_POINTS - 1] = 'Now';

// Màu sắc tương ứng với từng EC2 server
const DATA_COLORS = {
  'ec2-1': '#2dd4bf',
  'ec2-2': '#3b82f6',
  'ec2-3': '#f59e0b'
};

// Hàng đợi dữ liệu cho từng server — khởi tạo toàn 0
const dataQueues = {
  'ec2-1': new Array(MAX_POINTS).fill(0),
  'ec2-2': new Array(MAX_POINTS).fill(0),
  'ec2-3': new Array(MAX_POINTS).fill(0)
};

const previousRequestCounts = {
  'ec2-1': null,
  'ec2-2': null,
  'ec2-3': null
};

let trafficChart;

function initChart() {
  const ctx = document.getElementById('trafficChart').getContext('2d');
  trafficChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [...labels],
      datasets: [
        {
          label: 'EC2-1',
          data: [...dataQueues['ec2-1']],
          borderColor: DATA_COLORS['ec2-1'],
          backgroundColor: DATA_COLORS['ec2-1'] + '18',
          borderWidth: 2.5,
          pointRadius: 0,           // Ẩn điểm tròn để biểu đồ gọn hơn
          pointHoverRadius: 4,      // Hiện khi di chuột
          tension: 0.4,             // Đường cong mượt
          fill: true
        },
        {
          label: 'EC2-2',
          data: [...dataQueues['ec2-2']],
          borderColor: DATA_COLORS['ec2-2'],
          backgroundColor: DATA_COLORS['ec2-2'] + '18',
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.4,
          fill: true
        },
        {
          label: 'EC2-3',
          data: [...dataQueues['ec2-3']],
          borderColor: DATA_COLORS['ec2-3'],
          backgroundColor: DATA_COLORS['ec2-3'] + '18',
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.4,
          fill: true
        }
      ]
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
            // Hien thi so request moi trong moi giay
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} req/s`
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
          suggestedMax: 5,   // Mức tối thiểu nếu không có traffic; tự scale lên khi có nhiều request
          ticks: {
            color: '#5a78a0',
            font: { size: 11 },
            precision: 0,    // Chỉ hiện số nguyên
            callback: v => v
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

/**
 * Đẩy số request moi theo tung giay vao hang doi va dich bieu do ve ben trai
 * Được gọi bởi app.js mỗi khi nhận dữ liệu từ WebSocket
 */
function updateChart(servers) {
  if (!trafficChart) return;

  // Tra cứu index dataset theo server id — tránh lỗi nếu thứ tự thay đổi
  const idToDataset = { 'ec2-1': 0, 'ec2-2': 1, 'ec2-3': 2 };

  servers.forEach(s => {
    const idx = idToDataset[s.id];
    if (idx === undefined) return; // Bỏ qua server không nhận ra
    const queue = dataQueues[s.id];
    if (!queue) return;

    const currentCount = Number(s.requestCount || 0);
    const previousCount = previousRequestCounts[s.id];
    let reqPerSecond = 0;
    if (previousCount != null) {
      reqPerSecond = Math.max(0, currentCount - previousCount);
    }
    previousRequestCounts[s.id] = currentCount;

    queue.push(reqPerSecond);                               // Them diem moi
    if (queue.length > MAX_POINTS) queue.shift();           // Xóa điểm cũ nhất
    trafficChart.data.datasets[idx].data = [...queue];      // Cập nhật dataset
  });
  trafficChart.update('none'); // Cập nhật không có animation để mượt
}

// Khởi tạo biểu đồ khi DOM đã sẵn sàng
document.addEventListener('DOMContentLoaded', initChart);
window.updateChart = updateChart; // Expose ra global để app.js gọi được

// Update chart theme colors when toggling light/dark
function updateChartTheme() {
  if (!trafficChart) return;
  const style = getComputedStyle(document.documentElement);
  const gridColor = style.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.04)';
  const borderColor = style.getPropertyValue('--chart-border').trim() || 'rgba(255,255,255,0.06)';
  const tickColor = style.getPropertyValue('--chart-tick').trim() || '#5a78a0';
  const tooltipBg = style.getPropertyValue('--tooltip-bg').trim() || '#1e2a45';
  const tooltipBorder = style.getPropertyValue('--tooltip-border').trim() || 'rgba(255,255,255,0.1)';
  const textPrimary = style.getPropertyValue('--text-primary').trim() || '#e8edf5';
  const textSecondary = style.getPropertyValue('--text-secondary').trim() || '#8fa3c0';

  trafficChart.options.scales.x.ticks.color = tickColor;
  trafficChart.options.scales.x.grid.color = gridColor;
  trafficChart.options.scales.x.border.color = borderColor;
  trafficChart.options.scales.y.ticks.color = tickColor;
  trafficChart.options.scales.y.grid.color = gridColor;
  trafficChart.options.scales.y.border.color = borderColor;
  trafficChart.options.scales.y.title.color = tickColor;
  trafficChart.options.plugins.legend.labels.color = textSecondary;
  trafficChart.options.plugins.tooltip.backgroundColor = tooltipBg;
  trafficChart.options.plugins.tooltip.borderColor = tooltipBorder;
  trafficChart.options.plugins.tooltip.titleColor = textPrimary;
  trafficChart.options.plugins.tooltip.bodyColor = textSecondary;
  trafficChart.update();
}
window._updateChartTheme = updateChartTheme;
