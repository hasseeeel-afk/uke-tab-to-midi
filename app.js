'use strict';

/* ===== 楽器定義 =====
 * tuning 配列は TAB 表示の上から順（index 0 = 1弦 = 最高音弦）。値は MIDI ノート番号。
 */
const INSTRUMENTS = {
  uke: {
    label: 'ウクレレ', title: 'ukulele', maxFret: 18, program: 24,
    presets: [
      { name: 'スタンダード High-G (GCEA)', notes: [69, 64, 60, 67] },
      { name: 'Low-G (GCEA)', notes: [69, 64, 60, 55] },
      { name: 'Dチューニング (ADF#B)', notes: [71, 66, 62, 69] },
      { name: 'バリトン (DGBE)', notes: [64, 59, 55, 50] },
    ],
  },
  gtr: {
    label: 'ギター', title: 'guitar', maxFret: 24, program: 25,
    presets: [
      { name: 'スタンダード (EADGBE)', notes: [64, 59, 55, 50, 45, 40] },
      { name: '半音下げ (E♭)', notes: [63, 58, 54, 49, 44, 39] },
      { name: 'ドロップD (DADGBE)', notes: [64, 59, 55, 50, 45, 38] },
      { name: 'DADGAD', notes: [62, 57, 55, 50, 45, 38] },
      { name: 'オープンG (DGDGBD)', notes: [62, 59, 55, 50, 43, 38] },
      { name: 'オープンD (DADF#AD)', notes: [62, 57, 54, 50, 45, 38] },
    ],
  },
};
const PROGRAMS = [
  [24, 'ナイロンギター'], [25, 'スチールギター'], [26, 'ジャズギター'],
  [27, 'クリーンギター'], [28, 'ミュートギター'], [29, 'オーバードライブ'], [30, 'ディストーション'],
];
const TUNE_MIN = 28, TUNE_MAX = 84;   // E1 〜 C6
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DUR_NAME = { 1: '全音符', 2: '2分音符', 4: '4分音符', 8: '8分音符', 16: '16分音符' };
const REST_NAME = { 1: '全休符', 2: '2分休符', 4: '4分休符', 8: '8分休符', 16: '16分休符' };

/* 音符・休符アイコン（SVG で描画：Android でも記号フォントに依存せず表示できる） */
function durIcon(d, dot, rest) {
  const S = 'stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"';
  let g = '';
  if (!rest) {
    const hollow = d <= 2;
    const head = d === 1
      ? `<ellipse cx="9" cy="16" rx="4.6" ry="3.1" ${S} stroke-width="1.6"/>`
      : `<ellipse cx="8" cy="17" rx="4" ry="2.8" transform="rotate(-22 8 17)" ${hollow ? `${S} stroke-width="1.5"` : 'fill="currentColor"'}/>`;
    g += head;
    if (d >= 2) g += `<line x1="11.6" y1="16" x2="11.6" y2="2.5" ${S}/>`;
    if (d >= 8) g += `<path d="M11.6 2.5 C12.4 6 16.6 6.6 15.2 11" ${S}/>`;
    if (d >= 16) g += `<path d="M11.6 6.5 C12.4 10 16.6 10.6 15.2 15" ${S}/>`;
    if (dot) g += `<circle cx="17.3" cy="17.5" r="1.4" fill="currentColor"/>`;
  } else {
    if (d === 1) g += `<line x1="3" y1="8" x2="16" y2="8" ${S}/><rect x="5.5" y="8" width="8" height="3.6" fill="currentColor"/>`;
    if (d === 2) g += `<line x1="3" y1="13" x2="16" y2="13" ${S}/><rect x="5.5" y="9.4" width="8" height="3.6" fill="currentColor"/>`;
    if (d === 4) g += `<path d="M7.5 3.5 L11.5 8 L8.5 11.5 L12 15.5 C8.8 14.2 8 16.8 10.2 19.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (d === 8) g += `<circle cx="7.6" cy="8" r="1.8" fill="currentColor"/><path d="M8 9.6 Q11 9.8 13 6.8 L9.6 19" ${S}/>`;
    if (d === 16) g += `<circle cx="8.4" cy="5.6" r="1.7" fill="currentColor"/><circle cx="6.9" cy="10.6" r="1.7" fill="currentColor"/>`
      + `<path d="M8.8 7.1 Q11.6 7.3 13.4 4.4 L9.2 19.5 M7.3 12.1 Q10.2 12.3 12.1 9.4" ${S}/>`;
    if (dot) g += `<circle cx="17" cy="9" r="1.4" fill="currentColor"/>`;
  }
  return `<svg viewBox="0 0 20 22" width="20" height="22" aria-hidden="true">${g}</svg>`;
}
const PPQ = 480;
const STORE_KEY = 'tab-calc:v2';
const OLD_STORE_KEY = 'ukulele-tab-midi:v1';

const $ = (id) => document.getElementById(id);
const el = {
  app: document.querySelector('.app'),
  tab: $('tab'), labels: $('labels'), info: $('info'), pos: $('pos'), readout: $('readout'),
  keys: $('keys'), title: $('title'), tempo: $('tempo'),
  inst: $('inst'), settings: $('settings'), setDlg: $('setDlg'), setTitle: $('setTitle'),
  preset: $('preset'), tuneRows: $('tuneRows'), program: $('program'),
  playKey: $('playKey'), help: $('help'), helpDlg: $('helpDlg'),
};

/* HTML と JS の版が食い違っていたら（古いキャッシュ混在）キャッシュを消して1回だけ再読込 */
if (Object.values(el).some((x) => !x)) {
  let tried = false;
  try { tried = sessionStorage.getItem('tab-calc:healed') === '1'; sessionStorage.setItem('tab-calc:healed', '1'); } catch (_) { /* ignore */ }
  if (!tried) {
    Promise.all([
      navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))) : 0,
      window.caches ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))) : 0,
    ]).finally(() => location.reload());
  }
  throw new Error('HTML/JS version mismatch');
}

/* ===== 状態 =====
 * S = { inst: 'uke'|'gtr', songs: { uke: Song, gtr: Song } }  楽器ごとに別の譜面を保持
 */
const newStep = (n, d) => ({ f: Array(n).fill(null), d, dot: false });
function newSong(inst) {
  const I = INSTRUMENTS[inst];
  const tuning = [...I.presets[0].notes];
  return { steps: [newStep(tuning.length, 4)], cur: 0, str: 0, dur: 4, tempo: 100, title: I.title, tuning, program: I.program };
}
const fresh = () => ({ inst: 'uke', songs: { uke: newSong('uke'), gtr: newSong('gtr') } });

let S = load();
let buf = '';        // フレット入力中の数字
let player = null;   // 再生状態

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (_) { /* ignore */ }
  if (!s) {
    s = fresh();
    try {   // v1（ウクレレ専用版）からの移行
      const old = JSON.parse(localStorage.getItem(OLD_STORE_KEY));
      if (old && Array.isArray(old.steps) && old.steps.length) {
        const u = s.songs.uke;
        Object.assign(u, {
          steps: old.steps, cur: old.cur | 0, str: old.str | 0, dur: old.dur || 4,
          tempo: old.tempo || 100, title: old.title || u.title,
        });
        if (old.lowG) u.tuning = [69, 64, 60, 55];
      }
    } catch (_) { /* ignore */ }
  }
  // 整合性チェック
  if (!s.songs) s = fresh();
  if (!INSTRUMENTS[s.inst]) s.inst = 'uke';
  for (const k of Object.keys(INSTRUMENTS)) {
    const song = s.songs[k] = { ...newSong(k), ...(s.songs[k] || {}) };
    const n = song.tuning.length;
    if (!Array.isArray(song.steps) || !song.steps.length) song.steps = [newStep(n, 4)];
    song.steps.forEach((st) => { st.f = Array.from({ length: n }, (_, i) => (st.f && st.f[i] != null ? st.f[i] : null)); });
    song.cur = Math.min(Math.max(0, song.cur | 0), song.steps.length - 1);
    song.str = Math.min(Math.max(0, song.str | 0), n - 1);
  }
  return s;
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (_) { /* ignore */ }
}

const D = () => S.songs[S.inst];
const I = () => INSTRUMENTS[S.inst];
const nStr = () => D().tuning.length;
const cur = () => D().steps[D().cur];
/* セルの値: null=空 / 数値=フレット / 'x'=ミュート（ブラッシング） */
const MUTE = 'x';
const isMute = (v) => v === MUTE;
const midiOf = (si, fret) => D().tuning[si] + (isMute(fret) ? 0 : fret);
const noteName = (m) => NOTE[m % 12] + (Math.floor(m / 12) - 1);
const pc = (m) => NOTE[m % 12];
const beatsOf = (st) => (4 / st.d) * (st.dot ? 1.5 : 1);
const isRest = (st) => st.f.every((x) => x == null);
const uniqSorted = (arr) => [...new Set(arr)].sort((a, b) => a - b);
/* 実音（ミュート以外）の MIDI ノート */
const notesOf = (st) => uniqSorted(st.f.flatMap((fr, i) => (typeof fr === 'number' ? [midiOf(i, fr)] : [])));
/* ミュート弦の MIDI ノート（開放弦の音程で短く鳴らす） */
const mutesOf = (st) => uniqSorted(st.f.flatMap((fr, i) => (isMute(fr) ? [midiOf(i, 0)] : [])));

/* ===== 入力 ===== */
/* 全削除は「2回押し」で確定（confirm() は PWA/Android/埋め込みブラウザで抑止されることがあるため使わない） */
const AC_WINDOW_MS = 3000;
let acTimer = 0;
const acKey = () => el.keys.querySelector('[data-k="ac"]');
function armAc() {
  acTimer = setTimeout(() => { disarmAc(); render(); }, AC_WINDOW_MS);
  acKey().classList.add('armed');
  el.readout.textContent = 'もう一度ACで全削除';
}
function disarmAc() {
  if (!acTimer) return;
  clearTimeout(acTimer);
  acTimer = 0;
  acKey().classList.remove('armed');
}

function press(k) {
  if (k !== 'ac') disarmAc();
  if (/^\d$/.test(k)) { digit(+k); return; }
  const d = D();

  if (k === 'del' && buf.length === 2) {          // 2桁入力中なら1桁戻す
    buf = buf[0];
    cur().f[d.str] = +buf;
    commit();
    return;
  }
  buf = '';

  if (/^s\d$/.test(k)) { d.str = Math.min(+k[1], nStr() - 1); commit(); return; }
  switch (k) {
    case 'up': d.str = Math.max(0, d.str - 1); break;
    case 'down': d.str = Math.min(nStr() - 1, d.str + 1); break;
    case 'd1': case 'd2': case 'd4': case 'd8': case 'd16':
      d.dur = cur().d = +k.slice(1); break;
    case 'dot': cur().dot = !cur().dot; break;
    case 'mute':
      cur().f[d.str] = isMute(cur().f[d.str]) ? null : MUTE;
      if (isMute(cur().f[d.str]) && !player) thumpNow(midiOf(d.str, 0));
      break;
    case 'x': cur().f[d.str] = null; break;
    case 'left': if (d.cur > 0) d.cur--; break;
    case 'right':
      if (d.cur === d.steps.length - 1) d.steps.push(newStep(nStr(), d.dur));
      d.cur++; break;
    case 'ins':
      d.steps.splice(d.cur + 1, 0, newStep(nStr(), d.dur));
      d.cur++; break;
    case 'del':
      if (d.steps.length > 1) {
        d.steps.splice(d.cur, 1);
        d.cur = Math.max(0, d.cur - 1);
      } else {
        d.steps[0] = newStep(nStr(), d.dur);
      }
      break;
    case 'ac':
      if (!acTimer) { armAc(); return; }
      disarmAc();
      stop();
      d.steps = [newStep(nStr(), d.dur)];
      d.cur = 0;
      break;
    case 'play': player ? stop() : play(); return;
    case 'midi': exportMidi(); return;
    default: return;
  }
  commit();
}

function digit(n) {
  const d = D();
  let nb = buf + n;
  if (buf === '0' || nb.length > 2 || +nb > I().maxFret) nb = String(n);
  buf = nb;
  const fret = +buf;
  cur().f[d.str] = fret;
  if (!player) pluckNow(midiOf(d.str, fret), 0.6);
  commit();
}

function commit() { disarmAc(); save(); render(); }

/* ===== 描画 ===== */
function render() {
  const d = D();
  const n = nStr();
  el.app.style.setProperty('--n', n);
  el.app.dataset.inst = S.inst;

  // 弦ラベル（選択中の弦を反転表示、タップで弦選択）
  el.labels.replaceChildren(...d.tuning.map((m, i) => {
    const s = document.createElement('span');
    s.textContent = pc(m);
    s.dataset.s = i;
    if (i === d.str) s.className = 'on';
    return s;
  }), document.createElement('span'));

  // TAB
  const frag = document.createDocumentFragment();
  let beats = 0;
  d.steps.forEach((st, i) => {
    beats += beatsOf(st);
    const col = document.createElement('div');
    col.className = 'col';
    if (i === d.cur) col.classList.add('cur');
    if (Math.abs(beats / 4 - Math.round(beats / 4)) < 1e-6) col.classList.add('bar-end');
    col.dataset.i = i;
    for (let s = 0; s < n; s++) {
      const c = document.createElement('div');
      c.className = 'cell';
      c.dataset.s = s;
      const fr = st.f[s];
      if (fr == null) c.classList.add('empty');
      else if (isMute(fr)) c.innerHTML = '<b class="mute">x</b>';
      else c.innerHTML = `<b>${fr}</b>`;
      if (i === d.cur && s === d.str) c.classList.add('sel');
      col.appendChild(c);
    }
    const dl = document.createElement('div');
    dl.className = 'dur';
    const rest = isRest(st);
    dl.innerHTML = durIcon(st.d, st.dot, rest);
    dl.title = (st.dot ? '付点' : '') + (rest ? REST_NAME : DUR_NAME)[st.d];
    if (rest) dl.classList.add('rest');
    col.appendChild(dl);
    frag.appendChild(col);
  });
  el.tab.replaceChildren(frag);

  // ステータス
  let startBeats = 0;
  for (let i = 0; i < d.cur; i++) startBeats += beatsOf(d.steps[i]);
  const bar = Math.floor(startBeats / 4 + 1e-6) + 1;
  const beat = +(startBeats % 4 + 1).toFixed(2);
  el.info.textContent = `${tuningName()}  ♩=${d.tempo}`;
  el.pos.textContent = `${d.cur + 1}/${d.steps.length}  小節${bar} 拍${beat}`;

  const st = cur();
  const fr = st.f[d.str];
  const strLabel = `${d.str + 1}弦`;
  const chordText = () => [...notesOf(st).map(noteName), ...(mutesOf(st).length ? ['x'.repeat(mutesOf(st).length)] : [])].join(' ');
  if (isMute(fr)) {
    el.readout.textContent = `${strLabel} ミュート x`;
  } else if (fr != null) {
    el.readout.textContent = notesOf(st).length > 1 || mutesOf(st).length
      ? chordText()
      : `${strLabel} ${fr}f → ${noteName(midiOf(d.str, fr))}`;
  } else if (!isRest(st)) {
    el.readout.textContent = chordText();
  } else {
    el.readout.textContent = `${strLabel}(${noteName(d.tuning[d.str])}) _`;
  }

  // キー状態
  el.keys.querySelectorAll('.k-dur').forEach((b) => b.classList.toggle('on', b.dataset.k === 'd' + st.d));
  el.keys.querySelector('[data-k="dot"]').classList.toggle('on', st.dot);
  el.inst.textContent = I().label;
  if (document.activeElement !== el.tempo) el.tempo.value = d.tempo;
  if (document.activeElement !== el.title) el.title.value = d.title;
  document.title = `${I().label}TAB電卓`;

  const curCol = el.tab.children[d.cur];
  if (curCol) curCol.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function tuningName() {
  const t = D().tuning;
  const p = I().presets.find((x) => x.notes.every((v, i) => v === t[i]));
  return p ? p.name.replace(/\s*\(.*\)/, '') : [...t].reverse().map(pc).join('');
}

/* ===== 設定ダイアログ（チューニング・音色） ===== */
function renderSettings() {
  const d = D();
  el.setTitle.textContent = `${I().label}の設定`;

  const idx = I().presets.findIndex((p) => p.notes.every((v, i) => v === d.tuning[i]));
  el.preset.replaceChildren(
    ...I().presets.map((p, i) => new Option(p.name, i)),
    new Option('カスタム', 'custom'),
  );
  el.preset.value = idx >= 0 ? String(idx) : 'custom';
  el.preset.querySelector('[value="custom"]').disabled = true;

  el.tuneRows.replaceChildren(...d.tuning.map((m, i) => {
    const row = document.createElement('div');
    row.className = 'trow';
    const sel = document.createElement('select');
    sel.dataset.i = i;
    sel.setAttribute('aria-label', `${i + 1}弦のチューニング`);
    for (let v = TUNE_MAX; v >= TUNE_MIN; v--) sel.add(new Option(noteName(v), v));
    sel.value = m;
    row.innerHTML = `<span class="sname">${i + 1}弦</span>`;
    const minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = '−'; minus.dataset.i = i; minus.dataset.t = -1;
    minus.setAttribute('aria-label', `${i + 1}弦を半音下げる`);
    const plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '＋'; plus.dataset.i = i; plus.dataset.t = 1;
    plus.setAttribute('aria-label', `${i + 1}弦を半音上げる`);
    row.append(minus, sel, plus);
    return row;
  }));

  el.program.replaceChildren(...PROGRAMS.map(([p, name]) => new Option(`${name} (GM ${p + 1})`, p)));
  el.program.value = d.program;
}

function setTuning(i, v) {
  D().tuning[i] = Math.min(TUNE_MAX, Math.max(TUNE_MIN, v));
  pluckNow(D().tuning[i], 0.8);
  commit();
  renderSettings();
}

el.settings.addEventListener('click', () => { renderSettings(); el.setDlg.showModal(); });
el.preset.addEventListener('change', () => {
  const p = I().presets[+el.preset.value];
  if (!p) return;
  D().tuning = [...p.notes];
  commit();
  renderSettings();
});
el.tuneRows.addEventListener('change', (e) => {
  if (e.target.matches('select')) setTuning(+e.target.dataset.i, +e.target.value);
});
el.tuneRows.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-t]');
  if (b) setTuning(+b.dataset.i, D().tuning[+b.dataset.i] + +b.dataset.t);
});
el.program.addEventListener('change', () => { D().program = +el.program.value; save(); });

el.inst.addEventListener('click', () => {
  stop();
  buf = '';
  S.inst = S.inst === 'uke' ? 'gtr' : 'uke';
  commit();
});

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
  g.gain.exponentialRampToValueAtTime(0.24, t + 0.004);
  g.gain.setTargetAtTime(0.0001, t + 0.004, 0.55);
  const end = t + dur;
  g.gain.setTargetAtTime(0.0001, end, 0.03);
  o1.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(a.destination);
  o1.start(t); o2.start(t); o1.stop(end + 0.2); o2.stop(end + 0.2);
  voices.push(o1, o2);
  o1.onended = () => { voices = voices.filter((v) => v !== o1 && v !== o2); };
}
function pluckNow(m, dur) { const a = audio(); pluck(m, a.currentTime + 0.01, dur); }

/* ミュート音: 短いノイズ＋かすかな音程の「チャッ」 */
let noiseBuf = null;
function thump(m, t) {
  const a = audio();
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 0.08), a.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const f = 440 * Math.pow(2, (m - 69) / 12);
  const n = a.createBufferSource(); n.buffer = noiseBuf;
  const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(f * 6, 6000); bp.Q.value = 0.8;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  const o = a.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
  const og = a.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.12, t + 0.003);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  n.connect(bp).connect(g).connect(a.destination);
  o.connect(og).connect(a.destination);
  n.start(t); n.stop(t + 0.08); o.start(t); o.stop(t + 0.08);
  voices.push(n, o);
}
function thumpNow(m) { const a = audio(); thump(m, a.currentTime + 0.01); }

function play() {
  const steps = trimmed();
  if (!steps.length) return;
  const a = audio();
  const spb = 60 / D().tempo;
  const t0 = a.currentTime + 0.08;
  const times = [];
  let t = t0;
  steps.forEach((st) => {
    const len = beatsOf(st) * spb;
    times.push(t);
    notesOf(st).forEach((m) => pluck(m, t, len));
    mutesOf(st).forEach((m) => thump(m, t));
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
  const curCol = el.tab.children[D().cur];
  if (curCol) curCol.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/* 末尾の空き列は出力しない */
function trimmed() {
  const steps = D().steps;
  let n = steps.length;
  while (n > 0 && isRest(steps[n - 1])) n--;
  return steps.slice(0, n);
}

/* ===== MIDI 書き出し (SMF format 0) ===== */
function vlq(n) {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function buildMidi() {
  const d = D();
  const steps = trimmed();
  const ev = [];
  const push = (delta, ...bytes) => ev.push(...vlq(delta), ...bytes);

  const name = [...new TextEncoder().encode(d.title || I().title)];
  push(0, 0xff, 0x03, ...vlq(name.length), ...name);
  const uspq = Math.round(60000000 / d.tempo);
  push(0, 0xff, 0x51, 0x03, (uspq >> 16) & 255, (uspq >> 8) & 255, uspq & 255);
  push(0, 0xff, 0x58, 0x04, 4, 2, 24, 8);
  push(0, 0xc0, d.program & 0x7f);

  // 絶対時刻でノートを集め、時刻順（同時刻は Note Off 優先）に並べてから書き出す
  const MUTE_TICKS = PPQ / 8;          // ミュート音は 32分音符の長さ
  const notes = [];                    // { on, off, n, vel }
  let t = 0;
  for (const st of steps) {
    const len = Math.round(PPQ * beatsOf(st));
    const played = notesOf(st);
    played.forEach((n) => notes.push({ on: t, off: t + len, n, vel: 96 }));
    mutesOf(st).filter((n) => !played.includes(n))
      .forEach((n) => notes.push({ on: t, off: t + Math.min(MUTE_TICKS, len), n, vel: 40 }));
    t += len;
  }
  const ev2 = [];
  notes.filter((x) => x.n >= 0 && x.n <= 127).forEach((x) => {
    ev2.push({ t: x.on, k: 1, b: [0x90, x.n, x.vel] });
    ev2.push({ t: x.off, k: 0, b: [0x80, x.n, 64] });
  });
  ev2.sort((a, b) => a.t - b.t || a.k - b.k);
  let last = 0;
  for (const e of ev2) { push(e.t - last, ...e.b); last = e.t; }
  push(t - last, 0xff, 0x2f, 0x00);

  const head = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (PPQ >> 8) & 255, PPQ & 255];
  const trk = [0x4d, 0x54, 0x72, 0x6b, ...u32(ev.length)];
  return new Uint8Array([...head, ...trk, ...ev]);
}

async function exportMidi() {
  if (!trimmed().length) { alert('音符がありません。'); return; }
  const bytes = buildMidi();
  const fname = (D().title || I().title).replace(/[\\/:*?"<>|]/g, '_') + '.mid';
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
  D().cur = +col.dataset.i;
  const cell = e.target.closest('.cell');
  if (cell) D().str = +cell.dataset.s;
  commit();
});

el.labels.addEventListener('click', (e) => {
  const s = e.target.closest('[data-s]');
  if (!s) return;
  buf = '';
  D().str = +s.dataset.s;
  commit();
});

el.title.addEventListener('input', () => { D().title = el.title.value; save(); });
el.tempo.addEventListener('change', () => {
  const v = Math.round(+el.tempo.value);
  D().tempo = Number.isFinite(v) ? Math.min(300, Math.max(30, v)) : 100;
  commit();
});
el.help.addEventListener('click', () => el.helpDlg.showModal());

const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  Enter: 'ins', Backspace: 'del', Delete: 'x', ' ': 'play',
  x: 'mute', X: 'mute', '.': 'dot', '=': 'midi',
};
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, dialog') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = /^\d$/.test(e.key) ? e.key : KEYMAP[e.key];
  if (!k) return;
  e.preventDefault();
  press(k);
  const btn = el.keys.querySelector(`[data-k="${k}"]`);
  if (btn) { btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 100); }
});

/* 音価キーの表示を音符アイコンに（TAB 表示と同じ描画を流用） */
el.keys.querySelectorAll('.k-dur[data-k^="d"]').forEach((b) => {
  const d = +b.dataset.k.slice(1);
  b.innerHTML = `${durIcon(d, false, false)}<span class="cap">${DUR_NAME[d].replace('音符', '')}</span>`;
  b.setAttribute('aria-label', DUR_NAME[d]);
});

render();

/* ===== PWA ===== */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
