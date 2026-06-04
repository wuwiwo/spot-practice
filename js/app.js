/**
 * app.js v4
 */
import { getScenes, deleteScene, exportSceneData, parseImportData, createSceneFromImport, compressImage, saveScene } from './storage.js';
import { initEditor } from './editor.js';
import { initPractice } from './practice.js';

var $ = function(s) { return document.querySelector(s); };

var home = $('#home-view'), editor = $('#editor-view'), practice = $('#practice-view');
var sList = $('#scene-list'), empty = $('#empty-state');
var dialog = $('#json-dialog'), dTitle = $('#json-dialog-title');
var dText = $('#json-dialog-text'), dAction = $('#json-dialog-action'), dCancel = $('#json-dialog-cancel');

function navigate(name, p) {
  p = p || {};
  home.classList.toggle('hidden', name !== 'home');
  editor.classList.toggle('hidden', name !== 'editor');
  practice.classList.toggle('hidden', name !== 'practice');
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  if (name === 'home') render();
  else if (name === 'editor') initEditor(p.sceneId || null);
  else if (name === 'practice') initPractice(p.sceneId);
}

function render() {
  var scenes = getScenes();
  sList.innerHTML = '';
  if (scenes.length === 0) {
    sList.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  sList.classList.remove('hidden');
  empty.classList.add('hidden');
  scenes.sort(function(a,b) { return b.updatedAt - a.updatedAt; });
  scenes.forEach(function(sc) {
    var card = document.createElement('div');
    card.className = 'scene-card';

    var thumb = document.createElement('img');
    thumb.className = 'scene-card-thumb';
    thumb.src = sc.imageDataUrl;
    thumb.alt = sc.name;
    thumb.loading = 'lazy';

    var info = document.createElement('div');
    info.className = 'scene-card-info';
    var nameEl = document.createElement('div');
    nameEl.className = 'scene-card-name';
    nameEl.textContent = sc.name || '(unnamed)';
    var meta = document.createElement('div');
    meta.className = 'scene-card-meta';
    var mt = sc.items.length + ' \u4e2a\u7269\u54c1';
    if (sc.groups && sc.groups.length > 0) mt += ' \u00b7 ' + sc.groups.length + ' \u5206\u7ec4';
    meta.textContent = mt;
    info.appendChild(nameEl);
    info.appendChild(meta);

    card.addEventListener('click', function(e) {
      if (e.target.closest('.scene-card-btn')) return;
      navigate('practice', { sceneId: sc.id });
    });

    var acts = document.createElement('div');
    acts.className = 'scene-card-actions';

    var ed = document.createElement('button');
    ed.className = 'scene-card-btn scene-card-btn--edit';
    ed.textContent = '\u270e';
    ed.title = '\u7f16\u8f91';
    ed.addEventListener('click', function(e) { e.stopPropagation(); navigate('editor', { sceneId: sc.id }); });

    var ex = document.createElement('button');
    ex.className = 'scene-card-btn scene-card-btn--export';
    ex.textContent = '\ud83d\udce4';
    ex.title = '\u5bfc\u51fa';
    ex.addEventListener('click', function(e) { e.stopPropagation(); doExport(sc); });

    var del = document.createElement('button');
    del.className = 'scene-card-btn scene-card-btn--delete';
    del.textContent = '\ud83d\uddd1';
    del.title = '\u5220\u9664';
    del.addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm('\u786e\u5b9a\u5220\u9664' + (sc.name || '') + '\uff1f')) {
        deleteScene(sc.id); render();
      }
    });

    acts.appendChild(ed);
    acts.appendChild(ex);
    acts.appendChild(del);
    card.appendChild(thumb);
    card.appendChild(info);
    card.appendChild(acts);
    sList.appendChild(card);
  });
}

function doExport(sc) {
  var data = exportSceneData(sc);
  dTitle.textContent = '\u5bfc\u51fa\u300c' + (sc.name || '') + '\u300d';
  dText.value = JSON.stringify(data, null, 2);
  dText.readOnly = true;
  dAction.textContent = '\u590d\u5236';
  dAction.onclick = function() {
    navigator.clipboard.writeText(dText.value).then(function() {
      closeDialog();
    })['catch'](function() {
      dText.select();
      document.execCommand('copy');
      closeDialog();
    });
  };
  dCancel.textContent = '\u5173\u95ed';
  dCancel.onclick = closeDialog;
  dialog.classList.remove('hidden');
}

function openImport() {
  dTitle.textContent = '\u7c98\u8d34 JSON \u6570\u636e';
  dText.value = '';
  dText.readOnly = false;
  dAction.textContent = '\u5bfc\u5165';
  dAction.onclick = function() {
    var text = dText.value.trim();
    if (!text) return;
    var result = parseImportData(text);
    if (!result.data) return;
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/jpeg,image/png,image/webp';
    inp.addEventListener('change', function() {
      var file = inp.files ? inp.files[0] : null;
      if (!file) return;
      compressImage(file).then(function(imgInfo) {
        var sc = createSceneFromImport(result.data, imgInfo);
        saveScene(sc);
        render();
        closeDialog();
      });
    });
    inp.click();
  };
  dCancel.textContent = '\u53d6\u6d88';
  dCancel.onclick = closeDialog;
  dialog.classList.remove('hidden');
}

function closeDialog() {
  dialog.classList.add('hidden');
}

$('#btn-import').addEventListener('click', openImport);
$('#btn-new-scene').addEventListener('click', function() { navigate('editor'); });

window.addEventListener('navigate', function(e) {
  var d = e.detail || {};
  if (d.view) navigate(d.view, { sceneId: d.sceneId });
});
window.addEventListener('editor-saved', function() { navigate('home'); });

render();
