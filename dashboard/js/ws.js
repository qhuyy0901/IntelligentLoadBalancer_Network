/**
 * ============================================================================
 *  WEBSOCKET CLIENT — Kết Nối Nhận Dữ Liệu Thời Gian Thực Từ LB
 * ============================================================================
 *
 *  LUỒNG DỮ LIỆU:
 *  ┌──────────────┐   WebSocket    ┌──────────┐  CustomEvent   ┌──────────┐
 *  │ wsServer.js  │ ──────────▶   │  ws.js   │ ────────────▶ │  app.js  │
 *  │ (LB :9090)   │  JSON mỗi 1s  │(Dashboard)│  'lb-stats'   │chart-init│
 *  └──────────────┘               └──────────┘               │target-grp│
 *                                                             │traffic.js│
 *                                                             └──────────┘
 *
 *  1. Kết nối WebSocket đến ws://hostname:9090
 *  2. Nhận JSON { type:'stats', servers, recentRequests, metrics, algorithm }
 *  3. Phát CustomEvent 'lb-stats' → các module khác lắng nghe và cập nhật UI
 *  4. Tự động kết nối lại sau 3 giây nếu mất kết nối
 *
 *  WS_URL dùng window.location.hostname → hoạt động cả localhost lẫn EC2 public IP
 * ============================================================================
 */

const WS_PORT = 9090;  // Phải khớp với config/servers.json → loadBalancer.wsPort
const WS_URL = `ws://${window.location.hostname}:${WS_PORT}`;
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
