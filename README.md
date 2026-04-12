# Intelligent Load Balancing

Do an co so mon Mang May Tinh theo huong AWS simulation:
- Deploy nhieu EC2 server (mo phong local)
- Cau hinh Load Balancer
- Tao Target Group
- Test phan phoi traffic va failover

## Doi chieu yeu cau de tai

1. Deploy nhieu EC2 server: Dat
2. Cau hinh Load Balancer: Dat
3. Tao Target Group: Dat (mo phong bang file config)
4. ELB: Dat (Node.js ELB simulation)
5. Test traffic distribution: Dat (curl test + script test)

## Kien truc mo phong AWS

- EC2 instances (simulate):
	- EC2-1: localhost:3001
	- EC2-2: localhost:3002
	- EC2-3: localhost:3003
- Target Group (simulate): nhom server duoc quan ly trong file config
- ELB (simulate): Node.js Load Balancer tai localhost:3000
- Health Check: ping /health dinh ky de loai server loi

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

```bash
cd e:\IntelligentLoadBalancer
npm install
npm start
```

`npm start` se khoi dong dong thoi EC2-1, EC2-2, EC2-3 va Load Balancer.

Neu can dashboard:

```bash
npm run dashboard
```

Dashboard: http://localhost:4000

## Target Group (simulate)

File cau hinh: `config/servers.json`

```json
"servers": [
	{ "id": "ec2-1", "host": "localhost", "port": 3001 },
	{ "id": "ec2-2", "host": "localhost", "port": 3002 },
	{ "id": "ec2-3", "host": "localhost", "port": 3003 }
]
```

Trong buoi demo, trinh bay ro: day la Target Group mo phong.

## Test phan phoi traffic

### Test thu cong

```bash
curl http://localhost:3000
```

Lap lai nhieu lan, truong `server` trong response se luan phien giua EC2-1/2/3.

### Test spam request

Windows CMD:

```bat
for /l %i in (1,1,20) do curl http://localhost:3000
```

PowerShell:

```powershell
1..20 | ForEach-Object { curl http://localhost:3000 }
```

Hoac dung script san co:

```bash
npm run test-traffic
```

## Test failover (diem cong)

1. Tat 1 EC2 (vi du dung process EC2-2)
2. Spam request lai
3. Quan sat LB van phuc vu bang cac server con song
4. Health check tu dong danh dau node loi la down

## API nhanh cho demo

- `GET /lb/config`: xem thuat toan va pool
- `POST /lb/config/algorithm?name=round-robin`: doi thuat toan
- `POST /lb/config/server?id=ec2-2&enabled=false`: loai server khoi target group simulate
- `POST /lb/config/server?id=ec2-2&enabled=true`: them lai vao target group


