/**
 * editor.js v4 — 编辑器
 * - 单击放置标记，长按拖拽调整点位
 * - 半透明区域 + 预览点击范围
 * - 圆形+多边形双模式
 * - 分组管理
 * - 屏幕尺寸显示 + 图片缩放
 */

import { compressImage, generateId, saveScene, getScene, hitTest } from './storage.js';

const DR = 6; // default radius

let scene = null, items = [], sceneId = null;
let editIdx = -1;       // 当前编辑的物品索引
let selVtx = -1;        // 多边形选中的顶点
let mode = 'place';     // 'place' | 'polygon' | 'preview'
let drawPts = [];       // 多边形绘制中的顶点
let preview = false;    // 预览模式
let zoom = 1;
let drawerOpen = false;

// long-press state


const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// DOM
const upArea = $('#upload-area'), fileIn = $('#file-input');
const ws = $('#editor-workspace'), img = $('#editor-image');
const svg = $('#markers-svg'), fbSvg = $('#editor-feedback');
const scr = $('#editor-scroll'), inner = $('#editor-image-inner');
const hint = $('#polygon-hint'), hintText = $('#polygon-hint-text');
const btnCancelPoly = $('#polygon-cancel'), btnFinishPoly = $('#polygon-finish');
const btnPolyUndo = $('#polygon-undo');
const pan = $('#edit-panel'), epName = $('#ep-name'), epRadius = $('#ep-radius');
const epRadiusVal = $('#ep-radius-val'), epRadiusRow = $('#ep-radius-row');
const epGroup = $('#ep-group'), epGroupNew = $('#ep-group-new');
const epConfirm = $('#ep-confirm'), epDelete = $('#ep-delete'), epCancel = $('#ep-cancel');
const draw = $('#editor-drawer'), dtog = $('#drawer-toggle'), dct = $('#drawer-content');
const dcount = $('#drawer-count'), ilist = $('#items-list');
const btnSave = $('#btn-editor-save'), btnBack = $('#btn-editor-back');
const btnPreview = $('#btn-preview'), modeToggle = $('#mode-toggle');
const screenInfo = $('#screen-info'), imgDims = $('#img-dims');
const ezOut = $('#btn-ez-out'), ezIn = $('#btn-ez-in'), ezReset = $('#btn-ez-reset'), ezLabel = $('#ez-level');
const grpDlg = $('#grp-dialog'), grpList = $('#grp-list'), grpNewName = $('#grp-new-name'), grpNewBtn = $('#grp-new-btn'), grpClose = $('#grp-close');
const grpMgr = $('#drawer-grp-mgr');

export function initEditor(id) {
  sceneId = id; mode = 'place'; drawPts = []; editIdx = -1; preview = false; zoom = 1; drawerOpen = false;
  applyMode(); closePanel(); closeDrawer(); updateZoomUI();

  if (id) {
    const s = getScene(id);
    if (s) {
      scene = s; items = s.items.map(it => ({ ...it }));
      showWorkspace(s.imageDataUrl);
      renderAll();
      updateSaveState();
      return;
    }
  }
  scene = null; items = [];
  upArea.classList.remove('hidden'); ws.classList.add('hidden');
  updateSaveState();
}

function showWorkspace(url) {
  upArea.classList.add('hidden'); ws.classList.remove('hidden');
  img.src = url; img.onload = () => { renderAll(); updateScreenInfo(); };
}

/* ========================================
   模式
   ======================================== */

function applyMode() {
  modeToggle.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  hint.classList.toggle('hidden', mode !== 'polygon');
  if (mode === 'polygon') updatePolyHint();
  btnPreview.textContent = preview ? '✕' : '👁';
  btnPreview.title = preview ? '退出预览' : '预览点击范围';
}

function updatePolyHint() {
  hintText.textContent = drawPts.length === 0
    ? '点击图片放置顶点（至少 3 个点围成一个区域）'
    : drawPts.length < 3
      ? `已放置 ${drawPts.length}/3+ 个顶点，继续点击添加`
      : `已放置 ${drawPts.length} 个顶点，点击起点闭合或点完成`;
  btnFinishPoly.classList.toggle('hidden', drawPts.length < 3);
  btnPolyUndo.classList.toggle('hidden', drawPts.length === 0);
}

modeToggle.addEventListener('click', e => {
  const b = e.target.closest('.mode-btn'); if (!b) return;
  if (preview) exitPreview();
  mode = b.dataset.mode; drawPts = []; closePanel(); applyMode(); renderAll();
});

btnPreview.addEventListener('click', () => {
  if (items.length < 1) { toast('请先添加物品', 1); return; }
  preview = !preview;
  if (preview) { closePanel(); drawPts = []; }
  applyMode(); renderAll();
});

/* ========================================
   图片上传
   ======================================== */

upArea.addEventListener('click', () => fileIn.click());
fileIn.addEventListener('change', async () => {
  const f = fileIn.files?.[0]; if (!f) return;
  try {
    const { dataUrl, width, height } = await compressImage(f);
    scene = {
      id: generateId(), name: f.name.replace(/\.[^.]+$/, ''),
      imageDataUrl: dataUrl, imageWidth: width, imageHeight: height,
      items: [], groups: [], createdAt: Date.now(), updatedAt: Date.now(),
      screenWidth: window.innerWidth, screenHeight: window.innerHeight,
    };
    items = [];
    showWorkspace(dataUrl); renderAll();
  } catch { toast('图片处理失败', 1); }
  fileIn.value = '';
});

/* ========================================
   图片交互：点击放置 + 选中后拖拽调整
   ======================================== */

let isDragging = false;

function getImgPct(e) {
  const r = img.getBoundingClientRect();
  return {
    x: Math.round(((e.clientX - r.left) / r.width) * 10000) / 100,
    y: Math.round(((e.clientY - r.top) / r.height) * 10000) / 100,
  };
}

function findHit(x, y) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.shape === 'polygon' && it.points?.length >= 3) {
      if (ptInPoly(x, y, it.points)) return i;
    } else {
      const r = it.radius ?? DR;
      if (Math.sqrt((x - (it.x ?? 0)) ** 2 + (y - (it.y ?? 0)) ** 2) <= r + 2) return i;
    }
  }
  return -1;
}

function ptInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// pointerdown: 开始拖拽检测
scr.addEventListener('pointerdown', e => {
  if (preview || !scene || e.target.closest('#polygon-hint') || e.target.closest('#edit-panel')) return;
  const pt = getImgPct(e);
  const hit = findHit(pt.x, pt.y);
  // 如果面板已打开，且点到了选中的标记 → 进入拖拽模式
  if (editIdx >= 0 && hit === editIdx) {
    isDragging = true;
    e.preventDefault();
    scr.setPointerCapture(e.pointerId);
    return;
  }
});

// pointermove: 拖拽移动标记
scr.addEventListener('pointermove', e => {
  if (!isDragging || editIdx < 0) return;
  const pt = getImgPct(e);
  const it = items[editIdx];
  if (it.shape === 'circle') { it.x = pt.x; it.y = pt.y; }
  else if (it.points?.length >= 3) {
    // 整体移动多边形
    const cx = it.points.reduce((s, p) => s + p.x, 0) / it.points.length;
    const cy = it.points.reduce((s, p) => s + p.y, 0) / it.points.length;
    const dx = pt.x - cx, dy = pt.y - cy;
    it.points.forEach(p => { p.x += dx; p.y += dy; });
  }
  renderMarkers();
});

// pointerup: 结束拖拽
scr.addEventListener('pointerup', e => {
  if (isDragging) {
    isDragging = false;
    scr.releasePointerCapture(e.pointerId);
    updatePanel();
    renderAll();
    return;
  }
});
scr.addEventListener('pointercancel', e => {
  if (isDragging) { isDragging = false; scr.releasePointerCapture(e.pointerId); }
});

// click: 放置 / 选中
scr.addEventListener('click', e => {
  if (isDragging) { isDragging = false; return; } // 拖拽结束，跳过 click
  if (e.target.closest('#polygon-hint') || e.target.closest('#target-bar') || e.target.closest('#edit-panel')) return;
  if (!scene) return; if (preview) { handlePreviewClick(e); return; }
  const pt = getImgPct(e);

  if (mode === 'polygon') {
    const vi = findVtx(pt.x, pt.y);
    if (vi === 0 && drawPts.length >= 3) { finishPolygon(); return; }
    if (vi > 0) { selVtx = vi; renderAll(); return; }
    if (drawPts.some(p => dist(p, pt) < 2)) { renderAll(); return; }
    drawPts.push(pt);
    updatePolyHint();
    renderAll(); return;
  }

  // place mode: 选中已有或新建
  const hit = findHit(pt.x, pt.y);
  if (hit >= 0) {
    selectItem(hit); return;
  }
  items.push({ id: generateId(), name: '', shape: 'circle', x: pt.x, y: pt.y, radius: DR, points: [], groupId: null });
  selectItem(items.length - 1);
  renderAll();
  updateSaveState();
});

function findVtx(x, y) {
  for (let i = 0; i < drawPts.length; i++) {
    if (dist({ x, y }, drawPts[i]) < 3) return i;
  }
  return -1;
}
function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }

function selectItem(idx) {
  editIdx = idx; selVtx = -1;
  openPanel(items[idx]);
  renderAll();
}

// 多边形双击闭合
scr.addEventListener('dblclick', e => {
  if (mode !== 'polygon' || drawPts.length < 3) return;
  e.preventDefault(); finishPolygon();
});
}

// 多边形双击闭合
scr.addEventListener('dblclick', e => {
  if (mode !== 'polygon' || drawPts.length < 3) return;
  e.preventDefault(); finishPolygon();
});

btnFinishPoly.addEventListener('click', () => {
  if (drawPts.length >= 3) finishPolygon();
});

btnPolyUndo.addEventListener('click', () => {
  if (drawPts.length > 0) { drawPts.pop(); updatePolyHint(); renderAll(); }
});

function finishPolygon() {
  if (drawPts.length < 3) return;
  items.push({ id: generateId(), name: '', shape: 'polygon', x: 0, y: 0, radius: DR, points: [...drawPts], groupId: null });
  selectItem(items.length - 1);
  drawPts = []; hint.classList.add('hidden'); btnFinishPoly.classList.add('hidden');
  renderAll(); updateSaveState();
}

btnCancelPoly.addEventListener('click', () => { drawPts = []; hint.classList.add('hidden'); btnFinishPoly.classList.add('hidden'); renderAll(); });

/* ========================================
   预览模式
   ======================================== */

function handlePreviewClick(e) {
  const pt = getImgPct(e);
  let hit = false;
  for (const it of items) {
    if (hitTest(pt.x, pt.y, it)) { hit = true; showFb(it, 'hit'); break; }
  }
  if (!hit) showFbPoint(pt.x, pt.y, 'miss');
}

function showFb(item, type) {
  const ns = 'http://www.w3.org/2000/svg';
  if (item.shape === 'polygon' && item.points?.length >= 3) {
    const p = document.createElementNS(ns, 'polygon');
    p.setAttribute('points', item.points.map(pt => `${pt.x}%,${pt.y}%`).join(' '));
    p.style.fill = type === 'hit' ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.15)';
    p.style.stroke = type === 'hit' ? '#22c55e' : '#ef4444';
    p.style.strokeWidth = '3';
    fbSvg.appendChild(p); setTimeout(() => p.remove(), 500);
  } else {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', `${item.x}%`); c.setAttribute('cy', `${item.y}%`);
    c.setAttribute('r', String(item.radius ?? 6));
    c.setAttribute('class', type === 'hit' ? 'marker-hit' : 'marker-miss');
    fbSvg.appendChild(c); setTimeout(() => c.remove(), 500);
  }
}

function showFbPoint(x, y, type) {
  const ns = 'http://www.w3.org/2000/svg';
  const c = document.createElementNS(ns, 'circle');
  c.setAttribute('cx', `${x}%`); c.setAttribute('cy', `${y}%`);
  c.setAttribute('r', '4'); c.setAttribute('class', type === 'hit' ? 'marker-hit' : 'marker-miss');
  fbSvg.appendChild(c); setTimeout(() => c.remove(), 500);
}

function exitPreview() { preview = false; applyMode(); fbSvg.innerHTML = ''; }

/* ========================================
   底部编辑面板
   ======================================== */

function openPanel(it) {
  pan.classList.remove('hidden');
  epName.value = it.name || '';
  epRadius.value = String(it.radius ?? DR);
  epRadiusVal.textContent = radiusLabel(it.radius ?? DR);
  epRadiusRow.classList.toggle('hidden', it.shape === 'polygon');
  renderGroupSelect(it.groupId);
  epName.focus();
  scr.scrollTop = scr.scrollHeight; // 确保面板可见
}

function closePanel() { pan.classList.add('hidden'); editIdx = -1; renderAll(); }

function updatePanel() {
  if (editIdx < 0) return;
  const it = items[editIdx];
  epName.value = it.name || '';
  epRadius.value = String(it.radius ?? DR);
  epRadiusVal.textContent = radiusLabel(it.radius ?? DR);
  renderGroupSelect(it.groupId);
}

function radiusLabel(v) {
  const m = { 2:'指尖', 4:'指腹', 6:'硬币', 8:'鸡蛋', 10:'巴掌', 12:'大碗', 15:'餐盘', 20:'脸盆' };
  return m[Math.round(v)] || v + '%';
}

epRadius.addEventListener('input', () => {
  const v = Number(epRadius.value);
  epRadiusVal.textContent = radiusLabel(v);
  if (editIdx >= 0) { items[editIdx].radius = v; renderMarkers(); }
});

epConfirm.addEventListener('click', () => {
  if (editIdx < 0) return;
  const name = epName.value.trim();
  if (!name) { toast('请输入物品名称', 1); epName.focus(); return; }
  items[editIdx].name = name;
  items[editIdx].groupId = epGroup.value || null;
  updateSaveState();
  closePanel(); renderAll();
});

epDelete.addEventListener('click', () => {
  if (editIdx < 0) return;
  items.splice(editIdx, 1); closePanel(); renderAll(); updateSaveState();
});

epCancel.addEventListener('click', closePanel);

epName.addEventListener('keydown', e => { if (e.key === 'Enter') epConfirm.click(); });

/* ========================================
   分组
   ======================================== */

function renderGroupSelect(sel) {
  epGroup.innerHTML = '<option value="">无分组</option>';
  (scene?.groups || []).forEach(g => {
    const o = document.createElement('option');
    o.value = g.id; o.textContent = g.name;
    if (g.id === sel) o.selected = true;
    epGroup.appendChild(o);
  });
}

epGroupNew.addEventListener('click', () => {
  grpDlg.classList.remove('hidden');
});

grpNewBtn.addEventListener('click', () => {
  const name = grpNewName.value.trim();
  if (!name) return;
  if (!scene.groups) scene.groups = [];
  scene.groups.push({ id: generateId(), name });
  grpNewName.value = '';
  renderGroupsDlg(); renderGroupSelect();
  toast(`已创建分组"${name}"`);
});

grpClose.addEventListener('click', () => grpDlg.classList.add('hidden'));

function renderGroupsDlg() {
  grpList.innerHTML = '';
  (scene?.groups || []).forEach((g, i) => {
    const li = document.createElement('li'); li.className = 'grp-item';
    const n = document.createElement('span'); n.className = 'grp-item-name'; n.textContent = g.name;
    const d = document.createElement('button'); d.className = 'grp-item-del'; d.textContent = '✕';
    d.addEventListener('click', () => {
      scene.groups.splice(i, 1);
      items.forEach(it => { if (it.groupId === g.id) it.groupId = null; });
      renderGroupsDlg(); renderGroupSelect(); renderAll();
    });
    li.appendChild(n); li.appendChild(d); grpList.appendChild(li);
  });
}

grpMgr.addEventListener('click', () => {
  drawerOpen = true; draw.classList.add('editor-drawer--open');
  renderGroupsDlg(); grpDlg.classList.remove('hidden');
});

/* ========================================
   SVG 渲染
   ======================================== */

function renderAll() { renderMarkers(); renderDrawer(); }

function renderMarkers() {
  svg.innerHTML = ''; fbSvg.innerHTML = '';

  if (preview) {
    // 预览模式下不显示标记，只显示淡化的范围圈
    items.forEach(it => {
      const ns = 'http://www.w3.org/2000/svg';
      if (it.shape === 'polygon' && it.points?.length >= 3) {
        const p = document.createElementNS(ns, 'polygon');
        p.setAttribute('points', it.points.map(pt => `${pt.x}%,${pt.y}%`).join(' '));
        p.setAttribute('class', 'marker-area--preview');
        svg.appendChild(p);
      } else {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', `${it.x}%`); c.setAttribute('cy', `${it.y}%`);
        c.setAttribute('r', `${it.radius ?? 6}%`);
        c.setAttribute('class', 'marker-area--preview');
        svg.appendChild(c);
      }
    });
    return;
  }

  // 已确认的物品
  items.forEach((it, idx) => {
    const sel = idx === editIdx;
    const ns = 'http://www.w3.org/2000/svg';
    if (it.shape === 'polygon' && it.points?.length >= 3) {
      const p = document.createElementNS(ns, 'polygon');
      p.setAttribute('points', it.points.map(pt => `${pt.x}%,${pt.y}%`).join(' '));
      p.setAttribute('class', sel ? 'marker-pg--sel' : 'marker-pg');
      svg.appendChild(p);
      // label
      const cx = it.points.reduce((s, p) => s + p.x, 0) / it.points.length;
      const cy = it.points.reduce((s, p) => s + p.y, 0) / it.points.length;
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', `${cx}%`); t.setAttribute('y', `${cy}%`);
      t.setAttribute('class', 'marker-label'); t.textContent = String(idx + 1);
      svg.appendChild(t);
    } else {
      const g = document.createElementNS(ns, 'g');
      const a = document.createElementNS(ns, 'circle');
      a.setAttribute('cx', `${it.x}%`); a.setAttribute('cy', `${it.y}%`);
      a.setAttribute('r', `${it.radius ?? DR}%`);
      a.setAttribute('class', sel ? 'marker-area--sel' : 'marker-area');
      const d = document.createElementNS(ns, 'circle');
      d.setAttribute('cx', `${it.x}%`); d.setAttribute('cy', `${it.y}%`);
      d.setAttribute('r', sel ? '10' : '7');
      d.setAttribute('class', sel ? 'marker-dot--sel' : 'marker-dot');
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', `${it.x}%`); t.setAttribute('y', `${it.y}%`);
      t.setAttribute('class', 'marker-label'); t.textContent = String(idx + 1);
      g.append(a, d, t); svg.appendChild(g);
    }
  });

  // 绘制中的多边形
  if (drawPts.length > 0) {
    const ns = 'http://www.w3.org/2000/svg';
    if (drawPts.length >= 2) {
      const p = document.createElementNS(ns, 'polygon');
      p.setAttribute('points', drawPts.map(pt => `${pt.x}%,${pt.y}%`).join(' '));
      p.setAttribute('class', 'marker-pg--draw');
      svg.appendChild(p);
    }
    drawPts.forEach((pt, i) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', `${pt.x}%`); c.setAttribute('cy', `${pt.y}%`);
      c.setAttribute('r', i === selVtx ? '7' : '5');
      c.setAttribute('class', i === selVtx ? 'marker-vtx--sel' : 'marker-vtx');
      svg.appendChild(c);
    });
  }
}

/* ========================================
   抽屉
   ======================================== */

function renderDrawer() {
  ilist.innerHTML = ''; dcount.textContent = String(items.length);
  if (!items.length) { ilist.innerHTML = '<li style="padding:10px;text-align:center;font-size:.75rem;color:var(--text-dim)">点击图片添加物品</li>'; return; }

  // 按分组显示
  const grpMap = {};
  (scene?.groups || []).forEach(g => grpMap[g.id] = g.name);
  const ungrouped = items.filter(it => !it.groupId);
  const grouped = {};
  items.forEach(it => { if (it.groupId) { if (!grouped[it.groupId]) grouped[it.groupId] = []; grouped[it.groupId].push(it); } });

  // 有分组的分组名
  Object.keys(grouped).forEach(gid => {
    const grp = scene?.groups.find(g => g.id === gid);
    if (grp) {
      const h = document.createElement('li');
      h.style.cssText = 'font-size:.68rem;color:var(--text-dim);padding:4px 0 2px;margin-top:4px;border-top:1px solid var(--border)';
      h.textContent = grp.name; ilist.appendChild(h);
    }
    grouped[gid].forEach(it => appendDrawerItem(it));
  });
  // 无分组的
  if (ungrouped.length > 0 && Object.keys(grouped).length > 0) {
    const h = document.createElement('li');
    h.style.cssText = 'font-size:.68rem;color:var(--text-dim);padding:4px 0 2px;margin-top:4px;border-top:1px solid var(--border)';
    h.textContent = '未分组'; ilist.appendChild(h);
  }
  ungrouped.forEach(it => appendDrawerItem(it));

  function appendDrawerItem(it) {
    const idx = items.indexOf(it);
    const li = document.createElement('li'); li.className = 'drawer-item';
    if (idx === editIdx) li.classList.add('drawer-item--sel');

    const num = document.createElement('span'); num.className = 'di-num'; num.textContent = String(idx + 1);
    const name = document.createElement('span'); name.className = 'di-name'; name.textContent = it.name || '未命名';
    const shape = document.createElement('span'); shape.className = 'di-shape'; shape.textContent = it.shape === 'polygon' ? '⬠' : '⊙';
    const del = document.createElement('button'); del.className = 'di-del'; del.textContent = '✕';
    del.addEventListener('click', e => { e.stopPropagation(); items.splice(idx, 1); if (editIdx === idx) closePanel(); renderAll(); updateSaveState(); });
    li.addEventListener('click', () => { selectItem(idx); });
    li.append(num, name, shape, del); ilist.appendChild(li);
  }
}

dtog.addEventListener('click', () => {
  drawerOpen = !drawerOpen; draw.classList.toggle('editor-drawer--open', drawerOpen);
});
function closeDrawer() { drawerOpen = false; draw.classList.remove('editor-drawer--open'); }

/* ========================================
   缩放（编辑器）
   ======================================== */

function setZoom(v) { zoom = Math.max(.5, Math.min(3, v)); inner.style.width = `${zoom * 100}%`; updateZoomUI(); }
function updateZoomUI() { ezLabel.textContent = Math.round(zoom * 100) + '%'; }
ezOut.addEventListener('click', () => setZoom(zoom - .25));
ezIn.addEventListener('click', () => setZoom(zoom + .25));
ezReset.addEventListener('click', () => { setZoom(1); scr.scrollTop = 0; scr.scrollLeft = 0; });

/* ========================================
   屏幕信息
   ======================================== */

function updateScreenInfo() {
  const sw = window.innerWidth, sh = window.innerHeight;
  const iw = scene?.imageWidth || img.naturalWidth, ih = scene?.imageHeight || img.naturalHeight;
  screenInfo.textContent = `📱 ${sw}×${sh}  ·  🖼 ${iw}×${ih}`;
  imgDims.textContent = `${iw}×${ih}`;
}
window.addEventListener('resize', updateScreenInfo);

/* ========================================
   保存
   ======================================== */

function updateSaveState() {
  const ok = !!scene?.imageDataUrl && items.length >= 2 && items.every(it => it.name?.trim());
  btnSave.disabled = !ok;
}

btnSave.addEventListener('click', () => {
  if (!scene) return;
  if (items.length < 2) { toast('至少需要 2 个物品', 1); return; }
  const u = items.find(it => !it.name?.trim());
  if (u) { toast('请为所有物品命名', 1); return; }
  const sc = { ...scene, items: items.map(it => ({ ...it })), screenWidth: window.innerWidth, screenHeight: window.innerHeight };
  saveScene(sc);
  toast('保存成功');
  window.dispatchEvent(new CustomEvent('editor-saved'));
});

btnBack.addEventListener('click', () => { closePanel(); window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'home' } })); });

/* --- toast --- */
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' toast--error' : ''); t.classList.remove('hidden');
  clearTimeout(t._timeout); t._timeout = setTimeout(() => t.classList.add('hidden'), 2000);
}
