/**
 * EC2-3 — Server instance thứ ba
 * Chỉ chứa cấu hình riêng, logic chung nằm trong shared/ec2-template.js
 */
const createEC2Server = require('../shared/ec2-template');

createEC2Server({
  port: 3003,
  serverId: 'ec2-3',
  serverName: 'EC2-3',
  instance: {
    ip: '15.134.221.126',
    domain: 'ec2-3.ap-southeast-2.compute.amazonaws.com',
    region: 'ap-southeast-2',
    zone: 'ap-southeast-2c',
    type: 't2.micro',
    accent: '#f59e0b',
    accentRGB: '245,158,11',
  }
});
