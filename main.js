import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('canvas-container');

// ---------- Scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050b1a);
scene.fog = new THREE.Fog(0x050b1a, 15, 40);

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

// ---------- Mouse controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// ---------- Colors ----------
const COLORS = {
  normal:     new THREE.Color(0x22ff66),
  suspicious: new THREE.Color(0xffa726),
  malicious:  new THREE.Color(0xff3b3b),
};

// node er status onujayi color (body, glow)
const NODE_LOOK = {
  Normal:     { body: new THREE.Color(0x22aaff), glow: new THREE.Color(0x0a4a88) },
  Suspicious: { body: new THREE.Color(0xffa726), glow: new THREE.Color(0x8a4b00) },
  Malicious:  { body: new THREE.Color(0xff2222), glow: new THREE.Color(0xaa0000) },
};

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

function createGeometry(type) {
  switch (type) {
    case 'internet': return new THREE.SphereGeometry(0.9, 24, 24);
    case 'server':   return new THREE.BoxGeometry(1, 1.6, 1);
    case 'database': return new THREE.CylinderGeometry(0.7, 0.7, 1.2, 24);
    case 'desktop':  return new THREE.BoxGeometry(1.4, 1, 0.5);
    case 'mobile':   return new THREE.BoxGeometry(0.5, 1, 0.3);
    default:         return new THREE.BoxGeometry(1.4, 0.9, 0.5); // laptop
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
  mesh.userData = {
    name: d.name,
    ip: d.ip,
    status: 'Normal',  // Normal / Suspicious / Malicious
    level: 0,          // 0 normal, 1 suspicious, 2 malicious
    timer: 0,          // koto second por abar normal hobe
  };

  const label = createLabel(d.name, d.ip);
  label.position.set(0, 1.6, 0);
  mesh.add(label);

  scene.add(mesh);
  nodeMap[d.name] = mesh;
});

// ---------- Connections ----------
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

links.forEach(([a, b]) => {
  const geo = new THREE.BufferGeometry().setFromPoints([
    nodeMap[a].position,
    nodeMap[b].position,
  ]);
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0x2a6fb0, transparent: true, opacity: 0.7 })
  );
  scene.add(line);
});

// ---------- UI helpers ----------
const counts = { normal: 0, suspicious: 0, malicious: 0 };
const elNormal = document.getElementById('cnt-normal');
const elSusp   = document.getElementById('cnt-susp');
const elMal    = document.getElementById('cnt-mal');
const alertBox = document.getElementById('alert');
const alertTxt = document.getElementById('alert-text');
const logList  = document.getElementById('log-list');

const clock = new THREE.Clock();
let paused = false;   // Pause/Play state
let simTime = 0;      // simulation time (pause korle thame jay)
let alertTimeout = null;

function updateCounters() {
  elNormal.textContent = counts.normal;
  elSusp.textContent   = counts.suspicious;
  elMal.textContent    = counts.malicious;
}

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function addLog(type, from, to) {
  const li = document.createElement('li');
  li.style.color = '#' + COLORS[type].getHexString();
  li.textContent = `${formatTime(simTime)} ${type.toUpperCase()}: ${from.userData.ip} → ${to.userData.ip}`;
  logList.prepend(li);
  while (logList.children.length > 8) logList.lastChild.remove(); // shudhu shesh 8 ta
}

function showAlert(node) {
  alertTxt.textContent = `Malicious traffic detected from ${node.userData.ip} (${node.userData.name})`;
  alertBox.classList.remove('hidden');
  clearTimeout(alertTimeout);
  alertTimeout = setTimeout(() => alertBox.classList.add('hidden'), 5000);
}

// ---------- Traffic logic ----------
function pickType() {
  const r = Math.random();
  return r < 0.8 ? 'normal' : r < 0.95 ? 'suspicious' : 'malicious';
}

// node ke suspicious/malicious mark kora
function markNode(node, type) {
  const level = type === 'malicious' ? 2 : 1;
  if (level >= node.userData.level) {
    node.userData.level = level;
    node.userData.status = type === 'malicious' ? 'Malicious' : 'Suspicious';
  }
  node.userData.timer = type === 'malicious' ? 6 : 3;
}

// prottek frame e node er color smoothly change
function updateNodes(delta, time) {
  const k = 1 - Math.exp(-delta * 5); // smooth lerp factor

  Object.values(nodeMap).forEach((node) => {
    const u = node.userData;

    if (u.level > 0) {
      u.timer -= delta;
      if (u.timer <= 0) {
        u.level = 0;
        u.status = 'Normal';
      }
    }

    const look = NODE_LOOK[u.status];
    node.material.color.lerp(look.body, k);
    node.material.emissive.lerp(look.glow, k);

    // malicious hole pulse effect
    node.material.emissiveIntensity =
      u.status === 'Malicious' ? 0.9 + 0.7 * Math.sin(time * 8) : 0.6;
  });
}

// ---------- Packets ----------
const packets = [];
const MAX_PACKETS = 12;
const packetGeo = new THREE.SphereGeometry(0.12, 12, 12);

function spawnPacket() {
  const type = pickType();
  let from, to;

  if (type === 'malicious') {
    // malicious hole shobshomoy Infected node theke attack
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

  const mesh = new THREE.Mesh(
    packetGeo,
    new THREE.MeshBasicMaterial({ color: COLORS[type].clone() })
  );
  if (type === 'malicious') mesh.scale.setScalar(1.6); // malicious packet ektu boro
  mesh.position.copy(from.position);
  scene.add(mesh);

  packets.push({
    mesh,
    from,
    to,
    type,
    t: 0,
    speed: 0.3 + Math.random() * 0.4,
  });

  // stats + node status + log
  counts[type]++;
  updateCounters();

  if (type !== 'normal') {
    markNode(from, type);
    addLog(type, from, to);
    if (type === 'malicious') showAlert(from);
  }
}

for (let i = 0; i < MAX_PACKETS; i++) spawnPacket();

function updatePackets(delta) {
  for (let i = packets.length - 1; i >= 0; i--) {
    const p = packets[i];
    p.t += p.speed * delta;

    if (p.t >= 1) {
      scene.remove(p.mesh);
      p.mesh.material.dispose();
      packets.splice(i, 1);
      spawnPacket();
    } else {
      p.mesh.position.lerpVectors(p.from.position, p.to.position, p.t);
    }
  }
}

// ---------- Step 6: Pause / Play ----------
const toggleBtn = document.getElementById('toggle-btn');
toggleBtn.addEventListener('click', () => {
  paused = !paused;
  toggleBtn.textContent = paused ? 'Play' : 'Pause';
});

// ---------- Step 6: Hover tooltip + Click ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');
const infoBox = document.getElementById('info');
const infoTxt = document.getElementById('info-text');
const nodeMeshes = Object.values(nodeMap);
const scaleTarget = new THREE.Vector3();
let selected = null;

function pickNode(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(nodeMeshes, false)[0];
  return hit ? hit.object : null;
}

renderer.domElement.addEventListener('pointermove', (e) => {
  const node = pickNode(e);
  if (node) {
    const u = node.userData;
    tooltip.innerHTML = `<b>${u.name}</b><br>${u.ip}<br>Status: ${u.status}`;
    tooltip.style.left = e.clientX + 12 + 'px';
    tooltip.style.top = e.clientY + 12 + 'px';
    tooltip.classList.remove('hidden');
    renderer.domElement.style.cursor = 'pointer';
  } else {
    tooltip.classList.add('hidden');
    renderer.domElement.style.cursor = '';
  }
});

// drag (orbit) ke click bole dhorbe na
let downX = 0, downY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downX = e.clientX;
  downY = e.clientY;
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
  selected = pickNode(e);
  if (!selected) infoBox.classList.add('hidden');
});

function updateSelection(delta) {
  const k = 1 - Math.exp(-delta * 10);
  nodeMeshes.forEach((n) => {
    const s = n === selected ? 1.3 : 1;
    n.scale.lerp(scaleTarget.set(s, s, s), k);
  });
  if (selected) {
    const u = selected.userData;
    infoTxt.innerHTML = `${u.name}<br>IP: ${u.ip}<br>Status: ${u.status}`;
    infoBox.classList.remove('hidden');
  }
}

// ---------- Window resize ----------
window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

// ---------- Animation loop ----------
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta(); // pause-e-o call hoy, jate resume-e jump na hoy

  if (!paused) {
    simTime += delta;
    updatePackets(delta);
    updateNodes(delta, simTime);
  }
  updateSelection(delta);
  controls.update();
  renderer.render(scene, camera);
}
animate();