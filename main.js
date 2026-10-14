import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('canvas-container');

// ---------- Scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050b1a);
scene.fog = new THREE.Fog(0x050b1a, 18, 45);

// ---------- Camera ----------
const camera = new THREE.PerspectiveCamera(
  60,
  container.clientWidth / container.clientHeight,
  0.1,
  100
);
camera.position.set(0, 8, 14);

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// ---------- Lights ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const pointLight = new THREE.PointLight(0x4da3ff, 80, 50);
pointLight.position.set(0, 8, 4);
scene.add(pointLight);

// ---------- Floor grid ----------
const grid = new THREE.GridHelper(30, 30, 0x1c3a6b, 0x0f2347);
grid.position.y = -1;
scene.add(grid);

// ---------- Background particles ----------
const starPos = [];
for (let i = 0; i < 300; i++) {
  starPos.push((Math.random() - 0.5) * 60, Math.random() * 20 + 2, (Math.random() - 0.5) * 60);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const stars = new THREE.Points(
  starGeo,
  new THREE.PointsMaterial({ color: 0x4da3ff, size: 0.08, transparent: true, opacity: 0.6 })
);
scene.add(stars);

// ---------- Mouse controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// ---------- Colors ----------
const COLORS = {
  normal:     new THREE.Color(0x22ff66),
  suspicious: new THREE.Color(0xffa726),
  malicious:  new THREE.Color(0xff3b3b),
};

const NODE_LOOK = {
  Normal:     { body: new THREE.Color(0x22aaff), glow: new THREE.Color(0x0a4a88) },
  Suspicious: { body: new THREE.Color(0xffa726), glow: new THREE.Color(0x8a4b00) },
  Malicious:  { body: new THREE.Color(0xff2222), glow: new THREE.Color(0xaa0000) },
};

const BASE_LINK = new THREE.Color(0x2a6fb0);
const tmpColor = new THREE.Color();

// ---------- Glow texture (node/packet glow er jonno) ----------
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const glowTex = makeGlowTexture();

function makeGlowSprite(color, opacity, size) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: color.clone(),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  sprite.scale.set(size, size, 1);
  return sprite;
}

// ---------- Simulation state ----------
let simTime = 0;       // pause korle ei somoy thambe
let paused = false;

const counts = { normal: 0, suspicious: 0, malicious: 0 };
const logs = [];       // sob traffic log
const alerts = [];     // malicious alert history
const MAX_LOGS = 300;
const MAX_ALERTS = 50;

let filter = 'all';
let query = '';
let activeTab = 'logs';
let uiDirty = true;

const statHistory = [];  // prottek second er {total, threat}
let winTotal = 0;
let winThreat = 0;
let statAccum = 0;
let pps = 0;

// ---------- Nodes ----------
const nodeData = [
  { name: 'Internet', ip: '8.8.8.8',      type: 'internet', pos: [0, 2.5, -5] },
  { name: 'Laptop',   ip: '192.168.1.10', type: 'laptop',   pos: [-5, 0, -1] },
  { name: 'Server',   ip: '192.168.1.20', type: 'server',   pos: [5, 0, -1] },
  { name: 'Infected', ip: '192.168.1.25', type: 'laptop',   pos: [0, 0, 1] },
  { name: 'Desktop',  ip: '192.168.1.30', type: 'desktop',  pos: [-4, 0, 5] },
  { name: 'Mobile',   ip: '192.168.1.50', type: 'mobile',   pos: [4, 0, 5] },
  { name: 'Database', ip: '192.168.1.40', type: 'database', pos: [0, 0, 6] },
];

const nodeMap = {};
const nodeList = [];

function createGeometry(type) {
  switch (type) {
    case 'internet': return new THREE.SphereGeometry(0.9, 24, 24);
    case 'server':   return new THREE.BoxGeometry(1, 1.6, 1);
    case 'database': return new THREE.CylinderGeometry(0.7, 0.7, 1.2, 24);
    case 'desktop':  return new THREE.BoxGeometry(1.4, 1, 0.5);
    case 'mobile':   return new THREE.BoxGeometry(0.5, 1, 0.3);
    default:         return new THREE.BoxGeometry(1.4, 0.9, 0.5);
  }
}

function createLabel(name, ip) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px Arial';
  ctx.fillText(name, 128, 36);
  ctx.fillStyle = '#7fc4ff';
  ctx.font = '24px Arial';
  ctx.fillText(ip, 128, 72);

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true })
  );
  sprite.scale.set(3, 1.1, 1);
  return sprite;
}

nodeData.forEach((d) => {
  const material = new THREE.MeshStandardMaterial({
    color: NODE_LOOK.Normal.body.clone(),
    emissive: NODE_LOOK.Normal.glow.clone(),
    emissiveIntensity: 0.6,
  });
  const mesh = new THREE.Mesh(createGeometry(d.type), material);
  mesh.position.set(...d.pos);
  mesh.lookAt(camera.position.x, mesh.position.y, camera.position.z);

  const glow = makeGlowSprite(NODE_LOOK.Normal.body, 0.28, 3.4);
  mesh.add(glow);

  mesh.userData = {
    name: d.name,
    ip: d.ip,
    type: d.type,
    status: 'Normal',
    level: 0,
    timer: 0,
    sent: 0,
    received: 0,
    threats: 0,
    lastSeen: null,
    glow,
  };

  const label = createLabel(d.name, d.ip);
  label.position.set(0, 1.6, 0);
  mesh.add(label);

  scene.add(mesh);
  nodeMap[d.name] = mesh;
  nodeList.push(mesh);
});

// selected node er niche ring
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(1.2, 0.04, 8, 48),
  new THREE.MeshBasicMaterial({ color: 0x4da3ff })
);
ring.rotation.x = Math.PI / 2;
ring.visible = false;
scene.add(ring);

// ---------- Connections (glowing tubes) ----------
const links = [
  ['Internet', 'Laptop'],
  ['Internet', 'Server'],
  ['Infected', 'Internet'],
  ['Infected', 'Laptop'],
  ['Infected', 'Server'],
  ['Infected', 'Desktop'],
  ['Infected', 'Mobile'],
  ['Infected', 'Database'],
  ['Desktop', 'Database'],
  ['Mobile', 'Database'],
];

function makeTube(a, b, radius, material) {
  const curve = new THREE.LineCurve3(a, b);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 1, radius, 6, false), material);
}

const linkObjs = [];
links.forEach(([a, b]) => {
  const pa = nodeMap[a].position;
  const pb = nodeMap[b].position;

  const coreMat = new THREE.MeshBasicMaterial({ color: BASE_LINK.clone(), transparent: true, opacity: 0.7 });
  const haloMat = new THREE.MeshBasicMaterial({
    color: BASE_LINK.clone(),
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const core = makeTube(pa, pb, 0.025, coreMat);
  const halo = makeTube(pa, pb, 0.09, haloMat);
  scene.add(core, halo);

  linkObjs.push({ a, b, core, halo, heat: 0, heatType: 'malicious' });
});

function findLink(nameA, nameB) {
  return linkObjs.find(
    (l) => (l.a === nameA && l.b === nameB) || (l.a === nameB && l.b === nameA)
  );
}

// attack path highlighting
function heatLink(link, type) {
  if (!link) return;
  if (type === 'malicious' || link.heat < 0.3) link.heatType = type;
  link.heat = Math.max(link.heat, type === 'malicious' ? 1 : 0.6);
}

function updateLinks(delta, time) {
  linkObjs.forEach((l) => {
    l.heat = Math.max(0, l.heat - delta * 0.25); // ~4 second e thanda hoy
    tmpColor.copy(BASE_LINK).lerp(COLORS[l.heatType], Math.min(1, l.heat * 1.5));
    l.core.material.color.copy(tmpColor);
    l.halo.material.color.copy(tmpColor);

    l.core.material.opacity = 0.6 + 0.4 * l.heat;
    const pulse = 0.7 + 0.3 * Math.sin(time * 10);
    l.halo.material.opacity = 0.08 + 0.03 * Math.sin(time * 2) + 0.45 * l.heat * pulse;
  });
}

// ---------- DOM refs ----------
const elNormal   = document.getElementById('cnt-normal');
const elSusp     = document.getElementById('cnt-susp');
const elMal      = document.getElementById('cnt-mal');
const elTotal    = document.getElementById('stat-total');
const elPps      = document.getElementById('stat-pps');
const elRate     = document.getElementById('stat-rate');
const elLevel    = document.getElementById('stat-level');
const meterFill  = document.getElementById('meter-fill');
const sparkCanvas = document.getElementById('spark');
const alertBox   = document.getElementById('alert');
const alertTxt   = document.getElementById('alert-text');
const logList    = document.getElementById('log-list');
const alertList  = document.getElementById('alert-history');
const tabAlerts  = document.getElementById('tab-alerts');
const nodeDetails = document.getElementById('node-details');
const searchBox  = document.getElementById('search');
const tooltip    = document.getElementById('tooltip');
const toggleBtn  = document.getElementById('toggle-btn');

const clock = new THREE.Clock();
let alertTimeout = null;

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

// ---------- Live Threat Statistics ----------
function recentRate() {
  const h = statHistory.slice(-10);
  const total = h.reduce((a, s) => a + s.total, 0) + winTotal;
  const threat = h.reduce((a, s) => a + s.threat, 0) + winThreat;
  return total ? (threat / total) * 100 : 0;
}

function updateStats() {
  const total = counts.normal + counts.suspicious + counts.malicious;
  elNormal.textContent = counts.normal;
  elSusp.textContent   = counts.suspicious;
  elMal.textContent    = counts.malicious;
  elTotal.textContent  = total;
  elPps.textContent    = pps;

  const rate = recentRate();
  elRate.textContent = rate.toFixed(1) + '%';

  const level = rate < 12 ? 'low' : rate < 28 ? 'medium' : 'high';
  elLevel.textContent = level.toUpperCase();
  elLevel.className = 'lvl ' + level;
  meterFill.className = level;
  meterFill.style.width = Math.min(100, rate * 2.5) + '%';
}

function drawSpark() {
  const g = sparkCanvas.getContext('2d');
  const w = sparkCanvas.width;
  const h = sparkCanvas.height;
  g.clearRect(0, 0, w, h);

  const n = 30;
  const bw = w / n;
  const maxV = Math.max(4, ...statHistory.map((s) => s.total));

  statHistory.forEach((s, i) => {
    const x = (n - statHistory.length + i) * bw;
    const th = (s.total / maxV) * (h - 4);
    g.fillStyle = 'rgba(77,163,255,0.35)';
    g.fillRect(x + 1, h - th, bw - 2, th);

    const ht = (s.threat / maxV) * (h - 4);
    g.fillStyle = '#ff3b3b';
    g.fillRect(x + 1, h - ht, bw - 2, ht);
  });
}

// ---------- Logs, alerts, filters ----------
function pushLog(type, from, to) {
  logs.unshift({
    time: simTime,
    type,
    fromName: from.userData.name,
    fromIp: from.userData.ip,
    toName: to.userData.name,
    toIp: to.userData.ip,
  });
  if (logs.length > MAX_LOGS) logs.pop();
  uiDirty = true;
}

function raiseAlert(from, to) {
  alerts.unshift({
    time: simTime,
    severity: 'HIGH',
    fromName: from.userData.name,
    fromIp: from.userData.ip,
    toName: to.userData.name,
    toIp: to.userData.ip,
  });
  if (alerts.length > MAX_ALERTS) alerts.pop();

  alertTxt.textContent = `Malicious traffic detected from ${from.userData.ip} (${from.userData.name})`;
  alertBox.classList.remove('hidden');
  clearTimeout(alertTimeout);
  alertTimeout = setTimeout(() => alertBox.classList.add('hidden'), 5000);
  uiDirty = true;
}

function matchesQuery(text) {
  const q = query.trim().toLowerCase();
  return !q || text.toLowerCase().includes(q);
}

function renderLogs() {
  const rows = [];
  for (const l of logs) {
    if (filter !== 'all' && l.type !== filter) continue;
    if (!matchesQuery(`${l.fromName} ${l.fromIp} ${l.toName} ${l.toIp} ${l.type}`)) continue;
    rows.push(l);
    if (rows.length >= 60) break;
  }
  logList.innerHTML =
    rows
      .map(
        (l) =>
          `<li class="log ${l.type}"><span class="t">${formatTime(l.time)}</span><span class="sev">${l.type.toUpperCase()}</span><span>${l.fromIp} → ${l.toIp}</span></li>`
      )
      .join('') || '<li class="empty">No logs match.</li>';
}

function renderAlerts() {
  tabAlerts.textContent = `Alert History (${alerts.length})`;
  const rows = alerts.filter((a) =>
    matchesQuery(`${a.fromName} ${a.fromIp} ${a.toName} ${a.toIp} ${a.severity} malicious`)
  );
  alertList.innerHTML =
    rows
      .map(
        (a) =>
          `<li class="alert-item"><b>${a.severity}</b> ${formatTime(a.time)}<small>${a.fromName} (${a.fromIp}) → ${a.toName} (${a.toIp})</small></li>`
      )
      .join('') || '<li class="empty">No alerts yet.</li>';
}

let lastDetailsHtml = '';
let selectedNode = null;

function renderNodeDetails() {
  let html;
  if (!selectedNode) {
    html = '<p class="empty">Click a node in the 3D view to see its details.</p>';
  } else {
    const u = selectedNode.userData;
    html = `
      <div class="nd-title">${u.name} <span class="badge ${u.status.toLowerCase()}">${u.status}</span></div>
      <div class="nd-row"><span>IP Address</span><b>${u.ip}</b></div>
      <div class="nd-row"><span>Device Type</span><b>${u.type}</b></div>
      <div class="nd-row"><span>Packets Sent</span><b>${u.sent}</b></div>
      <div class="nd-row"><span>Packets Received</span><b>${u.received}</b></div>
      <div class="nd-row"><span>Threat Events</span><b>${u.threats}</b></div>
      <div class="nd-row"><span>Last Activity</span><b>${u.lastSeen === null ? '-' : formatTime(u.lastSeen)}</b></div>`;
  }
  if (html !== lastDetailsHtml) {
    nodeDetails.innerHTML = html;
    lastDetailsHtml = html;
  }
}

function renderUI() {
  if (activeTab === 'logs') renderLogs();
  renderAlerts();
  renderNodeDetails();
  uiDirty = false;
}

// filter chips
document.querySelectorAll('.chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    filter = btn.dataset.filter;
    renderUI();
  });
});

// tabs
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    logList.classList.toggle('hidden', activeTab !== 'logs');
    alertList.classList.toggle('hidden', activeTab !== 'alerts');
    renderUI();
  });
});

// search
searchBox.addEventListener('input', () => {
  query = searchBox.value;
  renderUI();
});

// ---------- Traffic logic ----------
function pickType() {
  const r = Math.random();
  return r < 0.8 ? 'normal' : r < 0.95 ? 'suspicious' : 'malicious';
}

function markNode(node, type) {
  const level = type === 'malicious' ? 2 : 1;
  if (level >= node.userData.level) {
    node.userData.level = level;
    node.userData.status = type === 'malicious' ? 'Malicious' : 'Suspicious';
  }
  node.userData.timer = type === 'malicious' ? 6 : 3;
}

function updateNodes(delta, time) {
  const k = 1 - Math.exp(-delta * 5);

  nodeList.forEach((node) => {
    const u = node.userData;

    if (u.level > 0) {
      u.timer -= delta;
      if (u.timer <= 0) {
        u.level = 0;
        u.status = 'Normal';
      }
    }

    const look = NODE_LOOK[u.status];
    const mal = u.status === 'Malicious';

    node.material.color.lerp(look.body, k);
    node.material.emissive.lerp(look.glow, k);
    node.material.emissiveIntensity = mal ? 0.9 + 0.7 * Math.sin(time * 8) : 0.6;

    u.glow.material.color.lerp(look.body, k);
    u.glow.material.opacity = mal
      ? 0.55 + 0.25 * Math.sin(time * 8)
      : u.status === 'Suspicious' ? 0.45 : 0.28;

    node.scale.setScalar(mal ? 1 + 0.06 * Math.sin(time * 8) : 1);
  });
}

// ---------- Packets (glow + trail) ----------
const packets = [];
const MAX_PACKETS = 12;
const TRAIL_COUNT = 5;
const packetGeo = new THREE.SphereGeometry(0.12, 12, 12);

function spawnPacket() {
  const type = pickType();
  let from, to;

  if (type === 'malicious') {
    const attackLinks = links.filter((l) => l.includes('Infected'));
    const [a, b] = attackLinks[Math.floor(Math.random() * attackLinks.length)];
    from = nodeMap['Infected'];
    to = nodeMap[a === 'Infected' ? b : a];
  } else {
    const [a, b] = links[Math.floor(Math.random() * links.length)];
    const forward = Math.random() < 0.5;
    from = nodeMap[forward ? a : b];
    to = nodeMap[forward ? b : a];
  }

  const color = COLORS[type];

  const mesh = new THREE.Mesh(packetGeo, new THREE.MeshBasicMaterial({ color: color.clone() }));
  if (type === 'malicious') mesh.scale.setScalar(1.6);
  mesh.position.copy(from.position);

  const glow = makeGlowSprite(color, 0.8, 1.0);
  mesh.add(glow);
  scene.add(mesh);

  const trail = [];
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const s = makeGlowSprite(color, 0.5 * (1 - i / TRAIL_COUNT), 0.55 * (1 - i * 0.12));
    s.position.copy(from.position);
    scene.add(s);
    trail.push(s);
  }

  packets.push({
    mesh,
    glow,
    trail,
    from,
    to,
    type,
    t: 0,
    speed: 0.3 + Math.random() * 0.4,
  });

  // stats
  counts[type]++;
  winTotal++;
  from.userData.sent++;
  to.userData.received++;
  from.userData.lastSeen = simTime;
  to.userData.lastSeen = simTime;

  pushLog(type, from, to);

  if (type !== 'normal') {
    winThreat++;
    from.userData.threats++;
    markNode(from, type);
    heatLink(findLink(from.userData.name, to.userData.name), type);
    if (type === 'malicious') raiseAlert(from, to);
  }
}

function removePacket(p) {
  scene.remove(p.mesh);
  p.mesh.material.dispose();
  p.glow.material.dispose();
  p.trail.forEach((s) => {
    scene.remove(s);
    s.material.dispose();
  });
}

function updatePackets(delta) {
  for (let i = packets.length - 1; i >= 0; i--) {
    const p = packets[i];
    p.t += p.speed * delta;

    if (p.t >= 1) {
      removePacket(p);
      packets.splice(i, 1);
      spawnPacket();
    } else {
      p.mesh.position.lerpVectors(p.from.position, p.to.position, p.t);
      p.trail.forEach((s, idx) => {
        const tt = Math.max(0, p.t - (idx + 1) * 0.03);
        s.position.lerpVectors(p.from.position, p.to.position, tt);
      });
    }
  }
}

for (let i = 0; i < MAX_PACKETS; i++) spawnPacket();

// ---------- Mouse interaction (hover + click) ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(nodeList, false);
  return hits.length ? hits[0].object : null;
}

renderer.domElement.addEventListener('pointermove', (e) => {
  const n = pick(e);
  if (n) {
    const u = n.userData;
    tooltip.innerHTML = `<b>${u.name}</b><br>IP: ${u.ip}<br>Status: ${u.status}`;
    tooltip.style.left = e.clientX + 14 + 'px';
    tooltip.style.top = e.clientY + 14 + 'px';
    tooltip.classList.remove('hidden');
    renderer.domElement.style.cursor = 'pointer';
  } else {
    tooltip.classList.add('hidden');
    renderer.domElement.style.cursor = '';
  }
});

renderer.domElement.addEventListener('pointerleave', () => tooltip.classList.add('hidden'));

let downX = 0;
let downY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downX = e.clientX;
  downY = e.clientY;
});

renderer.domElement.addEventListener('click', (e) => {
  // mouse diye ghurano (drag) hole click hishebe dhorbe na
  if (Math.abs(e.clientX - downX) > 5 || Math.abs(e.clientY - downY) > 5) return;
  selectNode(pick(e));
});

function selectNode(n) {
  selectedNode = n;
  if (n) {
    ring.position.set(n.position.x, -0.95, n.position.z);
    ring.visible = true;
  } else {
    ring.visible = false;
  }
  lastDetailsHtml = '';
  renderNodeDetails();
}

// ---------- Pause / Play ----------
toggleBtn.addEventListener('click', () => {
  paused = !paused;
  toggleBtn.textContent = paused ? 'Play' : 'Pause';
});

// ---------- Resize ----------
new ResizeObserver(() => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}).observe(container);

// ---------- UI refresh (prottek 0.3 second) ----------
setInterval(() => {
  updateStats();
  if (uiDirty) renderUI();
  else renderNodeDetails();
}, 300);

renderUI();
updateStats();
drawSpark();

// ---------- Animation loop ----------
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);

  if (!paused) {
    simTime += delta;

    updatePackets(delta);
    updateNodes(delta, simTime);
    updateLinks(delta, simTime);
    stars.rotation.y += delta * 0.02;

    // prottek 1 second er stats history
    statAccum += delta;
    while (statAccum >= 1) {
      statAccum -= 1;
      statHistory.push({ total: winTotal, threat: winThreat });
      if (statHistory.length > 30) statHistory.shift();
      pps = winTotal;
      winTotal = 0;
      winThreat = 0;
      drawSpark();
    }

    if (ring.visible) {
      const s = 1 + 0.08 * Math.sin(simTime * 4);
      ring.scale.set(s, s, s);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();