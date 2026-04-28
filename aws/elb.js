const path = require('path');
const dotenv = require('dotenv');
const {
  ElasticLoadBalancingV2Client,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
  DescribeLoadBalancersCommand
} = require('@aws-sdk/client-elastic-load-balancing-v2');
const { normalizeCredentialsError } = require('./ec2');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const REGION = process.env.AWS_REGION || 'ap-southeast-2';
const elbv2Client = new ElasticLoadBalancingV2Client({ region: REGION });

function getNameFromArn(arn = '', marker = '/') {
  if (!arn) return null;
  const pieces = arn.split(marker);
  return pieces.length > 1 ? pieces[1] || arn : arn;
}

async function getTargetGroupAndLoadBalancer(options = {}) {
  const targetGroupArn = options.targetGroupArn || process.env.TARGET_GROUP_ARN;
  const configuredLoadBalancerArn = options.loadBalancerArn || process.env.LOAD_BALANCER_ARN;

  const targetGroup = {
    arn: targetGroupArn || null,
    name: targetGroupArn ? getNameFromArn(targetGroupArn, 'targetgroup/') : null,
    protocol: null,
    port: null,
    vpcId: null,
    healthyTargets: 0,
    unhealthyTargets: 0,
    registeredTargets: []
  };

  const loadBalancer = {
    arn: configuredLoadBalancerArn || null,
    name: configuredLoadBalancerArn ? getNameFromArn(configuredLoadBalancerArn, 'loadbalancer/') : null,
    dnsName: process.env.ALB_DNS || null,
    state: null,
    type: null,
    scheme: null,
    vpcId: null,
    availabilityZones: []
  };

  if (!targetGroupArn && !configuredLoadBalancerArn) {
    return { targetGroup, loadBalancer };
  }

  try {
    let resolvedLoadBalancerArn = configuredLoadBalancerArn;

    if (targetGroupArn) {
      const tgDetails = await elbv2Client.send(
        new DescribeTargetGroupsCommand({ TargetGroupArns: [targetGroupArn] })
      );
      const tg = tgDetails?.TargetGroups?.[0];
      if (tg) {
        targetGroup.arn = tg.TargetGroupArn || targetGroup.arn;
        targetGroup.name = tg.TargetGroupName || targetGroup.name;
        targetGroup.protocol = tg.Protocol || null;
        targetGroup.port = tg.Port || null;
        targetGroup.vpcId = tg.VpcId || null;
        resolvedLoadBalancerArn = resolvedLoadBalancerArn || tg.LoadBalancerArns?.[0] || null;
      }

      const health = await elbv2Client.send(
        new DescribeTargetHealthCommand({ TargetGroupArn: targetGroupArn })
      );

      const descriptions = health?.TargetHealthDescriptions || [];
      targetGroup.registeredTargets = descriptions.map((item) => ({
        targetId: item.Target?.Id || null,
        port: item.Target?.Port || null,
        availabilityZone: item.Target?.AvailabilityZone || null,
        healthState: item.TargetHealth?.State || 'unknown',
        healthReason: item.TargetHealth?.Reason || null,
        healthDescription: item.TargetHealth?.Description || null
      }));

      targetGroup.healthyTargets = targetGroup.registeredTargets.filter((target) => target.healthState === 'healthy').length;
      targetGroup.unhealthyTargets = targetGroup.registeredTargets.filter((target) => target.healthState !== 'healthy').length;
    }

    if (resolvedLoadBalancerArn) {
      const lbResponse = await elbv2Client.send(
        new DescribeLoadBalancersCommand({ LoadBalancerArns: [resolvedLoadBalancerArn] })
      );
      const lb = lbResponse?.LoadBalancers?.[0];
      if (lb) {
        loadBalancer.arn = lb.LoadBalancerArn || loadBalancer.arn;
        loadBalancer.name = lb.LoadBalancerName || loadBalancer.name;
        loadBalancer.dnsName = lb.DNSName || loadBalancer.dnsName;
        loadBalancer.state = lb.State?.Code || null;
        loadBalancer.type = lb.Type || null;
        loadBalancer.scheme = lb.Scheme || null;
        loadBalancer.vpcId = lb.VpcId || null;
        loadBalancer.availabilityZones = (lb.AvailabilityZones || []).map((zone) => zone.ZoneName).filter(Boolean);
      }
    }

    return { targetGroup, loadBalancer };
  } catch (error) {
    throw normalizeCredentialsError(error, 'ELBv2');
  }
}

module.exports = {
  getTargetGroupAndLoadBalancer
};
