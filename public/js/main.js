/* 畫面切換、選單、設定、線上大廳 */
(function () {
'use strict';

/* ---------- 設定 ---------- */
const Settings = {
  data: { name: '', sound: true },
  load() {
    try {
      const raw = localStorage.getItem('bb_settings');
      if (raw) Object.assign(Settings.data, JSON.parse(raw));
    } catch (e) { /* 忽略 */ }
    if (!Settings.data.name) Settings.data.name = '玩家' + Math.floor(Math.random() * 900 + 100);
    Sound.setEnabled(Settings.data.sound);
  },
  save() {
    localStorage.setItem('bb_settings', JSON.stringify(Settings.data));
    Sound.setEnabled(Settings.data.sound);
  }
};

/* ---------- 畫面切換 ---------- */
const screens = ['screen-menu', 'screen-single', 'screen-online', 'screen-lobby', 'screen-settings', 'screen-game'];
function show(id) {
  for (const s of screens) document.getElementById(s).classList.toggle('hidden', s !== id);
}

const $ = id => document.getElementById(id);

/* ---------- 地圖選擇器（單機 + 房間共用） ---------- */
function buildMapPicker(container, onPick) {
  container.innerHTML = '';
  for (const m of Engine.MAPS) {
    const div = document.createElement('div');
    div.className = 'map-card';
    div.dataset.mapId = m.id;
    div.innerHTML = `<canvas width="90" height="78"></canvas><div>${m.name}</div>`;
    drawMapThumb(div.querySelector('canvas'), m);
    div.onclick = () => {
      container.querySelectorAll('.map-card').forEach(c => c.classList.remove('sel'));
      div.classList.add('sel');
      onPick(m.id);
    };
    container.appendChild(div);
  }
  container.querySelector('.map-card').classList.add('sel');
}

function drawMapThumb(cv, m) {
  const ctx = cv.getContext('2d');
  const tw = cv.width / Engine.COLS, th = cv.height / Engine.ROWS;
  for (let gy = 0; gy < Engine.ROWS; gy++) {
    for (let gx = 0; gx < Engine.COLS; gx++) {
      const c = m.rows[gy] ? m.rows[gy][gx] : '.';
      ctx.fillStyle = c === '#' ? m.theme.wall : c === 'B' ? m.theme.box :
        (gx + gy) % 2 ? m.theme.floor1 : m.theme.floor2;
      ctx.fillRect(gx * tw, gy * th, tw + 0.5, th + 0.5);
    }
  }
}

/* ---------- 單機模式 ---------- */
let singleMap = 0, singleBots = 3;
function initSingle() {
  buildMapPicker($('single-maps'), id => { singleMap = id; });
  document.querySelectorAll('#single-bots button').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#single-bots button').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      singleBots = +b.dataset.n;
    };
  });
  $('btn-single-start').onclick = () => {
    show('screen-game');
    GameView.startLocal(singleMap, singleBots, Settings.data.name);
  };
}

/* ---------- 線上模式 ---------- */
let myRoom = null;
let netBound = false;

async function enterOnline() {
  $('online-status').textContent = '連線中…';
  show('screen-online');
  try {
    await Net.connect(Settings.data.name);
    $('online-status').textContent = '';
    bindNet();
    Net.listRooms();
  } catch (err) {
    $('online-status').textContent = '⚠ ' + err.message;
  }
}

function bindNet() {
  if (netBound) return;
  netBound = true;
  Net.on('roomList', rooms => renderRooms(rooms));
  Net.on('roomUpdate', room => { myRoom = room; renderLobby(room); });
  Net.on('joinedRoom', room => { myRoom = room; show('screen-lobby'); renderLobby(room); });
  Net.on('leftRoom', () => { myRoom = null; show('screen-online'); Net.listRooms(); });
  Net.on('errorMsg', msg => alert(msg));
  Net.on('gameStart', snap => {
    show('screen-game');
    GameView.startNet(Net.myId, snap);
  });
  Net.on('gameState', snap => GameView.onNetState(snap));
  Net.on('backToLobby', room => {
    GameView.stop();
    myRoom = room;
    show('screen-lobby');
    renderLobby(room);
  });
}

function renderRooms(rooms) {
  const list = $('room-list');
  if (!rooms.length) {
    list.innerHTML = '<div class="empty">目前沒有房間，建立一個吧！</div>';
    return;
  }
  list.innerHTML = rooms.map(r => `
    <div class="room-row">
      <span>${escHtml(r.name)}</span>
      <span class="room-meta">${Engine.MAPS[r.mapId].name}・${r.count}/4 ${r.playing ? '・遊戲中' : ''}</span>
      <button data-id="${r.id}" ${r.count >= 4 || r.playing ? 'disabled' : ''}>加入</button>
    </div>`).join('');
  list.querySelectorAll('button').forEach(b => b.onclick = () => Net.joinRoom(b.dataset.id));
}

function renderLobby(room) {
  $('lobby-title').textContent = room.name;
  const me = room.players.find(p => p.id === Net.myId);
  const isHost = room.hostId === Net.myId;
  $('lobby-players').innerHTML = room.players.map(p => `
    <div class="lobby-p">
      <span class="dot" style="background:${Engine.COLORS[p.slot]}"></span>
      ${escHtml(p.name)}${p.id === room.hostId ? ' 👑' : ''}
      <span class="ready">${p.id === room.hostId ? '' : (p.ready ? '✅ 已準備' : '…等待中')}</span>
    </div>`).join('');
  $('lobby-map-name').textContent = Engine.MAPS[room.mapId].name;
  $('lobby-maps').style.display = isHost ? '' : 'none';
  if (isHost && !$('lobby-maps')._built) {
    $('lobby-maps')._built = true;
    buildMapPicker($('lobby-maps'), id => Net.setMap(id));
  }
  $('btn-ready').style.display = isHost ? 'none' : '';
  $('btn-ready').textContent = me && me.ready ? '取消準備' : '準備';
  $('btn-start').style.display = isHost ? '' : 'none';
  const allReady = room.players.every(p => p.id === room.hostId || p.ready);
  $('btn-start').disabled = !(room.players.length >= 2 && allReady);
  $('btn-start').textContent = room.players.length < 2 ? '至少需要 2 人' : (allReady ? '開始遊戲' : '等待玩家準備…');
}

/* ---------- 設定畫面 ---------- */
function initSettings() {
  $('set-name').value = Settings.data.name;
  $('set-sound').checked = Settings.data.sound;
  $('btn-settings-save').onclick = () => {
    const n = $('set-name').value.trim();
    if (n) Settings.data.name = n.slice(0, 10);
    Settings.data.sound = $('set-sound').checked;
    Settings.save();
    show('screen-menu');
  };
}

/* ---------- 初始化 ---------- */
window.addEventListener('DOMContentLoaded', () => {
  Settings.load();
  Controls.init();
  GameView.init();
  initSingle();
  initSettings();

  $('btn-menu-single').onclick = () => show('screen-single');
  $('btn-menu-online').onclick = enterOnline;
  $('btn-menu-settings').onclick = () => { initSettings(); show('screen-settings'); };
  document.querySelectorAll('.btn-back').forEach(b => b.onclick = () => {
    GameView.stop();
    show('screen-menu');
  });
  $('btn-refresh-rooms').onclick = () => Net.listRooms();
  $('btn-create-room').onclick = () => {
    const name = ($('new-room-name').value.trim() || Settings.data.name + ' 的房間').slice(0, 16);
    Net.createRoom(name, 0);
  };
  $('btn-ready').onclick = () => {
    const me = myRoom && myRoom.players.find(p => p.id === Net.myId);
    Net.setReady(!(me && me.ready));
  };
  $('btn-start').onclick = () => Net.startGame();
  $('btn-leave-room').onclick = () => Net.leaveRoom();

  // 結算畫面按鈕
  $('btn-rematch').onclick = () => {
    if (GameView.mode === 'local') {
      GameView.startLocal(singleMap, singleBots, Settings.data.name);
    }
  };
  $('btn-result-exit').onclick = () => {
    GameView.stop();
    if (GameView.mode === 'net' && myRoom) { show('screen-lobby'); }
    else show('screen-menu');
  };
});
})();
