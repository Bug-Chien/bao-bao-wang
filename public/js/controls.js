/* 鍵盤 + 手機浮動虛擬搖桿控制
   手機端：左半畫面任意處按下即生成搖桿（浮動式），方向採死區 + 遲滯避免抖動。 */
(function (root) {
'use strict';

const DEAD = 0.30;   // 死區（相對最大半徑）
const HYST = 1.35;   // 遲滯：另一軸需超過目前軸這麼多倍才改向

const Controls = {
  dx: 0, dy: 0,
  onChange: null,
  onAction: null,
  _keys: {},

  init() {
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (k === ' ' || k === 'j' || k === 'enter') { Controls._fireAction(); return; }
      Controls._keys[k] = true;
      Controls._recalc();
    });
    window.addEventListener('keyup', e => {
      Controls._keys[e.key.toLowerCase()] = false;
      Controls._recalc();
    });
    Controls._initTouch();
  },

  _fireAction() { if (Controls.onAction) Controls.onAction(); },

  _recalc() {
    const k = Controls._keys;
    let dx = 0, dy = 0;
    if (k['arrowleft'] || k['a']) dx = -1;
    else if (k['arrowright'] || k['d']) dx = 1;
    if (k['arrowup'] || k['w']) dy = -1;
    else if (k['arrowdown'] || k['s']) dy = 1;
    Controls._set(dx, dy);
  },

  _set(dx, dy) {
    if (dx === Controls.dx && dy === Controls.dy) return;
    Controls.dx = dx; Controls.dy = dy;
    if (Controls.onChange) Controls.onChange(dx, dy);
  },

  _vibe(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} },

  _initTouch() {
    const ui = document.getElementById('touch-ui');
    const zone = document.getElementById('joy-zone');
    const base = document.getElementById('joystick');
    const knob = document.getElementById('joy-knob');
    const btn = document.getElementById('btn-action');
    if (!ui || !zone || !base || !btn) return;
    const touchCapable = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!touchCapable) { ui.style.display = 'none'; return; }
    document.body.classList.add('touch');

    const RAD = 60;        // 搖桿最大半徑
    let joyId = null, ox = 0, oy = 0;

    const showBase = (x, y) => {
      base.style.left = x + 'px';
      base.style.top = y + 'px';
      base.classList.add('active');
      knob.style.transform = 'translate(-50%,-50%)';
    };
    const hideBase = () => { base.classList.remove('active'); Controls._set(0, 0); };

    const handle = t => {
      let vx = t.clientX - ox, vy = t.clientY - oy;
      let len = Math.hypot(vx, vy);
      if (len > RAD) { vx = vx / len * RAD; vy = vy / len * RAD; len = RAD; }
      knob.style.transform = `translate(calc(-50% + ${vx}px), calc(-50% + ${vy}px))`;
      if (len < RAD * DEAD) { Controls._set(0, 0); return; }
      // 死區外：依主軸決定方向，加遲滯避免對角線抖動
      const ax = Math.abs(vx), ay = Math.abs(vy);
      let dx = 0, dy = 0;
      if (Controls.dx && ax >= ay / HYST) dx = Math.sign(vx);            // 維持水平
      else if (Controls.dy && ay >= ax / HYST) dy = Math.sign(vy);       // 維持垂直
      else if (ax > ay) dx = Math.sign(vx);
      else dy = Math.sign(vy);
      Controls._set(dx, dy);
    };

    zone.addEventListener('touchstart', e => {
      e.preventDefault();
      if (joyId !== null) return;
      const t = e.changedTouches[0];
      joyId = t.identifier;
      ox = t.clientX; oy = t.clientY;
      showBase(ox, oy);
      handle(t);
    }, { passive: false });

    zone.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === joyId) handle(t);
    }, { passive: false });

    const end = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) { joyId = null; hideBase(); }
      }
    };
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);

    btn.addEventListener('touchstart', e => {
      e.preventDefault();
      btn.classList.add('press');
      Controls._vibe(12);
      Controls._fireAction();
    }, { passive: false });
    btn.addEventListener('touchend', e => { e.preventDefault(); btn.classList.remove('press'); }, { passive: false });
  },

  reset() { Controls._keys = {}; Controls._set(0, 0); }
};

root.Controls = Controls;
})(window);
