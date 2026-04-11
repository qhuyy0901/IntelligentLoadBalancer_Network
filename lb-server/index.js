const http = require('http');
const httpProxy = require('http-proxy');
const config = require('../config/servers.json');

const {
  getNextServer,
  getAlgorithm,
  setAlgorithm,
  getSupportedAlgorithms,
  setServerEnabled,
  getServersConfig,
  incrementConnections,
  decrementConnections,
  incrementRequestCount
} = require('./balancer');

const { startHealthChecks } = require('./healthCheck');
const { logRequest, logFailure, getRates, getLoadBalancingMetrics } = require('./logger');
const { startWebSocketServer } = require('./wsServer');

const LB_PORT = config.loadBalancer.port || 3000;
const proxy = httpProxy.createProxyServer({});

// ── DEBUG: ID duy nhat cho moi request de trace ──────────────────────────
let _reqId = 0;
const nextId = () => `[R${String(++_reqId).padStart(4,'0')}]`;

// Loi proxy toan cuc
proxy.on('error', (err, req, res) => {
  console.error('[LB ERROR]:', err.message);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway' }));
  }
});

const server = http.createServer((req, res) => {
  const id = nextId(); // ID duy nhat cho moi request
  console.log(`${id} --> ${req.method} ${req.url} (from ${req.socket.remoteAddress})`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log(`${id} [FILTER] OPTIONS preflight`);
    res.writeHead(204);
    return res.end();
  }

  // Chan request rac cua browser (favicon, robots...)
  const IGNORE = [
    '/favicon.ico', '/robots.txt',
    '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png',
    '/sitemap.xml', '/manifest.json', '/browserconfig.xml'
  ];

  if (IGNORE.includes(req.url)) {
    console.log(`${id} [FILTER] browser noise -> ignored`);
    res.writeHead(204);
    return res.end();
  }

  // Health check cua LB (khong proxy, khong dem)
  if (req.url === '/health') {
    console.log(`${id} [FILTER] health check`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }

  // API stats cho dashboard (khong proxy, khong dem)
  if (req.url === '/lb/stats') {
    console.log(`${id} [FILTER] /lb/stats`);
    const states = require('./balancer').getServerStates();
    const recent = require('./logger').getRecentRequests(20);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      servers: states, recentRequests: recent,
      rates: getRates(), metrics: getLoadBalancingMetrics(), algorithm: getAlgorithm()
    }));
  }

  // ── API nhận log từ EC2 backend khi traffic đến qua AWS ALB ───────────
  // EC2 gọi POST /lb/aws-log sau mỗi request thật để dashboard cập nhật
  if (req.url === '/lb/aws-log' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { serverId, serverName, clientIp, duration, path: reqPath } = data;

        // Validate: chỉ chấp nhận server đã biết
        const knownIds = config.servers.map(s => s.id);
        if (!serverId || !knownIds.includes(serverId)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Unknown serverId' }));
        }

        // Cập nhật counter và ghi log — giống hệt khi request đi qua Node LB
        incrementRequestCount(serverId);
        logRequest({
          clientIp: clientIp || '0.0.0.0',
          serverId,
          serverName: serverName || serverId,
          timestamp: new Date(),
          duration: Number(duration) || 0
        });

        console.log(`[AWS-ALB] ${clientIp} → ${serverName} (${duration}ms) via ALB`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // API config (khong dem)
  if (req.url.startsWith('/lb/config')) {
    console.log(`${id} [FILTER] /lb/config`);
    // Xu ly config API
    if (req.url.startsWith('/lb/config/algorithm') && req.method === 'POST') {
      const parsed = new URL(req.url, `http://localhost:${LB_PORT}`);
      const algorithm = parsed.searchParams.get('name');
      if (!algorithm || !setAlgorithm(algorithm)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Bad Request', supportedAlgorithms: getSupportedAlgorithms() }));
      }
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, algorithm: getAlgorithm() }));
    }
    if (req.url.startsWith('/lb/config/server') && req.method === 'POST') {
      const parsed = new URL(req.url, `http://localhost:${LB_PORT}`);
      const serverId = parsed.searchParams.get('id');
      const enabledValue = parsed.searchParams.get('enabled');
      if (!serverId || enabledValue == null || !setServerEnabled(serverId, enabledValue === 'true')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Bad Request' }));
      }
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, servers: getServersConfig() }));
    }
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ algorithm: getAlgorithm(), supportedAlgorithms: getSupportedAlgorithms(), servers: getServersConfig() }));
    }
  }

  // LOAD BALANCING CHINH - chi den day moi dem request
  console.log(`${id} [PROXY] --> routing to backend`);

  const target = getNextServer();

  if (!target) {
    logFailure();
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'No server available' }));
  }

  const targetUrl = `http://${target.host}:${target.port}`;

  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
  if (clientIp === '::1') clientIp = '127.0.0.1';           // IPv6 loopback
  else if (clientIp.startsWith('::ffff:')) clientIp = clientIp.slice(7); // IPv4-mapped

  req.headers['x-forwarded-for'] = clientIp;
  req.headers['x-load-balancer'] = 'IntelligentLB/1.0';

  const startTime = Date.now();
  let doneCalled = false;

  // Ham hoan tat: dem request + ghi log (chi khi response gui thanh cong)
  const done = () => {
    if (doneCalled) return;
    doneCalled = true;
    decrementConnections(target.id);
    incrementRequestCount(target.id);
    const duration = Date.now() - startTime;
    logRequest({ clientIp, serverId: target.id, serverName: target.name, timestamp: new Date(), duration });
    console.log(`${id} [DONE] counted +1 -> ${target.name} (${duration}ms) total=${require('./balancer').getServerStates()[target.id]?.requestCount}`);
  };

  // Ham giai phong ket noi khi client bo giua chung (KHONG dem request)
  const abort = () => {
    if (doneCalled) return;
    doneCalled = true;
    decrementConnections(target.id);
    console.log(`${id} [ABORT] client disconnect, NOT counted`);
  };

  incrementConnections(target.id);
  proxy.web(req, res, { target: targetUrl });

  res.on('finish', () => { console.log(`${id} [EVENT] finish`); done(); });
  res.on('close',  () => { console.log(`${id} [EVENT] close (doneCalled=${doneCalled})`); abort(); });
});


server.listen(LB_PORT, '0.0.0.0', () => {
  console.log(`🚀 LB running at http://0.0.0.0:${LB_PORT}`);
});

startHealthChecks();
startWebSocketServer();