const path = require('path');
const dotenv = require('dotenv');
const {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  DescribeScalingActivitiesCommand
} = require('@aws-sdk/client-auto-scaling');
const { normalizeCredentialsError } = require('./ec2');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const REGION = process.env.AWS_REGION || 'ap-southeast-2';
const autoScalingClient = new AutoScalingClient({ region: REGION });

async function getAutoScalingSnapshot(options = {}) {
  const groupName = options.groupName || process.env.AUTO_SCALING_GROUP_NAME;

  const empty = {
    groupName: groupName || null,
    minSize: null,
    desiredCapacity: null,
    maxSize: null,
    currentInstances: 0,
    instances: [],
    scalingActivities: []
  };

  if (!groupName) return empty;

  try {
    const groupResponse = await autoScalingClient.send(
      new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [groupName] })
    );

    const group = groupResponse?.AutoScalingGroups?.[0];
    if (!group) {
      return { ...empty, notFound: true };
    }

    const activityResponse = await autoScalingClient.send(
      new DescribeScalingActivitiesCommand({
        AutoScalingGroupName: groupName,
        MaxRecords: 10
      })
    );

    return {
      groupName: group.AutoScalingGroupName,
      minSize: group.MinSize,
      desiredCapacity: group.DesiredCapacity,
      maxSize: group.MaxSize,
      currentInstances: (group.Instances || []).length,
      instances: (group.Instances || []).map((instance) => ({
        instanceId: instance.InstanceId,
        lifecycleState: instance.LifecycleState,
        healthStatus: instance.HealthStatus,
        availabilityZone: instance.AvailabilityZone,
        protectedFromScaleIn: Boolean(instance.ProtectedFromScaleIn)
      })),
      scalingActivities: (activityResponse?.Activities || []).map((activity) => ({
        activityId: activity.ActivityId,
        statusCode: activity.StatusCode,
        description: activity.Description,
        cause: activity.Cause,
        startTime: activity.StartTime ? new Date(activity.StartTime).toISOString() : null,
        endTime: activity.EndTime ? new Date(activity.EndTime).toISOString() : null
      }))
    };
  } catch (error) {
    throw normalizeCredentialsError(error, 'Auto Scaling');
  }
}

module.exports = {
  getAutoScalingSnapshot
};
