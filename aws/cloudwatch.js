const path = require('path');
const dotenv = require('dotenv');
const { CloudWatchClient, GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { normalizeCredentialsError } = require('./ec2');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const REGION = process.env.AWS_REGION || 'ap-southeast-2';
const cloudWatchClient = new CloudWatchClient({ region: REGION });

function toLoadBalancerDimensionValue(loadBalancerArn = '') {
  const marker = 'loadbalancer/';
  const index = loadBalancerArn.indexOf(marker);
  return index >= 0 ? loadBalancerArn.slice(index + marker.length) : null;
}

function toTargetGroupDimensionValue(targetGroupArn = '') {
  const marker = 'targetgroup/';
  const index = targetGroupArn.indexOf(marker);
  return index >= 0 ? targetGroupArn.slice(index + marker.length) : null;
}

function pickLatestValue(metricDataResult = {}) {
  const timestamps = metricDataResult?.Timestamps || [];
  const values = metricDataResult?.Values || [];
  if (!timestamps.length || !values.length) return null;

  let latestIndex = 0;
  for (let i = 1; i < timestamps.length; i += 1) {
    if (new Date(timestamps[i]).getTime() > new Date(timestamps[latestIndex]).getTime()) {
      latestIndex = i;
    }
  }

  const value = values[latestIndex];
  return Number.isFinite(value) ? Number(value) : null;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

async function getCloudWatchSnapshot(options = {}) {
  const loadBalancerArn = options.loadBalancerArn || process.env.LOAD_BALANCER_ARN;
  const targetGroupArn = options.targetGroupArn || process.env.TARGET_GROUP_ARN;
  const periodSeconds = Number(options.periodSeconds || process.env.CLOUDWATCH_PERIOD_SECONDS || 60);
  const lookbackMinutes = Number(options.lookbackMinutes || process.env.CLOUDWATCH_LOOKBACK_MINUTES || 10);

  const lbDimensionValue = toLoadBalancerDimensionValue(loadBalancerArn);
  const tgDimensionValue = toTargetGroupDimensionValue(targetGroupArn);

  if (!lbDimensionValue) {
    return {
      periodSeconds,
      requestCount: null,
      requestRate: null,
      targetResponseTime: null,
      httpCodeTarget2xx: null,
      httpCodeTarget4xx: null,
      httpCodeTarget5xx: null,
      healthyHostCount: null,
      unHealthyHostCount: null,
      errorRate: null,
      noData: true,
      message: 'LOAD_BALANCER_ARN is missing or invalid in .env'
    };
  }

  const now = new Date();
  const startTime = new Date(now.getTime() - lookbackMinutes * 60 * 1000);

  const dimensions = [{ Name: 'LoadBalancer', Value: lbDimensionValue }];
  if (tgDimensionValue) dimensions.push({ Name: 'TargetGroup', Value: tgDimensionValue });

  const queryDefinitions = [
    { id: 'requestCount', metricName: 'RequestCount', stat: 'Sum' },
    { id: 'targetResponseTime', metricName: 'TargetResponseTime', stat: 'Average' },
    { id: 'httpCodeTarget2xx', metricName: 'HTTPCode_Target_2XX_Count', stat: 'Sum' },
    { id: 'httpCodeTarget4xx', metricName: 'HTTPCode_Target_4XX_Count', stat: 'Sum' },
    { id: 'httpCodeTarget5xx', metricName: 'HTTPCode_Target_5XX_Count', stat: 'Sum' },
    { id: 'healthyHostCount', metricName: 'HealthyHostCount', stat: 'Average' },
    { id: 'unHealthyHostCount', metricName: 'UnHealthyHostCount', stat: 'Average' }
  ];

  const metricDataQueries = queryDefinitions.map((definition) => ({
    Id: definition.id,
    Label: definition.metricName,
    MetricStat: {
      Metric: {
        Namespace: 'AWS/ApplicationELB',
        MetricName: definition.metricName,
        Dimensions: dimensions
      },
      Period: periodSeconds,
      Stat: definition.stat
    },
    ReturnData: true
  }));

  try {
    const response = await cloudWatchClient.send(
      new GetMetricDataCommand({
        StartTime: startTime,
        EndTime: now,
        MetricDataQueries: metricDataQueries,
        ScanBy: 'TimestampDescending'
      })
    );

    const results = response?.MetricDataResults || [];
    const values = {};
    results.forEach((result) => {
      values[result.Id] = pickLatestValue(result);
    });

    const requestCount = values.requestCount;
    const http2xx = values.httpCodeTarget2xx;
    const http4xx = values.httpCodeTarget4xx;
    const http5xx = values.httpCodeTarget5xx;

    const responseCodesTotal = [http2xx, http4xx, http5xx]
      .filter((value) => Number.isFinite(value))
      .reduce((sum, value) => sum + value, 0);

    const errorCount = [http4xx, http5xx]
      .filter((value) => Number.isFinite(value))
      .reduce((sum, value) => sum + value, 0);

    const noData = Object.values(values).every((value) => value == null);

    return {
      periodSeconds,
      startTime: startTime.toISOString(),
      endTime: now.toISOString(),
      requestCount: round(requestCount, 2),
      requestRate: Number.isFinite(requestCount) ? round(requestCount / periodSeconds, 2) : null,
      targetResponseTime: round(values.targetResponseTime, 4),
      httpCodeTarget2xx: round(http2xx, 2),
      httpCodeTarget4xx: round(http4xx, 2),
      httpCodeTarget5xx: round(http5xx, 2),
      healthyHostCount: round(values.healthyHostCount, 2),
      unHealthyHostCount: round(values.unHealthyHostCount, 2),
      errorRate: responseCodesTotal > 0 ? round((errorCount / responseCodesTotal) * 100, 2) : null,
      noData
    };
  } catch (error) {
    throw normalizeCredentialsError(error, 'CloudWatch');
  }
}

module.exports = {
  getCloudWatchSnapshot,
  toLoadBalancerDimensionValue,
  toTargetGroupDimensionValue
};
