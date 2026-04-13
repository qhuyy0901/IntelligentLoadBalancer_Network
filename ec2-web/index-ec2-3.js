const http = require("http");

const serverName = "EC2-3";
const zone = "ap-southeast-2c";
const color = "#490bf5";

function renderPage() {
  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${serverName} | Personal Profile Demo</title>
  <style>
    :root{
      --bg:#edf4fc;
      --panel:#ffffff;
      --panel-2:#f6f9fd;
      --soft:#edf3fb;
      --text:#0f172a;
      --muted:#5b6b86;
      --line:rgba(15,23,42,.08);
      --accent:${color};
      --accent-2:#60a5fa;
      --shadow:0 18px 40px rgba(15,23,42,.08);
      --radius:22px;
    }

    *{box-sizing:border-box}
    html,body{margin:0;padding:0;font-family:Inter,Arial,sans-serif}
    body{
      min-height:100vh;
      color:var(--text);
      background:
        radial-gradient(circle at top right, rgba(96,165,250,.08), transparent 22%),
        radial-gradient(circle at bottom left, rgba(45,212,191,.08), transparent 22%),
        linear-gradient(135deg,#eef5fc,#f8fbff,#edf4ff);
    }

    body.dark{
      --bg:#081120;
      --panel:#101a2d;
      --panel-2:#16233b;
      --soft:#1d2b47;
      --text:#eef4ff;
      --muted:#9db0d0;
      --line:rgba(255,255,255,.08);
      --shadow:0 20px 50px rgba(0,0,0,.35);
      background:
        radial-gradient(circle at top right, rgba(96,165,250,.12), transparent 22%),
        radial-gradient(circle at bottom left, rgba(45,212,191,.10), transparent 22%),
        linear-gradient(135deg,#07101d,#0b1526,#0d1a2e);
    }

    .container{
      max-width:1200px;
      margin:0 auto;
      padding:24px;
    }

    .hero{
      background:rgba(255,255,255,.7);
      border:1px solid var(--line);
      border-radius:28px;
      box-shadow:var(--shadow);
      overflow:hidden;
      backdrop-filter: blur(8px);
    }

    body.dark .hero,
    body.dark .panel,
    body.dark .card,
    body.dark .info-item,
    body.dark .about-box,
    body.dark .timeline-item,
    body.dark .contact-card{
      background:rgba(255,255,255,.04);
    }

    .hero-top{
      padding:28px 28px 18px;
      display:flex;
      justify-content:space-between;
      gap:16px;
      align-items:flex-start;
      flex-wrap:wrap;
    }

    .badge{
      display:inline-flex;
      align-items:center;
      gap:10px;
      background:var(--accent);
      color:#fff;
      font-weight:800;
      padding:10px 16px;
      border-radius:999px;
      margin-bottom:16px;
      box-shadow:0 10px 20px rgba(0,0,0,.08);
    }

    .pulse{
      width:10px;
      height:10px;
      border-radius:50%;
      background:#fff;
      opacity:.9;
    }

    h1{
      margin:0 0 10px;
      font-size:42px;
      line-height:1.05;
    }

    .hero-actions{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
    }

    button{
      border:0;
      border-radius:14px;
      padding:12px 16px;
      font-size:14px;
      font-weight:700;
      cursor:pointer;
      transition:.2s ease;
    }

    button:hover{
      transform:translateY(-1px);
      opacity:.96;
    }

    .btn-primary{
      background:var(--accent);
      color:#fff;
    }

    .btn-dark{
      background:transparent;
      color:var(--text);
      border:1px solid var(--line);
    }

    .metrics{
      display:grid;
      grid-template-columns:repeat(4,1fr);
      gap:16px;
      padding:0 28px 28px;
    }

    .card{
      background:var(--panel);
      border:1px solid var(--line);
      border-radius:20px;
      padding:18px;
    }

    .label{
      color:var(--muted);
      font-size:13px;
      margin-bottom:8px;
    }

    .value{
      font-size:24px;
      font-weight:800;
    }

    .main-grid{
      margin-top:18px;
      display:grid;
      grid-template-columns:1.1fr .9fr;
      gap:18px;
    }

    .panel{
      background:var(--panel);
      border:1px solid var(--line);
      border-radius:24px;
      box-shadow:var(--shadow);
      padding:22px;
    }

    .panel h2{
      margin:0 0 14px;
      font-size:22px;
    }

    .muted{
      color:var(--muted);
      line-height:1.7;
    }

    .profile-hero{
      display:grid;
      grid-template-columns:120px 1fr;
      gap:18px;
      align-items:center;
    }

    .avatar{
      width:120px;
      height:120px;
      border-radius:28px;
      background:linear-gradient(135deg,var(--accent),var(--accent-2));
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:42px;
      font-weight:900;
      color:#fff;
      box-shadow:var(--shadow);
    }

    .profile-name{
      font-size:32px;
      font-weight:900;
      margin:0 0 6px;
    }

    .profile-sub{
      color:var(--muted);
      margin:0 0 12px;
      font-size:15px;
      line-height:1.7;
    }

    .chips{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      margin-top:8px;
    }

    .chip{
      padding:9px 12px;
      border-radius:999px;
      background:var(--soft);
      border:1px solid var(--line);
      color:var(--text);
      font-size:13px;
      font-weight:700;
    }

    .info-grid{
      margin-top:18px;
      display:grid;
      grid-template-columns:repeat(2,1fr);
      gap:14px;
    }

    .info-item{
      background:var(--panel-2);
      border:1px solid var(--line);
      border-radius:18px;
      padding:16px;
    }

    .info-title{
      font-size:13px;
      color:var(--muted);
      margin-bottom:8px;
    }

    .info-value{
      font-size:20px;
      font-weight:800;
      line-height:1.5;
    }

    .action-row{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      margin-top:18px;
    }

    .action-btn{
      background:transparent;
      color:var(--text);
      border:1px solid var(--line);
    }

    .action-btn.active{
      background:var(--accent);
      color:#fff;
      border-color:transparent;
    }

    .about-box{
      margin-top:18px;
      background:var(--panel-2);
      border:1px solid var(--line);
      border-radius:18px;
      padding:18px;
      line-height:1.8;
      color:var(--muted);
    }

    .side-stack{
      display:grid;
      gap:18px;
    }

    .skill-list{
      display:grid;
      gap:14px;
    }

    .skill-top{
      display:flex;
      justify-content:space-between;
      font-size:14px;
      margin-bottom:6px;
      color:var(--muted);
    }

    .bar{
      height:12px;
      border-radius:999px;
      background:rgba(100,116,139,.15);
      overflow:hidden;
    }

    .fill{
      height:100%;
      border-radius:999px;
      background:linear-gradient(90deg,var(--accent),var(--accent-2));
    }

    .timeline{
      display:grid;
      gap:14px;
      margin-top:8px;
    }

    .timeline-item{
      padding:14px 14px 14px 16px;
      border-left:3px solid var(--accent);
      background:var(--panel-2);
      border-radius:0 16px 16px 0;
    }

    .timeline-title{
      font-weight:800;
      margin-bottom:6px;
    }

    .timeline-desc{
      color:var(--muted);
      line-height:1.65;
      font-size:14px;
    }

    .contact-list{
      display:grid;
      gap:12px;
    }

    .contact-card{
      background:var(--panel-2);
      border:1px solid var(--line);
      border-radius:16px;
      padding:14px;
    }

    .contact-label{
      font-size:12px;
      color:var(--muted);
      margin-bottom:6px;
    }

    .contact-value{
      font-size:16px;
      font-weight:700;
      line-height:1.6;
      word-break:break-word;
    }

    .contact-value a{
      color:inherit;
      text-decoration:none;
    }

    .contact-value a:hover{
      text-decoration:underline;
    }

    .footer{
      margin-top:18px;
      text-align:center;
      color:var(--muted);
      font-size:14px;
    }

    @media (max-width: 980px){
      .metrics{grid-template-columns:repeat(2,1fr)}
      .main-grid{grid-template-columns:1fr}
      h1{font-size:34px}
      .profile-hero{grid-template-columns:1fr}
    }

    @media (max-width: 560px){
      .container{padding:14px}
      .hero-top,.metrics{padding-left:16px;padding-right:16px}
      .metrics{grid-template-columns:1fr;padding-bottom:16px}
      .info-grid{grid-template-columns:1fr}
      h1{font-size:28px}
      .profile-name{font-size:26px}
    }
  </style>
</head>
<body>
  <div class="container">
    <section class="hero">
      <div class="hero-top">
        <div>
          <div class="badge">
            <span class="pulse"></span>
            Serving from ${serverName}
          </div>
          <h1>${serverName} Frontend Demo</h1>
        </div>

        <div class="hero-actions">
          <button class="btn-primary" onclick="location.reload()">Refresh</button>
          <button class="btn-dark" onclick="toggleTheme()">Đổi theme</button>
          <button class="btn-dark" onclick="showWelcome()">Demo action</button>
        </div>
      </div>

      <div class="metrics">
        <div class="card">
          <div class="label">Server Name</div>
          <div class="value">${serverName}</div>
        </div>
        <div class="card">
          <div class="label">Zone</div>
          <div class="value">${zone}</div>
        </div>
        <div class="card">
          <div class="label">Current Time</div>
          <div class="value" id="clock" style="font-size:18px">--:--:--</div>
        </div>
        <div class="card">
          <div class="label">Current Mode</div>
          <div class="value" style="font-size:20px">Healthy</div>
        </div>
      </div>
    </section>

    <section class="main-grid">
      <div class="panel">
        <div class="profile-hero">
          <div class="avatar">QH</div>

          <div>
            <div class="profile-name">Nguyen Quang Huy</div>
            <p class="profile-sub">
              qhuyy0901 • Sinh viên CNTT / Network.<br/>
              MSSV: 2380614932 • Lớp: 23DTHA4 • Khoa Công nghệ thông tin.<br/>
              Hiện tại mình đang thực hiện đồ án cơ sở về Intelligent Load Balancer trên AWS, triển khai nhiều EC2 server, target group và theo dõi phân phối traffic.
            </p>

            <div class="chips">
              <span class="chip">Từ Quy Nhơn</span>
              <span class="chip">HUTECH</span>
              <span class="chip">Đang học CCNA</span>
              <span class="chip">Tìm hiểu MCSA</span>
            </div>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <div class="info-title">GitHub</div>
            <div class="info-value">qhuyy0901</div>
          </div>
          <div class="info-item">
            <div class="info-title">Học tập</div>
            <div class="info-value">HUTECH</div>
          </div>
          <div class="info-item">
            <div class="info-title">Hướng học hiện tại</div>
            <div class="info-value">CCNA, MCSA, AWS cơ bản</div>
          </div>
          <div class="info-item">
            <div class="info-title">Khu vực</div>
            <div class="info-value">TP. Hồ Chí Minh</div>
          </div>
          <div class="info-item">
            <div class="info-title">Đến từ</div>
            <div class="info-value">Bình Định (Gia Lai NEW)</div>
          </div>
          <div class="info-item">
            <div class="info-title">MSSV</div>
            <div class="info-value">2380614932</div>
          </div>
          <div class="info-item">
            <div class="info-title">Lớp</div>
            <div class="info-value">23DTHA4</div>
          </div>
          <div class="info-item">
            <div class="info-title">Khoa</div>
            <div class="info-value">Công nghệ thông tin</div>
          </div>
          <div class="info-item">
            <div class="info-title">Đồ án hiện tại</div>
            <div class="info-value">Đồ án cơ sở Intelligent Load Balancer</div>
          </div>
          <div class="info-item">
            <div class="info-title">Đồng đội</div>
            <div class="info-value">Anh Trai: Đoàn Trọng Nghĩa</div>
          </div>
        </div>

        <div class="action-row">
          <button class="action-btn active" onclick="setStatus('Sẵn sàng demo', this)">Set Ready</button>
          <button class="action-btn" onclick="setStatus('Đang trình bày', this)">Presenting</button>
          <button class="action-btn" onclick="setStatus('Đang cập nhật', this)">Updating</button>
          <button class="action-btn" onclick="setStatus('Nghỉ giải lao', this)">Break</button>
        </div>

        <div class="about-box">
          <strong style="color:var(--text)">Giới thiệu ngắn</strong><br/>
          Mình là Nguyễn Quang Huy, sinh viên khoa Công nghệ thông tin. Hiện tại mình đang học và thực hành các nội dung liên quan đến web cơ bản, hệ thống mạng và triển khai demo trên AWS.
          <br/><br/>
          Mục tiêu của mình là hiểu rõ cách hoạt động của EC2, Load Balancer, Target Group, health check và cách đưa một ứng dụng nhỏ lên môi trường thật để kiểm thử và trình bày đồ án.
          <br/><br/>
          Đây là phần web hồ sơ cá nhân đơn giản được tích hợp vào backend EC2 để khi request đi qua Load Balancer có thể hiển thị giao diện trực quan hơn, dễ quan sát hơn trong lúc demo.
          <br/><br/>
          <strong style="color:var(--text)">Trạng thái hiện tại:</strong>
          <span id="demoStatus">Sẵn sàng demo</span>
        </div>
      </div>

      <div class="side-stack">
        <div class="panel">
          <h2>Kỹ năng nổi bật</h2>

          <div class="skill-list">
            <div>
              <div class="skill-top">
                <span>HTML / CSS / JavaScript</span>
                <span>38%</span>
              </div>
              <div class="bar"><div class="fill" style="width:38%"></div></div>
            </div>

            <div>
              <div class="skill-top">
                <span>AWS / EC2 / ALB</span>
                <span>34%</span>
              </div>
              <div class="bar"><div class="fill" style="width:34%"></div></div>
            </div>

            <div>
              <div class="skill-top">
                <span>Networking / Monitoring</span>
                <span>36%</span>
              </div>
              <div class="bar"><div class="fill" style="width:36%"></div></div>
            </div>

            <div>
              <div class="skill-top">
                <span>Node.js</span>
                <span>32%</span>
              </div>
              <div class="bar"><div class="fill" style="width:32%"></div></div>
            </div>
          </div>
        </div>

        <div class="panel">
          <h2>Thông tin liên hệ</h2>

          <div class="contact-list">
            <div class="contact-card">
              <div class="contact-label">Email</div>
              <div class="contact-value">qhuyy0901@gmail.com</div>
            </div>

            <div class="contact-card">
              <div class="contact-label">Địa chỉ:</div>
              <div class="contact-value">Phạm Hùng, Xã Bình Hưng, TP. Hồ Chí Minh</div>
            </div>

            <div class="contact-card">
              <div class="contact-label">GitHub Project</div>
              <div class="contact-value">
                <a href="https://github.com/qhuyy0901/IntelligentLoadBalancer_Network.git" target="_blank">
                  github.com/qhuyy0901/IntelligentLoadBalancer_Network.git
                </a>
              </div>
            </div>
          </div>
        </div>

        <div class="panel">
          <h2>Định hướng học tập</h2>

          <div class="timeline">
            <div class="timeline-item">
              <div class="timeline-title">Củng cố nền tảng mạng</div>
              <div class="timeline-desc">
                Tiếp tục học CCNA để hiểu kỹ hơn về routing, switching, subnetting và cách vận hành hệ thống mạng.
              </div>
            </div>

            <div class="timeline-item">
              <div class="timeline-title">Tìm hiểu hệ thống Windows Server</div>
              <div class="timeline-desc">
                Làm quen thêm với MCSA và các nội dung liên quan đến quản trị hệ thống ở mức cơ bản.
              </div>
            </div>

            <div class="timeline-item">
              <div class="timeline-title">Hoàn thiện đồ án cơ sở</div>
              <div class="timeline-desc">
                Tập trung hoàn thiện demo Load Balancer trên AWS, kết hợp nhiều EC2 backend, dashboard monitoring và phần giao diện hiển thị trực quan hơn.
              </div>
            </div>
          </div>
        </div>

        <div class="panel">
          <h2>Response Source</h2>
          <div class="muted">Server hiện tại đang phục vụ request:</div>
          <div style="margin-top:10px;font-size:26px;font-weight:900">${serverName} / port 3000</div>
        </div>
      </div>
    </section>

    <div class="footer">
      Demo đồ án cơ sở • AWS Load Balancer • ${serverName}
    </div>
  </div>

  <script>
    const clockEl = document.getElementById("clock");
    const demoStatus = document.getElementById("demoStatus");

    function updateClock() {
      const now = new Date();
      clockEl.textContent = now.toLocaleString("vi-VN");
    }

    function toggleTheme() {
      document.body.classList.toggle("dark");
    }

    function showWelcome() {
      alert("Xin chào, đây là hồ sơ cá nhân demo từ ${serverName}");
    }

    function setStatus(text, el) {
      demoStatus.textContent = text;

      document.querySelectorAll(".action-btn").forEach(btn => {
        btn.classList.remove("active");
      });

      el.classList.add("active");
    }

    updateClock();
    setInterval(updateClock, 1000);
  </script>
</body>
</html>
`;
}

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(renderPage());
}).listen(3000, "0.0.0.0", () => {
  console.log(serverName + " running on port 3000");
});