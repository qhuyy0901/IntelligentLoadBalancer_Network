const config = require('../config/servers.json');
const { getLoadBalancingMetrics } = require('./logger');
const { getServerStates, setServerEnabled } = require('./balancer');

const settings = config.loadBalancer.autoScaling || {};

let currentCapacity = Math.max(
  Number(settings.desiredCapacity || settings.minCapacity || 1),
  config.servers.filter((server) => server.enabled !== false).length || 1
);
let lastScaleAt = 0;

function clampCapacity(value) {
  const minCapacity = Number(settings.minCapacity || 1);
  const maxCapacity = Number(settings.maxCapacity || config.servers.length || 1);
  return Math.max(minCapacity, Math.min(maxCapacity, value));
}

function syncCapacity(targetCapacity) {
  const desiredCapacity = clampCapacity(targetCapacity);
  config.servers.forEach((server, index) => {
    setServerEnabled(server.id, index < desiredCapacity);
  });
  currentCapacity = desiredCapacity;
}

function canScale(now) {
  const cooldownMs = Number(settings.cooldownMs || 10000);
  return now - lastScaleAt >= cooldownMs;
}

function getEnabledServers() {
  return config.servers.filter((server) => server.enabled !== false);
}

function getAutoScalingState() {
  return {
    enabled: settings.enabled !== false,
    minCapacity: Number(settings.minCapacity || 1),
    desiredCapacity: currentCapacity,
    maxCapacity: Number(settings.maxCapacity || config.servers.length || 1),
    activeCapacity: getEnabledServers().length,
    scaleOutRequestsInWindow: Number(settings.scaleOutRequestsInWindow || 12),
    scaleInRequestsInWindow: Number(settings.scaleInRequestsInWindow || 3)
  };
}

function scaleOut(now, metrics) {
  const maxCapacity = Number(settings.maxCapacity || config.servers.length || 1);
  if (currentCapacity >= maxCapacity) return;
  syncCapacity(currentCapacity + 1);
  lastScaleAt = now;
  console.log(`[AutoScaling] scale out -> ${currentCapacity}/${maxCapacity} instances (requestsInWindow=${metrics.requestsInWindow})`);
}

function scaleIn(now, metrics) {
  const minCapacity = Number(settings.minCapacity || 1);
  if (currentCapacity <= minCapacity) return;

  const states = getServerStates();
  const removable = getEnabledServers()
    .slice()
    .reverse()
    .find((server) => (states[server.id]?.activeConnections || 0) === 0);

  if (!removable) return;

  syncCapacity(currentCapacity - 1);
  lastScaleAt = now;
  console.log(`[AutoScaling] scale in -> ${currentCapacity}/${settings.maxCapacity || config.servers.length} instances (requestsInWindow=${metrics.requestsInWindow})`);
}

function evaluateScaling() {
  if (settings.enabled === false) return;

  const now = Date.now();
  if (!canScale(now)) return;

  const metrics = getLoadBalancingMetrics();
  const scaleOutThreshold = Number(settings.scaleOutRequestsInWindow || 12);
  const scaleInThreshold = Number(settings.scaleInRequestsInWindow || 3);

  if (metrics.requestsInWindow >= scaleOutThreshold) {
    scaleOut(now, metrics);
    return;
  }

  if (metrics.requestsInWindow <= scaleInThreshold) {
    scaleIn(now, metrics);
  }
}

function startAutoScalingLoop() {
  if (settings.enabled === false) return;
  syncCapacity(currentCapacity);
  const evaluationIntervalMs = Number(settings.evaluationIntervalMs || 5000);
  console.log(`[AutoScaling] enabled with min=${settings.minCapacity || 1}, desired=${currentCapacity}, max=${settings.maxCapacity || config.servers.length}, check every ${evaluationIntervalMs}ms`);
  setInterval(evaluateScaling, evaluationIntervalMs);
}

module.exports = { startAutoScalingLoop, getAutoScalingState, evaluateScaling, syncCapacity };