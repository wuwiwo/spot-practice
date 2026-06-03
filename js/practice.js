/**
 * practice.js v4
 * 震动反馈、点击区域闪烁、错误点击惩罚
 */

import { getScene, hitTest } from './storage.js';

const $ = s => document.querySelector(s);

const ready = $('#practice-ready'), active = $('#practice-active'), result = $('#practice-result');
const nameEl = $('#practice-scene-name'), pImg = $('#practice-image'), fbSvg = $('#feedback-svg');
const tName = $('#target-name'), tBar = $('#target-bar'), tGrip = $('#target-bar-grip');
const timerD = $('#timer-display'), scoreD = $('#score-display');
const progC = $('#progress-current'), progT = $('#progress-total'), hudT = $('#hud-timer');
const cTime = $('#config-time'), cCount = $('#config-count'), btnStart = $('#btn-start-practice');
const btnRetry = $('#btn-retry'), btnRB = $('#btn-result-back'), btnBack = $('#btn-practice-back');
const rHits = $('#result-hits'), rMiss = $('#result-misses'), rWrg = $('#result-wrong'),
  rAcc = $('#result-accuracy'), rTime = $('#result-time'), rIcon = $('#result-icon');
const zIn = $('#btn-zoom-in'), zOut = $('#btn-zoom-out'), zReset = $('#btn-zoom-reset'), zLbl = $('#zoom-level-display');
const ps = $('#practice-scroll'), pi = $('#practice-image-inner'), grpFilter = $('#practice-group-filter');

let scene, sid, items = [], shuffled = [], ci = 0, score = 0, wrongClicks = 0;
let totalT = 60, totalC = 5, tl = 0, timer = null, running = false, startT = 0;
let zoom = 1, drag = false, dOffX = 0, dOffY = 0;

/* --- vibration --- */
function vibe(ms) { try { navigator.vibrate?.(ms); } catch {} }

export function initPractice(id) {
  sid = id; scene = getScene(id);
  if (!scene) { toast('场景数据异常', 1); return; }
  items = scene.items; zoom = 1;
  nameEl.textContent = scene.name || '未命名';
  cTime.value = '60'; cCount.value = String(Math.min(5, items.length));
  cCount.max = String(items.length);
  renderGroupFilter(); updateZoomUI(); resetBarPos();
  showView('ready');
}

function showView(v) {
  ready.classList.toggle('hidden', v !== 'ready');
  active.classList.toggle('hidden', v !== 'active');
  result.classList.toggle('hidden', v !== 'result');
}

/* --- group filter --- */
function renderGroupFilter() {
  grpFilter.innerHTML = '';
  const grps = scene?.groups || [];
  if (grps.length === 0) { grpFilter.classList.add('hidden'); return; }
  grpFilter.classList.remove('hidden');
  const allC = document.createElement('button'); allC.className = 'practice-grp-chip active';
  allC.textContent = '全部'; allC.dataset.gid = '__all__';
  allC.addEventListener('click', () => toggleGF(allC));
  grpFilter.appendChild(allC);
  grps.forEach(g => {
    const c = document.createElement('button'); c.className = 'practice-grp-chip';
    c.textContent = g.name; c.dataset.gid = g.id;
    c.addEventListener('click', () => toggleGF(c));
    grpFilter.appendChild(c);
  });
}
let activeG = new Set();
function toggleGF(chip) {
  if (chip.dataset.gid === '__all__') {
    grpFilter.querySelectorAll('.practice-grp-chip').forEach(c => c.classList.toggle('active', c === chip));
    activeG.clear();
  } else {
    chip.classList.toggle('active');
    if (chip.classList.contains('active')) activeG.add(chip.dataset.gid); else activeG.delete(chip.dataset.gid);
    const allC = grpFilter.querySelector('[data-gid="__all__"]');
    const chips = [...grpFilter.querySelectorAll('[data-gid]:not([data-gid="__all__"])')];
    const allOn = chips.every(c => c.classList.contains('active'));
    allC.classList.toggle('active', allOn || activeG.size === 0);
    if (allOn || activeG.size === 0) activeG.clear();
  }
  updateCNT();
}
function updateCNT() {
  const f = getFI(); cCount.max = String(f.length);
  if (Number(cCount.value) > f.length) cCount.value = String(f.length);
}
function getFI() { return activeG.size === 0 ? items : items.filter(it => activeG.has(it.groupId)); }

/* --- zoom --- */
function setZoom(v) { zoom = Math.max(.5, Math.min(3, v)); pi.style.width = `${zoom*100}%`; updateZoomUI(); }
function updateZoomUI() { zLbl.textContent = Math.round(zoom*100)+'%'; }
zIn.addEventListener('click', () => setZoom(zoom+.25));
zOut.addEventListener('click', () => setZoom(zoom-.25));
zReset.addEventListener('click', () => { setZoom(1); ps.scrollTop=0; ps.scrollLeft=0; });

/* --- drag bar --- */
function resetBarPos() { tBar.style.cssText = 'left:50%;bottom:14px;top:auto;transform:translateX(-50%)'; }
tGrip.addEventListener('pointerdown', e => {
  e.preventDefault(); drag = true;
  const r = tBar.getBoundingClientRect(); dOffX = e.clientX - r.left; dOffY = e.clientY - r.top;
  tBar.setPointerCapture(e.pointerId);
});
tGrip.addEventListener('pointermove', e => {
  if (!drag) return; const sr = ps.getBoundingClientRect();
  tBar.style.left = `${e.clientX - sr.left - dOffX}px`; tBar.style.top = `${e.clientY - sr.top - dOffY}px`;
  tBar.style.bottom = 'auto'; tBar.style.transform = 'none';
});
tGrip.addEventListener('pointerup', () => { drag = false; });
tGrip.addEventListener('pointercancel', () => { drag = false; });

/* --- start --- */
btnStart.addEventListener('click', () => {
  const pool = getFI();
  if (pool.length < 1) { toast('没有可用的物品', 1); return; }
  const asked = Math.min(Number(cCount.value)||5, pool.length);
  totalT = Math.max(10, Math.min(300, Number(cTime.value)||60));
  totalC = asked;
  shuffled = shuffle(pool).slice(0, asked);
  ci = 0; score = 0; wrongClicks = 0; tl = totalT; running = true; startT = Date.now();
  pImg.src = scene.imageDataUrl; fbSvg.innerHTML = '';
  pi.style.width = `${zoom*100}%`; ps.scrollTop = 0; ps.scrollLeft = 0;
  resetBarPos();
  timerD.textContent = String(tl); scoreD.textContent = '0';
  progC.textContent = '0'; progT.textContent = String(totalC);
  hudT.classList.remove('warning', 'danger');
  showTarget(); showView('active'); startTimer();
});
function shuffle(a) {
  const r = [...a];
  for (let i = r.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [r[i],r[j]]=[r[j],r[i]]; }
  return r;
}
function showTarget() {
  if (ci >= shuffled.length) { endPractice(); return; }
  tName.textContent = shuffled[ci].name; progC.textContent = String(ci);
}

/* --- timer --- */
function startTimer() {
  clearInterval(timer);
  timer = setInterval(() => {
    tl--; timerD.textContent = String(tl);
    if (tl <= 10) hudT.classList.add('danger');
    else if (tl <= 20) hudT.classList.add('warning');
    if (tl <= 0) endPractice();
  }, 1000);
}

/* --- hit detection --- */
ps.addEventListener('click', e => {
  if (!running || ci >= shuffled.length || drag || e.target.closest('#target-bar')) return;
  const r = pImg.getBoundingClientRect();
  const tx = ((e.clientX-r.left)/r.width)*100;
  const ty = ((e.clientY-r.top)/r.height)*100;
  const target = shuffled[ci];

  // 先闪烁区域
  flashArea(target);

  if (hitTest(tx, ty, target)) {
    vibe(30); // 短震动
    score++; scoreD.textContent = String(score); showHitFb(target);
    ci++; progC.textContent = String(ci);
    if (ci >= shuffled.length) setTimeout(endPractice, 400);
    else setTimeout(showTarget, 300);
  } else {
    vibe(200); // 长震动
    wrongClicks++;
    toast('点错了！', 1);
    showMissFb(tx, ty);
  }
});

/* --- area flash --- */
function flashArea(it) {
  const ns = 'http://www.w3.org/2000/svg';
  if (it.shape === 'polygon' && it.points?.length >= 3) {
    const p = document.createElementNS(ns, 'polygon');
    p.setAttribute('points', it.points.map(pt => `${pt.x}%,${pt.y}%`).join(' '));
    p.setAttribute('fill', 'rgba(99,102,241,.2)');
    p.setAttribute('stroke', 'var(--accent)'); p.setAttribute('stroke-width', '2');
    p.style.animation = 'flash-area .35s ease-out';
    fbSvg.appendChild(p); setTimeout(() => p.remove(), 400);
  } else {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', `${it.x}%`); c.setAttribute('cy', `${it.y}%`);
    c.setAttribute('r', `${it.radius ?? 6}%`);
    c.setAttribute('fill', 'rgba(99,102,241,.2)');
    c.setAttribute('stroke', 'var(--accent)'); c.setAttribute('stroke-width', '2');
    c.style.animation = 'flash-area .35s ease-out';
    fbSvg.appendChild(c); setTimeout(() => c.remove(), 400);
  }
}

function showHitFb(it) {
  const ns = 'http://www.w3.org/2000/svg';
  if (it.shape === 'polygon' && it.points?.length >= 3) {
    const p = document.createElementNS(ns, 'polygon');
    p.setAttribute('points', it.points.map(pt => `${pt.x}%,${pt.y}%`).join(' '));
    p.setAttribute('fill', 'rgba(34,197,94,.3)'); p.setAttribute('stroke', '#22c55e'); p.setAttribute('stroke-width','3');
    p.style.animation = 'pulse .4s ease-out'; fbSvg.appendChild(p); setTimeout(() => p.remove(), 500);
  } else {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', `${it.x}%`); c.setAttribute('cy', `${it.y}%`);
    c.setAttribute('r', String(it.radius ?? 6)); c.setAttribute('class','marker-hit');
    fbSvg.appendChild(c); setTimeout(() => c.remove(), 500);
  }
}
function showMissFb(x, y) {
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', `${x}%`); c.setAttribute('cy', `${y}%`);
  c.setAttribute('r','4'); c.setAttribute('class','marker-miss');
  fbSvg.appendChild(c); setTimeout(() => c.remove(), 500);
}

/* --- end --- */
function endPractice() {
  running = false; clearInterval(timer);
  hudT.classList.remove('warning','danger');
  const el = Math.round((Date.now()-startT)/1000);
  const miss = totalC - score;
  // 正确率 = 正确 / (总题目数 + 错误点击数)
  const denom = totalC + wrongClicks;
  const acc = denom > 0 ? Math.round((score / denom) * 100) : 0;
  rHits.textContent = String(score); rMiss.textContent = String(miss);
  rWrg.textContent = String(wrongClicks);
  rAcc.textContent = acc + '%'; rTime.textContent = el + 's';
  rIcon.textContent = acc === 100 ? '🏆' : acc >= 70 ? '🎯' : acc >= 40 ? '📚' : '💪';
  showView('result');
}

btnRetry.addEventListener('click', () => initPractice(sid));
btnRB.addEventListener('click', () => window.dispatchEvent(new CustomEvent('navigate',{detail:{view:'home'}})));
btnBack.addEventListener('click', () => { clearInterval(timer); running=false; window.dispatchEvent(new CustomEvent('navigate',{detail:{view:'home'}})); });

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' toast--error' : ''); t.classList.remove('hidden');
  clearTimeout(t._timeout); t._timeout = setTimeout(() => t.classList.add('hidden'), 2000);
}
