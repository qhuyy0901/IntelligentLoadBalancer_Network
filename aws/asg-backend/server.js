const express = require('express');
const os = require('os');

const app = express();

const port = parseInt(process.env.PORT || '3000', 10);
const startedAt = new Date();

function readEnv(name, fallback) {
  return process.env[name] || fallback;
}

function metadata() {
  return {
    appName: readEnv('APP_NAME', 'Intelligent Load Balancer Demo'),
    instanceLabel: readEnv('INSTANCE_LABEL', os.hostname()),
    instanceId: readEnv('INSTANCE_ID', 'unknown-instance-id'),
    availabilityZone: readEnv('AVAILABILITY_ZONE', 'unknown-az'),
    localIpv4: readEnv('LOCAL_IPV4', 'unknown-ip'),
    publicIpv4: readEnv('PUBLIC_IPV4', 'not-exposed'),
    region: readEnv('AWS_REGION', 'unknown-region'),
    hostname: os.hostname(),
    port,
    startedAt: startedAt.toISOString(),
    now: new Date().toLocaleString('vi-VN')
  };
}

function renderHtml(data) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${data.appName}</title>
  <style>
    :root {
      --bg: #f4efe6;
      --panel: rgba(255, 251, 245, 0.88);
      --ink: #1f2937;
      --muted: #6b7280;
      --line: rgba(31, 41, 55, 0.12);
      --accent: #b45309;
      --accent-soft: #f59e0b;
      --ok: #15803d;
      --shadow: 0 20px 50px rgba(31, 41, 55, 0.10);
      --radius: 24px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: Georgia, 'Times New Roman', serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top right, rgba(245, 158, 11, 0.16), transparent 22%),
        radial-gradient(circle at bottom left, rgba(180, 83, 9, 0.12), transparent 24%),
        linear-gradient(135deg, #f7f2e9, #efe7da, #f8f4ee);
      min-height: 100vh;
    }

    .wrap {
      max-width: 980px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }

    .hero {
      background: var(--panel);
      backdrop-filter: blur(10px);
      border: 1px solid var(--line);
      border-radius: 30px;
      padding: 32px;
      box-shadow: var(--shadow);
    }

    .eyebrow {
      display: inline-block;
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(180, 83, 9, 0.10);
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    h1 {
      margin: 14px 0 8px;
      font-size: 40px;
      line-height: 1.05;
    }

    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.7;
      font-size: 16px;
    }

    .status {
      margin-top: 18px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--ok);
      font-weight: 700;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--ok);
      box-shadow: 0 0 0 6px rgba(21, 128, 61, 0.10);
    }

    .grid {
      margin-top: 22px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }

    .card {
      background: rgba(255, 255, 255, 0.66);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 18px;
    }

    .label {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
      font-weight: 700;
    }

    .value {
      font-size: 22px;
      font-weight: 700;
      word-break: break-word;
    }

    .note {
      margin-top: 20px;
      border-left: 4px solid var(--accent-soft);
      padding: 12px 16px;
      background: rgba(245, 158, 11, 0.08);
      border-radius: 12px;
      color: #7c2d12;
      font-size: 15px;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <span class="eyebrow">AWS Auto Scaling Demo</span>
      <h1>${data.appName}</h1>
      <p>Trang này được trả về từ một EC2 backend phía sau Application Load Balancer. Khi Auto Scaling tạo thêm instance, bạn sẽ thấy thông tin instance thay đổi khi refresh hoặc gửi nhiều request.</p>
      <div class="status"><span class="dot"></span>Target Group health check đang dùng <strong>/health</strong> trên port <strong>${data.port}</strong>.</div>

      <div class="grid">
        <article class="card">
          <div class="label">Hostname</div>
          <div class="value">${data.hostname}</div>
        </article>
        <article class="card">
          <div class="label">Instance Label</div>
          <div class="value">${data.instanceLabel}</div>
        </article>
        <article class="card">
          <div class="label">Instance ID</div>
          <div class="value">${data.instanceId}</div>
        </article>
        <article class="card">
          <div class="label">Availability Zone</div>
          <div class="value">${data.availabilityZone}</div>
        </article>
        <article class="card">
          <div class="label">Local IPv4</div>
          <div class="value">${data.localIpv4}</div>
        </article>
        <article class="card">
          <div class="label">Public IPv4</div>
          <div class="value">${data.publicIpv4}</div>
        </article>
        <article class="card">
          <div class="label">Region</div>
          <div class="value">${data.region}</div>
        </article>
        <article class="card">
          <div class="label">Thời gian hiện tại</div>
          <div class="value">${data.now}</div>
        </article>
      </div>

      <div class="note">Gợi ý demo: mở ALB DNS trên trình duyệt, refresh nhiều lần hoặc dùng curl vòng lặp. Khi ASG scale out, bạn sẽ thấy các instance ID khác nhau xuất hiện.</div>
    </section>
  </main>
</body>
</html>`;
}

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    port
  });
});

app.get('/meta', (_req, res) => {
  res.json(metadata());
});

app.get('*', (_req, res) => {
  res.status(200).send(renderHtml(metadata()));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[asg-backend] listening on port ${port}`);
});