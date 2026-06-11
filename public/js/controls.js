/* 鍵盤 + 手機虛擬搖桿控制 */
(function (root) {
'use strict';

const Controls = {
  dx: 0, dy: 0,
  onChange: null,   // (dx, dy) 方向改變
  onAction: null,   // 放水球 / 用針
  _keys: {},

  init() {
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase()) || e.key === ' ') e.preventDefault();
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

  _initTouch() {
    const pad = document.getElementById('joystick');
    const knob = document.getElementById('joy-knob');
    const btn = document.getElementById('btn-action');
    if (!pad || !btn) return;
    if (!('ontouchstart' in window)) {
      document.getElementById('touch-ui').style.display = 'none';
      return;
    }
    let joyId = null;
    const center = () => {
      const r = pad.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, rad: r.width / 2 };
    };
    const handle = t => {
      const c = center();
      let vx = t.clientX - c.x, vy = t.clientY - c.y;
      const len = Math.hypot(vx, vy);
      const max = c.rad - 18;
      if (len > max) { vx = vx / len * max; vy = vy / len * max; }
      knob.style.transform = `translate(${vx}px, ${vy}px)`;
      if (len < c.rad * 0.25) { Controls._set(0, 0); return; }
      if (Math.abs(vx) > Math.abs(vy)) Controls._set(Math.sign(vx), 0);
      else Controls._set(0, Math.sign(vy));
    };
    pad.addEventListener('touchstart', e => {
      e.preventDefault();
      joyId = e.changedTouches[0].identifier;
      handle(e.changedTouches[0]);
    }, { passive: false });
    pad.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === joyId) handle(t);
    }, { passive: false });
    const end = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          knob.style.transform = 'translate(0,0)';
          Controls._set(0, 0);
        }
      }
    };
    pad.addEventListener('touchend', end);
    pad.addEventListener('touchcancel', end);
    btn.addEventListener('touchstart', e => { e.preventDefault(); Controls._fireAction(); }, { passive: false });
  },

  reset() { Controls._keys = {}; Controls._set(0, 0); }
};

root.Controls = Controls;
})(window);
