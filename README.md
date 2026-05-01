# IntelligentLoadBalancer Network

Demo AWS Application Load Balancer với Auto Scaling Group, Target Group health monitoring và real-time Dashboard.

## Kiến trúc

```
Internet → ALB (port 80) → Target Group (port 3000) → EC2 instances (ASG)
                                                              ↕
Dashboard (port 4000) ←── WebSocket ←── lb-server (port 8000/9090)
```

## Cấu trúc project

```
IntelligentLoadBalancer_Network/
├── aws/
│   ├── ec2.js                          # AWS EC2 API
│   ├── elb.js                          # AWS ELB API
│   ├── autoscaling.js                  # AWS Auto Scaling API
│   ├── cloudwatch.js                   # AWS CloudWatch API
│   └── user-data-amazon-linux-2023.sh  # Launch Template User Data
├── config/
│   └── servers.json                    # LB server config (ports, WS port)
├── dashboard/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js, chart-init.js, target-group.js, traffic.js, ws.js
├── ec2-web/
│   └── aws-backend.js                  # App chạy trên EC2 trong ASG (port 3000)
├── lb-server/
│   ├── index.js                        # HTTP server (port 8000)
│   └── wsServer.js                     # WebSocket server (port 9090) → polls AWS
├── scripts/
│   └── testAlbTraffic.js               # Test script gửi traffic lên ALB
├── .env.example
└── package.json
```

## Yêu cầu

- Node.js ≥ 18
- AWS credentials (IAM Role hoặc access keys) với quyền read-only:
  - `ec2:DescribeInstances`
  - `elasticloadbalancing:Describe*`
  - `autoscaling:Describe*`
  - `cloudwatch:GetMetricData`

## Setup

### 1. Clone và cài dependencies

```bash
git clone https://github.com/qhuyy0901/IntelligentLoadBalancer_Network.git
cd IntelligentLoadBalancer_Network
npm install
```

### 2. Cấu hình .env

```bash
cp .env.example .env
# Điền LOAD_BALANCER_ARN vào .env
```

`.env` tối thiểu:

```env
AWS_REGION=ap-southeast-2
AUTO_SCALING_GROUP_NAME=lb-asg
ALB_DNS=my-alb-2056764661.ap-southeast-2.elb.amazonaws.com
TARGET_GROUP_ARN=arn:aws:elasticloadbalancing:ap-southeast-2:039914330851:targetgroup/taget-ec2/b614f82f47c5e038
LOAD_BALANCER_ARN=arn:aws:elasticloadbalancing:ap-southeast-2:039914330851:loadbalancer/app/my-alb/...
```

### 3. Chạy Dashboard trên EC2 chính (máy monitor, không thuộc ASG)

```bash
npm start
# Hoặc tách riêng:
npm run lb         # LB server + WebSocket AWS poller  (port 8000, 9090)
npm run dashboard  # Static file server dashboard      (port 4000)
```

Mở trình duyệt: `http://<EC2-public-ip>:4000`

> **Lưu ý:** EC2 chạy dashboard cần Security Group mở port 4000 và 9090.

---

## EC2 trong ASG — cách deploy

### Launch Template User Data

File: `aws/user-data-amazon-linux-2023.sh`

Mỗi EC2 do ASG tạo ra sẽ tự động:
1. Cài Node.js, npm, git, pm2
2. Clone repo
3. Chạy `ec2-web/aws-backend.js` trên port 3000 qua pm2

### Tạo Launch Template version mới

1. AWS Console → **EC2 → Launch Templates**
2. Chọn template → **Actions → Modify template (Create new version)**
3. Vào **Advanced details → User data**
4. Dán nội dung file `aws/user-data-amazon-linux-2023.sh`
5. Click **Create template version**

### Cập nhật ASG dùng version mới

1. AWS Console → **EC2 → Auto Scaling Groups → lb-asg**
2. **Edit** → **Launch template** → chọn version **Latest**
3. **Update**

### Áp dụng ngay — terminate EC2 cũ thuộc ASG

Terminate các EC2 cũ thuộc ASG — ASG tự tạo EC2 mới chạy User Data mới:

```bash
# Tìm instance IDs trong ASG
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names lb-asg \
  --query "AutoScalingGroups[0].Instances[*].InstanceId" \
  --output text

# Terminate từng instance (ASG tự thay thế)
aws ec2 terminate-instances --instance-ids i-xxxxx i-yyyyy
```

---

## Target Group Health Check

| Setting             | Value    |
|---------------------|----------|
| Protocol            | HTTP     |
| Path                | /health  |
| Port                | 3000     |
| Healthy threshold   | 2        |
| Unhealthy threshold | 3        |
| Interval            | 30s      |

EC2 trả `{"status":"ok"}` tại `/health` → ALB đánh dấu healthy.

---

## Test

### Kiểm tra ALB hoạt động

```bash
curl http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/
curl http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/health
curl http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/metrics
```

### Spam traffic (Windows CMD)

```cmd
for /L %i in (1,1,300) do curl http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/
```

### Spam traffic (Bash/Linux)

```bash
for i in $(seq 1 300); do curl -s http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/ > /dev/null; done
```

### Test script

```bash
npm run test-traffic
```

---

## Kết quả mong đợi

- Mở ALB URL → thấy trang HTML từ `ec2-web/aws-backend.js` với Instance ID, AZ, request count
- Dashboard → EC2 Instances: 2 instance trạng thái `running / healthy`
- Spam request → request count tăng trên trang web và dashboard
- Dashboard Target Group → 2 healthy targets
- Dashboard Traffic → biểu đồ req/s tăng khi generate traffic
