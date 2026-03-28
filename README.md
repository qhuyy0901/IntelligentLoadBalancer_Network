# Intelligent Load Balancer

> Dự án cơ sở môn Mạng Máy Tính — Phân phối lưu lượng thông minh với Node.js

## 📁 Cấu trúc dự án

```
IntelligentLoadBalancer/
├── config/servers.json      # Cấu hình EC2 servers
├── lb-server/               # Load Balancer core (port 3000)
│   ├── index.js             # HTTP Proxy entry point
│   ├── balancer.js          # Thuật toán Round-Robin / Least-Connection
│   ├── healthCheck.js       # Kiểm tra sức khỏe server định kỳ
│   ├── logger.js            # Ghi log request, tính request/sec
│   └── wsServer.js          # WebSocket – push live data cho dashboard
├── servers/                 # 3 EC2 server giả lập
│   ├── ec2-1/index.js       # port 3001
│   ├── ec2-2/index.js       # port 3002
│   └── ec2-3/index.js       # port 3003
├── dashboard/               # Giao diện web real-time
│   ├── index.html
│   ├── css/style.css
│   └── js/ (app.js, chart-init.js, ws.js)
├── scripts/testTraffic.js   # Script kiểm tra phân phối
└── package.json
```

## 🚀 Cài đặt & Khởi chạy

### 1. Cài đặt dependencies
```bash
cd e:\IntelligentLoadBalancer
npm install
```

### 2. Chạy toàn bộ hệ thống
```bash
npm start
```
Lệnh này sẽ khởi động **đồng thời**: 3 EC2 servers + Load Balancer.

### 3. Mở Dashboard
```bash
# Terminal mới:
npx serve dashboard -p 4000
```
Truy cập: **http://localhost:4000**

## 🧪 Kiểm tra phân phối traffic

```bash
# Gửi 30 request (5 concurrent)
npm run test-traffic

# Hoặc tùy chỉnh:
node scripts/testTraffic.js 100 10
```

## 🌐 Các Endpoints

| Endpoint | Mô tả |
|---|---|
| `http://localhost:3000` | Load Balancer (proxy) |
| `http://localhost:3001` | EC2-1 trực tiếp |
| `http://localhost:3002` | EC2-2 trực tiếp |
| `http://localhost:3003` | EC2-3 trực tiếp |
| `http://localhost:3000/lb/stats` | API stats của LB |
| `http://localhost:3000/lb/config` | Xem thuật toán LB hiện tại + danh sách hỗ trợ |
| `http://localhost:3000/lb/config/algorithm?name=weighted-round-robin` | Đổi thuật toán LB khi đang chạy (POST) |
| `ws://localhost:8080` | WebSocket live data |
| `http://localhost:4000` | Dashboard UI |

## ⚙️ Cấu hình

Chỉnh sửa `config/servers.json` để:
- Thêm/xóa server
- Đổi thuật toán: `round-robin`, `least-connections`, `weighted-round-robin`
- Thay đổi health check interval

Đổi thuật toán ngay khi đang chạy (không cần restart):

```bash
# Xem cấu hình hiện tại
curl http://localhost:3000/lb/config

# Chuyển sang weighted round robin
curl -X POST "http://localhost:3000/lb/config/algorithm?name=weighted-round-robin"
```

## 📚 Kiến thức áp dụng

- **Round-Robin**: Phân phối lần lượt đều cho các server
- **Health Check**: Tự động loại server bị down ra khỏi pool
- **HTTP Proxy**: Chuyển tiếp request trong suốt
- **WebSocket**: Cập nhật dashboard real-time
- **Elastic Load Balancer**: Mô phỏng AWS ELB
