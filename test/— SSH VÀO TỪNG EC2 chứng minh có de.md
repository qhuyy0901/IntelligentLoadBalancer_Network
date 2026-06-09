**— SSH VÀO TỪNG EC2 chứng minh có deloy ec2 hoạt động**



ssh -i E:\\my\_key.pem ec2-user@



***---show check aws EC2 Instances (có launching + terminating)***

*application đang chạy bình thường,chạy cùng ứng dụng*

“Hệ thống có nhiều EC2, Auto Scaling quản lý và có trạng thái launching / terminating”



**— FIX APP**



cd \~

rm -rf IntelligentLoadBalancer\_Network

git clone https://github.com/qhuyy0901/IntelligentLoadBalancer\_Network.git

cd IntelligentLoadBalancer\_Network

sudo chown -R ec2-user:ec2-user .

npm install

sudo kill -9 $(sudo lsof -t -i:3000) 2>/dev/null || true

pm2 delete all || true

pm2 start ec2-web/aws-backend.js --name ec2-app

pm2 save

pm2 list



***---show check aws Target Group (Healthy)***



**— TEST TRÊN TỪNG EC2**



curl http://localhost:3000/



**— TEST LOAD BALANCER chứng minh**



curl http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/
for i in {1..5}; do curl http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/; echo ""; done



***--  http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/***

***-----------f5 trang hoặc crul***



**— TEST AUTO SCALING (DEMO) --đợi 2p**

yes > /dev/null \&

yes > /dev/null \&

yes > /dev/null \&


-------*tạo tải CPU để kích hoạt Auto Scaling*

***--giảm tải***


killall yes

pkill -f yes
*-----Target tracking policy: tránh scale in quá sớm. tránh “nhảy lên xuống liên tục”*

**---traffic ---- test phổ thông**
http://52.63.15.53:3000

http://3.106.122.232:3000
http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/
**----“Load Balancer phân phối request đến các EC2 backend. Hai EC2 đều hoạt động và được đăng ký trong Target Group (Healthy).”**

**“Target Group có 2 instance healthy, chứng minh Load Balancer có nhiều backend và đang phân phối traffic.”**

