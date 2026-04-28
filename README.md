# Intelligent Load Balancer — AWS Realtime Dashboard

Custom load balancer + real-time dashboard pulling live data from AWS.

Dashboard reads from:
- EC2 Instances (in Auto Scaling Group)
- Target Group (health state per target)
- Application Load Balancer
- Auto Scaling Group (min/desired/max/current)
- CloudWatch metrics (RequestCount, TargetResponseTime, 2XX/4XX/5XX, HealthyHostCount)

---

## 1. Install dependencies

```bash
npm install
```

---

## 2. Configure .env

Copy `.env.example` to `.env` and fill in your real ARNs:

```bash
cp .env.example .env
```

Open `.env` and set:

| Variable | Where to find it |
|---|---|
| `TARGET_GROUP_ARN` | AWS Console → EC2 → Target Groups → your TG → Details tab |
| `LOAD_BALANCER_ARN` | AWS Console → EC2 → Load Balancers → your ALB → Details tab |
| `AUTO_SCALING_GROUP_NAME` | AWS Console → EC2 → Auto Scaling Groups |
| `ALB_DNS` | AWS Console → EC2 → Load Balancers → DNS name column |

**Important:** ARNs must start with `arn:aws:` — placeholder `...` values are detected and skipped.

---

## 3. Set up IAM Role for the dashboard EC2

The EC2 instance running the dashboard needs read-only AWS permissions.

### 3a. Create the IAM Role

1. AWS Console → IAM → Roles → **Create role**
2. Trusted entity: **EC2**
3. Attach these managed policies:
   - `AmazonEC2ReadOnlyAccess`
   - `ElasticLoadBalancingReadOnly`
   - `AutoScalingReadOnlyAccess`
   - `CloudWatchReadOnlyAccess`
4. Name the role: `lb-dashboard-readonly`

### 3b. Attach the role to the dashboard EC2

1. AWS Console → EC2 → Instances → select your dashboard EC2 (`3.107.233.161`)
2. Actions → Security → **Modify IAM role**
3. Select `lb-dashboard-readonly` → **Update IAM role**
4. The change takes effect within ~30 seconds — no restart needed

### 3c. Verify credentials on the EC2

SSH into the instance and run:

```bash
aws sts get-caller-identity --region ap-southeast-2
```

If it returns your account/role info, credentials are working.

---

## 4. Run the server

```bash
# Custom LB + WebSocket server
pm2 start lb-server/index.js --name lb

# Dashboard (serve static files on port 4000)
pm2 start serve --name dashboard -- ./dashboard -l 4000

# Or without pm2:
npm run aws
```

Ports:
| Service | Port |
|---|---|
| Custom Load Balancer API | 8000 |
| WebSocket (real-time data) | 9090 |
| Dashboard | 4000 |

---

## 5. Fix inconsistent ALB backends

If the ALB returns different page styles on refresh (e.g. "Auto Scaling EC2 Backend" vs "EC2-2 Frontend Demo"), it means the target group has stale instances registered.

### 5a. Find and deregister old targets

```bash
# List all targets in the target group
aws elbv2 describe-target-health \
  --target-group-arn <YOUR_TARGET_GROUP_ARN> \
  --region ap-southeast-2

# Deregister a stale instance (not in your ASG)
aws elbv2 deregister-targets \
  --target-group-arn <YOUR_TARGET_GROUP_ARN> \
  --targets Id=i-0xxxxxxxxxxxx \
  --region ap-southeast-2
```

### 5b. Ensure ASG instances use the correct app

All EC2 instances in the ASG (`lb-asg`) should run `aws/asg-backend/server.js`.

Add this User Data to the ASG Launch Template:

```bash
#!/bin/bash
yum update -y
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs git
cd /home/ec2-user
git clone https://github.com/YOUR_USERNAME/IntelligentLoadBalancer.git app
cd app
npm install --production
nohup node aws/asg-backend/server.js >> /var/log/asg-backend.log 2>&1 &
```

The updated `asg-backend/server.js` automatically reads real Instance ID, AZ, and IPs from the **EC2 Instance Metadata Service (IMDSv2)** — no env vars needed.

---

## 6. Test ALB traffic

```bash
# Node.js script (shows per-instance distribution)
node scripts/testAlbTraffic.js 100 10

# Windows CMD loop
for /L %i in (1,1,100) do curl -s http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/

# Linux/Mac
for i in $(seq 1 100); do curl -s http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/ > /dev/null; done
```

After ~1–2 minutes, CloudWatch metrics will appear in the dashboard.

---

## 7. Dashboard overview

**Overview tab:**
- Request rate, avg latency, error rate, success rate (from CloudWatch)
- EC2 instances table: instanceId, state, health, AZ
- ASG: min / desired / max / current
- Healthy/unhealthy target count

**Target Group tab:**
- Registered targets: instanceId, health state, port, health reason (if unhealthy)
- Health history bar per target

**Traffic tab:**
- Request rate chart per EC2 (real-time, from local LB logs)
- Traffic distribution bars
- ALB access log (from local proxy)

**Error states:**
- AWS credentials not configured → red card with setup instructions
- CloudWatch no data yet → informational message (not an error)
- ARN not set in .env → clear "not configured" message per section

---

## 8. Key files

| File | Purpose |
|---|---|
| `aws/ec2.js` | EC2 describe instances |
| `aws/elb.js` | Target Group health + ALB info |
| `aws/autoscaling.js` | ASG details and scaling activities |
| `aws/cloudwatch.js` | CloudWatch metrics (10-min lookback) |
| `aws/asg-backend/server.js` | EC2 backend app (uses IMDSv2 for real metadata) |
| `lb-server/wsServer.js` | Polls AWS every 5s, broadcasts to dashboard |
| `lb-server/index.js` | Custom HTTP load balancer proxy (port 8000) |
| `dashboard/js/app.js` | Overview tab rendering |
| `dashboard/js/target-group.js` | Target Group tab rendering |
| `dashboard/js/traffic.js` | Traffic chart and log |
| `scripts/testAlbTraffic.js` | ALB traffic generator + distribution report |
| `.env.example` | Template for .env |
