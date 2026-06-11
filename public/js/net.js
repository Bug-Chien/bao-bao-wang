/* Socket.IO 連線封裝 */
(function (root) {
'use strict';

const Net = {
  socket: null,
  myId: null,

  available() { return typeof io !== 'undefined'; },

  connect(name) {
    return new Promise((resolve, reject) => {
      if (!Net.available()) { reject(new Error('此網站為單機版，線上多人請在電腦上用 npm start 自架伺服器')); return; }
      if (Net.socket && Net.socket.connected) {
        Net.socket.emit('setName', name);
        resolve();
        return;
      }
      Net.socket = io();
      Net.socket.on('connect', () => {
        Net.myId = Net.socket.id;
        Net.socket.emit('setName', name);
        resolve();
      });
      Net.socket.on('connect_error', () => reject(new Error('無法連線到伺服器')));
    });
  },

  on(ev, fn) { Net.socket.on(ev, fn); },
  off(ev) { Net.socket.off(ev); },
  emit(ev, data) { if (Net.socket) Net.socket.emit(ev, data); },

  listRooms() { Net.emit('listRooms'); },
  createRoom(roomName, mapId) { Net.emit('createRoom', { name: roomName, mapId }); },
  joinRoom(id) { Net.emit('joinRoom', { id }); },
  leaveRoom() { Net.emit('leaveRoom'); },
  setReady(v) { Net.emit('setReady', v); },
  setMap(mapId) { Net.emit('setMap', mapId); },
  startGame() { Net.emit('startGame'); },
  sendInput(dx, dy) { Net.emit('input', { dx, dy }); },
  sendAction() { Net.emit('action'); }
};

root.Net = Net;
})(window);
