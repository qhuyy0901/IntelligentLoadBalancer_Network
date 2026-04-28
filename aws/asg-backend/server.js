const http = require('http');
const express = require('express');
const os = require('os');

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const startedAt = new Date();

// ── IMDSv2 helper ─────────────────────────────────────────────────────────────
// On real EC2 instances this returns live metadata.
// On non-EC2 (local dev) it times out in ~1 second and returns null.

function imdsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '169.254.169.254', ...options, timeout: 1200 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data.trim()));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('IMDS timeout'));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function getImdsToken() {
  return imdsRequest(
    { path: '/latest/api/token', method: 'PUT', headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' } }
  );
}

async function getImdsMeta(token, path) {
  return imdsRequest(
    { path: `/latest/meta-data/${path}`, method: 'GET', headers: { 'X-aws-ec2-metadata-token': token } }
  );
}

// ── Cached metadata ───────────────────────────────────────────────────────────

let cachedMeta = null;

async function loadMetadata() {
  try {
    const token = await getImdsToken();
    const [instanceId, az, localIpv4, publicIpv4, region] = await Promise.all([
      getImdsMeta(token, 'instance-id'),
      getImdsMeta(token, 'placement/availability-zone'),
      getImdsMeta(token, 'local-ipv4'),
      getImdsMeta(token, 'public-ipv4').catch(() => 'not-available'),
      getImdsMeta(token, 'placement/region').catch(() => 'unknown-region'),
    ]);
    cachedMeta = { instanceId, availabilityZone: az, localIpv4, publicIpv4, region };
    console.log(`[asg-backend] EC2 metadata loaded: ${instanceId} @ ${az}`);
  } catch {
    cachedMeta = null;
    console.log('[asg-backend] Not running on EC2 or IMDS unavailable — using env/hostname fallback');
  }
}

function readEnv(name, fallback) {
  return process.env[name] || fallback;
}

function metadata() {
  const imds = cachedMeta || {};
  return {
    appName: readEnv('APP_NAME', 'Auto Scaling EC2 Backend'),
    instanceLabel: readEnv('INSTANCE_LABEL', imds.instanceId || os.hostname()),
    instanceId: imds.instanceId || readEnv('INSTANCE_ID', os.hostname()),
    availabilityZone: imds.availabilityZone || readEnv('AVAILABILITY_ZONE', 'unknown-az'),
    localIpv4: imds.localIpv4 || readEnv('LOCAL_IPV4', 'unknown-ip'),
    publicIpv4: imds.publicIpv4 || readEnv('PUBLIC_IPV4', 'not-exposed'),
    region: imds.region || readEnv('AWS_REGION', 'unknown-region'),
    hostname: os.hostname(),
    port,
    startedAt: startedAt.toISOString(),
    now: new Date().toLocaleString('vi-VN'),
    imdsSource: cachedMeta ? 'ec2-imdsv2' : 'env-fallback',
  };
}

// ── HTML renderer ─────────────────────────────────────────────────────────────

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
      --panel: rgba(255, 251, 245, 0.92);
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
    .wrap { max-width: 980px; margin: 0 auto; padding: 32px 20px 48px; }
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
    h1 { margin: 14px 0 8px; font-size: 36px; line-height: 1.05; }
    p { margin: 0; color: var(--muted); line-height: 1.7; font-size: 16px; }
    .status {
      margin-top: 18px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--ok);
      font-weight: 700;
    }
    .dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: var(--ok); box-shadow: 0 0 0 6px rgba(21, 128, 61, 0.10);
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
    .label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; font-weight: 700; }
    .value { font-size: 20px; font-weight: 700; word-break: break-word; }
    .value-mono { font-family: monospace; font-size: 16px; }
    .note {
      margin-top: 20px;
      border-left: 4px solid var(--accent-soft);
      padding: 12px 16px;
      background: rgba(245, 158, 11, 0.08);
      border-radius: 12px;
      color: #7c2d12;
      font-size: 15px;
    }
    .source-badge {
      display: inline-block;
      margin-top: 16px;
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      background: ${data.imdsSource === 'ec2-imdsv2' ? 'rgba(21,128,61,0.12)' : 'rgba(107,114,128,0.12)'};
      color: ${data.imdsSource === 'ec2-imdsv2' ? '#15803d' : '#6b7280'};
    }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <span class="eyebrow">Auto Scaling EC2 Backend</span>
      <h1>${data.appName}</h1>
      <p>Trang này được trả về từ một EC2 backend trong Auto Scaling Group, phía sau Application Load Balancer. Refresh nhiều lần để thấy các instance ID khác nhau.</p>
      <div class="status"><span class="dot"></span>Health check: <strong>/health</strong> · Port <strong>${data.port}</strong></div>
      <span class="source-badge">Metadata source: ${data.imdsSource}</span>

      <div class="grid">
        <article class="card">
          <div class="label">Instance ID</div>
          <div class="value value-mono">${data.instanceId}</div>
        </article>
        <article class="card">
          <div class="label">Availability Zone</div>
          <div class="value">${data.availabilityZone}</div>
        </article>
        <article class="card">
          <div class="label">Private IPv4</div>
          <div class="value value-mono">${data.localIpv4}</div>
        </article>
        <article class="card">
          <div class="label">Public IPv4</div>
          <div class="value value-mono">${data.publicIpv4}</div>
        </article>
        <article class="card">
          <div class="label">Region</div>
          <div class="value">${data.region}</div>
        </article>
        <article class="card">
          <div class="label">Hostname (OS)</div>
          <div class="value value-mono">${data.hostname}</div>
        </article>
        <article class="card">
          <div class="label">Port</div>
          <div class="value">${data.port}</div>
        </article>
        <article class="card">
          <div class="label">Thời gian</div>
          <div class="value" style="font-size:15px">${data.now}</div>
        </article>
      </div>

      <div class="note">Demo Auto Scaling: mở ALB DNS trên trình duyệt, refresh nhiều lần hoặc chạy vòng lặp curl. Khi ASG scale out, Instance ID và AZ sẽ thay đổi giữa các request.</div>
    </section>
  </main>
</body>
</html>`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    instanceId: cachedMeta?.instanceId || os.hostname(),
    uptimeSeconds: Math.floor(process.uptime()),
    port,
  });
});

app.get('/meta', (_req, res) => {
  res.json(metadata());
});

app.get('*', (_req, res) => {
  res.status(200).send(renderHtml(metadata()));
});

// ── Start ─────────────────────────────────────────────────────────────────────

loadMetadata().finally(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`[asg-backend] listening on :${port}`);
    const m = metadata();
    console.log(`[asg-backend] instanceId=${m.instanceId}  az=${m.availabilityZone}  source=${m.imdsSource}`);
  });
});
