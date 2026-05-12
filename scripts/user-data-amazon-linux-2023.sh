#!/bin/bash
cd /home/ec2-user
dnf update -y
dnf install -y nodejs npm git
npm install -g pm2
rm -rf IntelligentLoadBalancer_Network
git clone https://github.com/qhuyy0901/IntelligentLoadBalancer_Network.git
cd IntelligentLoadBalancer_Network
npm install
pm2 delete ec2-app || true
pm2 start ec2-web/aws-backend.js --name ec2-app
pm2 save
