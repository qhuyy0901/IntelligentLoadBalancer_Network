/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Intelligent Load Balancer — AWS Monitor Frontend
 *
 *  Polls GET /api/aws/overview every 7s.
 *  Renders: EC2, ALB, Target Group, Auto Scaling, CloudWatch, Activity Logs.
 *  Features: Light/Dark toggle, EC2 Detail modal, Traffic distribution bars.
 *  DOES NOT call any mutating AWS API.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────
  const POLL_MS         = 5000;
  const TRAFFIC_POLL_MS = 5000;   // traffic table polls faster
  const API_URL         = '/api/aws/overview';
  const TRAFFIC_URL     = '/api/lb/requests';
  let   lastFetch = 0;
  let   errStreak = 0;
  let   _azFilter = 'ALL';   // current AZ filter tab

  const $ = (id) => document.getElementById(id);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const v   = (x, fb = '—') => (x != null && x !== '' ? x : fb);
  const n   = (x, d = 0)    => (x != null && Number.isFinite(x) ? (d ? x.toFixed(d) : String(Math.round(x))) : '—');
  const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

  function pillClass(state) {
    if (!state) return 'pill pill-gray';
    const s = String(state).toLowerCase();
    if (/^(running|healthy|active|inservice|successful)$/.test(s))               return 'pill pill-green';
    if (/^(pending|initial|prechecking|waitingforelbconnectiondraining)$/.test(s)) return 'pill pill-amber';
    if (/^(stopped|unhealthy|draining|failed|cancelled)$/.test(s))               return 'pill pill-red';
    return 'pill pill-gray';
  }

  function timeAgo(iso) {
    if (!iso) return '—';
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (d < 60) return d + 's ago';
    if (d < 3600) return Math.floor(d / 60) + 'm ago';
    if (d < 86400) return Math.floor(d / 3600) + 'h ago';
    return Math.floor(d / 86400) + 'd ago';
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return iso; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  THEME TOGGLE (Light / Dark)
  // ══════════════════════════════════════════════════════════════════════════
  const THEME_KEY = 'ilb-theme';

  function applyTheme(dark) {
    document.body.classList.toggle('dark', dark);
    const icon  = $('themeIcon');
    const label = $('themeLabel');
    if (icon)  icon.textContent  = dark ? '☀️' : '🌙';
    if (label) label.textContent = dark ? 'Light' : 'Dark';
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch {}
  }

  function initTheme() {
    let saved = 'light';
    try { saved = localStorage.getItem(THEME_KEY) || 'light'; } catch {}
    applyTheme(saved === 'dark');

    const btn = $('themeToggle');
    if (btn) btn.addEventListener('click', () => {
      applyTheme(!document.body.classList.contains('dark'));
    });
  }

  // ── Connection UI ───────────────────────────────────────────────────────────
  function setConn(state, label) {
    const dot = $('connDot');
    dot.classList.remove('ok', 'err');
    if (state === 'ok')  dot.classList.add('ok');
    if (state === 'err') dot.classList.add('err');
    $('connLabel').textContent = label;
  }
  function showErr(msg)  { $('errText').textContent = msg; $('errBanner').classList.remove('hidden'); }
  function hideErr()     { $('errBanner').classList.add('hidden'); }

  // ══════════════════════════════════════════════════════════════════════════
  //  EC2 DETAIL MODAL
  // ══════════════════════════════════════════════════════════════════════════
  let _lastData = null;   // keep reference to latest API payload

  function openModal(instanceId) {
    if (!_lastData) return;
    const inst = (_lastData.ec2?.instances || []).find(i => i.instanceId === instanceId);
    if (!inst) return;

    const tgts    = _lastData.targetGroup?.registeredTargets || [];
    const tgtInfo = tgts.find(t => t.targetId === instanceId);

    $('modalTitle').textContent = inst.name || inst.instanceId;

    $('modalBody').innerHTML = `
      <div class="modal-row">
        <span class="modal-key">Instance ID</span>
        <span class="modal-val mono">${esc(inst.instanceId || '—')}</span>
      </div>
      <div class="modal-row">
        <span class="modal-key">Name</span>
        <span class="modal-val">${esc(inst.name || '—')}</span>
      </div>
      <div class="modal-row">
        <span class="modal-key">State</span>
        <span class="modal-val"><span class="${pillClass(inst.state)}">${esc(inst.state || 'unknown')}</span></span>
      </div>
      <div class="modal-row">
        <span class="modal-key">Target Health</span>
        <span class="modal-val"><span class="${pillClass(tgtInfo?.healthState)}">${esc(tgtInfo?.healthState || 'not registered')}</span></span>
      </div>
      <div class="modal-row">
        <span class="modal-key">Public IP</span>
        <span class="modal-val mono">${esc(inst.publicIp || '—')}</span>
      </div>
      <div class="modal-row">
        <span class="modal-key">Private IP</span>
        <span class="modal-val mono">${esc(inst.privateIp || '—')}</span>
      </div>
      <div class="modal-row">
        <span class="modal-key">Availability Zone</span>
        <span class="modal-val">${esc(inst.availabilityZone || '—')}</span>
      </div>
      <div class="modal-row">
        <span class="modal-key">Instance Type</span>
        <span class="modal-val mono">${esc(inst.instanceType || '—')}</span>
      </div>
      <div class="modal-row">
        <span class="modal-key">Launch Time</span>
        <span class="modal-val">${esc(fmtTime(inst.launchTime))} <span style="color:var(--t3);font-size:.78em">(${timeAgo(inst.launchTime)})</span></span>
      </div>
      <div class="modal-row">
        <span class="modal-key">Health Reason</span>
        <span class="modal-val">${esc(tgtInfo?.healthReason || '—')}</span>
      </div>
    `;
    $('modalOverlay').classList.remove('hidden');
  }

  function closeModal() {
    $('modalOverlay').classList.add('hidden');
  }

  function initModal() {
    $('modalClose').addEventListener('click', closeModal);
    $('modalFootClose').addEventListener('click', closeModal);
    $('modalOverlay').addEventListener('click', e => {
      if (e.target === $('modalOverlay')) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER — Summary Cards (top row)
  // ══════════════════════════════════════════════════════════════════════════
  function renderStats(d) {
    const ec2 = d.ec2 || {}, sum = ec2.summary || {};
    $('statEc2').textContent     = (sum.running || 0) + ' running';
    $('statEc2Hint').textContent = (sum.total || 0) + ' total';

    const lb = d.loadBalancer || {};
    const lbState = lb.state || 'unknown';
    $('statAlb').textContent     = lbState === 'active' ? '● Active' : lbState;
    $('statAlb').style.color     = lbState === 'active' ? 'var(--green)' : 'var(--amber)';
    $('statAlbHint').textContent = lb.name || lb.dnsName || '—';

    const tg = d.targetGroup || {};
    const ttl = (tg.healthyTargets || 0) + (tg.unhealthyTargets || 0);
    $('statTg').textContent     = (tg.healthyTargets || 0) + ' / ' + ttl;
    $('statTgHint').textContent = (tg.healthyTargets || 0) + ' healthy' + (tg.unhealthyTargets ? ', ' + tg.unhealthyTargets + ' unhealthy' : '');

    const asg = d.autoScaling || {};
    $('statAsg').textContent     = (asg.currentInstances || 0) + ' instances';
    $('statAsgHint').textContent = asg.groupName || '—';

    const cw = d.cloudwatch || {};
    if (cw.noData) {
      $('statCw').textContent = 'No Data';
      $('statCwHint').textContent = 'waiting for metrics';
    } else {
      $('statCw').textContent     = cw.requestRate != null ? n(cw.requestRate, 2) + ' req/s' : '—';
      $('statCwHint').textContent = cw.errorRate != null ? 'Error: ' + n(cw.errorRate, 1) + '%' : 'metrics active';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER — EC2 Instances + "View Details" button + Traffic Distribution
  // ══════════════════════════════════════════════════════════════════════════

  // Palette for distribution bars
  const DIST_COLORS = ['#3b82f6','#f59e0b','#22c55e','#a78bfa','#06b6d4','#ef4444'];

  function renderEc2(d) {
    const list = d.ec2?.instances || [];
    $('ec2Badge').textContent = list.length + ' instance' + (list.length !== 1 ? 's' : '');

    if (!list.length) {
      $('ec2Body').innerHTML = '<tr><td colspan="5" class="tbl-empty">No EC2 instances found</td></tr>';
      $('distSection').style.display = 'none';
      return;
    }

    // Table with View Details button
    $('ec2Body').innerHTML = list.map(i => `<tr>
      <td class="mono" style="color:var(--blue);font-weight:600">${esc(i.instanceId || '—')}</td>
      <td>${esc(i.name || '—')}</td>
      <td><span class="${pillClass(i.state)}">${esc(i.state || 'unknown')}</span></td>
      <td>${esc(i.availabilityZone || '—')}</td>
      <td><button class="btn-detail" onclick="window.__openModal('${esc(i.instanceId)}')">Details ›</button></td>
    </tr>`).join('');

    // Traffic Distribution — use cloudwatch healthy host count as weight proxy,
    // or fall back to equal distribution to show the UI is working
    renderDistribution(list, d.targetGroup);
  }

  function renderDistribution(instances, targetGroup) {
    const tgts   = targetGroup?.registeredTargets || [];
    const total  = tgts.length;
    const section = $('distSection');
    const barsEl  = $('distBars');

    if (!total) { section.style.display = 'none'; return; }

    section.style.display = 'block';

    // Equal weight simulation — in real deployment each EC2 gets ~equal share from ALB
    const perPct = total > 0 ? Math.round(100 / total) : 0;

    barsEl.innerHTML = instances.map((inst, idx) => {
      const tgt    = tgts.find(t => t.targetId === inst.instanceId);
      const health = tgt?.healthState || 'unknown';
      const isOk   = health === 'healthy';
      const pct    = isOk ? perPct : 0;
      const color  = DIST_COLORS[idx % DIST_COLORS.length];
      const label  = inst.name || inst.instanceId;
      const az     = inst.availabilityZone || '';

      return `
        <div class="dist-item">
          <div class="dist-header">
            <span class="dist-name">${esc(label)} <span style="color:var(--t3);font-size:.78em;font-weight:400">${esc(az)}</span></span>
            <span class="dist-pct" style="color:${isOk ? color : 'var(--red)'}">
              ${isOk ? pct + '%' : '<span style="color:var(--red)">unhealthy</span>'}
            </span>
          </div>
          <div class="dist-track">
            <div class="dist-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <div class="dist-req">${isOk ? 'Receiving traffic via ALB round-robin' : 'Not receiving traffic'}</div>
        </div>
      `;
    }).join('');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER — ALB
  // ══════════════════════════════════════════════════════════════════════════
  function renderAlb(d) {
    const lb = d.loadBalancer || {};
    const st = lb.state || 'unknown';
    const b  = $('albBadge');
    b.textContent = st;
    b.className   = 'card-badge ' + (st === 'active' ? 'badge-green' : 'badge-amber');
    $('albName').textContent   = v(lb.name);
    $('albDns').textContent    = v(lb.dnsName);
    $('albState').innerHTML    = `<span class="${pillClass(st)}">${esc(st)}</span>`;
    $('albScheme').textContent = v(lb.scheme);
    $('albType').textContent   = v(lb.type);
    $('albAzs').textContent    = (lb.availabilityZones || []).join(', ') || '—';
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER — Target Group
  // ══════════════════════════════════════════════════════════════════════════
  function renderTg(d) {
    const tg = d.targetGroup || {};
    const tgts = tg.registeredTargets || [];
    const allOk = tg.unhealthyTargets === 0 && tg.healthyTargets > 0;
    const b = $('tgBadge');
    b.textContent = allOk ? 'All Healthy' : (tg.healthyTargets || 0) + ' healthy';
    b.className   = 'card-badge ' + (allOk ? 'badge-green' : (tg.unhealthyTargets > 0 ? 'badge-red' : ''));

    $('tgName').textContent      = v(tg.name);
    $('tgProto').textContent     = tg.protocol && tg.port ? tg.protocol + ' : ' + tg.port : '—';
    $('tgHealthy').textContent   = n(tg.healthyTargets);
    $('tgUnhealthy').textContent = n(tg.unhealthyTargets);

    if (!tgts.length) { $('tgBody').innerHTML = '<tr><td colspan="5" class="tbl-empty">No registered targets</td></tr>'; return; }
    $('tgBody').innerHTML = tgts.map(t => `<tr>
      <td class="mono" style="color:var(--blue);font-weight:600">${esc(t.targetId || '—')}</td>
      <td>${v(t.port)}</td>
      <td>${esc(t.availabilityZone || '—')}</td>
      <td><span class="${pillClass(t.healthState)}">${esc(t.healthState || 'unknown')}</span></td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.healthDescription || '')}">${esc(t.healthReason || '—')}</td>
    </tr>`).join('');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER — ASG
  // ══════════════════════════════════════════════════════════════════════════
  function renderAsg(d) {
    const asg = d.autoScaling || {};
    $('asgBadge').textContent   = (asg.currentInstances || 0) + ' / ' + (asg.maxSize || '?');
    $('asgName').textContent    = v(asg.groupName);
    $('asgCap').textContent     = asg.minSize != null ? asg.minSize + ' / ' + asg.desiredCapacity + ' / ' + asg.maxSize : '—';
    $('asgCurrent').textContent = n(asg.currentInstances);

    const max = asg.maxSize || 1, cur = asg.currentInstances || 0;
    $('capFill').style.width = Math.min(100, Math.round(cur / max * 100)) + '%';
    $('capText').textContent = cur + ' / ' + max;

    const insts = asg.instances || [];
    if (!insts.length) { $('asgBody').innerHTML = '<tr><td colspan="4" class="tbl-empty">No ASG instances</td></tr>'; return; }
    $('asgBody').innerHTML = insts.map(i => `<tr>
      <td class="mono" style="color:var(--blue);font-weight:600">${esc(i.instanceId || '—')}</td>
      <td><span class="${pillClass(i.lifecycleState)}">${esc(i.lifecycleState || '—')}</span></td>
      <td><span class="${pillClass(i.healthStatus)}">${esc(i.healthStatus || '—')}</span></td>
      <td>${esc(i.availabilityZone || '—')}</td>
    </tr>`).join('');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER — CloudWatch
  // ══════════════════════════════════════════════════════════════════════════
  function renderCw(d) {
    const cw = d.cloudwatch || {};
    const b  = $('cwBadge');
    if (cw.noData) { b.textContent = 'No Data'; b.className = 'card-badge badge-gray'; }
    else           { b.textContent = 'Live';    b.className = 'card-badge badge-green'; }

    $('cwReqCount').textContent  = n(cw.requestCount);
    $('cwReqRate').textContent   = n(cw.requestRate, 2);
    $('cwRespTime').textContent  = cw.targetResponseTime != null ? n(cw.targetResponseTime, 4) : '—';
    $('cwHealthy').textContent   = n(cw.healthyHostCount);
    $('cwUnhealthy').textContent = n(cw.unHealthyHostCount);
    $('cwErrRate').textContent   = cw.errorRate != null ? n(cw.errorRate, 2) + '%' : '—';
    $('cwH2xx').textContent      = n(cw.httpCodeTarget2xx);
    $('cwHErr').textContent      = `${cw.httpCodeTarget4xx != null ? Math.round(cw.httpCodeTarget4xx) : 0} / ${cw.httpCodeTarget5xx != null ? Math.round(cw.httpCodeTarget5xx) : 0}`;

    const er = $('cwErrRate');
    er.style.color = cw.errorRate > 5 ? 'var(--red)' : cw.errorRate > 0 ? 'var(--amber)' : '';

    const uh = $('cwUnhealthy');
    uh.style.color = (cw.unHealthyHostCount || 0) > 0 ? 'var(--red)' : '';
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER — Activity Timeline
  // ══════════════════════════════════════════════════════════════════════════
  function renderActivity(d) {
    const acts = d.autoScaling?.scalingActivities || [];
    $('actBadge').textContent = acts.length + ' event' + (acts.length !== 1 ? 's' : '');
    const box = $('timeline');

    if (!acts.length) { box.innerHTML = '<div class="tbl-empty">No scaling activities recorded</div>'; return; }

    box.innerHTML = acts.map(a => {
      const desc = a.description || '';
      const isLaunch = /launch/i.test(desc);
      const isTerm   = /terminat/i.test(desc);
      const status   = (a.statusCode || '').toLowerCase();
      const isOk     = status === 'successful';

      let cls = 'pending', ico = '⏳';
      if (isLaunch) { cls = 'launch'; ico = '🚀'; }
      else if (isTerm) { cls = 'terminate'; ico = '🔻'; }
      if (isOk) { cls = 'success'; ico = '✅'; }

      return `<div class="tl-item">
        <div class="tl-icon ${cls}">${ico}</div>
        <div class="tl-body">
          <div class="tl-desc">${esc(desc || 'No description')}</div>
          <div class="tl-meta">
            <span class="tl-status" style="color:${isOk ? 'var(--green)' : isTerm ? 'var(--red)' : 'var(--amber)'}">${esc(a.statusCode || '—')}</span>
            <span>Start: ${fmtTime(a.startTime)}</span>
            ${a.endTime ? `<span>End: ${fmtTime(a.endTime)}</span>` : ''}
            <span>${timeAgo(a.startTime)}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER — Header / Errors
  // ══════════════════════════════════════════════════════════════════════════
  function renderHead(d) {
    $('regionLabel').textContent = d.region || '—';
    $('footerTs').textContent    = 'Last updated: ' + new Date().toLocaleTimeString('vi-VN');
  }
  function renderErrors(d) {
    const errs = d.errors || [];
    if (errs.length) showErr(errs.map(e => e.service + ': ' + e.message).join(' | '));
    else hideErr();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  FETCH
  // ══════════════════════════════════════════════════════════════════════════
  async function fetchData() {
    document.body.classList.add('loading');
    try {
      const r = await fetch(API_URL, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + (await r.text()));
      const d = await r.json();
      _lastData = d;
      errStreak = 0;
      lastFetch = Date.now();
      setConn('ok', 'Connected');

      renderHead(d);
      renderStats(d);
      renderEc2(d);
      renderAlb(d);
      renderTg(d);
      renderAsg(d);
      renderCw(d);
      renderActivity(d);
      renderErrors(d);
    } catch (e) {
      errStreak++;
      console.error('[AWS Monitor]', e.message);
      setConn('err', 'Error (' + errStreak + ')');
      if (errStreak >= 3) showErr('Cannot reach /api/aws/overview — ' + e.message);
    } finally {
      setTimeout(() => document.body.classList.remove('loading'), 400);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  TRAFFIC TABLE — Client IP → EC2 with AZ filter
  // ══════════════════════════════════════════════════════════════════════════

  // Build lookup: serverId → { name, az } from latest AWS payload
  function buildInstanceMap() {
    const map = {};
    if (!_lastData) return map;
    (_lastData.ec2?.instances || []).forEach(i => {
      map[i.instanceId] = { name: i.name || i.instanceId, az: i.availabilityZone || '' };
    });
    return map;
  }

  function fmtDuration(ms) {
    if (ms == null) return '—';
    return ms + ' ms';
  }

  function renderTraffic(requests) {
    const body    = $('trafficBody');
    const badge   = $('trafficBadge');
    const instMap = buildInstanceMap();

    // Filter by AZ if not ALL
    const filtered = _azFilter === 'ALL'
      ? requests
      : requests.filter(r => {
          const az = (instMap[r.serverId] || {}).az || '';
          return az.endsWith(_azFilter);   // e.g. ends with "2a" or "2b"
        });

    badge.textContent = filtered.length + ' request' + (filtered.length !== 1 ? 's' : '');

    if (!filtered.length) {
      const msg = _azFilter === 'ALL'
        ? 'No traffic logged — EC2 instances call /lb/aws-log after each request'
        : 'No traffic in AZ ' + _azFilter + ' yet';
      body.innerHTML = `<tr><td colspan="5" class="tbl-empty">${esc(msg)}</td></tr>`;
      return;
    }

    body.innerHTML = filtered.slice(0, 50).map(r => {
      const inst     = instMap[r.serverId] || {};
      const az       = inst.az   || '—';
      const name     = inst.name || r.serverName || r.serverId || '—';
      const azSuffix = az.split('-').pop();
      const azColor  = azSuffix === '2a' ? 'var(--blue)'
                     : azSuffix === '2b' ? 'var(--purple)'
                     : 'var(--t2)';

      return `<tr>
        <td style="white-space:nowrap;color:var(--t3)">${fmtTime(r.time)}</td>
        <td class="mono" style="color:var(--t1);font-weight:600">${esc(r.clientIp || '—')}</td>
        <td>
          <span style="color:var(--blue);font-family:var(--mono);font-size:.8em;font-weight:600">${esc(name)}</span>
          ${r.serverId && r.serverId !== name ? `<span style="color:var(--t3);font-size:.72em"> (${esc(r.serverId)})</span>` : ''}
        </td>
        <td><span style="color:${azColor};font-weight:700;font-size:.78rem">${esc(az)}</span></td>
        <td style="color:var(--t2)">${fmtDuration(r.duration)}</td>
      </tr>`;
    }).join('');
  }

  async function fetchTraffic() {
    try {
      const r = await fetch(TRAFFIC_URL, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      renderTraffic(d.requests || []);
    } catch { /* silent fail — traffic is supplementary */ }
  }

  function initTrafficTabs() {
    const tabs = document.querySelectorAll('.az-tab');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        _azFilter = btn.dataset.az;
        fetchTraffic();   // re-render immediately on tab switch
      });
    });
  }

  // ── Countdown timer ─────────────────────────────────────────────────────────
  function tickTimer() {
    if (!lastFetch) { $('timerLabel').textContent = '—'; return; }
    const next = Math.max(0, Math.ceil((POLL_MS - (Date.now() - lastFetch)) / 1000));
    $('timerLabel').textContent = next + 's';
  }

  // ── Start ───────────────────────────────────────────────────────────────────
  function boot() {
    initTheme();
    initModal();
    // initTrafficTabs();

    // Expose openModal globally for onclick in table rows
    window.__openModal = openModal;

    setConn('', 'Connecting…');
    fetchData();
    // fetchTraffic();
    setInterval(fetchData,    POLL_MS);
    // setInterval(fetchTraffic, TRAFFIC_POLL_MS);
    setInterval(tickTimer,    1000);
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
