/* 爆爆水球大作戰 - 多人對戰伺服器 */
'use strict';
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Engine = require('../public/js/engine.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
const TICK = 1 / 30;        // 遊戲邏輯 30Hz
const SNAP_EVERY = 2;       // 每 2 tick 廣播一次（15Hz）

const rooms = new Map();    // id -> room
let roomSeq = 1;

function roomSummary(r) {
  return { id: r.id, name: r.name, mapId: r.mapId, count: r.players.length, playing: r.state === 'playing' };
}

function broadcastRoomList() {
  const list = [...rooms.values()].map(roomSummary);
  io.emit('roomList', list);
}

function roomDetail(r) {
  return {
    id: r.id, name: r.name, hostId: r.hostId, mapId: r.mapId,
    players: r.players.map((p, i) => ({ id: p.id, name: p.name, ready: p.ready, slot: i }))
  };
}

function pushRoom(r) {
  for (const p of r.players) io.to(p.id).emit('roomUpdate', roomDetail(r));
}

function leaveRoom(socket) {
  const r = [...rooms.values()].find(x => x.players.some(p => p.id === socket.id));
  if (!r) return;
  r.players = r.players.filter(p => p.id !== socket.id);
  if (r.game) {
    const gp = r.game.player(socket.id);
    if (gp && gp.alive) { gp.alive = false; gp.trapped = false; }
  }
  socket.emit('leftRoom');
  if (!r.players.length) {
    stopGame(r);
    rooms.delete(r.id);
  } else {
    if (r.hostId === socket.id) {
      r.hostId = r.players[0].id;
      r.players[0].ready = false;
    }
    pushRoom(r);
  }
  broadcastRoomList();
}

function stopGame(r) {
  if (r.interval) { clearInterval(r.interval); r.interval = null; }
  r.game = null;
  r.state = 'lobby';
}

function startGame(r) {
  r.state = 'playing';
  r.game = new Engine.Game(r.mapId, r.players.map(p => ({ id: p.id, name: p.name })));
  const first = r.game.snapshot();
  for (const p of r.players) io.to(p.id).emit('gameStart', first);
  let tickCount = 0;
  let overTimer = null;
  r.interval = setInterval(() => {
    if (!r.game) return;
    r.game.update(TICK);
    tickCount++;
    if (tickCount % SNAP_EVERY === 0 || r.game.over) {
      const snap = r.game.snapshot();
      for (const p of r.players) io.to(p.id).emit('gameState', snap);
    }
    if (r.game.over && !overTimer) {
      overTimer = setTimeout(() => {
        stopGame(r);
        for (const p of r.players) p.ready = false;
        for (const p of r.players) io.to(p.id).emit('backToLobby', roomDetail(r));
        broadcastRoomList();
      }, 4000);
    }
  }, TICK * 1000);
  broadcastRoomList();
}

io.on('connection', socket => {
  let playerName = '玩家';

  socket.on('setName', name => {
    playerName = String(name || '玩家').slice(0, 10) || '玩家';
    const r = findRoom(socket);
    if (r) {
      const p = r.players.find(x => x.id === socket.id);
      if (p) { p.name = playerName; pushRoom(r); }
    }
  });

  const findRoom = s => [...rooms.values()].find(x => x.players.some(p => p.id === s.id));

  socket.on('listRooms', () => {
    socket.emit('roomList', [...rooms.values()].map(roomSummary));
  });

  socket.on('createRoom', data => {
    if (findRoom(socket)) return socket.emit('errorMsg', '你已在房間中');
    const id = 'r' + roomSeq++;
    const mapId = Number.isInteger(data && data.mapId) && data.mapId >= 0 && data.mapId < Engine.MAPS.length ? data.mapId : 0;
    const r = {
      id, name: String((data && data.name) || '新房間').slice(0, 16),
      hostId: socket.id, mapId, state: 'lobby',
      players: [{ id: socket.id, name: playerName, ready: false }],
      game: null, interval: null
    };
    rooms.set(id, r);
    socket.emit('joinedRoom', roomDetail(r));
    broadcastRoomList();
  });

  socket.on('joinRoom', data => {
    if (findRoom(socket)) return socket.emit('errorMsg', '你已在房間中');
    const r = rooms.get(data && data.id);
    if (!r) return socket.emit('errorMsg', '房間不存在');
    if (r.state === 'playing') return socket.emit('errorMsg', '遊戲進行中，無法加入');
    if (r.players.length >= 4) return socket.emit('errorMsg', '房間已滿');
    r.players.push({ id: socket.id, name: playerName, ready: false });
    socket.emit('joinedRoom', roomDetail(r));
    pushRoom(r);
    broadcastRoomList();
  });

  socket.on('leaveRoom', () => leaveRoom(socket));

  socket.on('setReady', v => {
    const r = findRoom(socket);
    if (!r || r.state !== 'lobby') return;
    const p = r.players.find(x => x.id === socket.id);
    if (p) { p.ready = !!v; pushRoom(r); }
  });

  socket.on('setMap', mapId => {
    const r = findRoom(socket);
    if (!r || r.hostId !== socket.id || r.state !== 'lobby') return;
    if (Number.isInteger(mapId) && mapId >= 0 && mapId < Engine.MAPS.length) {
      r.mapId = mapId;
      pushRoom(r);
      broadcastRoomList();
    }
  });

  socket.on('startGame', () => {
    const r = findRoom(socket);
    if (!r || r.hostId !== socket.id || r.state !== 'lobby') return;
    if (r.players.length < 2) return socket.emit('errorMsg', '至少需要 2 名玩家');
    if (!r.players.every(p => p.id === r.hostId || p.ready)) return socket.emit('errorMsg', '還有玩家未準備');
    startGame(r);
  });

  socket.on('input', d => {
    const r = findRoom(socket);
    if (r && r.game) r.game.setInput(socket.id, (d && d.dx) | 0, (d && d.dy) | 0);
  });

  socket.on('action', () => {
    const r = findRoom(socket);
    if (r && r.game) r.game.action(socket.id);
  });

  socket.on('disconnect', () => leaveRoom(socket));
});

server.listen(PORT, () => {
  console.log(`💣 爆爆水球大作戰伺服器啟動： http://localhost:${PORT}`);
  console.log('   手機請連同一個 Wi-Fi，瀏覽 http://<電腦IP>:' + PORT);
});
