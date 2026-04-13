// testTraffic.js — Script đơn giản để gửi nhiều request đến Load Balancer và kiểm tra phân phối traffic

const http = require('http');

const COUNT       = parseInt(process.argv[2]) || 30;  // Tổng số request cần gửi
const CONCURRENCY = parseInt(process.argv[3]) || 5;   // Số request gửi cùng một lúc
const LB_HOST     = 'localhost';
const LB_PORT     = 8000; // Cổng Load Balancer (phải khớp với config/servers.json)

let completed = 0;
let stats = {}; // Đếm request theo tên server

// Gửi một request đến Load Balancer và đo thời gian phản hồi
function sendRequest() {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request({ hostname: LB_HOST, port: LB_PORT, path: '/', method: 'GET' }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const duration = Date.now() - start;
        try {
          const json = JSON.parse(body);
          const s = json.server || 'unknown';
          stats[s] = (stats[s] || 0) + 1;
          // Hiển thị tiến độ inline
          process.stdout.write(`\r[${++completed}/${COUNT}] → ${s.padEnd(6)} (${duration}ms)   `);
        } catch (_) {}
        resolve();
      });
    });
    req.on('error', (e) => {
      console.error('\n[Lỗi]', e.message);
      completed++;
      resolve();
    });
    req.end();
  });
}

// Gửi một đợt request song song
async function runBatch(batchSize) {
  const tasks = Array.from({ length: Math.min(batchSize, COUNT - completed) }, sendRequest);
  await Promise.all(tasks);
}

async function main() {
  console.log(`\n🚀 Gửi ${COUNT} request đến http://localhost:${LB_PORT} (song song: ${CONCURRENCY})`);
  console.log('─'.repeat(58));

  // Gửi từng đợt cho đến khi đủ số lượng
  while (completed < COUNT) {
    await runBatch(CONCURRENCY);
  }

  // In kết quả phân phối theo từng server
  console.log('\n\n📊 Kết Quả Phân Phối Traffic:');
  console.log('─'.repeat(38));

  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  for (const [server, count] of Object.entries(stats).sort()) {
    const pct = ((count / total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(pct / 3));
    console.log(`  ${server.padEnd(8)} ${bar.padEnd(34)} ${count} req (${pct}%)`);
  }
  console.log(`\n  Tổng cộng: ${total} request\n`);
}

main();
