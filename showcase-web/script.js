/* ============================================
   Intelligent Load Balancer — Showcase Script
   All data is simulated in-memory (no backend)
   ============================================ */

// ── Simulated Server Data ──
let servers = [
  { id: 1, name: 'backend-01', ip: '10.0.1.10', status: 'healthy', cpu: 32, memory: 45, requests: 1280, responseTime: 85,  zone: 'ap-southeast-1a' },
  { id: 2, name: 'backend-02', ip: '10.0.1.11', status: 'healthy', cpu: 58, memory: 62, requests: 1540, responseTime: 120, zone: 'ap-southeast-1a' },
  { id: 3, name: 'backend-03', ip: '10.0.2.10', status: 'healthy', cpu: 21, memory: 38, requests: 980,  responseTime: 65,  zone: 'ap-southeast-1b' },
  { id: 4, name: 'backend-04', ip: '10.0.2.11', status: 'unhealthy', cpu: 92, memory: 88, requests: 420, responseTime: 340, zone: 'ap-southeast-1b' },
  { id: 5, name: 'backend-05', ip: '10.0.3.10', status: 'healthy', cpu: 44, memory: 51, requests: 1100, responseTime: 95,  zone: 'us-east-1a' },
  { id: 6, name: 'backend-06', ip: '10.0.3.11', status: 'healthy', cpu: 15, memory: 29, requests: 760,  responseTime: 55,  zone: 'us-east-1a' },
];

let nextServerId = 7;
let requestHistory = [];
let nextRequestId = 1;
let currentFilter = 'all';
let searchQuery = '';

// Routes for traffic simulation
const ROUTES = ['/api/users', '/api/products', '/api/orders', '/api/health', '/api/auth/login', '/api/cart', '/api/payments', '/api/inventory'];
const ALGORITHMS = ['Round Robin', 'Least Connections', 'Weighted Round Robin', 'IP Hash'];
let currentAlgorithm = 'Round Robin';

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSidebarToggle();
  initThemeToggle();
  initFilters();
  initForm();
  initButtons();
  renderAll();
});

// ── Navigation ──
function initNavigation() {
  const links = document.querySelectorAll('.nav-link');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const section = link.dataset.section;
      document.querySelectorAll('.section').forEach(s => {
        s.style.display = 'none';
      });
      const target = document.getElementById(section);
      if (target) target.style.display = 'block';

      // Close mobile sidebar
      document.getElementById('sidebar').classList.remove('mobile-open');
    });
  });

  // Show all sections by default (scrollable page)
  document.querySelectorAll('.section').forEach(s => s.style.display = 'block');
}

// ── Sidebar Toggle ──
function initSidebarToggle() {
  const btn = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  btn.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('mobile-open');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });
}

// ── Theme Toggle ──
function initThemeToggle() {
  const toggle = document.getElementById('themeToggle');
  const icon = toggle.querySelector('i');
  toggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
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
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderServerTable();
    });
  });

  // Search input
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderServerTable();
  });
}

// ── Add Server Form ──
function initForm() {
  document.getElementById('addServerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('fName').value.trim();
    const ip = document.getElementById('fIP').value.trim();
    if (!name || !ip) return;

    const newServer = {
      id: nextServerId++,
      name,
      ip,
      zone: document.getElementById('fZone').value,
      status: document.getElementById('fStatus').value,
      cpu: parseInt(document.getElementById('fCPU').value) || 25,
      memory: parseInt(document.getElementById('fMemory').value) || 40,
      requests: 0,
      responseTime: parseInt(document.getElementById('fResponse').value) || 120,
    };

    servers.push(newServer);
    e.target.reset();
    renderAll();
    showToast(`Server "${newServer.name}" added`, 'success');
  });
}

// ── Button Handlers ──
function initButtons() {
  document.getElementById('btnRefresh').addEventListener('click', () => {
    // Simulate data refresh with slight variations
    servers.forEach(s => {
      if (s.status === 'healthy') {
        s.cpu = clamp(s.cpu + randInt(-8, 8), 5, 95);
        s.memory = clamp(s.memory + randInt(-5, 5), 10, 95);
        s.responseTime = clamp(s.responseTime + randInt(-15, 15), 20, 500);
      }
    });
    currentAlgorithm = ALGORITHMS[Math.floor(Math.random() * ALGORITHMS.length)];
    renderAll();
    showToast('Data refreshed', 'info');
  });

  document.getElementById('btnGenerateTraffic').addEventListener('click', () => {
    generateTraffic(randInt(5, 15));
  });

  document.getElementById('btnTrafficBurst').addEventListener('click', () => {
    generateTraffic(50);
  });

  document.getElementById('btnClearHistory').addEventListener('click', () => {
    requestHistory = [];
    renderHistoryTable();
    showToast('History cleared', 'info');
  });
}

// ── Traffic Generation ──
function generateTraffic(count) {
  const healthy = servers.filter(s => s.status === 'healthy');
  if (healthy.length === 0) {
    showToast('No healthy servers to handle traffic!', 'error');
    return;
  }

  const feed = document.getElementById('trafficFeed');
  // Clear empty state
  const emptyState = feed.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  let delay = 0;
  for (let i = 0; i < count; i++) {
    delay += randInt(40, 120);
    setTimeout(() => {
      const server = healthy[Math.floor(Math.random() * healthy.length)];
      const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
      const statusCode = Math.random() < 0.92 ? 200 : 500;
      const latency = server.responseTime + randInt(-20, 40);

      server.requests += 1;
      if (statusCode === 200) {
        server.cpu = clamp(server.cpu + randInt(0, 2), 5, 95);
        server.memory = clamp(server.memory + randInt(0, 1), 10, 95);
      }

      const entry = {
        id: nextRequestId++,
        timestamp: new Date().toLocaleTimeString(),
        server: server.name,
        route,
        statusCode,
        latency,
      };
      requestHistory.unshift(entry);
      if (requestHistory.length > 200) requestHistory.pop();

      // Add to feed (keep max 60)
      addTrafficFeedItem(feed, entry);
      renderAll();
    }, delay);
  }

  showToast(`Generating ${count} requests...`, 'info');
}

function addTrafficFeedItem(feed, entry) {
  const div = document.createElement('div');
  div.className = 'traffic-item';
  const isOk = entry.statusCode === 200;
  div.innerHTML = `
    <span class="ti-time">${entry.timestamp}</span>
    <span class="ti-route">${entry.route}</span>
    <span class="ti-server">${entry.server}</span>
    <span class="ti-status ${isOk ? 's-ok' : 's-err'}">${entry.statusCode}</span>
    <span style="font-size:0.75rem;color:var(--text-muted)">${entry.latency}ms</span>
  `;
  feed.prepend(div);
  // Keep max items
  while (feed.children.length > 60) feed.removeChild(feed.lastChild);
}

// ── Render Everything ──
function renderAll() {
  renderStats();
  renderServerTable();
  renderHistoryTable();
  renderHealthBars();
  renderRequestChart();
  renderServerLoadBars();
}

// ── Stats ──
function renderStats() {
  const total = servers.length;
  const healthy = servers.filter(s => s.status === 'healthy').length;
  const unhealthy = total - healthy;
  const totalReqs = servers.reduce((a, s) => a + s.requests, 0);
  const avgResp = total > 0
    ? Math.round(servers.reduce((a, s) => a + s.responseTime, 0) / total)
    : 0;

  document.getElementById('statTotalServers').textContent = total;
  document.getElementById('statHealthy').textContent = healthy;
  document.getElementById('statUnhealthy').textContent = unhealthy;
  document.getElementById('statTotalRequests').textContent = totalReqs.toLocaleString();
  document.getElementById('statAvgResponse').textContent = avgResp + ' ms';
  document.getElementById('statAlgorithm').textContent = currentAlgorithm;
}

// ── Server Table ──
function renderServerTable() {
  const tbody = document.getElementById('serverTableBody');
  tbody.innerHTML = '';

  let filtered = [...servers];

  // Filter
  if (currentFilter !== 'all') {
    filtered = filtered.filter(s => s.status === currentFilter);
  }

  // Search
  if (searchQuery) {
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(searchQuery) ||
      s.ip.toLowerCase().includes(searchQuery)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted)">No servers found</td></tr>`;
    return;
  }

  filtered.forEach((s, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${esc(s.name)}</strong></td>
      <td><code style="font-size:0.8rem">${esc(s.ip)}</code></td>
      <td>
        <span class="badge badge-${s.status}">
          <i class="fas fa-${s.status === 'healthy' ? 'check-circle' : 'exclamation-circle'}"></i>
          ${s.status}
        </span>
      </td>
      <td>${gaugeHTML(s.cpu)}</td>
      <td>${gaugeHTML(s.memory)}</td>
      <td>${s.requests.toLocaleString()}</td>
      <td>${s.responseTime} ms</td>
      <td><span style="font-size:0.75rem;color:var(--text-muted)">${esc(s.zone)}</span></td>
      <td>
        <div class="action-group">
          <button class="btn btn-icon btn-${s.status === 'healthy' ? 'warning' : 'success'}" 
                  onclick="toggleServerStatus(${s.id})" 
                  title="${s.status === 'healthy' ? 'Mark unhealthy' : 'Mark healthy'}">
            <i class="fas fa-${s.status === 'healthy' ? 'ban' : 'heart'}"></i>
          </button>
          <button class="btn btn-icon btn-danger" 
                  onclick="deleteServer(${s.id})" 
                  title="Remove server">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function gaugeHTML(value) {
  const level = value > 75 ? 'high' : value > 50 ? 'mid' : 'low';
  return `
    <div class="gauge-inline">
      <div class="gauge-bar"><div class="gauge-fill ${level}" style="width:${value}%"></div></div>
      <span class="gauge-text">${value}%</span>
    </div>
  `;
}

// ── Server Actions ──
function toggleServerStatus(id) {
  const server = servers.find(s => s.id === id);
  if (!server) return;
  server.status = server.status === 'healthy' ? 'unhealthy' : 'healthy';
  if (server.status === 'unhealthy') {
    server.cpu = clamp(server.cpu + 30, 50, 98);
  } else {
    server.cpu = clamp(server.cpu - 30, 10, 50);
  }
  renderAll();
  showToast(`${server.name} → ${server.status}`, server.status === 'healthy' ? 'success' : 'error');
}

function deleteServer(id) {
  const server = servers.find(s => s.id === id);
  if (!server) return;
  servers = servers.filter(s => s.id !== id);
  renderAll();
  showToast(`Server "${server.name}" removed`, 'error');
}

// ── History Table ──
function renderHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  tbody.innerHTML = '';

  const recent = requestHistory.slice(0, 100);

  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No requests yet</td></tr>`;
    return;
  }

  recent.forEach(r => {
    const isOk = r.statusCode === 200;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span style="font-family:monospace;font-size:0.75rem">${r.timestamp}</span></td>
      <td><code>#${r.id}</code></td>
      <td>${esc(r.server)}</td>
      <td><span style="color:var(--primary);font-weight:500">${r.route}</span></td>
      <td><span class="badge-code ${isOk ? 'code-2xx' : 'code-5xx'}">${r.statusCode}</span></td>
      <td>${r.latency} ms</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Health Bars (Dashboard) ──
function renderHealthBars() {
  const container = document.getElementById('healthBars');
  container.innerHTML = '';
  servers.forEach(s => {
    const color = s.status === 'healthy' ? 'var(--success)' : 'var(--danger)';
    const div = document.createElement('div');
    div.className = 'health-bar-item';
    div.innerHTML = `
      <span class="health-bar-label">${esc(s.name)}</span>
      <div class="health-bar-track">
        <div class="health-bar-fill" style="width:${s.cpu}%;background:${color}"></div>
      </div>
      <span class="health-bar-value">${s.cpu}%</span>
    `;
    container.appendChild(div);
  });
}

// ── Request Chart (Dashboard) ──
function renderRequestChart() {
  const container = document.getElementById('requestChart');
  container.innerHTML = '';
  const maxReq = Math.max(...servers.map(s => s.requests), 1);

  servers.forEach(s => {
    const pct = (s.requests / maxReq) * 100;
    const div = document.createElement('div');
    div.className = 'bar-item';
    div.innerHTML = `
      <span class="bar-count">${s.requests}</span>
      <div class="bar-wrapper">
        <div class="bar-fill" style="height:${pct}%;${s.status === 'unhealthy' ? 'background:linear-gradient(to top, var(--danger), #f87171)' : ''}"></div>
      </div>
      <span class="bar-label">${esc(s.name)}</span>
    `;
    container.appendChild(div);
  });
}

// ── Server Load Bars (Traffic section) ──
function renderServerLoadBars() {
  const container = document.getElementById('serverLoadBars');
  container.innerHTML = '';
  servers.forEach(s => {
    const div = document.createElement('div');
    div.className = 'load-bar-item';
    div.innerHTML = `
      <div class="load-bar-header">
        <span>${esc(s.name)} <span class="badge badge-${s.status}" style="font-size:0.625rem">${s.status}</span></span>
        <span style="font-weight:600">${s.cpu}% CPU</span>
      </div>
      <div class="load-bar-track">
        <div class="load-bar-fill" style="width:${s.cpu}%"></div>
      </div>
    `;
    container.appendChild(div);
  });
}

// ── Toast Notification ──
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ── Utilities ──
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
