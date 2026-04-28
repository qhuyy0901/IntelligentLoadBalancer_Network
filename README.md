# Intelligent Load Balancer (AWS Realtime Dashboard)

Du an nay giu nguyen custom load balancer cu va bo sung dashboard lay du lieu that tu AWS.

Dashboard realtime lay du lieu tu:
- EC2 Instances
- Target Group
- Application Load Balancer
- Auto Scaling Group
- CloudWatch metrics

## 1) Cai package

```bash
npm install
```

## 2) Cau hinh .env

Tao file `.env` o root project:

```env
AWS_REGION=ap-southeast-2
TARGET_GROUP_ARN=arn:aws:elasticloadbalancing:ap-southeast-2:123456789012:targetgroup/your-tg/xxxxxxxx
LOAD_BALANCER_ARN=arn:aws:elasticloadbalancing:ap-southeast-2:123456789012:loadbalancer/app/your-alb/yyyyyyyy
AUTO_SCALING_GROUP_NAME=lb-asg
ALB_DNS=my-alb-123456789.ap-southeast-2.elb.amazonaws.com
AWS_POLL_INTERVAL_MS=5000
CLOUDWATCH_PERIOD_SECONDS=60
CLOUDWATCH_LOOKBACK_MINUTES=10
```

Luu y:
- Khong hard-code ARN trong code. He thong doc tu `.env`.
- Ban phai co AWS credentials hop le (AWS CLI profile, access key hoac IAM role).

## 3) Chay he thong

Chay custom load balancer + dashboard:

```bash
npm run aws
```

Mac dinh:
- Load balancer API: `http://localhost:8000`
- WebSocket: `ws://localhost:9090`
- Dashboard: `http://localhost:4000`

## 4) Test traffic qua AWS ALB

Thay `ALB-DNS` bang DNS that cua ALB:

```cmd
for /L %i in (1,1,100) do curl http://ALB-DNS
```

Vi du:

```cmd
for /L %i in (1,1,100) do curl http://my-alb-123456789.ap-southeast-2.elb.amazonaws.com
```

## 5) Dashboard hien thi gi

Overview:
- Request Count / Request Rate
- Avg Latency (TargetResponseTime)
- Error Rate (4XX/5XX)
- Healthy/Unhealthy targets
- EC2 state summary (running/pending/stopped)
- ASG min/desired/max/current

Target Group tab:
- Registered targets that
- Health state tung target
- Ly do unhealthy (neu co)

Traffic tab:
- RequestCount va req/s tu CloudWatch
- Latency va error rate
- Traffic distribution theo tung EC2 (dua tren request log nhan ve LB)

## 6) Xu ly loi da them

- Thieu AWS credentials:
  - Dashboard hien thong bao loi ro rang.
  - Backend khong crash.
- CloudWatch chua co datapoint:
  - Dashboard hien `No CloudWatch data yet`.
  - Khong crash.
- Target Group chua healthy:
  - Dashboard van hien trang thai that (`healthy/unhealthy`) tu AWS.

## 7) Files chinh da cap nhat

- `aws/ec2.js`: Lay danh sach EC2 va state/IP/AZ.
- `aws/elb.js`: Lay Target Group health va ALB info.
- `aws/autoscaling.js`: Lay ASG min/desired/max/current + scaling activities.
- `aws/cloudwatch.js`: Lay RequestCount, TargetResponseTime, 2XX/4XX/5XX, HealthyHostCount, UnHealthyHostCount.
- `lb-server/wsServer.js`: Poll AWS moi 5s va broadcast payload realtime cho dashboard.
- `dashboard/js/app.js`: Overview dung du lieu AWS that.
- `dashboard/js/target-group.js`: Render registered targets that.
- `dashboard/js/traffic.js`: Render CloudWatch traffic + distribution theo EC2.
- `dashboard/js/chart-init.js`: Chart dong theo danh sach instance AWS.

## 8) Payload WebSocket

WebSocket gui payload dang:

```json
{
  "ec2Instances": [],
  "targetGroup": {},
  "loadBalancer": {},
  "autoScaling": {},
  "cloudWatch": {},
  "traffic": {}
}
```

Dashboard su dung payload nay de cap nhat realtime.
