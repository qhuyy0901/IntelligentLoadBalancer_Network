'use strict';

const http = require('http');
const os = require('os');

const port = parseInt(process.env.PORT || '3000', 10);
const startedAt = new Date();
let requestCount = 0;

// ── IMDSv2 helper ──────────────────────────────────────────────────────────────

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
    req.on('timeout', () => { req.destroy(); reject(new Error('IMDS timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function getImdsToken() {
  return imdsRequest({
    path: '/latest/api/token', method: 'PUT',
    headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' }
  });
}

async function getImdsMeta(token, path) {
  return imdsRequest({
    path: `/latest/meta-data/${path}`, method: 'GET',
    headers: { 'X-aws-ec2-metadata-token': token }
  });
}

// ── Cached metadata ────────────────────────────────────────────────────────────

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
    console.log(`[aws-backend] EC2 metadata loaded: ${instanceId} @ ${az}`);
  } catch {
    cachedMeta = null;
    console.log('[aws-backend] Not running on EC2 — using env/hostname fallback');
  }
}

function meta() {
  const m = cachedMeta || {};
  return {
    instanceId: m.instanceId || process.env.INSTANCE_ID || os.hostname(),
    availabilityZone: m.availabilityZone || process.env.AVAILABILITY_ZONE || 'unknown-az',
    localIpv4: m.localIpv4 || process.env.LOCAL_IPV4 || 'unknown-ip',
    publicIpv4: m.publicIpv4 || process.env.PUBLIC_IPV4 || 'not-exposed',
    region: m.region || process.env.AWS_REGION || 'unknown-region',
    hostname: os.hostname(),
    imdsSource: cachedMeta ? 'ec2-imdsv2' : 'env-fallback',
  };
}

// ── HTML renderer ──────────────────────────────────────────────────────────────

function renderHtml(m) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EC2 Backend — ${m.instanceId}</title>
  <style>
    :root {
      --bg: #0d1117; --panel: #161b22; --border: #30363d;
      --text: #e6edf3; --muted: #8b949e; --green: #3fb950;
      --blue: #58a6ff; --accent: #238636;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg); color: var(--text);
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 24px;
    }
    .card {
      background: var(--panel); border: 1px solid var(--border);
      border-radius: 12px; padding: 32px; max-width: 620px; width: 100%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(63,185,80,0.15); border: 1px solid rgba(63,185,80,0.4);
      color: var(--green); border-radius: 999px; padding: 4px 12px;
      font-size: 12px; font-weight: 700; letter-spacing: 0.05em;
      text-transform: uppercase; margin-bottom: 20px;
    }
    .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--green); box-shadow: 0 0 6px var(--green);
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 6px; }
    .sub { color: var(--muted); font-size: 14px; margin-bottom: 24px; }
    .grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
    }
    .stat {
      background: var(--bg); border: 1px solid var(--border);
      border-radius: 8px; padding: 14px;
    }
    .stat-label { font-size: 11px; font-weight: 700; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
    .stat-value { font-size: 16px; font-weight: 600; font-family: monospace;
      color: var(--blue); word-break: break-all; }
    .stat-value.green { color: var(--green); }
    .req-count { font-size: 28px; font-weight: 800; color: var(--green); }
    .footer { margin-top: 20px; font-size: 12px; color: var(--muted);
      border-top: 1px solid var(--border); padding-top: 16px;
      display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span> Healthy — Port ${port}</div>
    <h1>EC2 Instance Backend</h1>
    <p class="sub">AWS Auto Scaling Group · Application Load Balancer</p>
    <div class="grid">
      <div class="stat">
        <div class="stat-label">Instance ID</div>
        <div class="stat-value">${m.instanceId}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Availability Zone</div>
        <div class="stat-value green">${m.availabilityZone}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Private IPv4</div>
        <div class="stat-value">${m.localIpv4}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Region</div>
        <div class="stat-value">${m.region}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Hostname</div>
        <div class="stat-value">${m.hostname}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Request Count</div>
        <div class="stat-value req-count" id="rc">${requestCount}</div>
      </div>
    </div>
    <div class="footer">
      <span>Started: ${startedAt.toISOString()}</span>
      <span>Source: ${m.imdsSource}</span>
    </div>
  </div>
</body>
</html>`;
}

// ── HTTP Server ────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/health') {
    const m = meta();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      instanceId: m.instanceId,
      availabilityZone: m.availabilityZone,
      uptimeSeconds: Math.floor(process.uptime()),
      port,
    }));
    return;
  }

  if (url === '/metrics') {
    const m = meta();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({
      instanceId: m.instanceId,
      availabilityZone: m.availabilityZone,
      localIpv4: m.localIpv4,
      region: m.region,
      port,
      uptimeSeconds: Math.floor(process.uptime()),
      requestCount,
      startedAt: startedAt.toISOString(),
    }));
    return;
  }

  // All other routes → increment counter + serve HTML
  requestCount += 1;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(renderHtml(meta()));
});

// ── Start ──────────────────────────────────────────────────────────────────────

loadMetadata().finally(() => {
  server.listen(port, '0.0.0.0', () => {
    const m = meta();
    console.log(`[aws-backend] listening on :${port}`);
    console.log(`[aws-backend] instanceId=${m.instanceId}  az=${m.availabilityZone}  source=${m.imdsSource}`);
  });
});
