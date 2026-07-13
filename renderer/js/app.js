import Store, { RULES, SUPER_ADMIN, isCloud } from './store.js';
import { CONTROLS, PRESETS, buildGraph, renderSong } from './engine.js';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');

function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.4s'; }, 2200);
  setTimeout(() => t.remove(), 2700);
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function mask(k) { return k ? k.slice(0, 6) + '••••' + k.slice(-4) : ''; }
function fmtTime(t) { const d = new Date(t); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }

/* ===================== 路由 ===================== */
function route() {
  const h = location.hash.slice(1);
  if (h === 'admin-login') return renderAdminLogin();
  if (h === 'admin') {
    if (!Store.adminSession || !Store.adminSession()) { location.hash = 'admin-login'; return; }
    return renderAdminPanel();
  }
  if (h === 'main') {
    if (!Store.userSession || !Store.userSession()) { location.hash = 'login'; return; }
    return renderMain();
  }
  return renderUserLogin();
}
window.addEventListener('hashchange', route);

/* ===================== 用户登录（禁止展示结算规则）===================== */
function renderUserLogin() {
  app.innerHTML = `
  <div class="login-wrap">
    <div class="glass login-card">
      <div class="logo">纯金工坊</div>
      <div class="logo-sub">P U R E · G O L D · S T U D I O</div>
      <div class="field">
        <label>用户登录密钥</label>
        <input id="keyInput" placeholder="请输入密钥，例如 PJ-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false">
      </div>
      <div class="login-actions">
        <button class="btn primary" id="loginBtn">进 入 工 坊</button>
      </div>
      <div class="link-row">管理员？ <button class="link-btn" id="toAdmin">管理登录 →</button></div>
    </div>
  </div>`;
  const input = $('#keyInput'); input.focus();
  $('#loginBtn').onclick = async () => {
    const r = await Store.userLogin(input.value);
    if (!r.ok) { toast(r.msg, 'err'); return; }
    toast('登录成功', 'ok'); location.hash = 'main';
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') $('#loginBtn').click(); });
  $('#toAdmin').onclick = () => { location.hash = 'admin-login'; };
}

/* ===================== 管理登录 ===================== */
function renderAdminLogin() {
  app.innerHTML = `
  <div class="login-wrap">
    <div class="glass login-card">
      <div class="logo" style="font-size:24px">管 理 登 录</div>
      <div class="logo-sub">ADMIN ACCESS</div>
      <div class="field">
        <label>管理员账号（邮箱）</label>
        <input id="email" placeholder="如 ${esc(SUPER_ADMIN)}" autocomplete="off">
      </div>
      <div class="field">
        <label>密码</label>
        <input id="pwd" type="password" placeholder="请输入密码" autocomplete="off">
      </div>
      <div class="login-actions">
        <button class="btn primary" id="loginBtn">登 录 后 台</button>
      </div>
      <div class="link-row"><button class="link-btn" id="toUser">← 返回用户登录</button></div>
    </div>
  </div>`;
  $('#email').focus();
  $('#loginBtn').onclick = async () => {
    const r = await Store.adminLogin($('#email').value, $('#pwd').value);
    if (!r.ok) { toast(r.msg, 'err'); return; }
    toast('欢迎，' + (r.role === 'super' ? '超级管理员' : '管理员'), 'ok');
    location.hash = 'admin';
  };
  $('#toUser').onclick = () => { location.hash = 'login'; };
}

/* ===================== 管理后台（角色化）===================== */
function renderAdminPanel() {
  const me = Store.adminSession();
  const isSuper = me.role === 'super';
  app.innerHTML = `
  <div class="glass topbar">
    <div class="brand"><span class="dot"></span> 纯金工坊 · 管理登录</div>
    <div class="top-right">
      <span class="pill ${isSuper ? 'n' : 'r'}" style="padding:5px 12px">${isSuper ? '超级管理员' : '普通管理员'}</span>
      <span class="keytag">${esc(me.email)}</span>
      <button class="btn ghost sm" id="logoutBtn">退出</button>
    </div>
  </div>
  <div class="container">
    <div class="page-title">管理后台</div>
    <div class="page-sub">${isSuper ? '全部管控权限：新建管理员、管理所有用户密钥、充值' : '权限：仅可为用户密钥充值星币（每日上限 ' + RULES.DAILY_ADMIN_LIMIT + ' 星币）'}</div>
    <div id="dailyCard"></div>
    <div id="superCards"></div>
    <div class="glass card">
      <div class="page-title" style="font-size:16px; display:flex; justify-content:space-between; align-items:center">用户密钥列表 <button class="btn sm" id="expAllBtn">⬇ 导出全部流水</button></div>
      <div id="keyList"></div>
    </div>
  </div>`;
  $('#logoutBtn').onclick = () => { Store.adminLogout(); location.hash = 'admin-login'; };
  const expAllBtn = $('#expAllBtn'); if (expAllBtn) expAllBtn.onclick = exportAllLogs;

  if (isSuper) {
    $('#superCards').innerHTML = `
    <div class="glass card">
      <div class="page-title" style="font-size:15px">新建管理员账号（仅超级管理员）</div>
      <div class="grid cols3" style="align-items:end">
        <div class="field" style="margin:0"><label>管理员邮箱</label><input id="aEmail" placeholder="新管理员邮箱"></div>
        <div class="field" style="margin:0"><label>登录密码</label><input id="aPwd" type="password" placeholder="设置密码"></div>
        <div><button class="btn primary" id="createAdminBtn" style="width:100%">+ 创建普通管理员</button></div>
      </div>
    </div>
    <div class="glass card">
      <div class="grid cols3" style="align-items:end">
        <div class="field" style="margin:0"><label>新建用户密钥备注（可选）</label><input id="noteInput" placeholder="如：客户A"></div>
        <div><button class="btn gold" id="createKeyBtn" style="width:100%">+ 新建用户密钥（赠${RULES.GIFT_ON_CREATE}星币）</button></div>
        <div class="hint" style="margin:0">新密钥自动初始化赠送 ${RULES.GIFT_ON_CREATE} 星币。</div>
      </div>
    </div>`;
    $('#createAdminBtn').onclick = async () => {
      const r = await Store.createAdmin($('#aEmail').value, $('#aPwd').value);
      if (!r.ok) return toast(r.msg, 'err');
      toast('普通管理员创建成功', 'ok'); $('#aEmail').value = ''; $('#aPwd').value = '';
    };
    $('#createKeyBtn').onclick = async () => {
      const r = await Store.createUserKey($('#noteInput').value.trim());
      if (!r.ok) return toast(r.msg, 'err');
      showKeyModal(r.key); renderKeyList();
    };
  } else {
    // 普通管理员：展示今日剩余额度 + 按密钥充值面板
    Store.regularDaily().then(d => {
      if (!d) return;
      $('#dailyCard').innerHTML = `
      <div class="glass card" style="border-color:rgba(255,206,91,.4)">
        <div style="display:flex; justify-content:space-between; align-items:center">
          <div><div class="page-title" style="font-size:15px;margin:0">今日充值额度</div>
          <div class="hint" style="margin:2px 0 0">每日上限 ${RULES.DAILY_ADMIN_LIMIT} 星币，跨自然日自动重置</div></div>
          <div style="font-size:26px; font-weight:800; color:var(--gold)">剩余 <span id="leftNum">${d.left}</span> / ${RULES.DAILY_ADMIN_LIMIT}</div>
        </div>
      </div>
      <div class="glass card">
        <div class="page-title" style="font-size:15px;margin:0">为用户密钥充值星币</div>
        <div class="grid cols3" style="align-items:end; margin-top:10px">
          <div class="field" style="margin:0"><label>用户密钥</label><input id="rkKey" placeholder="粘贴用户密钥 PJ-..."></div>
          <div class="field" style="margin:0"><label>充值星币数量</label><input id="rkAmt" type="number" min="1" placeholder="如 100"></div>
          <div><button class="btn gold" id="rkBtn" style="width:100%">确认充值星币</button></div>
        </div>
      </div>`;
      $('#rkBtn').onclick = async () => {
        const r = await Store.recharge($('#rkKey').value, $('#rkAmt').value);
        if (!r.ok) { toast(r.msg, 'err'); return; }
        toast(`充值成功 · 星币 ★ ${r.stars}`, 'ok');
        $('#rkKey').value = ''; $('#rkAmt').value = '';
        if (r.left != null) { const n = $('#leftNum'); if (n) n.textContent = r.left; }
      };
    });
  }
  renderKeyList();
}

function renderKeyList() {
  Store.listKeys().then(list => {
    const me = Store.adminSession(); const isSuper = me.role === 'super';
    const el = $('#keyList');
    if (!list.length) { el.innerHTML = `<div class="empty">暂无用户密钥。</div>`; return; }
    el.innerHTML = `<table>
      <thead><tr><th>密钥</th><th>备注</th><th>星币余额</th><th>创建者</th><th>操作</th></tr></thead>
      <tbody>${list.map(k => `<tr>
        <td class="mono">${esc(k.key)}</td>
        <td>${esc(k.note || '-')}</td>
        <td class="stars-num">★ ${k.stars}</td>
        <td style="color:var(--muted)">${esc(k.createdBy || '-')}</td>
        <td>
          <button class="btn gold sm" data-recharge="${esc(k.key)}">充值星币</button>
          <button class="btn ghost sm" data-logs="${esc(k.key)}">流水</button>
          ${isSuper ? `<button class="btn danger sm" data-del="${esc(k.key)}">删除</button>` : ''}
        </td></tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('[data-recharge]').forEach(b => b.onclick = () => showRecharge(b.dataset.recharge));
    el.querySelectorAll('[data-logs]').forEach(b => b.onclick = () => showLogs(b.dataset.logs));
    if (isSuper) el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (confirm('确认删除该密钥？')) { const r = await Store.deleteKey(b.dataset.del); if (r.ok) { renderKeyList(); toast('已删除', 'ok'); } else toast(r.msg, 'err'); }
    });
  });
}

function showKeyModal(key) {
  const m = document.createElement('div'); m.className = 'mask';
  m.innerHTML = `<div class="glass modal">
    <h3>✅ 新用户密钥创建成功</h3>
    <div class="hint">已初始化赠送 ${RULES.GIFT_ON_CREATE} 星币，请复制交付给用户：</div>
    <div class="key-reveal">${esc(key)}</div>
    <div class="row" style="display:flex; gap:10px; justify-content:flex-end">
      <button class="btn" id="copyKey">复制</button><button class="btn primary" id="closeM">完成</button>
    </div></div>`;
  document.body.appendChild(m);
  $('#copyKey', m).onclick = () => { navigator.clipboard?.writeText(key); toast('已复制', 'ok'); };
  $('#closeM', m).onclick = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

function showRecharge(key) {
  const m = document.createElement('div'); m.className = 'mask';
  const me = Store.adminSession();
  m.innerHTML = `<div class="glass modal">
    <h3>充值星币</h3>
    <div class="hint">密钥 <span class="mono">${esc(mask(key))}</span> · 充值单位为【星币】，直接入账星币余额</div>
    <div class="field"><label>充值星币数量</label><input id="starInput" type="number" min="1" placeholder="如 100"></div>
    <div class="row" style="display:flex; gap:8px; margin-bottom:6px">${[100, 200, 300, 500].map(v => `<button class="btn sm" data-q="${v}">${v}</button>`).join('')}</div>
    <div class="row" style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px">
      <button class="btn ghost" id="cancelR">取消</button><button class="btn gold" id="doR">确认充值</button>
    </div></div>`;
  document.body.appendChild(m);
  const input = $('#starInput', m); input.focus();
  m.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { input.value = b.dataset.q; });
  $('#cancelR', m).onclick = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  $('#doR', m).onclick = async () => {
    const r = await Store.recharge(key, input.value);
    if (!r.ok) { toast(r.msg, 'err'); return; }
    toast(`充值成功 · 星币 ★ ${r.stars}`, 'ok');
    m.remove(); renderKeyList();
    if (me.role !== 'super' && r.left != null) { const n = $('#leftNum'); if (n) n.textContent = r.left; }
  };
}

function showLogs(key) {
  Store.logs(key).then(logs => {
    const m = document.createElement('div'); m.className = 'mask';
    m.innerHTML = `<div class="glass modal" style="max-width:520px">
      <h3>流水明细 <span class="mono" style="font-size:13px;color:var(--muted)">${esc(mask(key))}</span></h3>
      <div style="max-height:50vh; overflow:auto; margin-top:10px">
        ${logs.length ? `<table><tbody>${logs.map(l => `<tr>
          <td style="color:var(--muted); white-space:nowrap">${fmtTime(l.t)}</td>
          <td><span class="pill ${l.type === 'consume' ? 'c' : l.type === 'recharge' ? 'r' : 'n'}">${l.type === 'consume' ? '消费' : l.type === 'recharge' ? '充值' : '新建'}</span></td>
          <td>${esc(l.text)}</td>
          <td class="${l.delta < 0 ? '' : 'stars-num'}" style="text-align:right;${l.delta < 0 ? 'color:var(--red)' : ''}">${l.delta > 0 ? '+' : ''}${l.delta}</td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty">暂无流水</div>'}
      </div>
      <div class="row" style="display:flex; justify-content:flex-end; margin-top:14px"><button class="btn primary" id="closeL">关闭</button></div>
    </div>`;
    document.body.appendChild(m);
    $('#closeL', m).onclick = () => m.remove();
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  });
}

/* ===================== 流水导出（CSV）===================== */
function csvCell(s) { return '"' + String(s ?? '').replace(/"/g, '""') + '"'; }
function typeLabel(t) { return t === 'consume' ? '消费' : t === 'recharge' ? '充值' : t === 'convert' ? '兑换' : '新建'; }
function logsToRows(logs, keyPrefix) {
  return (logs || []).map(l => [
    csvCell(fmtTime(l.t)),
    csvCell(typeLabel(l.type)),
    csvCell(l.text),
    csvCell((l.delta > 0 ? '+' : '') + l.delta),
    keyPrefix ? csvCell(keyPrefix) : '',
  ].join(','));
}
function downloadCSV(filename, rows) {
  const csv = rows.join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function exportUserLogs(key) {
  const logs = await Store.userLogs(key);
  if (!logs.length) { toast('暂无流水可导出', 'err'); return; }
  downloadCSV('纯金工坊_流水_' + mask(key) + '.csv', logsToRows(logs));
  toast('流水已导出', 'ok');
}
async function exportAllLogs() {
  const list = await Store.listKeys();
  if (!list.length) { toast('暂无密钥数据', 'err'); return; }
  const rows = [];
  list.forEach(k => { (k.logs || []).forEach(l => rows.push([csvCell(k.key), csvCell(fmtTime(l.t)), csvCell(typeLabel(l.type)), csvCell(l.text), csvCell((l.delta > 0 ? '+' : '') + l.delta)].join(','))); });
  if (!rows.length) { toast('暂无流水可导出', 'err'); return; }
  const d = new Date().toISOString().slice(0, 10);
  downloadCSV('纯金工坊_全部流水_' + d + '.csv', rows);
  toast('全部流水已导出', 'ok');
}

/* ===================== 主界面：歌曲生成（扣费）===================== */
let audioCtx = null, currentBuffer = null, sourceNode = null, currentGraph = null, analyser = null, playing = false, rafId = null;
const inputs = {};

function renderMain() {
  const key = Store.userSession();
  app.innerHTML = `
  <div class="glass topbar">
    <div class="brand"><span class="dot"></span> 纯金工坊 · 歌曲生成</div>
    <div class="top-right">
      <span class="keytag mono">${esc(mask(key))}</span>
      <span class="coin-pill"><span class="star">★</span> <span id="balance">…</span> 星币</span>
      <button class="btn ghost sm" id="expBtn">导出流水</button>
      <button class="btn ghost sm" id="logoutBtn">退出登录</button>
    </div>
  </div>
  <div class="container">
    <div class="page-title">人声动态柔化 · 歌曲生成引擎</div>
    <div class="page-sub">载入素材 → 调整参数 → 生成歌曲 · 全程本地处理不上传</div>
    <div class="glass card">
      <div class="drop" id="drop">📂 点击或拖入音频素材<br><span class="hint">支持 MP3 / WAV / M4A</span></div>
      <div class="filename" id="fname"></div>
      <div class="row" style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap">
        <button class="btn" id="play" disabled>▶ 试听</button>
        <button class="btn" id="stop" disabled>■ 停止</button>
        <button class="btn primary" id="gen" disabled>🎵 生成歌曲（-${RULES.COST_PER_SONG} 星币）</button>
      </div>
      <canvas id="spectrum"></canvas>
    </div>
    <div class="glass card">
      <div class="presets">
        <button class="optimize" id="optBtn">⚡ 一键优化</button>
        <button class="preset" data-preset="sleep">睡前治愈</button>
        <button class="preset" data-preset="podcast">温暖播客</button>
        <button class="preset" data-preset="tape">复古磁带</button>
        <button class="preset" data-preset="space">空间感</button>
        <button class="preset" data-preset="clear">清澈咬字</button>
      </div>
      <div class="hint">默认即推荐值，可一键优化或自由拖动微调。</div>
      <div id="controls"></div>
    </div>
  </div>`;
  $('#logoutBtn').onclick = () => { stop(); Store.userLogout(); location.hash = 'login'; };
  $('#expBtn').onclick = () => exportUserLogs(key);
  Store.userInfo(key).then(i => { const b = $('#balance'); if (b) b.textContent = i.stars; });
  buildControls(); bindEngine();
}

function buildControls() {
  const wrap = $('#controls'); let lastGroup = '';
  CONTROLS.forEach(c => {
    if (c.group !== lastGroup) { const gt = document.createElement('div'); gt.className = 'group-title'; gt.textContent = c.group; wrap.appendChild(gt); lastGroup = c.group; }
    const d = document.createElement('div'); d.className = 'ctrl';
    d.innerHTML = `<div class="lab"><span>${c.name}</span><span class="val" id="v_${c.key}">${c.def} ${c.unit}</span></div>`;
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = c.min; inp.max = c.max; inp.value = c.def; inp.step = (c.max - c.min > 200 ? 1 : 0.1);
    inp.oninput = () => { $('#v_' + c.key).textContent = (+inp.value).toFixed(inp.step < 1 ? 1 : 0) + ' ' + c.unit; clearPreset(); if (playing) restart(); };
    d.appendChild(inp); wrap.appendChild(d); inputs[c.key] = inp;
  });
}
function getParams() { const p = {}; CONTROLS.forEach(c => p[c.key] = +inputs[c.key].value); return p; }
function applyPreset(o) { CONTROLS.forEach(c => { inputs[c.key].value = o[c.key]; $('#v_' + c.key).textContent = (+o[c.key]).toFixed(inputs[c.key].step < 1 ? 1 : 0) + ' ' + c.unit; }); }
function clearPreset() { document.querySelectorAll('.preset').forEach(b => b.classList.remove('active')); }

function bindEngine() {
  $('#optBtn').onclick = () => { applyPreset(PRESETS.recommend); clearPreset(); if (playing) restart(); };
  document.querySelectorAll('.preset').forEach(b => b.onclick = () => { applyPreset(PRESETS[b.dataset.preset]); clearPreset(); b.classList.add('active'); if (playing) restart(); });
  const drop = $('#drop');
  drop.onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'audio/*'; i.onchange = e => e.target.files[0] && loadFile(e.target.files[0]); i.click(); };
  drop.ondragover = e => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; };
  drop.ondragleave = () => drop.style.borderColor = '';
  drop.ondrop = e => { e.preventDefault(); drop.style.borderColor = ''; e.dataTransfer.files[0] && loadFile(e.dataTransfer.files[0]); };
  $('#play').onclick = play; $('#stop').onclick = stop; $('#gen').onclick = generate;
}

async function loadFile(f) {
  try {
    const arr = await f.arrayBuffer();
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    currentBuffer = await audioCtx.decodeAudioData(arr);
    $('#fname').textContent = '✓ 已载入：' + f.name + ' （' + currentBuffer.duration.toFixed(1) + 's）';
    ['play', 'stop', 'gen'].forEach(id => $('#' + id).disabled = false);
  } catch { toast('无法解码该音频文件', 'err'); }
}
function stop() {
  if (sourceNode) { try { sourceNode.stop(); } catch (e) {} sourceNode.disconnect(); }
  if (currentGraph) { currentGraph.stop(); currentGraph.output.disconnect(); }
  if (analyser) analyser.disconnect();
  currentGraph = null; sourceNode = null; playing = false; cancelAnimationFrame(rafId);
}
function restart() { stop(); play(); }
function play() {
  if (!currentBuffer) return; stop();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  sourceNode = audioCtx.createBufferSource(); sourceNode.buffer = currentBuffer;
  currentGraph = buildGraph(audioCtx, sourceNode, getParams());
  analyser = audioCtx.createAnalyser(); analyser.fftSize = 1024;
  currentGraph.output.connect(analyser); analyser.connect(audioCtx.destination);
  sourceNode.start(); playing = true; drawSpectrum();
}
function drawSpectrum() {
  if (!analyser) return;
  const cv = $('#spectrum'), cx = cv.getContext('2d'); cv.width = cv.clientWidth; cv.height = 80;
  const data = new Uint8Array(analyser.frequencyBinCount);
  const loop = () => { analyser.getByteFrequencyData(data); cx.clearRect(0, 0, cv.width, cv.height); const bw = cv.width / data.length;
    for (let i = 0; i < data.length; i++) { const h = (data[i] / 255) * cv.height; cx.fillStyle = 'hsl(' + (42 - i / data.length * 30) + ',80%,' + (55 + data[i] / 600 * 30) + '%)'; cx.fillRect(i * bw, cv.height - h, bw * 0.8, h); }
    rafId = requestAnimationFrame(loop); }; loop();
}

async function generate() {
  if (!currentBuffer) { toast('请先载入音频素材', 'err'); return; }
  const key = Store.userSession(); if (!key) { toast('登录已失效', 'err'); location.hash = 'login'; return; }
  const cur = await Store.userGetBalance(key);
  if (cur < RULES.COST_PER_SONG) { toast(`星币不足（需 ${RULES.COST_PER_SONG}，当前 ${cur}），请联系管理员充值`, 'err'); return; }
  const btn = $('#gen'); btn.disabled = true; const old = btn.textContent; btn.textContent = '生成中…';
  try {
    const blob = await renderSong(currentBuffer, getParams());
    const r = await Store.userCharge(key, RULES.COST_PER_SONG);
    if (!r.ok) { toast(r.msg, 'err'); return; }
    $('#balance').textContent = r.balance;
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = '纯金工坊_歌曲_' + Date.now() + '.wav'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast(`生成成功，已扣 ${r.cost} 星币，剩余 ★ ${r.balance}`, 'ok');
  } catch (e) { toast('生成失败：' + (e.message || e), 'err'); }
  finally { btn.disabled = false; btn.textContent = old; }
}

Store.rehydrate().then(route);
