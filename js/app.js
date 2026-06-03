/**
 * app.js v4 — 主控制器
 * 剪贴板导入导出、分组信息
 */

import { getScenes, deleteScene, exportSceneData, parseImportData, createSceneFromImport, compressImage } from './storage.js';
import { initEditor } from './editor.js';
import { initPractice } from './practice.js';

const $ = s => document.querySelector(s);

const home = $('#home-view'), editor = $('#editor-view'), practice = $('#practice-view');
const sList = $('#scene-list'), empty = $('#empty-state');
const dialog = $('#json-dialog'), dTitle = $('#json-dialog-title'), dText = $('#json-dialog-text');
const dAction = $('#json-dialog-action'), dCancel = $('#json-dialog-cancel');
let view = 'home';

function navigate(name, p = {}) {
  view = name;
  home.classList.toggle('hidden', name !== 'home');
  editor.classList.toggle('hidden', name !== 'editor');
  practice.classList.toggle('hidden', name !== 'practice');
  document.body.scrollTop = 0; document.documentElement.scrollTop = 0;
  if (name === 'home') render();
  else if (name === 'editor') initEditor(p.sceneId || null);
  else if (name === 'practice') initPractice(p.sceneId);
}

function render() {
  const scenes = getScenes(); sList.innerHTML = '';
  if (scenes.length === 0) { sList.classList.add('hidden'); empty.classList.remove('hidden'); return; }
  sList.classList.remove('hidden'); empty.classList.add('hidden');

  [...scenes].sort((a, b) => b.updatedAt - a.updatedAt).forEach(sc => {
    const card = document.createElement('div'); card.className = 'scene-card';

    const thumb = document.createElement('img'); thumb.className = 'scene-card-thumb';
    thumb.src = sc.imageDataUrl; thumb.alt = sc.name; thumb.loading = 'lazy';

    const info = document.createElement('div'); info.className = 'scene-card-info';
    const name = document.createElement('div'); name.className = 'scene-card-name'; name.textContent = sc.name || '未命名';
    const meta = document.createElement('div'); meta.className = 'scene-card-meta';
    let metaText = `${sc.items.length} 个物品 · ${fmt(sc.updatedAt)}`;
    if (sc.groups?.length > 0) metaText += ` · ${sc.groups.length} 分组`;
    if (sc.screenWidth && sc.screenHeight) metaText += ` · ${sc.screenWidth}×${sc.screenHeight}`;
    meta.textContent = metaText;
    info.append(name, meta);

    card.addEventListener('click', e => {
      if (e.target.closest('.scene-card-btn')) return;
      navigate('practice', { sceneId: sc.id });
    });

    const acts = document.createElement('div'); acts.className = 'scene-card-actions';
    const ed = document.createElement('button'); ed.className = 'scene-card-btn scene-card-btn--edit'; ed.textContent = '✎';
    ed.title = '编辑'; ed.addEventListener('click', e => { e.stopPropagation(); navigate('editor', { sceneId: sc.id }); });
    const ex = document.createElement('button'); ex.className = 'scene-card-btn scene-card-btn--export'; ex.textContent = '📤';
    ex.title = '导出数据'; ex.addEventListener('click', e => { e.stopPropagation(); doExport(sc); });
    const del = document.createElement('button'); del.className = 'scene-card-btn scene-card-btn--delete'; del.textContent = '🗑';
    del.title = '删除'; del.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`确定删除"${sc.name || '未命名'}"？`)) { deleteScene(sc.id); render(); toast('已删除'); }
    });
    acts.append(ed, ex, del);
    card.append(thumb, info, acts);
    sList.appendChild(card);
  });
}

/* ========================================
   导出 — 复制 JSON 文本
   ======================================== */

function doExport(sc) {
  const data = exportSceneData(sc);
  const json = JSON.stringify(data, null, 2);
  dTitle.textContent = `导出「${sc.name || '未命名'}」`;
  dText.value = json;
  dText.readOnly = true;
  dAction.textContent = '📋 复制到剪贴板';
  dAction.onclick = async () => {
    try {
      await navigator.clipboard.writeText(json);
      toast('已复制到剪贴板');
      closeDialog();
    } catch {
      // fallback: select all
      dText.select();
      document.execCommand('copy');
      toast('已复制到剪贴板');
      closeDialog();
    }
  };
  dCancel.textContent = '关闭';
  dCancel.onclick = closeDialog;
  dialog.classList.remove('hidden');
  // 等弹窗渲染完自动选中
  setTimeout(() => dText.select(), 100);
}

/* ========================================
   导入 — 粘贴 JSON 文本
   ======================================== */

function openImport() {
  dTitle.textContent = '导入场景 — 粘贴 JSON 数据';
  dText.value = '';
  dText.readOnly = false;
  dAction.textContent = '📥 导入';
  dAction.onclick = async () => {
    const text = dText.value.trim();
    if (!text) { toast('请先粘贴 JSON 数据', 1); return; }
    const { data, errors } = parseImportData(text);
    if (!data) { toast(errors[0] || '数据格式错误', 1); return; }
    toast('数据解析成功，请选择对应场景图片');

    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp';
    inp.addEventListener('change', async () => {
      const imgF = inp.files?.[0];
      if (!imgF) { toast('已取消导入', 1); closeDialog(); return; }
      try {
        const imgInfo = await compressImage(imgF);
        const sc = createSceneFromImport(data, imgInfo);
        const { saveScene } = await import('./storage.js');
        saveScene(sc); render();
        closeDialog();
        toast(`已导入「${data.name}」(${data.items.length} 个物品${data.groups?.length ? `，${data.groups.length} 个分组` : ''})`);
      } catch { toast('图片处理失败', 1); }
    });
    inp.click();
  };
  dCancel.textContent = '取消';
  dCancel.onclick = closeDialog;
  dialog.classList.remove('hidden');
  setTimeout(() => dText.focus(), 100);
}

function closeDialog() { dialog.classList.add('hidden'); }

/* --- import button --- */
$('#btn-import').addEventListener('click', openImport);

/* --- events --- */
window.addEventListener('navigate', e => {
  const { view, sceneId } = e.detail || {};
  if (view) navigate(view, { sceneId });
});
window.addEventListener('editor-saved', () => navigate('home'));
$('#btn-new-scene').addEventListener('click', () => navigate('editor'));

function fmt(ts) {
  const d = new Date(ts), now = new Date(), diff = now - d;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' toast--error' : ''); t.classList.remove('hidden');
  clearTimeout(t._timeout); t._timeout = setTimeout(() => t.classList.add('hidden'), 2500);
}

render();
