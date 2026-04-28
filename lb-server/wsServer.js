const path = require('path');
const dotenv = require('dotenv');
const WebSocket = require('ws');
const config = require('../config/servers.json');
const { getAlgorithm } = require('./balancer');
const { getRates, getRecentRequests, getLoadBalancingMetrics } = require('./logger');
const { getAutoScalingState } = require('./autoScaling');
const { getEC2Instances, getEC2StateSummary } = require('../aws/ec2');
const { getTargetGroupAndLoadBalancer } = require('../aws/elb');
const { getAutoScalingSnapshot } = require('../aws/autoscaling');
const { getCloudWatchSnapshot } = require('../aws/cloudwatch');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

let wss;
let isPolling = false;
let lastAwsErrorSignature = null;

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function buildTrafficFromRecentRequests(recentRequests = [], windowMs = 60000) {
  const now = Date.now();
  const start = now - windowMs;
  const byInstance = {};

  recentRequests.forEach((request) => {
    const ts = new Date(request.time).getTime();
    if (!Number.isFinite(ts) || ts < start) return;

    const key = request.serverId || 'unknown';
    if (!byInstance[key]) {
      byInstance[key] = {
        instanceId: key,
        serverName: request.serverName || key,
        requestCount: 0,
        requestRate: 0
      };
    }

    byInstance[key].requestCount += 1;
  });

  Object.values(byInstance).forEach((item) => {
    item.requestRate = round(item.requestCount / (windowMs / 1000), 2);
  });

  return {
    windowMs,
    byInstance
  };
}

function mapLegacyServers(ec2Instances = [], trafficByInstance = {}, targetGroup = {}) {
  const targetHealthMap = new Map((targetGroup.registeredTargets || []).map((target) => [target.targetId, target]));
  const ec2ColorPalette = ['#2dd4bf', '#3b82f6', '#f59e0b', '#f43f5e', '#22c55e', '#8b5cf6'];

  return ec2Instances.map((instance, index) => {
    const targetHealth = targetHealthMap.get(instance.instanceId);
    const traffic = trafficByInstance[instance.instanceId] || {};
    const state = String(instance.state || 'unknown');
    const isRunning = state === 'running';
    const isHealthy = targetHealth?.healthState === 'healthy';

    return {
      id: instance.instanceId,
      name: instance.name || instance.instanceId,
      domain: instance.privateIp || instance.publicIp || 'n/a',
      color: ec2ColorPalette[index % ec2ColorPalette.length],
      port: 3000,
      enabled: true,
      status: isRunning && isHealthy ? 'up' : 'down',
      requestCount: Number(traffic.requestCount || 0),
      activeConnections: 0,
      rps: Number(traffic.requestRate || 0)
    };
  });
}

function toUserSafeError(error) {
  const code = error?.code || error?.name || 'AWS_ERROR';
  const message = error?.message || 'Unknown AWS error';
  return { code, message };
}

// ── Fetch /metrics from a single EC2 private IP ───────────────────────────────
function fetchInstanceMetrics(privateIp, timeout = 2000) {
  return new Promise((resolve) => {
    const req = require('http').get(
      { hostname: privateIp, port: 3000, path: '/metrics', timeout },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Enrich ec2Instances with live requestCount from /metrics on each private IP
async function enrichWithInstanceMetrics(ec2Instances = []) {
  const results = await Promise.all(
    ec2Instances.map(async (instance) => {
      const ip = instance.privateIp;
      if (!ip) return instance;
      const m = await fetchInstanceMetrics(ip);
      return {
        ...instance,
        metricsRequestCount: m?.requestCount ?? null,
        metricsReachable: m !== null,
      };
    })
  );
  return results;
}

function logAwsErrors(errors = []) {
  if (!errors.length) {
    lastAwsErrorSignature = null;
    return;
  }

  const signature = JSON.stringify(errors.map((item) => `${item.code}:${item.message}`));
  if (signature === lastAwsErrorSignature) return;
  lastAwsErrorSignature = signature;
  console.warn('[WebSocket][AWS]', errors.map((item) => `${item.code} - ${item.message}`).join(' | '));
}

async function buildAwsPayload() {
  const awsErrors = [];

  const envConfig = {
    targetGroupArn: process.env.TARGET_GROUP_ARN || null,
    loadBalancerArn: process.env.LOAD_BALANCER_ARN || null,
    autoScalingGroupName: process.env.AUTO_SCALING_GROUP_NAME || null,
    albDns: process.env.ALB_DNS || null
  };

  let autoScaling = {
    groupName: envConfig.autoScalingGroupName,
    minSize: null,
    desiredCapacity: null,
    maxSize: null,
    currentInstances: 0,
    instances: [],
    scalingActivities: []
  };

  try {
    autoScaling = await getAutoScalingSnapshot({ groupName: envConfig.autoScalingGroupName });
  } catch (error) {
    awsErrors.push(toUserSafeError(error));
  }

  const asgInstanceIds = (autoScaling.instances || []).map((instance) => instance.instanceId).filter(Boolean);

  let ec2Instances = [];
  try {
    ec2Instances = await getEC2Instances({ instanceIds: asgInstanceIds });
  } catch (error) {
    awsErrors.push(toUserSafeError(error));
  }

  let targetGroup = {
    arn: envConfig.targetGroupArn,
    name: null,
    protocol: null,
    port: null,
    vpcId: null,
    healthyTargets: 0,
    unhealthyTargets: 0,
    registeredTargets: []
  };

  let loadBalancer = {
    arn: envConfig.loadBalancerArn,
    name: null,
    dnsName: envConfig.albDns,
    state: null,
    type: null,
    scheme: null,
    vpcId: null,
    availabilityZones: []
  };

  try {
    const elbSnapshot = await getTargetGroupAndLoadBalancer({
      targetGroupArn: envConfig.targetGroupArn,
      loadBalancerArn: envConfig.loadBalancerArn
    });
    targetGroup = elbSnapshot.targetGroup;
    loadBalancer = elbSnapshot.loadBalancer;
  } catch (error) {
    awsErrors.push(toUserSafeError(error));
  }

  let cloudWatch = {
    requestCount: null,
    requestRate: null,
    targetResponseTime: null,
    httpCodeTarget2xx: null,
    httpCodeTarget4xx: null,
    httpCodeTarget5xx: null,
    healthyHostCount: null,
    unHealthyHostCount: null,
    errorRate: null,
    noData: true
  };

  try {
    cloudWatch = await getCloudWatchSnapshot({
      loadBalancerArn: loadBalancer.arn,
      targetGroupArn: targetGroup.arn
    });
  } catch (error) {
    awsErrors.push(toUserSafeError(error));
  }

  const recentRequests = getRecentRequests(200).map((request) => ({
    time: request.time,
    clientIp: request.clientIp,
    serverId: request.serverId,
    serverName: request.serverName,
    duration: request.duration
  }));
  const traffic = buildTrafficFromRecentRequests(recentRequests, 60000);
  const ec2StateSummary = getEC2StateSummary(ec2Instances);

  // Fetch live /metrics from each EC2 private IP (best-effort, 2s timeout)
  const enrichedInstances = await enrichWithInstanceMetrics(ec2Instances);

  // Merge live requestCount into traffic map for dashboard display
  enrichedInstances.forEach((instance) => {
    if (instance.metricsRequestCount != null) {
      const key = instance.instanceId;
      if (!traffic.byInstance[key]) {
        traffic.byInstance[key] = { instanceId: key, serverName: instance.name, requestCount: 0, requestRate: 0 };
      }
      traffic.byInstance[key].requestCount = instance.metricsRequestCount;
    }
  });

  const legacyServers = mapLegacyServers(enrichedInstances, traffic.byInstance, targetGroup);

  const legacyMetrics = getLoadBalancingMetrics();
  const healthyFromTg = Number(targetGroup.healthyTargets || 0);
  const unhealthyFromTg = Number(targetGroup.unhealthyTargets || 0);

  return {
    type: 'stats',
    timestamp: new Date().toISOString(),
    ec2Instances: enrichedInstances,
    ec2StateSummary,
    targetGroup,
    loadBalancer,
    autoScaling,
    cloudWatch,
    traffic,
    awsErrors,
    // Compatibility fields used by existing dashboard scripts.
    algorithm: getAlgorithm(),
    recentRequests,
    servers: legacyServers,
    metrics: {
      ...legacyMetrics,
      healthyServers: healthyFromTg,
      totalServers: healthyFromTg + unhealthyFromTg,
      throughputRps: Number.isFinite(cloudWatch.requestRate) ? cloudWatch.requestRate : legacyMetrics.throughputRps,
      packetLossPct: Number.isFinite(cloudWatch.errorRate) ? cloudWatch.errorRate : legacyMetrics.packetLossPct,
      latencyAvgMs: Number.isFinite(cloudWatch.targetResponseTime)
        ? round(cloudWatch.targetResponseTime * 1000, 2)
        : legacyMetrics.latencyAvgMs,
      successRatePct: Number.isFinite(cloudWatch.errorRate)
        ? round(100 - cloudWatch.errorRate, 2)
        : legacyMetrics.successRatePct
    },
    simulatedAutoScaling: getAutoScalingState(),
    localRates: getRates()
  };
}

async function broadcastStats() {
  if (!wss || wss.clients.size === 0) return;
  if (isPolling) return;
  isPolling = true;

  try {
    const payload = await buildAwsPayload();
    logAwsErrors(payload.awsErrors);
    const data = JSON.stringify(payload);

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  } catch (error) {
    console.error('[WebSocket] Failed to build AWS payload:', error.message || error);
  } finally {
    isPolling = false;
  }
}

function startWebSocketServer() {
  const WS_PORT = config.loadBalancer.wsPort || 9090;
  const POLL_MS = Math.max(3000, Math.min(5000, Number(process.env.AWS_POLL_INTERVAL_MS || 5000)));

  wss = new WebSocket.Server({ port: WS_PORT });

  console.log(`[WebSocket] AWS realtime server ready at ws://localhost:${WS_PORT}`);
  console.log(`[WebSocket] Polling AWS every ${POLL_MS}ms`);

  wss.on('connection', (ws) => {
    console.log('[WebSocket] Dashboard connected');
    ws.on('close', () => console.log('[WebSocket] Dashboard disconnected'));
  });

  setInterval(broadcastStats, POLL_MS);
}

module.exports = { startWebSocketServer };
