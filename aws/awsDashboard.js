/**
 * aws/awsDashboard.js — Read-only AWS status aggregator
 *
 * Gathers live data from AWS services using ONLY read (Describe/Get) API calls.
 * Exposes a single handler: handleAwsOverview(req, res)
 *
 * NO create / update / delete / start / stop / terminate calls are made.
 */

const { getEC2Instances, getEC2StateSummary } = require('./ec2');
const { getTargetGroupAndLoadBalancer }        = require('./elb');
const { getAutoScalingSnapshot }               = require('./autoscaling');
const { getCloudWatchSnapshot }                = require('./cloudwatch');

// ── Cache layer — avoid hammering AWS APIs on every frontend poll ───────────
let _cache  = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 4000; // refresh at most every 4 seconds

async function fetchAwsOverview() {
  const now = Date.now();

  // Return cached data if still fresh
  if (_cache && (now - _cacheTs) < CACHE_TTL_MS) {
    return { ..._cache, cached: true, cacheAge: now - _cacheTs };
  }

  const errors = [];

  // ── 1. Auto Scaling Group ─────────────────────────────────────────────────
  let autoScaling = null;
  try {
    autoScaling = await getAutoScalingSnapshot();
  } catch (err) {
    errors.push({ service: 'AutoScaling', message: err.message, code: err.code });
  }

  // ── 2. EC2 Instances ──────────────────────────────────────────────────────
  let ec2Instances = [];
  let ec2Summary   = null;
  try {
    // If ASG returned instance IDs, use those; otherwise get all
    const instanceIds = autoScaling?.instances?.map(i => i.instanceId).filter(Boolean) || [];
    ec2Instances = await getEC2Instances({ instanceIds: instanceIds.length > 0 ? instanceIds : undefined });
    ec2Summary   = getEC2StateSummary(ec2Instances);
  } catch (err) {
    errors.push({ service: 'EC2', message: err.message, code: err.code });
  }

  // ── 3. Target Group + Load Balancer ───────────────────────────────────────
  let targetGroup  = null;
  let loadBalancer = null;
  try {
    const elbData = await getTargetGroupAndLoadBalancer();
    targetGroup   = elbData.targetGroup;
    loadBalancer  = elbData.loadBalancer;
  } catch (err) {
    errors.push({ service: 'ELBv2', message: err.message, code: err.code });
  }

  // ── 4. CloudWatch Metrics ─────────────────────────────────────────────────
  let cloudwatch = null;
  try {
    cloudwatch = await getCloudWatchSnapshot();
  } catch (err) {
    errors.push({ service: 'CloudWatch', message: err.message, code: err.code });
  }

  // ── Build response ────────────────────────────────────────────────────────
  const result = {
    timestamp: new Date().toISOString(),
    region: process.env.AWS_REGION || 'ap-southeast-2',
    cached: false,

    autoScaling: autoScaling || {
      groupName: process.env.AUTO_SCALING_GROUP_NAME || null,
      minSize: null, desiredCapacity: null, maxSize: null,
      currentInstances: 0, instances: [], scalingActivities: []
    },

    ec2: {
      instances: ec2Instances,
      summary: ec2Summary || { total: 0, running: 0, pending: 0, stopped: 0, stopping: 0, terminated: 0, other: 0 }
    },

    targetGroup: targetGroup || {
      arn: null, name: null, protocol: null, port: null,
      healthyTargets: 0, unhealthyTargets: 0, registeredTargets: []
    },

    loadBalancer: loadBalancer || {
      arn: null, name: null, dnsName: process.env.ALB_DNS || null,
      state: null, type: null, scheme: null, availabilityZones: []
    },

    cloudwatch: cloudwatch || {
      requestCount: null, requestRate: null, targetResponseTime: null,
      healthyHostCount: null, unHealthyHostCount: null, errorRate: null, noData: true
    },

    errors
  };

  _cache   = result;
  _cacheTs = now;
  return result;
}

/**
 * HTTP handler for GET /api/aws/overview  (used by lb-server/index.js)
 */
function handleAwsOverview(req, res) {
  fetchAwsOverview()
    .then(data => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    })
    .catch(err => {
      console.error('[AWS Dashboard] fatal error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to fetch AWS overview',
        message: err.message,
        timestamp: new Date().toISOString()
      }));
    });
}

module.exports = { handleAwsOverview };
