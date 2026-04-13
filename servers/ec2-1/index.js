/**
 * EC2-1 — Server instance đầu tiên
 * Chỉ chứa cấu hình riêng, logic chung nằm trong shared/ec2-template.js
 */
const createEC2Server = require('../shared/ec2-template');

createEC2Server({
  port: 3001,
  serverId: 'ec2-1',
  serverName: 'EC2-1',
  instance: {
    ip: '3.107.233.161',
    domain: 'ec2-1.ap-southeast-2.compute.amazonaws.com',
    region: 'ap-southeast-2',
    zone: 'ap-southeast-2a',
    type: 't2.micro',
    accent: '#2dd4bf',
    accentRGB: '45,212,191',
  }
});
