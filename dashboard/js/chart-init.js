/**
 * Khởi Tạo Biểu Đồ Phân Phối Lưu Lượng (Traffic Distribution)
 * Biểu đồ đường thời gian thực dùng Chart.js — cửa sổ 20 điểm
 */

const MAX_POINTS = 20; // Số điểm dữ liệu hiển thị trên biểu đồ

// Nhãn trục X: từ -20s đến Now
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
          borderWidth: 2,
          pointRadius: 0,           // Ẩn điểm tròn để biểu đồ gọn hơn
          pointHoverRadius: 4,      // Hiện khi di chuột
          tension: 0.4,             // Đường cong mượt
          fill: false
        },
        {
          label: 'EC2-2',
          data: [...dataQueues['ec2-2']],
          borderColor: DATA_COLORS['ec2-2'],
          backgroundColor: DATA_COLORS['ec2-2'] + '18',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.4,
          fill: false
        },
        {
          label: 'EC2-3',
          data: [...dataQueues['ec2-3']],
          borderColor: DATA_COLORS['ec2-3'],
          backgroundColor: DATA_COLORS['ec2-3'] + '18',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.4,
          fill: false
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
            // Hiển thị số request thay vì số thập phân req/s
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} req`
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
            text: 'Requests / 2s',  // Số request trong cửa sổ 2 giây
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
 * Đẩy giá trị RPS mới vào hàng đợi và dịch biểu đồ về bên trái
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
    queue.push(s.rps);                                      // Thêm điểm mới
    if (queue.length > MAX_POINTS) queue.shift();           // Xóa điểm cũ nhất
    trafficChart.data.datasets[idx].data = [...queue];      // Cập nhật dataset
  });
  trafficChart.update('none'); // Cập nhật không có animation để mượt
}

// Khởi tạo biểu đồ khi DOM đã sẵn sàng
document.addEventListener('DOMContentLoaded', initChart);
window.updateChart = updateChart; // Expose ra global để app.js gọi được
