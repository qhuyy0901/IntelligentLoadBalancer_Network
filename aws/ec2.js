const path = require('path');
const dotenv = require('dotenv');
const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const REGION = process.env.AWS_REGION || 'ap-southeast-2';
const ec2Client = new EC2Client({ region: REGION });

function getTagValue(tags = [], key) {
  const tag = tags.find((item) => item.Key === key);
  return tag ? tag.Value : '';
}

function normalizeCredentialsError(error, serviceName) {
  const name = error?.name || 'AwsError';
  const message = error?.message || 'Unknown AWS SDK error';
  const credentialsMissing =
    name === 'CredentialsProviderError' ||
    name === 'UnauthorizedOperation' ||
    name === 'InvalidClientTokenId' ||
    /credential|token|auth/i.test(message);

  if (!credentialsMissing) return error;

  const wrapped = new Error(
    `Missing or invalid AWS credentials for ${serviceName}. Configure AWS credentials (AWS_PROFILE, access key, or IAM role).`
  );
  wrapped.code = 'MISSING_AWS_CREDENTIALS';
  wrapped.cause = error;
  return wrapped;
}

async function getEC2Instances(options = {}) {
  const instanceIds = Array.isArray(options.instanceIds) ? options.instanceIds.filter(Boolean) : [];
  const command = new DescribeInstancesCommand({
    InstanceIds: instanceIds.length > 0 ? instanceIds : undefined
  });

  try {
    const response = await ec2Client.send(command);
    const reservations = response?.Reservations || [];
    const instances = reservations.flatMap((reservation) => reservation.Instances || []).map((instance) => ({
      instanceId: instance.InstanceId,
      name: getTagValue(instance.Tags, 'Name') || instance.InstanceId,
      state: instance.State?.Name || 'unknown',
      publicIp: instance.PublicIpAddress || null,
      privateIp: instance.PrivateIpAddress || null,
      availabilityZone: instance.Placement?.AvailabilityZone || null,
      launchTime: instance.LaunchTime ? new Date(instance.LaunchTime).toISOString() : null,
      tags: instance.Tags || []
    }));

    return instances;
  } catch (error) {
    throw normalizeCredentialsError(error, 'EC2');
  }
}

function getEC2StateSummary(instances = []) {
  const summary = {
    total: instances.length,
    running: 0,
    pending: 0,
    stopped: 0,
    stopping: 0,
    terminated: 0,
    other: 0
  };

  instances.forEach((instance) => {
    const state = String(instance.state || '').toLowerCase();
    if (state in summary) {
      summary[state] += 1;
      return;
    }
    summary.other += 1;
  });

  return summary;
}

module.exports = {
  getEC2Instances,
  getEC2StateSummary,
  normalizeCredentialsError
};
