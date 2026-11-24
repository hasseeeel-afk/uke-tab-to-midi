'use strict';

/* ===== ウクレレ設定 =====
 * 文字列 index: 0=A(1弦) 1=E(2弦) 2=C(3弦) 3=G(4弦)  ※TAB表示の上から順
 */
const STRINGS = [
  { name: 'A', base: 69 },            // A4
  { name: 'E', base: 64 },            // E4
  { name: 'C', base: 60 },            // C4
  { name: 'G', base: 67, low: 55 },   // G4 (Low-G: G3)
];
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DUR_LABEL = { 1: '1', 2: '½', 4: '¼', 8: '⅛', 16: '1/16' };
const MAX_FRET = 15;
const PPQ = 480;
const GM_PROGRAM = 24; // Acoustic Guitar (nylon) — GM にウクレレ音色が無いため
const STORE_KEY = 'ukulele-tab-midi:v1';

const $ = (id) => document.getElementById(id);
const el = {
  tab: $('tab'), info: $('info'), pos: $('pos'), readout: $('readout'),
  keys: $('keys'), title: $('title'), tempo: $('tempo'), lowg: $('lowg'),
  playKey: $('playKey'), help: $('help'), helpDlg: $('helpDlg'),
};

/* ===== 状態 ===== */
const newStep = (d) => ({ f: [null, null, null, null], d, dot: false });
const fresh = () => ({ steps: [newStep(4)], cur: 0, str: 0, dur: 4, tempo: 100, lowG: false, title: 'ukulele' });

let S = load() || fresh();
let buf = '';        // フレット入力中の数字
let player = null;   // 再生状態

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.steps) && s.steps.length) return s;
  } catch (_) { /* ignore */ }
  return null;
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (_) { /* ignore */ }
}

const cur = () => S.steps[S.cur];
const midiOf = (si, fret) => (si === 3 && S.lowG ? STRINGS[3].low : STRINGS[si].base) + fret;
const noteName = (m) => NOTE[m % 12] + (Math.floor(m / 12) - 1);
const beatsOf = (st) => (4 / st.d) * (st.dot ? 1.5 : 1);
const isRest = (st) => st.f.every((x) => x == null);
const notesOf = (st) => [...new Set(st.f.map((fr, i) => (fr == null ? null : midiOf(i, fr))).filter((x) => x != null))].sort((a, b) => a - b);

/* ===== 入力 ===== */
function press(k) {
  if (/^\d$/.test(k)) { digit(+k); return; }

  if (k === 'del' && buf.length === 2) {          // 2桁入力中なら1桁戻す
    buf = buf[0];
    cur().f[S.str] = +buf;
    commit();
    return;
  }
  buf = '';

  switch (k) {
    case 's0': case 's1': case 's2': case 's3':
      S.str = +k[1]; break;
    case 'up': S.str = Math.max(0, S.str - 1); break;
    case 'down': S.str = Math.min(3, S.str + 1); break;
    case 'd1': case 'd2': case 'd4': case 'd8': case 'd16':
      S.dur = cur().d = +k.slice(1); break;
    case 'dot': cur().dot = !cur().dot; break;
    case 'rest': cur().f = [null, null, null, null]; break;
    case 'x': cur().f[S.str] = null; break;
    case 'left': if (S.cur > 0) S.cur--; break;
    case 'right':
      if (S.cur === S.steps.length - 1) S.steps.push(newStep(S.dur));
      S.cur++; break;
    case 'next':
      S.steps.splice(S.cur + 1, 0, newStep(S.dur));
      S.cur++; break;
    case 'del':
      if (S.steps.length > 1) {
        S.steps.splice(S.cur, 1);
        S.cur = Math.max(0, S.cur - 1);
      } else {
        S.steps[0] = newStep(S.dur);
      }
      break;
    case 'ac':
      if (!confirm('TABをすべて消去しますか？')) return;
      stop();
      S = { ...fresh(), tempo: S.tempo, lowG: S.lowG, title: S.title, dur: S.dur };
      S.steps = [newStep(S.dur)];
      break;
    case 'play': player ? stop() : play(); return;
    case 'midi': exportMidi(); return;
    default: return;
  }
  commit();
}

function digit(d) {
  let nb = buf + d;
  if (buf === '0' || nb.length > 2 || +nb > MAX_FRET) nb = String(d);
  buf = nb;
  const fret = +buf;
  cur().f[S.str] = fret;
  if (!player) pluckNow(midiOf(S.str, fret), 0.6);
  commit();
}

function commit() { save(); render(); }

/* ===== 描画 ===== */
function render() {
  const frag = document.createDocumentFragment();
  let beats = 0;
  S.steps.forEach((st, i) => {
    beats += beatsOf(st);
    const col = document.createElement('div');
    col.className = 'col';
    if (i === S.cur) col.classList.add('cur');
    if (Math.abs(beats / 4 - Math.round(beats / 4)) < 1e-6) col.classList.add('bar-end');
    col.dataset.i = i;
    for (let s = 0; s < 4; s++) {
      const c = document.createElement('div');
      c.className = 'cell';
      c.dataset.s = s;
      const fr = st.f[s];
      if (fr == null) c.classList.add('empty');
      else c.innerHTML = `<b>${fr}</b>`;
      if (i === S.cur && s === S.str) c.classList.add('sel');
      col.appendChild(c);
    }
    const dl = document.createElement('div');
    dl.className = 'dur';
    dl.textContent = DUR_LABEL[st.d] + (st.dot ? '.' : '') + (isRest(st) ? '休' : '');
    col.appendChild(dl);
    frag.appendChild(col);
  });
  el.tab.replaceChildren(frag);

  // ステータス
  let startBeats = 0;
  for (let i = 0; i < S.cur; i++) startBeats += beatsOf(S.steps[i]);
  const bar = Math.floor(startBeats / 4 + 1e-6) + 1;
  const beat = +(startBeats % 4 + 1).toFixed(2);
  el.info.textContent = `${S.lowG ? 'Low-G' : 'High-G'}  ♩=${S.tempo}`;
  el.pos.textContent = `${S.cur + 1}/${S.steps.length}  小節${bar} 拍${beat}`;

  const st = cur();
  const fr = st.f[S.str];
  const strLabel = `${STRINGS[S.str].name}弦`;
  if (fr != null) {
    const chord = notesOf(st);
    el.readout.textContent = chord.length > 1
      ? chord.map(noteName).join(' ')
      : `${strLabel} ${fr}f → ${noteName(midiOf(S.str, fr))}`;
  } else if (!isRest(st)) {
    el.readout.textContent = notesOf(st).map(noteName).join(' ');
  } else {
    el.readout.textContent = `${strLabel} _`;
  }

  // キー状態
  el.keys.querySelectorAll('.k-str').forEach((b) => b.classList.toggle('on', b.dataset.k === 's' + S.str));
  el.keys.querySelectorAll('.k-dur').forEach((b) => b.classList.toggle('on', b.dataset.k === 'd' + st.d));
  el.keys.querySelector('[data-k="dot"]').classList.toggle('on', st.dot);
  el.lowg.classList.toggle('on', S.lowG);
  if (document.activeElement !== el.tempo) el.tempo.value = S.tempo;
  if (document.activeElement !== el.title) el.title.value = S.title;

  const curCol = el.tab.children[S.cur];
  if (curCol) curCol.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/* ===== 音 ===== */
let ac = null;
let voices = [];
function audio() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function pluck(m, t, dur) {
  const a = audio();
  const f = 440 * Math.pow(2, (m - 69) / 12);
  const o1 = a.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
  const o2 = a.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.002;
  const g2 = a.createGain(); g2.gain.value = 0.12;
  const lp = a.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(f * 10, 12000), t);
  lp.frequency.exponentialRampToValueAtTime(f * 2, t + 0.4);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.28, t + 0.004);
  g.gain.setTargetAtTime(0.0001, t + 0.004, 0.55);
  const end = t + dur;
  g.gain.setTargetAtTime(0.0001, end, 0.03);
  o1.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(a.destination);
  o1.start(t); o2.start(t); o1.stop(end + 0.2); o2.stop(end + 0.2);
  voices.push(o1, o2);
  o1.onended = () => { voices = voices.filter((v) => v !== o1 && v !== o2); };
}
function pluckNow(m, dur) { const a = audio(); pluck(m, a.currentTime + 0.01, dur); }

function play() {
  const steps = trimmed();
  if (!steps.length) return;
  const a = audio();
  const spb = 60 / S.tempo;
  const t0 = a.currentTime + 0.08;
  const times = [];
  let t = t0;
  steps.forEach((st) => {
    const len = beatsOf(st) * spb;
    times.push(t);
    notesOf(st).forEach((m) => pluck(m, t, len));
    t += len;
  });
  const tEnd = t;
  player = { raf: 0, last: -1 };
  el.playKey.classList.add('on');
  const tick = () => {
    if (!player) return;
    const now = a.currentTime;
    if (now >= tEnd) { stop(); return; }
    let idx = -1;
    for (let i = 0; i < times.length; i++) if (now >= times[i]) idx = i;
    if (idx !== player.last) {
      const cols = el.tab.children;
      if (cols[player.last]) cols[player.last].classList.remove('playing');
      if (cols[idx]) { cols[idx].classList.add('playing'); cols[idx].scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      player.last = idx;
    }
    player.raf = requestAnimationFrame(tick);
  };
  tick();
}
function stop() {
  if (player) cancelAnimationFrame(player.raf);
  player = null;
  voices.forEach((v) => { try { v.stop(); } catch (_) { /* already stopped */ } });
  voices = [];
  el.playKey.classList.remove('on');
  el.tab.querySelectorAll('.playing').forEach((c) => c.classList.remove('playing'));
  const curCol = el.tab.children[S.cur];
  if (curCol) curCol.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/* 末尾の空き列は出力しない */
function trimmed() {
  let n = S.steps.length;
  while (n > 0 && isRest(S.steps[n - 1])) n--;
  return S.steps.slice(0, n);
}

/* ===== MIDI 書き出し (SMF format 0) ===== */
function vlq(n) {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function buildMidi() {
  const steps = trimmed();
  const ev = [];
  const push = (delta, ...bytes) => ev.push(...vlq(delta), ...bytes);

  const name = [...new TextEncoder().encode(S.title || 'ukulele')];
  push(0, 0xff, 0x03, ...vlq(name.length), ...name);
  const uspq = Math.round(60000000 / S.tempo);
  push(0, 0xff, 0x51, 0x03, (uspq >> 16) & 255, (uspq >> 8) & 255, uspq & 255);
  push(0, 0xff, 0x58, 0x04, 4, 2, 24, 8);
  push(0, 0xc0, GM_PROGRAM);

  let pending = 0;
  for (const st of steps) {
    const len = Math.round(PPQ * beatsOf(st));
    const notes = notesOf(st);
    if (!notes.length) { pending += len; continue; }
    notes.forEach((n, i) => push(i ? 0 : pending, 0x90, n, 96));
    notes.forEach((n, i) => push(i ? 0 : len, 0x80, n, 64));
    pending = 0;
  }
  push(pending, 0xff, 0x2f, 0x00);

  const head = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (PPQ >> 8) & 255, PPQ & 255];
  const trk = [0x4d, 0x54, 0x72, 0x6b, ...u32(ev.length)];
  return new Uint8Array([...head, ...trk, ...ev]);
}

async function exportMidi() {
  if (!trimmed().length) { alert('音符がありません。'); return; }
  const bytes = buildMidi();
  const fname = (S.title || 'ukulele').replace(/[\\/:*?"<>|]/g, '_') + '.mid';
  const blob = new Blob([bytes], { type: 'audio/midi' });

  // スマホでは共有シート（ファイル保存/他アプリへ送る）を優先
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare) {
    const file = new File([blob], fname, { type: 'audio/midi' });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: fname }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ===== イベント ===== */
el.keys.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (b) press(b.dataset.k);
});

el.tab.addEventListener('click', (e) => {
  const col = e.target.closest('.col');
  if (!col) return;
  buf = '';
  S.cur = +col.dataset.i;
  const cell = e.target.closest('.cell');
  if (cell) S.str = +cell.dataset.s;
  commit();
});

el.title.addEventListener('input', () => { S.title = el.title.value; save(); });
el.tempo.addEventListener('change', () => {
  const v = Math.round(+el.tempo.value);
  S.tempo = Number.isFinite(v) ? Math.min(300, Math.max(30, v)) : 100;
  commit();
});
el.lowg.addEventListener('click', () => { S.lowG = !S.lowG; commit(); });
el.help.addEventListener('click', () => el.helpDlg.showModal());

const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  Enter: 'next', Backspace: 'del', Delete: 'x', ' ': 'play',
  r: 'rest', R: 'rest', '.': 'dot', '=': 'midi', a: 's0', e: 's1', c: 's2', g: 's3',
};
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, dialog') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = /^\d$/.test(e.key) ? e.key : KEYMAP[e.key];
  if (!k) return;
  e.preventDefault();
  press(k);
  const btn = el.keys.querySelector(`[data-k="${k}"]`);
  if (btn) { btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 100); }
});

render();

/* ===== PWA ===== */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
