/* ==============================================
   ILB Dashboard — Script (All data simulated)
   No backend, no database — in-memory arrays only
   ============================================== */

// ── Simulated Data ──
let servers = [
  { id:1, name:'backend-01', ip:'10.0.1.10', status:'healthy',   cpu:32, memory:45, requests:1280, responseTime:85,  zone:'ap-southeast-1a' },
  { id:2, name:'backend-02', ip:'10.0.1.11', status:'healthy',   cpu:58, memory:62, requests:1540, responseTime:120, zone:'ap-southeast-1a' },
  { id:3, name:'backend-03', ip:'10.0.2.10', status:'healthy',   cpu:21, memory:38, requests:980,  responseTime:65,  zone:'ap-southeast-1b' },
  { id:4, name:'backend-04', ip:'10.0.2.11', status:'unhealthy', cpu:92, memory:88, requests:420,  responseTime:340, zone:'ap-southeast-1b' },
  { id:5, name:'backend-05', ip:'10.0.3.10', status:'healthy',   cpu:44, memory:51, requests:1100, responseTime:95,  zone:'us-east-1a' },
  { id:6, name:'backend-06', ip:'10.0.3.11', status:'healthy',   cpu:15, memory:29, requests:760,  responseTime:55,  zone:'us-east-1a' },
];

let nextServerId = 7;
let requestHistory = [];
let nextRequestId = 1;
let currentFilter = 'all';
let searchQuery = '';
let feedEventCount = 0;

const ROUTES = ['/api/users','/api/products','/api/orders','/api/health','/api/auth/login','/api/cart','/api/payments','/api/inventory'];
const ALGORITHMS = ['Round Robin','Least Connections','Weighted Round Robin','IP Hash'];
let currentAlgorithm = 'Round Robin';

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initSidebar();
  initTheme();
  initFilters();
  initForm();
  initButtons();
  renderAll();
});

// ── Navigation (single-section view) ──
function initNav() {
  const links = document.querySelectorAll('.nav-link');
  const breadcrumb = document.getElementById('breadcrumbCurrent');

  function activate(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active-section'));
    const el = document.getElementById(sectionId);
    if (el) el.classList.add('active-section');
    links.forEach(l => l.classList.toggle('active', l.dataset.section === sectionId));
    if (breadcrumb) breadcrumb.textContent = sectionId.charAt(0).toUpperCase() + sectionId.slice(1);
  }

  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      activate(link.dataset.section);
      // close mobile sidebar
      document.getElementById('sidebar').classList.remove('mobile-open');
      document.getElementById('sidebarOverlay').classList.remove('show');
    });
  });

  // default section
  activate('dashboard');
}

// ── Sidebar toggle ──
function initSidebar() {
  const btn = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  btn.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('mobile-open');
      overlay.classList.toggle('show');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('show');
  });
}

// ── Theme toggle ──
function initTheme() {
  const btn = document.getElementById('themeToggle');
  const icon = btn.querySelector('i');
  btn.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) {
      document.documentElement.removeAttribute('data-theme');
      icon.className = 'fas fa-moon';
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      icon.className = 'fas fa-sun';
    }
  });
}

// ── Filters & Search ──
function initFilters() {
  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      renderServerTable();
    });
  });
  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderServerTable();
  });
}

// ── Add Server Form ──
function initForm() {
  document.getElementById('addServerForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('fName').value.trim();
    const ip = document.getElementById('fIP').value.trim();
    if (!name || !ip) return;

    servers.push({
      id: nextServerId++,
      name,
      ip,
      zone: document.getElementById('fZone').value,
      status: document.getElementById('fStatus').value,
      cpu: parseInt(document.getElementById('fCPU').value) || 25,
      memory: parseInt(document.getElementById('fMemory').value) || 40,
      requests: 0,
      responseTime: parseInt(document.getElementById('fResponse').value) || 120,
    });
    e.target.reset();
    renderAll();
    toast(`Server "${name}" registered`, 'success');
  });
}

// ── Buttons ──
function initButtons() {
  document.getElementById('btnRefresh').addEventListener('click', () => {
    servers.forEach(s => {
      if (s.status === 'healthy') {
        s.cpu = clamp(s.cpu + rnd(-8, 8), 5, 95);
        s.memory = clamp(s.memory + rnd(-5, 5), 10, 95);
        s.responseTime = clamp(s.responseTime + rnd(-15, 15), 20, 500);
      }
    });
    currentAlgorithm = ALGORITHMS[rnd(0, ALGORITHMS.length - 1)];
    renderAll();
    toast('Data refreshed', 'info');
  });

  document.getElementById('btnGenerateTraffic').addEventListener('click', () => generateTraffic(rnd(5, 15)));
  document.getElementById('btnTrafficBurst').addEventListener('click', () => generateTraffic(50));

  document.getElementById('btnClearHistory').addEventListener('click', () => {
    requestHistory = [];
    renderHistoryTable();
    toast('History cleared', 'info');
  });
}

// ── Traffic Generation ──
function generateTraffic(count) {
  const healthy = servers.filter(s => s.status === 'healthy');
  if (!healthy.length) { toast('No healthy servers!', 'error'); return; }

  const feed = document.getElementById('trafficFeed');
  const empty = feed.querySelector('.empty-state');
  if (empty) empty.remove();

  let delay = 0;
  for (let i = 0; i < count; i++) {
    delay += rnd(30, 100);
    setTimeout(() => {
      const srv = healthy[rnd(0, healthy.length - 1)];
      const route = ROUTES[rnd(0, ROUTES.length - 1)];
      const code = Math.random() < 0.92 ? 200 : 500;
      const lat = Math.max(10, srv.responseTime + rnd(-20, 40));

      srv.requests++;
      if (code === 200) {
        srv.cpu = clamp(srv.cpu + rnd(0, 2), 5, 95);
        srv.memory = clamp(srv.memory + rnd(0, 1), 10, 95);
      }

      const entry = {
        id: nextRequestId++,
        timestamp: new Date().toLocaleTimeString(),
        server: srv.name,
        route,
        statusCode: code,
        latency: lat,
      };
      requestHistory.unshift(entry);
      if (requestHistory.length > 200) requestHistory.pop();

      addFeedItem(feed, entry);
      feedEventCount++;
      const fc = document.getElementById('feedCount');
      if (fc) fc.textContent = feedEventCount + ' events';
      renderAll();
    }, delay);
  }
  toast(`Sending ${count} requests...`, 'info');
}

function addFeedItem(feed, e) {
  const d = document.createElement('div');
  d.className = 'traffic-item';
  const ok = e.statusCode === 200;
  d.innerHTML = `
    <span class="ti-time">${e.timestamp}</span>
    <span class="ti-route">${e.route}</span>
    <span class="ti-server">${e.server}</span>
    <span class="ti-code ${ok ? 'ok' : 'err'}">${e.statusCode}</span>
    <span class="ti-lat">${e.latency}ms</span>`;
  feed.prepend(d);
  while (feed.children.length > 80) feed.removeChild(feed.lastChild);
}

// ── Render Everything ──
function renderAll() {
  renderStats();
  renderServerTable();
  renderHistoryTable();
  renderHealthBars();
  renderRequestChart();
  renderLoadBars();
}

// ── Stats ──
function renderStats() {
  const total = servers.length;
  const h = servers.filter(s => s.status === 'healthy').length;
  const reqs = servers.reduce((a, s) => a + s.requests, 0);
  const avg = total ? Math.round(servers.reduce((a, s) => a + s.responseTime, 0) / total) : 0;

  setText('statTotalServers', total);
  setText('statHealthy', h);
  setText('statUnhealthy', total - h);
  setText('statTotalRequests', reqs.toLocaleString());
  setText('statAvgResponse', avg + ' ms');
  setText('statAlgorithm', currentAlgorithm);
}

// ── Server Table ──
function renderServerTable() {
  const tbody = document.getElementById('serverTableBody');
  tbody.innerHTML = '';

  let list = [...servers];
  if (currentFilter !== 'all') list = list.filter(s => s.status === currentFilter);
  if (searchQuery) list = list.filter(s => s.name.toLowerCase().includes(searchQuery) || s.ip.includes(searchQuery));

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state" style="padding:36px">No servers match your filter</td></tr>`;
    return;
  }

  list.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;color:var(--tx-3)">${i + 1}</td>
      <td><strong>${esc(s.name)}</strong></td>
      <td><code style="font-size:.75rem;background:var(--bg-stripe);padding:2px 6px;border-radius:4px">${esc(s.ip)}</code></td>
      <td><span class="badge badge-${s.status}"><i class="fas fa-${s.status === 'healthy' ? 'check-circle' : 'exclamation-circle'}"></i> ${s.status}</span></td>
      <td>${gaugeHtml(s.cpu)}</td>
      <td>${gaugeHtml(s.memory)}</td>
      <td style="font-weight:600">${s.requests.toLocaleString()}</td>
      <td>${s.responseTime} ms</td>
      <td><span style="font-size:.72rem;color:var(--tx-3)">${esc(s.zone)}</span></td>
      <td>
        <div class="act-group">
          <button class="btn btn-icon ${s.status === 'healthy' ? 'btn-warn' : 'btn-success'}" onclick="toggleStatus(${s.id})" title="${s.status === 'healthy' ? 'Set unhealthy' : 'Set healthy'}">
            <i class="fas fa-${s.status === 'healthy' ? 'ban' : 'heart'}"></i>
          </button>
          <button class="btn btn-icon btn-danger" onclick="removeServer(${s.id})" title="Remove">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

function gaugeHtml(v) {
  const lvl = v > 75 ? 'high' : v > 50 ? 'mid' : 'low';
  return `<div class="gauge"><div class="gauge-bar"><div class="gauge-fill ${lvl}" style="width:${v}%"></div></div><span class="gauge-val">${v}%</span></div>`;
}

// ── Server Actions ──
function toggleStatus(id) {
  const s = servers.find(x => x.id === id);
  if (!s) return;
  s.status = s.status === 'healthy' ? 'unhealthy' : 'healthy';
  s.cpu = s.status === 'unhealthy' ? clamp(s.cpu + 30, 50, 98) : clamp(s.cpu - 30, 10, 50);
  renderAll();
  toast(`${s.name} → ${s.status}`, s.status === 'healthy' ? 'success' : 'error');
}

function removeServer(id) {
  const s = servers.find(x => x.id === id);
  if (!s) return;
  servers = servers.filter(x => x.id !== id);
  renderAll();
  toast(`"${s.name}" removed`, 'error');
}

// ── History Table ──
function renderHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  tbody.innerHTML = '';
  const list = requestHistory.slice(0, 100);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="padding:36px">No requests recorded yet</td></tr>`;
    return;
  }

  list.forEach(r => {
    const ok = r.statusCode === 200;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family:monospace;font-size:.72rem;color:var(--tx-3)">${r.timestamp}</td>
      <td><code style="font-size:.75rem">#${r.id}</code></td>
      <td style="font-weight:600">${esc(r.server)}</td>
      <td style="color:var(--accent);font-weight:600">${r.route}</td>
      <td><span class="badge-code ${ok ? 'code-2xx' : 'code-5xx'}">${r.statusCode}</span></td>
      <td>${r.latency} ms</td>`;
    tbody.appendChild(tr);
  });
}

// ── Health Bars (Dashboard) ──
function renderHealthBars() {
  const c = document.getElementById('healthBars');
  c.innerHTML = '';
  servers.forEach(s => {
    const color = s.status === 'healthy' ? 'var(--green-500)' : 'var(--red-500)';
    c.innerHTML += `
      <div class="health-bar-item">
        <span class="hb-label">${esc(s.name)}</span>
        <div class="hb-track"><div class="hb-fill" style="width:${s.cpu}%;background:${color}"></div></div>
        <span class="hb-val">${s.cpu}%</span>
      </div>`;
  });
}

// ── Request Chart (Dashboard) ──
function renderRequestChart() {
  const c = document.getElementById('requestChart');
  c.innerHTML = '';
  const max = Math.max(...servers.map(s => s.requests), 1);
  servers.forEach(s => {
    const pct = (s.requests / max) * 100;
    c.innerHTML += `
      <div class="bar-col">
        <span class="bar-count">${s.requests}</span>
        <div class="bar-track"><div class="bar-fill${s.status === 'unhealthy' ? ' danger' : ''}" style="height:${pct}%"></div></div>
        <span class="bar-name">${esc(s.name)}</span>
      </div>`;
  });
}

// ── Server Load (Traffic section) ──
function renderLoadBars() {
  const c = document.getElementById('serverLoadBars');
  c.innerHTML = '';
  servers.forEach(s => {
    c.innerHTML += `
      <div class="load-item">
        <div class="load-hdr">
          <span>${esc(s.name)} <span class="badge badge-${s.status}" style="font-size:.56rem">${s.status}</span></span>
          <span>${s.cpu}% CPU</span>
        </div>
        <div class="load-track"><div class="load-fill" style="width:${s.cpu}%"></div></div>
      </div>`;
  });
}

// ── Toasts ──
function toast(msg, type = 'info') {
  const rack = document.getElementById('toastRack');
  const icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i> ${msg}`;
  rack.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ── Utilities ──
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
