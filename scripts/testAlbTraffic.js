#!/usr/bin/env node
/**
 * scripts/testAlbTraffic.js
 *
 * Send repeated HTTP GET requests to the ALB to generate traffic.
 * This helps populate CloudWatch metrics and verify round-robin distribution.
 *
 * Usage:
 *   node scripts/testAlbTraffic.js [count] [concurrency]
 *
 * Examples:
 *   node scripts/testAlbTraffic.js          # 100 requests, 5 concurrent
 *   node scripts/testAlbTraffic.js 200 10   # 200 requests, 10 concurrent
 *
 * Windows curl loop equivalent:
 *   for /L %i in (1,1,100) do curl -s http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/ > nul
 *
 * Linux/Mac equivalent:
 *   for i in $(seq 1 100); do curl -s http://my-alb-2056764661.ap-southeast-2.elb.amazonaws.com/ > /dev/null; done
 */

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const ALB_URL = process.argv[2] && process.argv[2].startsWith('http')
  ? process.argv[2]
  : `http://${process.env.ALB_DNS || 'my-alb-2056764661.ap-southeast-2.elb.amazonaws.com'}/`;

const TOTAL = parseInt(process.argv[3] || process.argv[2]) || 100;
const CONCURRENCY = parseInt(process.argv[4] || process.argv[3]) || 5;

// Adjust args: if first arg is a URL, shift count/concurrency
const isUrl = process.argv[2] && process.argv[2].startsWith('http');
const total = parseInt(isUrl ? process.argv[3] : process.argv[2]) || 100;
const concurrency = parseInt(isUrl ? process.argv[4] : process.argv[3]) || 5;
const targetUrl = isUrl ? process.argv[2] : ALB_URL;

const stats = {
  sent: 0,
  ok: 0,
  errors: 0,
  responses: {},
  startMs: Date.now(),
};

function request(url) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        stats.ok += 1;
        const code = String(res.statusCode);
        stats.responses[code] = (stats.responses[code] || 0) + 1;

        // Try to extract instance ID from response body for distribution tracking
        const idMatch = body.match(/i-[0-9a-f]{8,17}/);
        if (idMatch) {
          stats.responses[`instance:${idMatch[0]}`] = (stats.responses[`instance:${idMatch[0]}`] || 0) + 1;
        }
        resolve();
      });
    });
    req.on('error', () => { stats.errors += 1; resolve(); });
    req.on('timeout', () => { req.destroy(); stats.errors += 1; resolve(); });
  });
}

async function runBatch(batch) {
  await Promise.all(batch.map((url) => request(url)));
}

async function main() {
  console.log(`\nALB Traffic Test`);
  console.log(`Target : ${targetUrl}`);
  console.log(`Total  : ${total} requests`);
  console.log(`Concurr: ${concurrency} parallel`);
  console.log('─'.repeat(48));

  const urls = Array(total).fill(targetUrl);
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    await runBatch(batch);
    stats.sent += batch.length;
    const pct = Math.round((stats.sent / total) * 100);
    process.stdout.write(`\r  Progress: ${stats.sent}/${total} (${pct}%)  OK: ${stats.ok}  Err: ${stats.errors}`);
  }

  const elapsed = ((Date.now() - stats.startMs) / 1000).toFixed(2);
  console.log('\n');
  console.log(`Done in ${elapsed}s`);
  console.log(`  OK    : ${stats.ok}`);
  console.log(`  Errors: ${stats.errors}`);
  console.log(`  RPS   : ${(stats.ok / elapsed).toFixed(2)}`);

  // Distribution summary
  const instanceKeys = Object.keys(stats.responses).filter((k) => k.startsWith('instance:'));
  if (instanceKeys.length) {
    console.log('\nInstance distribution (from response body):');
    instanceKeys.sort().forEach((k) => {
      const id = k.replace('instance:', '');
      const count = stats.responses[k];
      const pct = Math.round((count / stats.ok) * 100);
      const bar = '█'.repeat(Math.round(pct / 2));
      console.log(`  ${id}  ${bar} ${count} req (${pct}%)`);
    });
  }

  const statusKeys = Object.keys(stats.responses).filter((k) => !k.startsWith('instance:'));
  if (statusKeys.length) {
    console.log('\nHTTP status codes:');
    statusKeys.forEach((k) => console.log(`  ${k}: ${stats.responses[k]}`));
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
