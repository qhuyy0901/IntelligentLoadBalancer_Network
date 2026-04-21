# Intelligent Load Balancing

Do an co so mon Mang May Tinh theo huong AWS simulation:
- Deploy nhieu EC2 server (them auto scaling)
- Cau hinh Load Balancer
- Tao Target Group
- Test phan phoi traffic


## Kien truc mo phong AWS

- EC2 instances (simulate):
	- EC2-1: localhost:3001
	- EC2-2: localhost:3002
	- EC2-3: localhost:3003
- Target Group (simulate): nhom server duoc quan ly trong file config
- ELB (simulate): Node.js Load Balancer tai localhost:3000
- Health Check: ping /health dinh ky de loai server loi

## AWS Auto Scaling mode

Neu chuyen sang AWS that dung theo yeu cau do an, dung cac thanh phan sau:
- Application Load Balancer cua AWS lam bo can bang tai chinh
- Target Group HTTP:3000
- Launch Template + Auto Scaling Group de tu tao / xoa EC2
- App backend chung cho moi EC2 tai `aws/asg-backend/server.js`
- User Data mau cho Amazon Linux 2023 tai `aws/user-data-amazon-linux-2023.sh`

### Cau hinh de xuat de demo

- Min capacity: 1
- Desired capacity: 1
- Max capacity: 3
- Health check path: `/health`
- Backend port: `3000`
- Scaling policy: Target Tracking
- Metric: Average CPU utilization
- Target value: `60`
- Instance warmup: `120s`

### Chay local app backend chung

```bash
npm run asg-backend
```

### Cach dung User Data tren AWS Console

1. Vao EC2 -> Launch Templates -> Create launch template.
2. Chon Amazon Linux 2023, instance type t2.micro hoac t3.micro.
3. Chon security group cho backend, trong do port 3000 chi mo tu security group cua ALB.
4. Dan noi dung file `aws/user-data-amazon-linux-2023.sh` vao muc User data.
5. Tao Auto Scaling Group tu Launch Template do.
6. Attach ASG vao Target Group HTTP:3000 hien co.
7. Bat ELB health check va dat Min=1, Desired=1, Max=3.

### Canh bao khi demo tren AWS that

- App phai listen `0.0.0.0:3000`, neu chi bind `localhost` thi Target Group se unhealthy.
- Security group cua EC2 phai cho phep `TCP 3000` tu security group cua ALB.
- `User data` chi chay khi instance khoi tao, sua script xong thi can launch instance moi de kiem tra.
- Neu repo GitHub la private thi can doi cach lay code, vi script mau dang `git clone` tu repo public.

## Cau truc du an

```
IntelligentLoadBalancer/
|- config/servers.json      # Target Group simulate
|- lb-server/               # ELB simulate (Node.js)
|- servers/                 # EC2 simulate
|- dashboard/               # Giao dien theo doi realtime
|- scripts/testTraffic.js   # Script test chia tai
`- package.json
```

## Chay he thong
------------Terminal 1 — Windows copy file
scp -i E:\my_key.pem E:\IntelligentLoadBalancer\ec2-web\index-ec2-1.js ec2-user@3.107.233.161:/home/ec2-user/index.js
scp -i E:\my_key.pem E:\IntelligentLoadBalancer\ec2-web\index-ec2-2.js ec2-user@13.210.108.168:/home/ec2-user/index.js	
scp -i E:\my_key.pem E:\IntelligentLoadBalancer\ec2-web\index-ec2-3.js ec2-user@15.134.221.126:/home/ec2-user/index.js

--pm2 delete ec2-app
pm2 start /home/ec2-user/index.js --name ec2-app
pm2 save

-----------Terminal 2 — EC2-1
ssh -i E:\my_key.pem ec2-user@3.107.233.161
node -v
npm -v
sudo npm install -g pm2
pm2 delete ec2-app
pm2 start /home/ec2-user/index.js --name ec2-app
pm2 save



---------Terminal 3 — EC2-2
ssh -i E:\my_key.pem ec2-user@13.210.108.168
node -v
npm -v
sudo npm install -g pm2
pm2 delete ec2-app
pm2 start /home/ec2-user/index.js --name ec2-app
pm2 save


----------Terminal 4 — EC2-3
ssh -i E:\my_key.pem ec2-user@15.134.221.126
node -v
npm -v
sudo npm install -g pm2
pm2 delete ec2-app
pm2 start /home/ec2-user/index.js --name ec2-app
pm2 save

---------Terminal 5 — EC2 chính
ssh -i E:\my_key.pem ec2-user@3.107.233.161
cd ~
rm -rf IntelligentLoadBalancer_Network
git clone https://github.com/qhuyy0901/IntelligentLoadBalancer_Network.git
cd IntelligentLoadBalancer_Network
npm install
cd config
nano servers.json
cd ..
sudo npm install -g serve
pm2 delete all
pm2 start serve --name dashboard -- dashboard -l 4000
pm2 start lb-server/index.js --name lb
pm2 save
pm2 list

-------xóa data cũ: pm2 delete all
pm2 start lb-server/index.js --name lb
pm2 start serve --name dashboard -- dashboard -1 4000
------------------------------
curl http://3.107.233.161:3000
curl http://13.210.108.168:3000
curl http://15.134.221.126:3000
curl http://localhost:4000
curl http://localhost:8000


---------link
Dashboard: http://3.107.233.161:4000
Custom LB:    http://3.107.233.161:8000
http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/

---for /L %i in (1,1,50) do curl http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/

----------code E:\ec2-web

--------------------showcase
scp -i E:\my_key.pem -r E:\IntelligentLoadBalancer\showcase-web ec2-user@3.107.233.161:/home/ec2-user/
---ssh -i E:\my_key.pem ec2-user@3.107.233.161
pm2 delete all
pm2 start serve --name web -- showcase-web -l 3000
pm2 save




