'use strict';

/* =========================================================
 * 명장면 500피스 직소 퍼즐
 * - 25 x 20 = 500 피스
 * - 난이도 중: 피스 방향 고정 + 흐린 밑그림
 * - 난이도 상: 피스가 90° 단위로 돌아가 있음 + 밑그림 없음
 * - 제한 시간 없음, 500피스를 모두 맞추면 완료
 * ========================================================= */

const COLS = 25;
const ROWS = 20;
const TOTAL = COLS * ROWS;           // 500
const S = 40;                        // 원본 그림에서 피스 한 칸 크기(px)
const W = COLS * S;                  // 1000
const H = ROWS * S;                  // 800
const PAD = 12;                      // 탭(돌기)이 튀어나올 여백
const PIECE_SCALE = 1.6;             // 피스 보관함 캔버스 해상도 배율
const BOARD_RES = 2;                 // 퍼즐판 캔버스 해상도 배율
const ZOOMS = [1, 1.5, 2, 3, 4];

/* ---------- 유틸 ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const $ = (id) => document.getElementById(id);
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 저장 불가 환경 */ } },
  del(key) { try { localStorage.removeItem(key); } catch (e) { /* 무시 */ } },
};
const saveKey = (id) => `jigsaw500:save:${id}`;
const bestKey = (id) => `jigsaw500:best:${id}`;

/* =========================================================
 * 그림 그리기 도우미
 * ========================================================= */
function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function radial(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function glow(ctx, x, y, r, color) {
  ctx.fillStyle = radial(ctx, x, y, 0, r, [[0, color], [1, 'rgba(0,0,0,0)']]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function ellipse(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function cloud(ctx, rng, x, y, w, h, color, shade) {
  const blobs = [];
  const n = 8 + Math.floor(rng() * 6);
  for (let i = 0; i < n; i++) {
    const bx = x + (rng() - 0.5) * w;
    const r = h * (0.3 + rng() * 0.4) * (1 - Math.abs(bx - x) / w);
    blobs.push([bx, y - rng() * h * 0.35, Math.max(r, h * 0.18)]);
  }
  blobs.forEach(([bx, by, r]) => ellipse(ctx, bx, by + r * 0.22, r * 1.1, r, shade));
  blobs.forEach(([bx, by, r]) => ellipse(ctx, bx, by, r * 1.1, r, color));
}
function stars(ctx, rng, n, yMax, maxR) {
  for (let i = 0; i < n; i++) {
    const r = 0.4 + Math.pow(rng(), 3) * maxR;
    ctx.fillStyle = `rgba(255,${235 + Math.floor(rng() * 20)},${200 + Math.floor(rng() * 55)},${0.35 + rng() * 0.65})`;
    ctx.beginPath();
    ctx.arc(rng() * W, rng() * yMax, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
function grain(ctx, rng, n, alpha) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  for (let i = 0; i < n; i++) ctx.fillRect(rng() * W, rng() * H, 2, 2);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let i = 0; i < n; i++) ctx.fillRect(rng() * W, rng() * H, 2, 2);
}
function wavyLayer(ctx, rng, baseY, amp, color) {
  const ph = rng() * 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 10) {
    ctx.lineTo(x, baseY + Math.sin(x * 0.006 + ph) * amp + Math.sin(x * 0.019 + ph * 2) * amp * 0.4);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}
/* 사람 실루엣. 팔 각도는 '아래로 늘어뜨림 = 0', 오른쪽(+)/왼쪽(-) 라디안 */
function figure(ctx, o) {
  const { x, y, h, color } = o;
  const lean = o.lean || 0;
  const hip = [x + lean * h * 0.05, y - h * 0.47];
  const neck = [x + lean * h * 0.2, y - h * 0.82];
  const sh = [neck[0], neck[1] + h * 0.04];
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 다리
  ctx.lineWidth = h * 0.075;
  const spread = o.legs || 0.12;
  ctx.beginPath();
  ctx.moveTo(x - spread * h, y); ctx.lineTo(hip[0], hip[1]); ctx.lineTo(x + spread * h * 0.8, y);
  ctx.stroke();
  // 몸통
  ctx.lineWidth = h * 0.14;
  ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(neck[0], neck[1] + h * 0.03); ctx.stroke();
  // 드레스
  if (o.dress) {
    ctx.fillStyle = o.dress;
    ctx.beginPath();
    ctx.moveTo(neck[0] - h * 0.06, neck[1] + h * 0.06);
    ctx.lineTo(neck[0] + h * 0.06, neck[1] + h * 0.06);
    ctx.lineTo(hip[0] + h * 0.2 + (o.swirl || 0), y - h * 0.16);
    ctx.quadraticCurveTo(hip[0], y - h * 0.1, hip[0] - h * 0.2 + (o.swirl || 0), y - h * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
  }
  // 팔
  const L = h * 0.36;
  ctx.lineWidth = h * 0.06;
  [o.armL ?? -0.25, o.armR ?? 0.25].forEach((a) => {
    const ex = sh[0] + Math.sin(a) * L;
    const ey = sh[1] + Math.cos(a) * L;
    ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(ex, ey); ctx.stroke();
  });
  // 머리
  ctx.beginPath();
  ctx.arc(neck[0], neck[1] - h * 0.07, h * 0.075, 0, Math.PI * 2);
  ctx.fill();
  if (o.hat) {
    ctx.fillRect(neck[0] - h * 0.11, neck[1] - h * 0.12, h * 0.22, h * 0.025);
    ctx.fillRect(neck[0] - h * 0.065, neck[1] - h * 0.2, h * 0.13, h * 0.09);
  }
  return { hand: (a) => [sh[0] + Math.sin(a) * L, sh[1] + Math.cos(a) * L], neck };
}

/* =========================================================
 * 6가지 명장면 오마주 일러스트 (1000 x 800)
 * ========================================================= */

// 1. 풍선을 타고 떠나는 집 — 〈업〉
function sceneBalloons(ctx, rng) {
  ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, '#2f86d6'], [0.55, '#8fd0f5'], [1, '#e9f7ff']]);
  ctx.fillRect(0, 0, W, H);
  glow(ctx, 900, 80, 300, 'rgba(255,248,215,0.9)');
  for (let i = 0; i < 10; i++) {
    cloud(ctx, rng, rng() * W, 90 + rng() * 520, 160 + rng() * 220, 50 + rng() * 50, '#ffffff', '#cfe2f1');
  }
  // 아래 들판
  wavyLayer(ctx, rng, 680, 20, '#a6d68f');
  wavyLayer(ctx, rng, 715, 22, '#74ba62');
  wavyLayer(ctx, rng, 755, 18, '#3e8f45');
  const fields = ['#cfe47e', '#e6d27c', '#8cc46e', '#b9da8c', '#d7b56d'];
  for (let i = 0; i < 70; i++) {
    const fx = rng() * W, fy = 700 + rng() * 95;
    ctx.fillStyle = pick(rng, fields);
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(fx, fy); ctx.lineTo(fx + 30 + rng() * 40, fy - 4); ctx.lineTo(fx + 40 + rng() * 40, fy + 10); ctx.lineTo(fx + 6, fy + 14);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 90; i++) ellipse(ctx, rng() * W, 705 + rng() * 95, 4 + rng() * 4, 3 + rng() * 3, '#2f6e36');

  // 집
  ctx.fillStyle = '#a0523d';
  ctx.fillRect(548, 385, 24, 60);
  ctx.fillStyle = '#f2d9a0';
  ctx.fillRect(395, 470, 210, 120);
  ctx.strokeStyle = 'rgba(120,80,30,0.18)';
  ctx.lineWidth = 2;
  for (let y = 478; y < 590; y += 10) { ctx.beginPath(); ctx.moveTo(395, y); ctx.lineTo(605, y); ctx.stroke(); }
  ctx.fillStyle = '#5f7fa8';
  ctx.beginPath(); ctx.moveTo(375, 474); ctx.lineTo(625, 474); ctx.lineTo(500, 378); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(20,40,70,0.3)';
  for (let y = 395; y < 474; y += 12) {
    const half = (y - 378) * (125 / 96);
    ctx.beginPath(); ctx.moveTo(500 - half, y); ctx.lineTo(500 + half, y); ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(385, 470, 230, 6);
  ellipse(ctx, 500, 440, 16, 16, '#ffe9a8');
  ctx.fillStyle = '#7a4a2e'; ctx.fillRect(482, 515, 36, 75);
  ctx.fillStyle = '#c99b5c'; ctx.fillRect(390, 584, 220, 12);
  [[412, 500], [543, 500]].forEach(([wx, wy]) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(wx - 4, wy - 4, 53, 48);
    ctx.fillStyle = '#ffe39a'; ctx.fillRect(wx, wy, 45, 40);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(wx + 21, wy, 3, 40); ctx.fillRect(wx, wy + 18, 45, 3);
    ctx.fillStyle = '#4fa36b'; ctx.fillRect(wx - 10, wy - 4, 6, 48); ctx.fillRect(wx + 49, wy - 4, 6, 48);
  });

  // 풍선
  const colors = ['#ff4d4d', '#ffb000', '#ffe14d', '#4dd17a', '#3fa9ff', '#a46bff', '#ff6fb5', '#ff8a3d', '#29d3c9', '#ffffff'];
  const balloons = [];
  for (let i = 0; i < 240; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng());
    balloons.push({ x: 500 + Math.cos(a) * d * 330, y: 200 + Math.sin(a) * d * 175, r: 19 + rng() * 14, c: pick(rng, colors) });
  }
  balloons.sort((p, q) => p.y - q.y);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  balloons.forEach((b) => { ctx.beginPath(); ctx.moveTo(560, 385); ctx.lineTo(b.x, b.y + b.r); ctx.stroke(); });
  balloons.forEach((b) => {
    ellipse(ctx, b.x, b.y, b.r * 0.88, b.r, b.c);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * 0.88, b.r, 0, 0, Math.PI * 2); ctx.stroke();
    ellipse(ctx, b.x - b.r * 0.33, b.y - b.r * 0.4, b.r * 0.2, b.r * 0.3, 'rgba(255,255,255,0.5)');
  });
  grain(ctx, rng, 3000, 0.05);
}

// 2. 달을 가로지르는 자전거 — 〈E.T.〉
function sceneMoon(ctx, rng) {
  ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, '#030616'], [0.5, '#0c1a4a'], [1, '#2a3577']]);
  ctx.fillRect(0, 0, W, H);
  stars(ctx, rng, 800, H * 0.85, 1.8);
  ctx.strokeStyle = 'rgba(255,255,240,0.7)'; ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const sx = rng() * W, sy = rng() * 450, l = 5 + rng() * 6;
    ctx.beginPath(); ctx.moveTo(sx - l, sy); ctx.lineTo(sx + l, sy); ctx.moveTo(sx, sy - l); ctx.lineTo(sx, sy + l); ctx.stroke();
  }
  const mx = 560, my = 360, mr = 270;
  glow(ctx, mx, my, 480, 'rgba(255,245,200,0.3)');
  const mg = ctx.createRadialGradient(480, 280, 30, mx, my, mr);
  mg.addColorStop(0, '#fffdf0'); mg.addColorStop(0.6, '#f3e9c4'); mg.addColorStop(1, '#d6c99c');
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.clip();
  for (let i = 0; i < 8; i++) {
    ellipse(ctx, mx + (rng() - 0.5) * 400, my + (rng() - 0.5) * 400, 50 + rng() * 70, 40 + rng() * 60, 'rgba(170,155,110,0.22)');
  }
  for (let i = 0; i < 55; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * mr;
    const cx = mx + Math.cos(a) * d, cy = my + Math.sin(a) * d, r = 4 + Math.pow(rng(), 2) * 34;
    ellipse(ctx, cx, cy, r, r, `rgba(140,125,85,${0.15 + rng() * 0.25})`);
    ctx.strokeStyle = 'rgba(255,255,235,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx + 1.5, cy + 1.5, r, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
  }
  ctx.restore();

  // 숲 (먼 숲 / 가까운 숲)
  function forest(color, baseY, hMin, hMax, stepMin, stepMax) {
    ctx.fillStyle = color;
    ctx.fillRect(0, baseY, W, H - baseY);
    for (let x = -20; x < W + 20; x += stepMin + rng() * (stepMax - stepMin)) {
      const th = hMin + rng() * (hMax - hMin), tw = th * (0.22 + rng() * 0.1);
      for (let k = 0; k < 4; k++) {
        const top = baseY - th + k * th * 0.2;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x - tw * (0.5 + k * 0.17), top + th * 0.38);
        ctx.lineTo(x + tw * (0.5 + k * 0.17), top + th * 0.38);
        ctx.closePath(); ctx.fill();
      }
    }
  }
  forest('#101e52', 690, 110, 210, 16, 30);
  forest('#03061a', 740, 150, 300, 22, 44);

  // 자전거 + 사람 실루엣
  const c = '#02040f';
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  [[470, 470], [610, 470]].forEach(([wx, wy]) => {
    ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(wx, wy, 38, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(a) * 36, wy + Math.sin(a) * 36); ctx.stroke();
    }
  });
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(470, 470); ctx.lineTo(530, 465); ctx.lineTo(515, 420); ctx.lineTo(470, 470);
  ctx.moveTo(530, 465); ctx.lineTo(585, 418); ctx.lineTo(515, 420);
  ctx.moveTo(585, 418); ctx.lineTo(610, 470);
  ctx.moveTo(585, 418); ctx.lineTo(580, 395); ctx.lineTo(598, 388);
  ctx.stroke();
  ctx.fillRect(500, 410, 30, 8);
  // 타는 사람
  ctx.lineWidth = 20;
  ctx.beginPath(); ctx.moveTo(515, 405); ctx.lineTo(545, 345); ctx.stroke();
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(545, 355); ctx.lineTo(590, 390); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(518, 410); ctx.lineTo(548, 432); ctx.lineTo(535, 465); ctx.stroke();
  ellipse(ctx, 552, 325, 15, 17, c);
  ctx.beginPath(); ctx.moveTo(538, 320); ctx.quadraticCurveTo(552, 296, 568, 322); ctx.lineTo(540, 340); ctx.fill();
  // 앞 바구니와 작은 친구
  ctx.fillRect(592, 392, 40, 26);
  ellipse(ctx, 612, 380, 12, 11, c);
  ctx.beginPath(); ctx.moveTo(598, 392); ctx.quadraticCurveTo(612, 362, 628, 392); ctx.fill();
  grain(ctx, rng, 2500, 0.04);
}

// 3. 석양의 뱃머리 — 〈타이타닉〉
function sceneBow(ctx, rng) {
  const HY = 520;
  ctx.fillStyle = lin(ctx, 0, 0, 0, HY, [[0, '#24184d'], [0.3, '#6a2f73'], [0.58, '#d9536a'], [0.8, '#f7944d'], [1, '#ffd27a']]);
  ctx.fillRect(0, 0, W, HY);
  stars(ctx, rng, 60, 150, 1.2);
  for (let i = 0; i < 34; i++) {
    const y = 50 + rng() * 420;
    const col = y < 200 ? 'rgba(170,95,170,0.45)' : y < 350 ? 'rgba(255,135,120,0.45)' : 'rgba(255,205,140,0.55)';
    ellipse(ctx, rng() * W, y, 80 + rng() * 200, 4 + rng() * 12, col);
  }
  glow(ctx, 650, 505, 320, 'rgba(255,225,150,0.75)');
  ellipse(ctx, 650, 500, 62, 62, '#fff2c0');
  // 바다
  ctx.fillStyle = lin(ctx, 0, HY, 0, H, [[0, '#f2a35e'], [0.25, '#a24f6c'], [1, '#1a1838']]);
  ctx.fillRect(0, HY, W, H - HY);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(35,20,55,${0.15 + rng() * 0.3})`;
    const y = HY + rng() * (H - HY);
    ctx.fillRect(rng() * W, y, 10 + rng() * 40, 1 + (y - HY) / 120);
  }
  for (let i = 0; i < 200; i++) {
    const t = Math.pow(rng(), 1.4);
    const y = HY + 2 + t * (H - HY);
    const spread = 40 + (y - HY) * 1.3;
    const w = 15 + rng() * (20 + (y - HY) * 0.5);
    ctx.fillStyle = `rgba(255,220,150,${0.3 + rng() * 0.45})`;
    ctx.fillRect(650 + (rng() - 0.5) * spread - w / 2, y, w, 1.5 + (y - HY) / 90);
  }
  // 뱃머리
  ctx.fillStyle = lin(ctx, 0, 560, 300, 800, [[0, '#1d1622'], [1, '#08070d']]);
  ctx.beginPath();
  ctx.moveTo(0, 575); ctx.lineTo(445, 612); ctx.lineTo(300, 800); ctx.lineTo(0, 800); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,170,110,0.6)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 575); ctx.lineTo(445, 612); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,140,100,0.35)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(445, 612); ctx.lineTo(300, 800); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let y = 620; y < 800; y += 18) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(445 - (y - 612) * 0.77, y); ctx.stroke(); }
  // 난간
  ctx.strokeStyle = '#0c0a12'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, 528); ctx.lineTo(440, 606); ctx.moveTo(0, 552); ctx.lineTo(442, 609); ctx.stroke();
  for (let x = 0; x < 430; x += 24) {
    ctx.beginPath(); ctx.moveTo(x, 528 + x * (78 / 440)); ctx.lineTo(x, 575 + x * (37 / 445)); ctx.stroke();
  }
  // 물보라
  for (let i = 0; i < 160; i++) {
    const t = rng();
    ellipse(ctx, 445 - t * 145 + rng() * 40, 612 + t * 188 + (rng() - 0.5) * 20, 1 + rng() * 3, 1 + rng() * 2, `rgba(255,235,215,${0.3 + rng() * 0.5})`);
  }
  // 두 사람
  figure(ctx, { x: 352, y: 600, h: 140, color: '#0b0910', armL: -1.2, armR: 0.9, lean: 0.1 });
  const woman = figure(ctx, { x: 392, y: 604, h: 122, color: '#120d17', dress: '#16101c', armL: -Math.PI / 2 - 0.12, armR: Math.PI / 2 + 0.12, lean: 0.15 });
  ctx.strokeStyle = '#120d17'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(woman.neck[0], woman.neck[1] - 12); ctx.quadraticCurveTo(woman.neck[0] - 25, woman.neck[1] - 2, woman.neck[0] - 38, woman.neck[1] + 8); ctx.stroke();
  grain(ctx, rng, 3000, 0.04);
}

// 4. 빗속의 가로등 춤 — 〈사랑은 비를 타고〉
function sceneRain(ctx, rng) {
  ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, '#060a18'], [1, '#1c2746']]);
  ctx.fillRect(0, 0, W, H);
  const lit = ['#f7d774', '#ffb35c', '#fff1c1', '#f7d774'];
  for (let x = -10; x < W;) {
    const bw = 60 + rng() * 80, bh = 260 + rng() * 280, top = 640 - bh;
    ctx.fillStyle = pick(rng, ['#121a2e', '#18213a', '#1d2742', '#151c33']);
    ctx.fillRect(x, top, bw, bh);
    for (let wy = top + 14; wy < 620; wy += 22) {
      for (let wx = x + 8; wx < x + bw - 12; wx += 18) {
        ctx.fillStyle = rng() < 0.3 ? pick(rng, lit) : '#0b1020';
        ctx.fillRect(wx, wy, 9, 12);
      }
    }
    x += bw + rng() * 6;
  }
  [[90, 200, '#ff4f8b'], [700, 260, '#49d6ff'], [930, 180, '#b06bff']].forEach(([sx, sy, col]) => {
    glow(ctx, sx + 12, sy + 70, 90, col + '55');
    ctx.fillStyle = col; ctx.fillRect(sx, sy, 24, 140);
    ctx.fillStyle = '#0b1020';
    for (let k = 0; k < 5; k++) ctx.fillRect(sx + 6, sy + 10 + k * 26, 12, 14);
  });
  ctx.fillStyle = '#2b3552'; ctx.fillRect(0, 640, W, 24);
  ctx.fillStyle = '#3b476a'; ctx.fillRect(0, 640, W, 3);
  ctx.fillStyle = lin(ctx, 0, 664, 0, H, [[0, '#121a30'], [1, '#070b16']]);
  ctx.fillRect(0, 664, W, H - 664);
  for (let i = 0; i < 110; i++) {
    ctx.fillStyle = pick(rng, lit);
    ctx.globalAlpha = 0.08 + rng() * 0.15;
    ctx.fillRect(rng() * W, 668 + rng() * 40, 3 + rng() * 6, 30 + rng() * 100);
  }
  ctx.globalAlpha = 1;
  const lamps = [170, 520, 860];
  lamps.forEach((lx) => {
    glow(ctx, lx, 345, 190, 'rgba(255,220,140,0.5)');
    ctx.fillStyle = 'rgba(255,225,150,0.08)';
    ctx.beginPath(); ctx.moveTo(lx - 15, 360); ctx.lineTo(lx - 120, 664); ctx.lineTo(lx + 120, 664); ctx.lineTo(lx + 15, 360); ctx.fill();
    ctx.fillStyle = 'rgba(255,215,130,0.35)';
    ctx.fillRect(lx - 8, 670, 16, 120);
  });
  lamps.forEach((lx) => {
    ctx.fillStyle = '#0d1120';
    ctx.fillRect(lx - 5, 355, 10, 285);
    ctx.fillRect(lx - 12, 610, 24, 32);
    ctx.fillRect(lx - 9, 420, 18, 6);
    ctx.beginPath(); ctx.moveTo(lx - 20, 330); ctx.lineTo(lx + 20, 330); ctx.lineTo(lx + 13, 362); ctx.lineTo(lx - 13, 362); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(lx - 12, 335, 24, 22);
    ctx.fillStyle = '#0d1120';
    ctx.beginPath(); ctx.moveTo(lx - 24, 332); ctx.lineTo(lx, 314); ctx.lineTo(lx + 24, 332); ctx.fill();
  });
  // 가로등에 매달린 사람과 우산
  const man = figure(ctx, { x: 545, y: 618, h: 175, color: '#05070f', armL: -2.75, armR: 2.0, lean: -0.15, hat: true, legs: 0.14 });
  const hand = man.hand(2.0);
  ctx.strokeStyle = '#05070f'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(hand[0] + 18, hand[1] - 55); ctx.stroke();
  ctx.fillStyle = '#05070f';
  ctx.beginPath(); ctx.arc(hand[0] + 18, hand[1] - 45, 62, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
  // 비
  ctx.lineWidth = 1;
  for (let i = 0; i < 1500; i++) {
    const rx = rng() * W, ry = rng() * H, l = 12 + rng() * 24;
    ctx.strokeStyle = `rgba(190,210,255,${0.15 + rng() * 0.35})`;
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - l * 0.25, ry + l); ctx.stroke();
  }
  for (let i = 0; i < 140; i++) {
    ctx.strokeStyle = `rgba(200,220,255,${0.2 + rng() * 0.25})`;
    ctx.beginPath(); ctx.ellipse(rng() * W, 670 + rng() * 125, 4 + rng() * 9, 1 + rng() * 2, 0, 0, Math.PI * 2); ctx.stroke();
  }
  grain(ctx, rng, 2500, 0.04);
}

// 5. 보랏빛 언덕의 왈츠 — 〈라라랜드〉
function sceneTwilight(ctx, rng) {
  ctx.fillStyle = lin(ctx, 0, 0, 0, 540, [[0, '#120c35'], [0.35, '#3b2470'], [0.65, '#7e4a9e'], [0.85, '#d184b0'], [1, '#f3b1a0']]);
  ctx.fillRect(0, 0, W, H);
  stars(ctx, rng, 160, 300, 1.4);
  for (let i = 0; i < 16; i++) ellipse(ctx, rng() * W, 300 + rng() * 180, 60 + rng() * 180, 3 + rng() * 8, 'rgba(255,175,205,0.2)');
  wavyLayer(ctx, rng, 485, 22, '#5a3d86');
  wavyLayer(ctx, rng, 520, 16, '#3c2a6a');
  ctx.fillStyle = lin(ctx, 0, 530, 0, 660, [[0, '#2d2160'], [1, '#1f1745']]);
  ctx.fillRect(0, 535, W, 140);
  const lights = ['#ffd27a', '#fff3c4', '#ff9ec7', '#9ecbff', '#ffb46b'];
  for (let i = 0; i < 2400; i++) {
    const y = 540 + Math.pow(rng(), 0.7) * 120;
    ctx.globalAlpha = 0.45 + rng() * 0.55;
    ellipse(ctx, rng() * W, y, 0.7 + rng() * 1.5, 0.7 + rng() * 1.3, pick(rng, lights));
  }
  ctx.globalAlpha = 1;
  // 앞 언덕
  ctx.fillStyle = '#170f30';
  ctx.beginPath();
  ctx.moveTo(0, 665); ctx.quadraticCurveTo(300, 610, 540, 628); ctx.quadraticCurveTo(800, 645, W, 600);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 900; i++) {
    const gx = rng() * W, gy = 650 + rng() * 150;
    ctx.strokeStyle = rng() < 0.5 ? 'rgba(80,55,140,0.5)' : 'rgba(8,4,20,0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + (rng() - 0.5) * 6, gy - 5 - rng() * 10); ctx.stroke();
  }
  // 가로등
  glow(ctx, 770, 370, 170, 'rgba(255,225,150,0.55)');
  ellipse(ctx, 770, 640, 110, 14, 'rgba(255,215,140,0.18)');
  ctx.fillStyle = '#0c0820';
  ctx.fillRect(765, 375, 10, 268);
  ctx.fillRect(758, 625, 24, 18);
  ctx.beginPath(); ctx.moveTo(752, 352); ctx.lineTo(788, 352); ctx.lineTo(782, 382); ctx.lineTo(758, 382); ctx.fill();
  ctx.fillStyle = '#ffe9a8'; ctx.fillRect(760, 357, 20, 20);
  // 벤치
  ctx.fillStyle = '#0c0820';
  ctx.fillRect(230, 612, 170, 8);
  ctx.fillRect(230, 588, 170, 6); ctx.fillRect(230, 600, 170, 5);
  [240, 385].forEach((bx) => ctx.fillRect(bx, 588, 6, 54));
  // 춤추는 두 사람
  figure(ctx, { x: 515, y: 632, h: 150, color: '#0c0820', armL: -2.6, armR: 1.25, lean: -0.1 });
  ctx.fillStyle = '#d9d2ea';
  ctx.beginPath(); ctx.moveTo(512, 512); ctx.lineTo(522, 512); ctx.lineTo(517, 530); ctx.fill();
  figure(ctx, { x: 580, y: 634, h: 138, color: '#0c0820', dress: '#f2cf3a', armL: -1.35, armR: 2.7, lean: 0.25, swirl: 12 });
  grain(ctx, rng, 3000, 0.04);
}

// 6. 바다 위를 달리는 기차 — 〈센과 치히로의 행방불명〉
function sceneSeaTrain(ctx, rng) {
  const HY = 440;
  const sky = document.createElement('canvas');
  sky.width = W; sky.height = HY;
  const sc = sky.getContext('2d');
  sc.fillStyle = lin(sc, 0, 0, 0, HY, [[0, '#3d8fd6'], [0.6, '#9ccdf0'], [1, '#f3e6d3']]);
  sc.fillRect(0, 0, W, HY);
  for (let i = 0; i < 6; i++) ellipse(sc, rng() * W, 40 + rng() * 120, 60 + rng() * 120, 6 + rng() * 10, 'rgba(255,255,255,0.45)');
  for (let i = 0; i < 9; i++) {
    cloud(sc, rng, rng() * W, 160 + rng() * 230, 200 + rng() * 200, 70 + rng() * 60, '#ffffff', '#c3d2e8');
  }
  ctx.drawImage(sky, 0, 0);
  // 바다: 하늘을 거울처럼 반사
  ctx.save();
  ctx.translate(0, HY * 2); ctx.scale(1, -1);
  ctx.drawImage(sky, 0, 0);
  ctx.restore();
  ctx.fillStyle = lin(ctx, 0, HY, 0, H, [[0, 'rgba(60,140,180,0.15)'], [1, 'rgba(20,70,110,0.55)']]);
  ctx.fillRect(0, HY, W, H - HY);

  function objects() {
    // 섬
    ctx.fillStyle = '#4f7a4a';
    ctx.beginPath(); ctx.ellipse(880, HY, 95, 24, 0, Math.PI, Math.PI * 2); ctx.fill();
    ellipse(ctx, 850, HY - 34, 22, 26, '#3c6a3a');
    ctx.fillStyle = '#5a3a2a'; ctx.fillRect(848, HY - 14, 4, 14);
    ctx.fillStyle = '#efe6d2'; ctx.fillRect(895, HY - 22, 26, 18);
    ctx.fillStyle = '#b8443a';
    ctx.beginPath(); ctx.moveTo(890, HY - 22); ctx.lineTo(908, HY - 36); ctx.lineTo(926, HY - 22); ctx.fill();
    // 전봇대와 전선
    ctx.strokeStyle = '#3a3a48'; ctx.lineWidth = 3;
    const poles = [];
    for (let x = 25; x < 800; x += 95) poles.push(x);
    poles.forEach((px) => {
      ctx.beginPath(); ctx.moveTo(px, HY + 4); ctx.lineTo(px, HY - 64); ctx.moveTo(px - 10, HY - 56); ctx.lineTo(px + 10, HY - 56); ctx.stroke();
    });
    ctx.lineWidth = 1;
    for (let i = 0; i < poles.length - 1; i++) {
      ctx.beginPath(); ctx.moveTo(poles[i], HY - 56); ctx.quadraticCurveTo((poles[i] + poles[i + 1]) / 2, HY - 46, poles[i + 1], HY - 56); ctx.stroke();
    }
    // 기차
    for (let k = 0; k < 3; k++) {
      const tx = 330 + k * 114;
      ctx.fillStyle = '#2f7f7a';
      ctx.fillRect(tx, HY - 44, 108, 42);
      ctx.fillStyle = '#e9e1c9'; ctx.fillRect(tx, HY - 14, 108, 6);
      ctx.fillStyle = '#5a1f24';
      ctx.beginPath(); ctx.moveTo(tx - 3, HY - 44); ctx.quadraticCurveTo(tx + 54, HY - 60, tx + 111, HY - 44); ctx.fill();
      for (let j = 0; j < 6; j++) {
        ctx.fillStyle = '#ffe6a6'; ctx.fillRect(tx + 7 + j * 16.5, HY - 36, 11, 14);
        if ((j + k) % 3 === 0) { ctx.fillStyle = '#1b2a33'; ctx.beginPath(); ctx.arc(tx + 12.5 + j * 16.5, HY - 26, 4, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.fillStyle = '#1b1b24'; ctx.fillRect(tx + 6, HY - 2, 96, 4);
    }
    ctx.fillStyle = '#5b5560'; ctx.fillRect(0, HY + 2, W, 2);
  }
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.translate(0, HY * 2 + 6); ctx.scale(1, -1);
  objects();
  ctx.restore();
  for (let i = 0; i < 1100; i++) {
    const y = HY + 6 + rng() * (H - HY);
    ctx.fillStyle = rng() < 0.55 ? `rgba(255,255,255,${0.1 + rng() * 0.25})` : `rgba(20,60,100,${0.12 + rng() * 0.2})`;
    ctx.fillRect(rng() * W, y, 8 + rng() * (20 + (y - HY) * 0.15), 1 + (y - HY) / 200);
  }
  objects();
  ctx.fillStyle = 'rgba(255,245,230,0.25)';
  ctx.fillRect(0, HY - 3, W, 5);
  grain(ctx, rng, 3000, 0.035);
}

const PUZZLES = [
  { id: 'balloon', title: '풍선을 타고 떠나는 집', homage: '영화 〈업〉 오마주', level: 'mid', seed: 11, draw: sceneBalloons },
  { id: 'moon', title: '달을 가로지르는 자전거', homage: '영화 〈E.T.〉 오마주', level: 'mid', seed: 22, draw: sceneMoon },
  { id: 'bow', title: '석양의 뱃머리', homage: '영화 〈타이타닉〉 오마주', level: 'mid', seed: 33, draw: sceneBow },
  { id: 'rain', title: '빗속의 가로등 춤', homage: '영화 〈사랑은 비를 타고〉 오마주', level: 'hard', seed: 44, draw: sceneRain },
  { id: 'twilight', title: '보랏빛 언덕의 왈츠', homage: '영화 〈라라랜드〉 오마주', level: 'hard', seed: 55, draw: sceneTwilight },
  { id: 'seatrain', title: '바다 위를 달리는 기차', homage: '영화 〈센과 치히로의 행방불명〉 오마주', level: 'hard', seed: 66, draw: sceneSeaTrain },
];
const LEVEL_NAME = { mid: '중', hard: '상' };

const imageCache = {};
function getImage(puzzle) {
  if (!imageCache[puzzle.id]) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    puzzle.draw(cv.getContext('2d'), mulberry32(puzzle.seed));
    imageCache[puzzle.id] = cv;
  }
  return imageCache[puzzle.id];
}

/* =========================================================
 * 직소 피스 모양
 * ========================================================= */
function makeEdges(seed) {
  const rng = mulberry32(seed);
  const h = [], v = [];
  for (let r = 0; r <= ROWS; r++) {
    h[r] = [];
    for (let c = 0; c < COLS; c++) h[r][c] = (r === 0 || r === ROWS) ? 0 : (rng() < 0.5 ? 1 : -1);
  }
  for (let r = 0; r < ROWS; r++) {
    v[r] = [];
    for (let c = 0; c <= COLS; c++) v[r][c] = (c === 0 || c === COLS) ? 0 : (rng() < 0.5 ? 1 : -1);
  }
  return { h, v };
}
// 한 변을 그린다. k: 1 = 바깥으로 돌기, -1 = 안으로 홈, 0 = 평평
function side(path, x0, y0, dx, dy, k) {
  const nx = dy, ny = -dx; // 시계 방향 진행 시 바깥쪽 법선
  const P = (u, v) => [x0 + dx * u * S + nx * v * S * k, y0 + dy * u * S + ny * v * S * k];
  if (k === 0) { path.lineTo(x0 + dx * S, y0 + dy * S); return; }
  path.lineTo(...P(0.37, 0));
  path.bezierCurveTo(...P(0.42, 0), ...P(0.44, 0.06), ...P(0.40, 0.11));
  path.bezierCurveTo(...P(0.34, 0.20), ...P(0.42, 0.25), ...P(0.50, 0.25));
  path.bezierCurveTo(...P(0.58, 0.25), ...P(0.66, 0.20), ...P(0.60, 0.11));
  path.bezierCurveTo(...P(0.56, 0.06), ...P(0.58, 0), ...P(0.63, 0));
  path.lineTo(...P(1, 0));
}
function piecePath(edges, r, c) {
  const top = -edges.h[r][c];
  const bottom = edges.h[r + 1][c];
  const left = -edges.v[r][c];
  const right = edges.v[r][c + 1];
  const p = new Path2D();
  p.moveTo(0, 0);
  side(p, 0, 0, 1, 0, top);
  side(p, S, 0, 0, 1, right);
  side(p, S, S, -1, 0, bottom);
  side(p, 0, S, 0, -1, left);
  p.closePath();
  return p;
}
function renderPieceCanvas(img, piece) {
  const size = Math.round((S + PAD * 2) * PIECE_SCALE);
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.scale(PIECE_SCALE, PIECE_SCALE);
  ctx.translate(PAD, PAD);
  ctx.save();
  ctx.clip(piece.path);
  ctx.drawImage(img, -piece.c * S, -piece.r * S);
  ctx.restore();
  ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke(piece.path);
  ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke(piece.path);
  return cv;
}
function copyCanvas(src) {
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  cv.getContext('2d').drawImage(src, 0, 0);
  return cv;
}

/* =========================================================
 * 게임 상태
 * ========================================================= */
let game = null;
let zoomIndex = 0;
let filter = 'all';
let saveTimer = null;
let drag = null;
let suppressClick = false;

const el = {
  menu: $('menuScreen'), gameScreen: $('gameScreen'),
  midGrid: $('midGrid'), hardGrid: $('hardGrid'),
  gameName: $('gameName'), gameLevel: $('gameLevel'),
  statusBar: $('statusBar'), statusText: $('statusText'), statusCount: $('statusCount'),
  progressFill: $('progressFill'), timeText: $('timeText'), movesText: $('movesText'),
  mistakesText: $('mistakesText'), hintsText: $('hintsText'), feedback: $('feedback'),
  boardScroll: $('boardScroll'), boardInner: $('boardInner'), board: $('boardCanvas'),
  hintBox: $('hintBox'), flashBox: $('flashBox'),
  tray: $('tray'), selectedPreview: $('selectedPreview'),
  btnRotate: $('btnRotate'), btnHint: $('btnHint'),
  loading: $('loading'), modal: $('modal'), modalTitle: $('modalTitle'),
  modalBody: $('modalBody'), modalActions: $('modalActions'),
};
const bctx = el.board.getContext('2d');

function showScreen(name) {
  el.menu.classList.toggle('active', name === 'menu');
  el.gameScreen.classList.toggle('active', name === 'game');
  window.scrollTo(0, 0);
}

/* ---------- 모달 ---------- */
function openModal(title, bodyHtml, actions, cls = '') {
  el.modalTitle.textContent = title;
  el.modalBody.innerHTML = '';
  if (typeof bodyHtml === 'string') el.modalBody.innerHTML = bodyHtml;
  else if (bodyHtml) el.modalBody.appendChild(bodyHtml);
  el.modalActions.innerHTML = '';
  actions.forEach(({ label, cls: bcls, onClick }) => {
    const b = document.createElement('button');
    b.className = `btn ${bcls || ''}`;
    b.textContent = label;
    b.addEventListener('click', () => { closeModal(); onClick && onClick(); });
    el.modalActions.appendChild(b);
  });
  el.modal.querySelector('.modal-card').className = `modal-card ${cls}`;
  el.modal.hidden = false;
  el.modalActions.querySelector('button')?.focus();
}
function closeModal() { el.modal.hidden = true; }

/* =========================================================
 * 메뉴
 * ========================================================= */
function buildMenu() {
  el.midGrid.innerHTML = '';
  el.hardGrid.innerHTML = '';
  PUZZLES.forEach((p) => {
    const card = document.createElement('button');
    card.className = `puzzle-card ${p.level}`;
    const thumb = document.createElement('canvas');
    thumb.width = 500; thumb.height = 400;
    thumb.getContext('2d').drawImage(getImage(p), 0, 0, 500, 400);
    const save = store.get(saveKey(p.id));
    const best = store.get(bestKey(p.id));
    const tags = [`<span class="tag ${p.level}">난이도 ${LEVEL_NAME[p.level]}</span>`, '<span class="tag">500피스</span>'];
    if (save) tags.push(`<span class="tag save">이어하기 ${Math.floor((save.placed.length / TOTAL) * 100)}%</span>`);
    if (best) tags.push(`<span class="tag best">최고 ${fmtTime(best.time)}</span>`);
    const info = document.createElement('div');
    info.className = 'card-info';
    info.innerHTML = `<strong>${p.title}</strong><span class="homage">${p.homage}</span><div class="card-tags">${tags.join('')}</div>`;
    card.append(thumb, info);
    card.addEventListener('click', () => choosePuzzle(p));
    (p.level === 'mid' ? el.midGrid : el.hardGrid).appendChild(card);
  });
}

function choosePuzzle(p) {
  const save = store.get(saveKey(p.id));
  if (!save) { startGame(p, null); return; }
  openModal('저장된 퍼즐이 있어요',
    `<p><b>${p.title}</b><br>${save.placed.length} / ${TOTAL} 피스 · ${fmtTime(save.elapsed)} 진행</p>`,
    [
      { label: '▶ 이어하기', cls: 'primary', onClick: () => startGame(p, save) },
      { label: '처음부터', onClick: () => { store.del(saveKey(p.id)); startGame(p, null); } },
    ]);
}

/* =========================================================
 * 게임 시작
 * ========================================================= */
function startGame(puzzle, save) {
  el.loading.hidden = false;
  setTimeout(() => {
    const img = getImage(puzzle);
    const edges = makeEdges(puzzle.seed * 7919 + 13);
    const hard = puzzle.level === 'hard';
    const pieces = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const piece = {
          i, r, c,
          edge: r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1,
          rot: hard ? (save ? save.rot[i] : 1 + Math.floor(Math.random() * 3)) : 0,
          placed: false,
        };
        piece.path = piecePath(edges, r, c);
        pieces.push(piece);
      }
    }
    game = {
      puzzle, img, hard, pieces,
      placedCount: 0, selected: null,
      moves: save ? save.moves : 0,
      mistakes: save ? save.mistakes : 0,
      hints: save ? save.hints : 0,
      elapsed: save ? save.elapsed : 0,
      ended: false,
    };
    if (save) save.placed.forEach((i) => { pieces[i].placed = true; game.placedCount++; });
    pieces.forEach((p) => { if (!p.placed) p.canvas = renderPieceCanvas(img, p); });

    el.gameName.textContent = puzzle.title;
    el.gameLevel.textContent = `난이도 ${LEVEL_NAME[puzzle.level]}`;
    el.gameLevel.className = `badge ${puzzle.level}`;
    el.btnRotate.hidden = !hard;
    filter = 'all';
    document.querySelectorAll('.chip').forEach((ch) => ch.classList.toggle('active', ch.dataset.filter === 'all'));

    buildTray();
    drawBoard();
    updateSelected();
    updateStatus();
    setFeedback(save ? '저장된 곳부터 이어서 시작해요. 화이팅!' :
      hard ? '상 난이도: 피스가 돌아가 있어요. 피스를 한 번 더 누르거나 ⟳ 회전으로 방향을 맞춘 뒤 판에 놓으세요.'
           : '아래 피스를 누른 뒤, 퍼즐판의 알맞은 자리를 누르세요. (가장자리부터 추천!)', 'info');
    showScreen('game');
    zoomIndex = 0;
    applyZoom();
    el.loading.hidden = true;
  }, 30);
}

/* ---------- 피스 보관함 ---------- */
function buildTray() {
  el.tray.innerHTML = '';
  const order = shuffle(game.pieces.filter((p) => !p.placed));
  order.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'piece';
    b.dataset.i = p.i;
    b.setAttribute('aria-label', `피스 ${p.i + 1}`);
    p.canvas.style.transform = `rotate(${p.rot * 90}deg)`;
    b.appendChild(p.canvas);
    p.el = b;
    el.tray.appendChild(b);
  });
  applyFilter();
}
function applyFilter() {
  let shown = 0;
  game.pieces.forEach((p) => {
    if (p.placed || !p.el) return;
    const vis = filter === 'all' || (filter === 'edge' ? p.edge : !p.edge);
    p.el.hidden = !vis;
    if (vis) shown++;
  });
  let empty = el.tray.querySelector('.tray-empty');
  if (!shown) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'tray-empty';
      el.tray.appendChild(empty);
    }
    empty.textContent = filter === 'edge' ? '가장자리 피스를 다 맞췄어요! 🎉 "안쪽"을 눌러 보세요.' : '이 분류의 피스를 모두 맞췄어요!';
  } else if (empty) {
    empty.remove();
  }
  const left = game.pieces.filter((p) => !p.placed);
  $('cntAll').textContent = left.length;
  $('cntEdge').textContent = left.filter((p) => p.edge).length;
  $('cntInner').textContent = left.filter((p) => !p.edge).length;
}

/* ---------- 퍼즐판 ---------- */
function drawBoard() {
  bctx.setTransform(BOARD_RES, 0, 0, BOARD_RES, 0, 0);
  bctx.fillStyle = '#0b0a1a';
  bctx.fillRect(0, 0, W, H);
  if (!game.hard) {
    bctx.globalAlpha = 0.28;
    bctx.drawImage(game.img, 0, 0);
    bctx.globalAlpha = 1;
  }
  bctx.lineWidth = 0.8;
  bctx.strokeStyle = game.hard ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.18)';
  game.pieces.forEach((p) => {
    if (p.placed) return;
    bctx.save(); bctx.translate(p.c * S, p.r * S); bctx.stroke(p.path); bctx.restore();
  });
  game.pieces.forEach((p) => { if (p.placed) drawPlaced(p); });
}
function drawPlaced(p) {
  bctx.save();
  bctx.translate(p.c * S, p.r * S);
  bctx.save();
  bctx.clip(p.path);
  bctx.drawImage(game.img, -p.c * S, -p.r * S);
  bctx.restore();
  bctx.lineWidth = 0.6;
  bctx.strokeStyle = 'rgba(0,0,0,0.25)';
  bctx.stroke(p.path);
  bctx.restore();
}
function applyZoom(keepCenter = false) {
  const sc = el.boardScroll;
  const cx = (sc.scrollLeft + sc.clientWidth / 2) / (sc.scrollWidth || 1);
  const cy = (sc.scrollTop + sc.clientHeight / 2) / (sc.scrollHeight || 1);
  const fit = Math.max(200, Math.min(sc.clientWidth - 2, (sc.clientHeight - 2) * (W / H)));
  const z = ZOOMS[zoomIndex];
  el.boardInner.style.width = `${Math.floor(fit * z)}px`;
  $('zoomText').textContent = `${Math.round(z * 100)}%`;
  $('btnZoomOut').disabled = zoomIndex === 0;
  $('btnZoomIn').disabled = zoomIndex === ZOOMS.length - 1;
  if (keepCenter) {
    sc.scrollLeft = cx * sc.scrollWidth - sc.clientWidth / 2;
    sc.scrollTop = cy * sc.scrollHeight - sc.clientHeight / 2;
  }
}
function placeBox(box, r, c, cls) {
  box.style.left = `${(c / COLS) * 100}%`;
  box.style.top = `${(r / ROWS) * 100}%`;
  box.style.width = `${100 / COLS}%`;
  box.style.height = `${100 / ROWS}%`;
  box.className = `cell-box ${cls}`;
  void box.offsetWidth; // 애니메이션 재시작
  box.classList.add(cls === 'hint' ? 'show' : 'flash');
}
function scrollToCell(r, c) {
  const sc = el.boardScroll;
  const cw = el.boardInner.clientWidth / COLS;
  const ch = el.boardInner.clientHeight / ROWS;
  sc.scrollTo({ left: (c + 0.5) * cw - sc.clientWidth / 2, top: (r + 0.5) * ch - sc.clientHeight / 2, behavior: 'smooth' });
}
function cellFromPoint(x, y) {
  const rect = el.board.getBoundingClientRect();
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
  const c = Math.min(COLS - 1, Math.floor(((x - rect.left) / rect.width) * COLS));
  const r = Math.min(ROWS - 1, Math.floor(((y - rect.top) / rect.height) * ROWS));
  return { r, c };
}

/* ---------- 선택 / 회전 / 배치 ---------- */
function selectPiece(i) {
  if (game.selected !== null) game.pieces[game.selected].el?.classList.remove('selected');
  game.selected = i;
  if (i !== null) game.pieces[i].el.classList.add('selected');
  updateSelected();
}
function updateSelected() {
  const box = el.selectedPreview;
  box.innerHTML = '';
  const p = game.selected !== null ? game.pieces[game.selected] : null;
  box.classList.toggle('has', !!p);
  el.btnHint.disabled = !p;
  el.btnRotate.disabled = !p;
  if (!p) { box.innerHTML = '선택<br>없음'; return; }
  const cv = copyCanvas(p.canvas);
  cv.style.transform = `rotate(${p.rot * 90}deg)`;
  box.appendChild(cv);
}
function rotateSelected() {
  if (!game.hard || game.selected === null) return;
  const p = game.pieces[game.selected];
  p.rot = (p.rot + 1) % 4;
  p.canvas.style.transform = `rotate(${p.rot * 90}deg)`;
  const pv = el.selectedPreview.querySelector('canvas');
  if (pv) pv.style.transform = `rotate(${p.rot * 90}deg)`;
  setFeedback(p.rot === 0 ? '피스를 돌렸어요. (방향을 잘 보고 판에 놓아 보세요)' : '피스를 90° 돌렸어요.', 'info');
  scheduleSave();
}
function onPieceTap(i) {
  if (game.ended) return;
  if (game.selected === i) {
    if (game.hard) rotateSelected();
    else { selectPiece(null); setFeedback('선택을 취소했어요.', 'info'); }
    return;
  }
  selectPiece(i);
  setFeedback(game.hard ? '피스를 골랐어요. 다시 누르면 회전, 판을 누르면 그 자리에 놓아요.' : '피스를 골랐어요. 퍼즐판에서 맞는 자리를 누르세요.', 'info');
}
function tryPlace(i, r, c) {
  if (game.ended) return;
  const target = game.pieces[r * COLS + c];
  if (target.placed) { setFeedback('이미 맞춘 자리예요. 빈 자리를 눌러 주세요.', 'warn'); return; }
  const p = game.pieces[i];
  game.moves++;
  if (p.r === r && p.c === c && p.rot === 0) {
    placePiece(p);
  } else if (p.r === r && p.c === c) {
    game.mistakes++;
    placeBox(el.flashBox, r, c, 'warn');
    setFeedback('자리는 맞는데 방향이 달라요! 피스를 한 번 더 누르거나 ⟳ 회전을 눌러 보세요.', 'warn');
    shakePiece(p);
  } else {
    game.mistakes++;
    placeBox(el.flashBox, r, c, 'bad');
    setFeedback(`여기가 아니에요 ✖ (${r + 1}행 ${c + 1}열) 다른 자리를 찾아보세요.`, 'bad');
    shakePiece(p);
  }
  updateStatus();
  scheduleSave();
}
function shakePiece(p) {
  p.el.classList.remove('shake');
  void p.el.offsetWidth;
  p.el.classList.add('shake');
}
function placePiece(p) {
  p.placed = true;
  game.placedCount++;
  drawPlaced(p);
  p.el.remove();
  p.el = null;
  game.selected = null;
  updateSelected();
  applyFilter();
  placeBox(el.flashBox, p.r, p.c, 'good');
  const cheers = ['딱 맞아요! 👍', '정확해요! ✨', '좋아요, 한 조각 더! 🧩', '완벽한 자리예요! 🎯'];
  setFeedback(cheers[game.placedCount % cheers.length], 'good');
  if (game.placedCount === TOTAL) finish(true);
}

/* ---------- 상태 표시 (색 + 문구) ---------- */
function updateStatus() {
  const n = game.placedCount;
  const pct = Math.floor((n / TOTAL) * 100);
  let state, text;
  if (game.ended && n < TOTAL) { state = 'quit'; text = '⬜ 포기함 — 게임 종료'; }
  else if (n === TOTAL) { state = 'done'; text = '🏆 완성! 500피스를 모두 맞췄어요'; }
  else if (n === 0) { state = 'start'; text = '🟦 시작! 첫 피스를 골라 보세요'; }
  else if (pct < 25) { state = 'low'; text = '🟪 워밍업 중 — 가장자리부터 차근차근'; }
  else if (pct < 75) { state = 'mid'; text = pct < 50 ? '🟧 순항 중 — 절반을 향해!' : '🟧 순항 중 — 절반을 넘었어요!'; }
  else { state = 'high'; text = '🟩 거의 다 왔어요! 조금만 더'; }
  el.statusBar.dataset.state = state;
  el.statusText.textContent = text;
  el.statusCount.textContent = `${n} / ${TOTAL} (${pct}%)`;
  el.progressFill.style.width = `${(n / TOTAL) * 100}%`;
  el.timeText.textContent = fmtTime(game.elapsed);
  el.movesText.textContent = game.moves;
  el.mistakesText.textContent = game.mistakes;
  el.hintsText.textContent = game.hints;
}
function setFeedback(msg, type) {
  el.feedback.textContent = msg;
  el.feedback.dataset.type = type;
  el.feedback.classList.remove('pop');
  void el.feedback.offsetWidth;
  el.feedback.classList.add('pop');
}

/* ---------- 저장 ---------- */
function saveNow() {
  if (!game || game.ended) return;
  store.set(saveKey(game.puzzle.id), {
    placed: game.pieces.filter((p) => p.placed).map((p) => p.i),
    rot: game.pieces.map((p) => p.rot),
    elapsed: game.elapsed, moves: game.moves, mistakes: game.mistakes, hints: game.hints,
  });
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

/* ---------- 종료 ---------- */
function finish(win) {
  game.ended = true;
  clearTimeout(saveTimer);
  store.del(saveKey(game.puzzle.id));
  selectPiece(null);
  updateStatus();
  const p = game.puzzle;
  const replay = { label: '🔁 다시하기', cls: 'primary', onClick: () => startGame(p, null) };
  const toMenu = { label: '🧩 다른 퍼즐 고르기', onClick: goMenu };
  const stats = `
    <div class="result-grid">
      <div>맞춘 피스<b>${game.placedCount} / ${TOTAL}</b></div>
      <div>걸린 시간<b>${fmtTime(game.elapsed)}</b></div>
      <div>시도 / 실수<b>${game.moves} / ${game.mistakes}</b></div>
      <div>힌트 사용<b>${game.hints}회</b></div>
    </div>`;
  if (win) {
    const best = store.get(bestKey(p.id));
    const isBest = !best || game.elapsed < best.time;
    if (isBest) store.set(bestKey(p.id), { time: game.elapsed, moves: game.moves });
    setFeedback('🎉 축하해요! 퍼즐을 완성했어요!', 'good');
    setTimeout(() => {
      const thumb = copyCanvas(game.img);
      const wrap = document.createElement('div');
      wrap.appendChild(thumb);
      wrap.insertAdjacentHTML('beforeend', `<p>〈${p.title}〉 500피스를 모두 맞췄어요!</p>${stats}` +
        (isBest ? '<p class="new-best">🥇 새 최고 기록!</p>' : `<p>최고 기록: ${fmtTime(best.time)}</p>`));
      openModal('🎉 완성!', wrap, [replay, toMenu], 'win');
    }, 700);
  } else {
    setFeedback('게임을 포기했어요.', 'warn');
    openModal('포기했어요', `<p>〈${p.title}〉 진행률 ${Math.floor((game.placedCount / TOTAL) * 100)}%에서 멈췄어요.</p>${stats}`, [replay, toMenu], 'quit');
  }
}
function goMenu() {
  if (game && !game.ended) saveNow();
  buildMenu();
  showScreen('menu');
}

/* =========================================================
 * 이벤트
 * ========================================================= */
el.tray.addEventListener('click', (e) => {
  if (suppressClick) return;
  const b = e.target.closest('.piece');
  if (b) onPieceTap(Number(b.dataset.i));
});
el.board.addEventListener('click', (e) => {
  if (!game || game.ended) return;
  const cell = cellFromPoint(e.clientX, e.clientY);
  if (!cell) return;
  if (game.selected === null) {
    setFeedback('아래 보관함에서 피스를 먼저 골라 주세요.', 'warn');
    return;
  }
  tryPlace(game.selected, cell.r, cell.c);
});

// 마우스로 끌어다 놓기 (터치는 '누르고 → 판 누르기' 방식)
el.tray.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || e.button !== 0 || !game || game.ended) return;
  const b = e.target.closest('.piece');
  if (!b) return;
  drag = { i: Number(b.dataset.i), x: e.clientX, y: e.clientY, ghost: null };
});
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    if (game.selected !== drag.i) selectPiece(drag.i);
    const p = game.pieces[drag.i];
    const g = document.createElement('div');
    g.className = 'drag-ghost';
    const cv = copyCanvas(p.canvas);
    cv.style.transform = `rotate(${p.rot * 90}deg)`;
    g.appendChild(cv);
    document.body.appendChild(g);
    drag.ghost = g;
  }
  drag.ghost.style.left = `${e.clientX}px`;
  drag.ghost.style.top = `${e.clientY}px`;
});
window.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.ghost) return;
  d.ghost.remove();
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  const cell = cellFromPoint(e.clientX, e.clientY);
  if (cell) tryPlace(d.i, cell.r, cell.c);
  else setFeedback('퍼즐판 위에 놓아 주세요.', 'info');
});

el.btnRotate.addEventListener('click', rotateSelected);
$('btnHint').addEventListener('click', () => {
  if (!game || game.selected === null || game.ended) return;
  const p = game.pieces[game.selected];
  game.hints++;
  scrollToCell(p.r, p.c);
  placeBox(el.hintBox, p.r, p.c, 'hint');
  setFeedback(`💡 반짝이는 칸이 정답 자리예요! (${p.r + 1}행 ${p.c + 1}열)${game.hard && p.rot ? ' 방향도 맞춰 주세요.' : ''}`, 'info');
  updateStatus();
  scheduleSave();
});
$('btnShuffle').addEventListener('click', () => {
  if (!game || game.ended) return;
  const sel = game.selected;
  buildTray();
  if (sel !== null) game.pieces[sel].el.classList.add('selected');
  el.tray.scrollTop = 0;
  setFeedback('남은 피스를 섞었어요.', 'info');
});
document.querySelectorAll('.chip').forEach((ch) => ch.addEventListener('click', () => {
  filter = ch.dataset.filter;
  document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === ch));
  applyFilter();
  el.tray.scrollTop = 0;
}));
$('btnZoomIn').addEventListener('click', () => { zoomIndex = Math.min(ZOOMS.length - 1, zoomIndex + 1); applyZoom(true); });
$('btnZoomOut').addEventListener('click', () => { zoomIndex = Math.max(0, zoomIndex - 1); applyZoom(true); });
$('btnZoomFit').addEventListener('click', () => { zoomIndex = 0; applyZoom(); });
$('btnPreview').addEventListener('click', () => {
  if (!game) return;
  openModal('원본 그림', copyCanvas(game.img), [{ label: '닫기', cls: 'primary' }]);
});
$('btnGiveUp').addEventListener('click', () => {
  if (!game || game.ended) return;
  openModal('정말 포기할까요?', '<p>포기하면 게임이 끝나고 저장된 진행 상황이 사라져요.</p>', [
    { label: '계속하기', cls: 'primary' },
    { label: '포기하기', cls: 'danger', onClick: () => finish(false) },
  ]);
});
$('btnMenu').addEventListener('click', goMenu);
el.modal.addEventListener('click', (e) => { if (e.target === el.modal && el.modalActions.children.length === 1) closeModal(); });
window.addEventListener('keydown', (e) => {
  if (!el.modal.hidden) { if (e.key === 'Escape' && el.modalActions.children.length === 1) closeModal(); return; }
  if (!game || game.ended || !el.gameScreen.classList.contains('active')) return;
  if (e.key === 'r' || e.key === 'R') rotateSelected();
  if (e.key === 'Escape') selectPiece(null);
});
window.addEventListener('resize', () => { if (game && el.gameScreen.classList.contains('active')) applyZoom(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
window.addEventListener('pagehide', saveNow);

// 시간 (제한 없음, 진행 시간만 기록)
setInterval(() => {
  if (!game || game.ended || document.hidden || !el.gameScreen.classList.contains('active') || !el.modal.hidden) return;
  game.elapsed++;
  el.timeText.textContent = fmtTime(game.elapsed);
  if (game.elapsed % 15 === 0) saveNow();
}, 1000);

buildMenu();
