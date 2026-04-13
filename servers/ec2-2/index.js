/**
 * EC2-2 — Server instance thứ hai
 * Chỉ chứa cấu hình riêng, logic chung nằm trong shared/ec2-template.js
 */
const createEC2Server = require('../shared/ec2-template');

createEC2Server({
  port: 3002,
  serverId: 'ec2-2',
  serverName: 'EC2-2',
  instance: {
    ip: '13.210.108.168',
    domain: 'ec2-2.ap-southeast-2.compute.amazonaws.com',
    region: 'ap-southeast-2',
    zone: 'ap-southeast-2b',
    type: 't2.micro',
    accent: '#3b82f6',
    accentRGB: '59,130,246',
  }
});
