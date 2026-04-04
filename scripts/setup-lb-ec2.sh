#!/bin/bash
# Script cài đặt Load Balancer lên EC2
# Chạy trên EC2-1: bash setup-lb.sh

echo "======================================"
echo " INSTALLING Node.js (nếu chưa có)    "
echo "======================================"
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

echo ""
echo "======================================"
echo " CLONE / COPY project lên EC2        "
echo "======================================"
cd ~
# Xóa nếu đã có rồi
rm -rf IntelligentLoadBalancer

# Clone từ GitHub (nếu bạn có repo):
# git clone https://github.com/YOUR_USER/IntelligentLoadBalancer.git

# Hoặc tạo thư mục thủ công:
mkdir -p IntelligentLoadBalancer
cd IntelligentLoadBalancer

echo ""
echo "======================================"
echo " CÀI đặt dependencies                "
echo "======================================"
npm install

echo ""
echo "======================================"
echo " INSTALL pm2 để chạy nền             "
echo "======================================"
sudo npm install -g pm2

echo ""
echo "======================================"
echo " KHỞI ĐỘNG Load Balancer             "
echo "======================================"
# LB chạy port 8000, WebSocket 8080
pm2 start lb-server/index.js --name "lb"
pm2 start node_modules/.bin/serve --name "dashboard" -- dashboard -p 4000

pm2 save
pm2 startup

echo ""
echo "======================================"
echo " XONG!                               "
echo " Load Balancer: http://$(curl -s ifconfig.me):8000"
echo " Dashboard:     http://$(curl -s ifconfig.me):4000"
echo "======================================"
