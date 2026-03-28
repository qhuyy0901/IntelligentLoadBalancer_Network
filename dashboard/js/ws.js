/**
 * WebSocket Client — Kết nối nhận dữ liệu thời gian thực từ Load Balancer
 * Tự động kết nối lại nếu bị mất kết nối
 */

const WS_URL = 'ws://localhost:8080';
let ws;
let reconnectTimer;

function connectWebSocket() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[WS] Đã kết nối đến Load Balancer');
    document.getElementById('lastUpdated').textContent = 'Cập nhật lần cuối: vừa xong ✓';
    clearTimeout(reconnectTimer);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      // Phát sự kiện tùy chỉnh để app.js xử lý dữ liệu
      if (data.type === 'stats') {
        window.dispatchEvent(new CustomEvent('lb-stats', { detail: data }));
      }
    } catch (e) {
      console.warn('[WS] Lỗi phân tích dữ liệu:', e);
    }
  };

  ws.onerror = () => {
    console.warn('[WS] Lỗi kết nối — sẽ thử lại sau');
  };

  ws.onclose = () => {
    // Hiển thị trạng thái đang kết nối lại và thử lại sau 3 giây
    document.getElementById('lastUpdated').textContent = 'Cập nhật lần cuối: đang kết nối lại...';
    reconnectTimer = setTimeout(connectWebSocket, 3000);
  };
}

// Bắt đầu kết nối khi trang web đã tải xong
document.addEventListener('DOMContentLoaded', connectWebSocket);
