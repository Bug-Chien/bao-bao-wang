/* 簡易音效（WebAudio 合成，無需音檔） */
(function (root) {
'use strict';
let ctx = null;
let enabled = true;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function beep(freq, dur, type, vol, slide) {
  if (!enabled) return;
  try {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.08, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur);
  } catch (e) { /* 音效失敗不影響遊戲 */ }
}

const Sound = {
  setEnabled(v) { enabled = v; },
  place() { beep(300, 0.08, 'sine', 0.06); },
  boom() { beep(180, 0.35, 'sawtooth', 0.1, 60); },
  trap() { beep(500, 0.3, 'sine', 0.07, 250); },
  pop() { beep(700, 0.15, 'square', 0.08, 200); },
  item() { beep(660, 0.1, 'sine', 0.07, 990); },
  needle() { beep(880, 0.12, 'square', 0.06, 1320); },
  win() { beep(523, 0.15, 'sine', 0.08); setTimeout(() => beep(659, 0.15, 'sine', 0.08), 150); setTimeout(() => beep(784, 0.3, 'sine', 0.08), 300); },
  lose() { beep(330, 0.2, 'sine', 0.08); setTimeout(() => beep(262, 0.4, 'sine', 0.08), 200); },
  play(ev) {
    if (ev.k === 'place') Sound.place();
    else if (ev.k === 'boom') Sound.boom();
    else if (ev.k === 'trap') Sound.trap();
    else if (ev.k === 'pop') Sound.pop();
    else if (ev.k === 'item') Sound.item();
    else if (ev.k === 'needle') Sound.needle();
  }
};
root.Sound = Sound;
})(window);
