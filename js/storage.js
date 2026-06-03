/**
 * storage.js — 数据持久化层 v4
 * 支持分组、多边形点集、屏幕尺寸元数据
 */

const STORAGE_KEY = 'spot-practice-scenes';
const EXPORT_VERSION = 3;

/** @returns {import('./types').Scene[]} */
export function getScenes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function persist(scenes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes));
}

export function getScene(id) {
  return getScenes().find(s => s.id === id);
}

export function saveScene(scene) {
  const scenes = getScenes();
  const idx = scenes.findIndex(s => s.id === scene.id);
  const now = Date.now();
  const normalized = normalizeScene({ ...scene, updatedAt: now, createdAt: scene.createdAt || now });
  if (idx >= 0) scenes[idx] = normalized;
  else scenes.push(normalized);
  persist(scenes);
  return normalized;
}

export function deleteScene(id) {
  persist(getScenes().filter(s => s.id !== id));
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 补齐旧数据字段 */
function normalizeScene(scene) {
  return {
    ...scene,
    groups: Array.isArray(scene.groups) ? scene.groups.map(g => ({ ...g })) : [],
    items: (scene.items || []).map(it => ({
      id: it.id,
      name: it.name || '',
      shape: it.shape || 'circle',
      x: it.x,
      y: it.y,
      radius: it.radius ?? 6,
      points: it.points ? it.points.map(p => ({ ...p })) : [],
      groupId: it.groupId || null,
    })),
    screenWidth: scene.screenWidth || 0,
    screenHeight: scene.screenHeight || 0,
  };
}

export function compressImage(file, maxWidth = 1920) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;
        let drawW = w, drawH = h;
        if (w > maxWidth) { drawW = maxWidth; drawH = Math.round((h / w) * maxWidth); }
        const c = document.createElement('canvas');
        c.width = drawW; c.height = drawH;
        c.getContext('2d').drawImage(img, 0, 0, drawW, drawH);
        resolve({ dataUrl: c.toDataURL('image/jpeg', 0.85), width: drawW, height: drawH });
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/* --- 命中判定 --- */
export function hitTest(tx, ty, item) {
  if (item.shape === 'polygon' && item.points?.length >= 3) {
    return pointInPolygon(tx, ty, item.points);
  }
  const r = item.radius ?? 6;
  const dx = tx - (item.x ?? 0);
  const dy = ty - (item.y ?? 0);
  return Math.sqrt(dx * dx + dy * dy) <= r;
}

export function pointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/* --- 导出 --- */
export function exportSceneData(scene) {
  return {
    version: EXPORT_VERSION,
    name: scene.name,
    imageWidth: scene.imageWidth,
    imageHeight: scene.imageHeight,
    screenWidth: scene.screenWidth || 0,
    screenHeight: scene.screenHeight || 0,
    groups: (scene.groups || []).map(g => ({ id: g.id, name: g.name })),
    items: scene.items.map(it => {
      const base = { name: it.name, shape: it.shape || 'circle', groupId: it.groupId || null };
      if (it.shape === 'polygon') base.points = it.points?.map(p => ({ x: p.x, y: p.y })) || [];
      else { base.x = it.x; base.y = it.y; base.radius = it.radius ?? 6; }
      return base;
    }),
  };
}

export function parseImportData(jsonStr) {
  const errors = [];
  let data;
  try { data = JSON.parse(jsonStr); } catch { return { data: null, errors: ['JSON 解析失败'] }; }
  if (!data || ![1, 2, 3].includes(data.version)) errors.push('不支持的版本号');
  if (!data.name) errors.push('缺少场景名称');
  if (!Array.isArray(data.items) || data.items.length < 2) errors.push('至少需要 2 个物品');
  if (data.items) {
    for (let i = 0; i < data.items.length; i++) {
      const it = data.items[i];
      if (!it.name) { errors.push(`物品 #${i + 1} 缺少名称`); break; }
      if (it.shape === 'polygon') {
        if (!Array.isArray(it.points) || it.points.length < 3) { errors.push(`物品 #${i + 1} 多边形顶点不足`); break; }
      } else {
        if (typeof it.x !== 'number' || typeof it.y !== 'number') { errors.push(`物品 #${i + 1} 坐标异常`); break; }
      }
    }
  }
  return { data: errors.length === 0 ? data : null, errors };
}

export function createSceneFromImport(importData, imageInfo) {
  return normalizeScene({
    id: generateId(),
    name: importData.name,
    imageDataUrl: imageInfo.dataUrl,
    imageWidth: imageInfo.width,
    imageHeight: imageInfo.height,
    screenWidth: importData.screenWidth || 0,
    screenHeight: importData.screenHeight || 0,
    groups: (importData.groups || []).map(g => ({ id: g.id || generateId(), name: g.name })),
    items: importData.items.map(it => ({
      id: generateId(),
      name: it.name,
      shape: it.shape || 'circle',
      x: it.x, y: it.y,
      radius: it.radius ?? 6,
      points: (it.points || []).map(p => ({ x: p.x, y: p.y })),
      groupId: it.groupId || null,
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
