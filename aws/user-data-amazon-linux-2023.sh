#!/bin/bash
set -euxo pipefail

dnf update -y
dnf install -y nodejs git

APP_ROOT="/opt/intelligent-load-balancer"
APP_SUBDIR="aws/asg-backend"
APP_ENTRY="server.js"
REPO_URL="${REPO_URL:-https://github.com/qhuyy0901/IntelligentLoadBalancer_Network.git}"
APP_PORT="${APP_PORT:-3000}"

TOKEN=$(curl -sS -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)
AZ=$(curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/availability-zone)
LOCAL_IPV4=$(curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/local-ipv4)
PUBLIC_IPV4=$(curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || true)
REGION="${AZ::-1}"

rm -rf "$APP_ROOT"
git clone "$REPO_URL" "$APP_ROOT"

cd "$APP_ROOT"
npm install --omit=dev

cat > /etc/systemd/system/ilb-asg-app.service <<EOF
[Unit]
Description=Intelligent Load Balancer ASG Backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_ROOT/$APP_SUBDIR
Environment=PORT=$APP_PORT
Environment=APP_NAME=Intelligent Load Balancer Demo
Environment=INSTANCE_LABEL=ASG Node Backend
Environment=INSTANCE_ID=$INSTANCE_ID
Environment=AVAILABILITY_ZONE=$AZ
Environment=LOCAL_IPV4=$LOCAL_IPV4
Environment=PUBLIC_IPV4=$PUBLIC_IPV4
Environment=AWS_REGION=$REGION
ExecStart=/usr/bin/node $APP_ROOT/$APP_SUBDIR/$APP_ENTRY
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ilb-asg-app.service
systemctl restart ilb-asg-app.service

curl -sS "http://127.0.0.1:$APP_PORT/health" || true