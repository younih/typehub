/* ===== TypeHub App — منطق اصلی (کپسول‌های حروف با فیدبک زنده) ===== */
const $ = (s) => document.querySelector(s);
const faNum = (n) => String(n).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

/* ---------- ذخیره‌سازی ---------- */
const LS_KEY = 'typehub_v1';
const store = {
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch { this.data = null; }
    if (!this.data) this.data = { xp: 0, streak: 0, lastDay: null, done: 0, correctWords: 0, totalWords: 0, accSum: 0, wpmSum: 0, levelDone: {}, mistakes: [], dayDone: {} };
    return this.data;
  },
  save() { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); }
};
const P = store.load();

/* ---------- وضعیت نشست (حافظه‌ای) ---------- */
let perfectRun = 0;
let sessionXp = 0;

/* ===== PURE-LOGIC: ماشین حالت کپسول‌ها (بدون DOM — قابل تست در node) =====
   state: { targets:['do','you'], words:['',''], cur:0, cheated:false }
   cur = ایندکس کلمه‌ی جاری؛ مکان‌نما همیشه انتهای متن تایپ‌شده‌ی آن کلمه است */
function newPills(targets) { return { targets, words: targets.map(() => ''), cur: 0, cheated: false }; }
function pillFull(st, i) { return st.words[i].length >= st.targets[i].length; }
function allPillsFull(st) { return st.targets.every((t, i) => pillFull(st, i)); }
function firstOpenPill(st) { return st.targets.findIndex((t, i) => !pillFull(st, i)); }
function pillType(st, ch) {
  // 'ok' | 'bad' | 'full' | 'rej' — به‌همراه موقعیت کپسول لمس‌شده
  ch = String(ch).toLowerCase();
  if (!/^[a-z']$/.test(ch)) return { res: 'rej' };
  const w = st.cur, t = st.targets[w];
  if (st.words[w].length >= t.length) return { res: 'full' };
  const c = st.words[w].length;
  st.words[w] += ch;
  return { res: ch === t[c] ? 'ok' : 'bad', w, c };
}
function pillBackspace(st) {
  // 'del' | 'prev' | 'noop'
  const w = st.cur;
  if (st.words[w].length > 0) { st.words[w] = st.words[w].slice(0, -1); return 'del'; }
  if (w > 0) { st.cur = w - 1; return 'prev'; }
  return 'noop';
}
function pillSpace(st) {
  // 'next' | 'submit' | 'noop'
  const w = st.cur;
  if (st.words[w].length === 0) return 'noop';
  if (allPillsFull(st)) return 'submit';
  for (let k = 1; k <= st.targets.length; k++) {
    const i = (w + k) % st.targets.length;
    if (!pillFull(st, i)) { st.cur = i; return 'next'; }
  }
  return 'submit';
}
function pillEnter(st) { return allPillsFull(st) ? 'submit' : 'goto-empty'; }
function pillHint(st) {
  // حرف بعدی کلمه‌ی جاری (یا اولین کلمه‌ی ناقص) را آشکار می‌کند
  let w = st.cur;
  if (pillFull(st, w)) { w = firstOpenPill(st); if (w < 0) return false; st.cur = w; }
  const t = st.targets[w];
  st.words[w] += t[st.words[w].length];
  st.cheated = true;
  return true;
}
function pillReveal(st) {
  // کل کلمه‌ی جاری (یا اولین کلمه‌ی ناقص) را پر می‌کند
  let w = st.cur;
  if (pillFull(st, w)) { w = firstOpenPill(st); if (w < 0) return false; st.cur = w; }
  st.words[w] = st.targets[w];
  st.cheated = true;
  return true;
}
function pillsText(st) { return st.words.join(' '); }
function pillAccuracy(st) {
  // دقت لحظه‌ای حرف‌به‌حرف از روی کپسول‌ها
  let ok = 0, n = 0;
  st.targets.forEach((t, w) => {
    const typed = st.words[w];
    for (let c = 0; c < typed.length; c++) { n++; if (typed[c] === t[c]) ok++; }
  });
  return n ? Math.round(ok / n * 100) : null;
}
/* ===== /PURE-LOGIC ===== */

/* ---------- ناوبری ---------- */
function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-' + name).classList.add('active');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.nav === name));
  window.scrollTo(0, 0);
  if (name === 'levels') renderLevelCards('#level-list', true);
  if (name === 'stats') renderStats();
  if (name === 'review') renderReview();
  if (name === 'home') renderHome();
}
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) { Engine.stopSpeak(); show(nav.dataset.nav); }
});

/* ---------- خانه ---------- */
function renderHome() {
  $('#pill-xp-n').textContent = faNum(P.xp);
  $('#pill-streak-n').textContent = faNum(P.streak);
  $('#review-count').textContent = faNum(P.mistakes.length) + ' کلمه برای مرور';
  $('#stats-summary').textContent = P.done
    ? `${faNum(P.done)} تمرین • میانگین دقت ${faNum(Math.round(P.accSum / P.done))}٪`
    : 'هنوز تمرینی ثبت نشده';
  const GOAL = 5;
  const todayDone = (P.dayDone && P.dayDone[Engine.todayKey()]) || 0;
  const frac = Math.min(todayDone / GOAL, 1);
  const ring = $('#ring-fg');
  if (ring) {
    const C = 2 * Math.PI * 34;
    ring.style.strokeDasharray = String(C);
    ring.style.strokeDashoffset = String(C * (1 - frac));
    ring.classList.toggle('done', frac >= 1);
    $('#goal-num').textContent = faNum(todayDone) + ' / ' + faNum(GOAL);
  }
  renderLevelCards('#path-list', false);
}
$('#btn-start-zero').addEventListener('click', () => startLevel(0));
$('#btn-continue').addEventListener('click', () => {
  const lvl = LEVELS.find(l => (P.levelDone[l.id] || 0) < l.items.length) || LEVELS[LEVELS.length - 1];
  startLevel(lvl.id);
});

/* ---------- کارت‌های مسیر ---------- */
function renderLevelCards(boxSel, withTip) {
  const box = $(boxSel);
  if (!box) return;
  box.innerHTML = '';
  LEVELS.forEach((l, i) => {
    const done = Math.min(P.levelDone[l.id] || 0, l.items.length);
    const pct = Math.round(done / l.items.length * 100);
    const isDone = done >= l.items.length;
    const el = document.createElement('div');
    el.className = 'path-card' + (isDone ? ' done' : '');
    el.innerHTML = `
      <div class="num">${String(i + 1).padStart(2, '0')}</div>
      <div class="path-body">
        <div class="path-name">${l.name}</div>
        <div class="path-desc">${l.desc}</div>
        ${withTip && l.tip ? `<div class="path-desc">💡 ${l.tip}</div>` : ''}
        <div class="path-prog"><i style="width:${pct}%"></i></div>
        <div class="path-meta">${isDone ? '✅ کامل شده' : faNum(done) + ' از ' + faNum(l.items.length) + ' تمرین'}</div>
      </div>
      <div class="path-ico">${l.icon}</div>`;
    el.addEventListener('click', () => startLevel(l.id));
    box.appendChild(el);
  });
}

/* ---------- دموی خانه ---------- */
$('#demo-play').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  await Engine.speak('sheep ship');
  btn.disabled = false;
});

/* ---------- ویوفرم ---------- */
function buildWave(sel) {
  const w = $(sel);
  if (!w) return;
  w.innerHTML = '';
  for (let i = 0; i < 24; i++) {
    const b = document.createElement('span');
    b.className = 'wbar';
    b.style.animationDelay = (Math.random() * -1.2).toFixed(2) + 's';
    b.style.animationDuration = (0.65 + Math.random() * 0.75).toFixed(2) + 's';
    w.appendChild(b);
  }
}
buildWave('#wave');
buildWave('#place-wave');
function setPlaying(btnSel, waveSel, on) {
  const btn = $(btnSel), wave = $(waveSel);
  if (btn) { btn.classList.toggle('playing', on); btn.textContent = on ? '⏸' : '▶'; }
  if (wave) wave.classList.toggle('playing', on);
}

/* ---------- ابزارهای مشترک کپسول‌ها ---------- */
const PILL_UI = {
  p:  { box: '#pill-row',    hidden: '#type-hidden' },
  pl: { box: '#place-pills', hidden: '#place-hidden' }
};
function sessOf(tag) { return tag === 'p' ? S : PL; }
/* قفل بودن جلسه: تمرین از doneOnce و تعیین سطح از done استفاده می‌کند */
function sessLocked(sess) { return !sess || sess.doneOnce || sess.done || !sess.st; }
function focusHidden(tag) {
  if (IS_TOUCH) return; // روی موبایل کیبورد سیستمی نباید خودکار باز شود
  const inp = $(PILL_UI[tag].hidden);
  if (inp) inp.focus({ preventScroll: true });
}
function renderPills(tag, shakeAt) {
  const sess = sessOf(tag);
  if (!sess || !sess.st) return;
  const box = $(PILL_UI[tag].box);
  box.innerHTML = '';
  sess.st.targets.forEach((t, w) => {
    const wg = document.createElement('div');
    wg.className = 'pword';
    wg.addEventListener('click', () => {
      if (sessLocked(sess)) return;
      sess.st.cur = w;
      renderPills(tag);
      focusHidden(tag);
    });
    for (let c = 0; c < t.length; c++) {
      const p = document.createElement('span');
      p.className = 'pch';
      const typed = sess.st.words[w][c];
      if (typed !== undefined && typed !== '') {
        p.textContent = typed;
        p.classList.add(typed === t[c] ? 'ok' : 'bad');
      } else if (w === sess.st.cur && c === sess.st.words[w].length) {
        p.classList.add('cur');
      }
      if (shakeAt && shakeAt.w === w && shakeAt.c === c) p.classList.add('shk');
      wg.appendChild(p);
    }
    box.appendChild(wg);
  });
  updateLiveAcc(tag);
}
function updateLiveAcc(tag) {
  if (tag !== 'p') return;
  const el = $('#live-acc');
  if (!el) return;
  const a = pillAccuracy(sessOf(tag).st);
  el.textContent = a === null ? '—' : faNum(a) + '٪';
}
function shakePillRow(tag) {
  const box = $(PILL_UI[tag].box);
  box.style.animation = 'none'; void box.offsetWidth;
  box.style.animation = 'shk .3s ease';
}

/* اکشن‌های ورودی — یک مسیر واحد برای کیبورد فیزیکی، input مخفی و OSK */
function doChar(tag, ch) {
  const sess = sessOf(tag);
  if (sessLocked(sess)) return;
  const r = pillType(sess.st, ch);
  if (r.res === 'rej') return;
  if (!sess.t0) sess.t0 = Date.now();
  if (r.res === 'full') { shakePillRow(tag); return; }
  renderPills(tag, r.res === 'bad' ? { w: r.w, c: r.c } : null);
}
function doBackspace(tag) {
  const sess = sessOf(tag);
  if (sessLocked(sess)) return;
  if (pillBackspace(sess.st) !== 'noop') { if (!sess.t0) sess.t0 = Date.now(); renderPills(tag); }
}
function doSpace(tag) {
  const sess = sessOf(tag);
  if (sessLocked(sess)) return;
  const r = pillSpace(sess.st);
  if (r === 'submit') trySubmit(tag);
  else if (r === 'next') { if (!sess.t0) sess.t0 = Date.now(); renderPills(tag); }
  else shakePillRow(tag); // کلمه‌ی جاری خالی است
}
function doEnter(tag) {
  const sess = sessOf(tag);
  if (sessLocked(sess)) return;
  const r = pillEnter(sess.st);
  if (r === 'submit') trySubmit(tag);
  else { const fi = firstOpenPill(sess.st); if (fi >= 0) { sess.st.cur = fi; renderPills(tag); } }
}
function doSkip(tag) {
  if (tag === 'p') {
    if (!S) return;
    perfectRun = 0;
    renderSess();
    stopTimer();
    nextItem();
  } else if (PL) placeNext();
}

/* input نامرئی: همه‌ی keystrokeها */
function bindHidden(tag) {
  const inp = $(PILL_UI[tag].hidden);
  if (!inp) return;
  inp.addEventListener('keydown', (e) => {
    const sess = sessOf(tag);
    if (sessLocked(sess)) return;
    if (e.key === 'Backspace') { e.preventDefault(); doBackspace(tag); }
    else if (e.key === ' ') { e.preventDefault(); doSpace(tag); }
    else if (e.key === 'Enter') { e.preventDefault(); doEnter(tag); }
    else if (e.key === 'Escape') { e.preventDefault(); doSkip(tag); }
    else if (e.key && e.key.length === 1) { e.preventDefault(); doChar(tag, e.key); }
  });
  inp.addEventListener('input', () => {
    // fallback برای کیبوردهای موبایلی که keydown درست نمی‌فرستند
    const v = inp.value;
    inp.value = '';
    if (!v) return;
    const sess = sessOf(tag);
    if (sessLocked(sess)) return;
    for (const ch of v) {
      if (ch === ' ') doSpace(tag);
      else if (ch === '\n') doEnter(tag);
      else doChar(tag, ch);
    }
  });
}
bindHidden('p');
bindHidden('pl');
/* کلیک روی ردیف کپسول‌ها = فوکوس ورودی */
Object.keys(PILL_UI).forEach(tag => {
  const box = $(PILL_UI[tag].box);
  if (box) box.addEventListener('click', (e) => {
    if (!e.target.closest('.pword')) focusHidden(tag);
  });
});

function trySubmit(tag) {
  const sess = sessOf(tag);
  if (sessLocked(sess)) return;
  if (!allPillsFull(sess.st)) {
    shakePillRow(tag);
    const fi = firstOpenPill(sess.st);
    if (fi >= 0) { sess.st.cur = fi; renderPills(tag); }
    return;
  }
  if (tag === 'p') finishItem(); else placeSubmit();
}

/* ---------- جلسه تمرین ---------- */
let S = null; // { level, queue, idx, playsLeft, slow, t0, st, doneOnce, timerId, finishedItem, titleSuffix, wrongWords }

function startLevel(levelId, customItems = null, titleSuffix = '') {
  const level = LEVELS.find(l => l.id === levelId);
  const items = customItems || Engine.shuffle(level.items);
  S = { level, queue: items, idx: 0, playsLeft: 3, slow: false, t0: null, st: null,
        doneOnce: false, timerId: null, finishedItem: null,
        titleSuffix, wrongWords: [] };
  show('practice');
  loadItem();
}

function currentItem() { return S.queue[S.idx]; }

function loadItem() {
  const item = currentItem();
  const total = S.queue.length;
  const isLetter = S.level.kind === 'letter';
  const targets = (isLetter ? [item.en] : Engine.tokenize(item.en)).map(Engine.normWord);
  S.st = newPills(targets);
  S.doneOnce = false; S.t0 = null;
  S.slow = false; S.playsLeft = Server.maxPlays;
  $('#practice-level').textContent = S.level.name + S.titleSuffix;
  $('#practice-count').textContent = `${faNum(S.idx + 1)} / ${faNum(total)}`;
  $('#practice-bar').style.width = (S.idx / total * 100) + '%';
  $('#btn-slow').classList.remove('on');
  $('#btn-hint').classList.remove('used');
  $('#btn-reveal').classList.remove('used');
  updatePlays();
  renderSess();
  renderPills('p');
  startTimer();
  setTimeout(() => { focusHidden('p'); playAudio(); }, 350);
}

function updatePlays() { if (S) $('#plays-left').textContent = faNum(S.playsLeft); }

function renderSess() {
  $('#sess-time').textContent = '۰۰:۰۰';
  $('#sess-score').textContent = faNum(sessionXp);
  $('#sess-combo').textContent = faNum(perfectRun);
}
function startTimer() {
  stopTimer();
  const t0 = Date.now();
  S.timerId = setInterval(() => {
    if (!S || !S.timerId) return;
    const s = Math.floor((Date.now() - t0) / 1000);
    const el = $('#sess-time');
    if (el) el.textContent = faNum(String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'));
  }, 1000);
}
function stopTimer() { if (S && S.timerId) { clearInterval(S.timerId); S.timerId = null; } }

async function playAudio() {
  if (!S || S.playsLeft <= 0 || S.doneOnce) return;
  S.playsLeft--;
  updatePlays();
  setPlaying('#btn-play', '#wave', true);
  await Engine.speak(currentItem().en, { rate: S.slow ? 0.75 : null });
  setPlaying('#btn-play', '#wave', false);
}
$('#btn-play').addEventListener('click', playAudio);
$('#btn-slow').addEventListener('click', (e) => {
  if (!S || S.doneOnce) return;
  S.slow = !S.slow;
  e.currentTarget.classList.toggle('on', S.slow);
  playAudio();
  focusHidden('p');
});

/* راهنمایی: حرف بعدی — کمبو می‌شکند */
$('#btn-hint').addEventListener('click', () => {
  if (!S || S.doneOnce || !S.st) return;
  if (pillHint(S.st)) {
    if (!S.t0) S.t0 = Date.now();
    $('#btn-hint').classList.add('used');
    renderPills('p');
  }
  focusHidden('p');
});
/* نمایش جواب: پر کردن کلمه‌ی جاری — کمبو می‌شکند */
$('#btn-reveal').addEventListener('click', () => {
  if (!S || S.doneOnce || !S.st) return;
  if (pillReveal(S.st)) {
    if (!S.t0) S.t0 = Date.now();
    $('#btn-reveal').classList.add('used');
    renderPills('p');
  }
  focusHidden('p');
});

$('#btn-check').addEventListener('click', () => trySubmit('p'));
$('#btn-skip').addEventListener('click', () => doSkip('p'));

function wordFa(item, enWord) {
  if (item.w) {
    const f = item.w.find(([en]) => Engine.normWord(en) === Engine.normWord(enWord));
    if (f) return f[1];
  }
  return item.fa || '';
}

function finishItem() {
  if (!S || S.doneOnce) return;
  S.doneOnce = true;
  stopTimer();
  setPlaying('#btn-play', '#wave', false);
  const item = currentItem();
  S.finishedItem = item;
  const typed = pillsText(S.st);
  const secs = S.t0 ? (Date.now() - S.t0) / 1000 : 5;
  const r = Engine.score(item.en, typed, secs, S.level.kind);
  const perfect = r.accuracy === 100 && !S.st.cheated;
  if (perfect) perfectRun++; else perfectRun = 0;
  const perfectBonus = (perfect && perfectRun >= 2) ? perfectRun * 10 : 0;
  const gainedXp = r.xp + perfectBonus;
  sessionXp += gainedXp;

  // ثبت پیشرفت
  P.done++; P.xp += gainedXp; P.correctWords += r.correct; P.totalWords += r.total;
  P.accSum += r.accuracy; P.wpmSum += r.wpm;
  const today0 = Engine.todayKey();
  if (!P.dayDone) P.dayDone = {};
  P.dayDone[today0] = (P.dayDone[today0] || 0) + 1;
  P.levelDone[S.level.id] = (P.levelDone[S.level.id] || 0) + 1;
  if (P.lastDay !== today0) {
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    P.streak = (P.lastDay === y) ? P.streak + 1 : 1;
    P.lastDay = today0;
  }
  const wrongs = r.wrong.map(wr => ({ en: wr.target, fa: wordFa(item, wr.target), level: S.level.id }));
  wrongs.forEach(wr => {
    if (!P.mistakes.some(m => m.en === wr.en)) P.mistakes.push(wr);
  });
  if (P.mistakes.length > 200) P.mistakes = P.mistakes.slice(-200);
  S.wrongWords = wrongs;
  store.save();
  Server.push();

  // جشن Perfect نئونی
  const pr = $('#perfect-ribbon');
  if (perfect) {
    let conf = '';
    for (let k = 0; k < 14; k++) conf += '<i></i>';
    pr.innerHTML = `<div class="pf-conf">${conf}</div>
      <div class="pf-big">Perfect × ${faNum(perfectRun)}</div>
      ${perfectBonus > 0 ? `<div class="pf-sub">+${faNum(perfectBonus)} بونوس کمبو 🔥</div>` : ''}`;
    pr.classList.remove('hidden');
    $('#result-title').textContent = 'آفرین! 🎉';
  } else {
    pr.classList.add('hidden'); pr.innerHTML = '';
    $('#result-title').textContent = r.accuracy >= 70 ? 'خوب پیش می‌ری! 💪' : 'اشکال نداره، ادامه بده 🌱';
  }
  $('#r-acc').textContent = faNum(r.accuracy) + '٪';
  $('#r-wpm').textContent = faNum(r.wpm);
  $('#r-xp').textContent = '+' + faNum(gainedXp);
  const rc = $('#r-combo');
  if (perfectBonus > 0) { rc.classList.remove('hidden'); rc.innerHTML = `🔥 کمبوی <b>×${faNum(perfectRun)}</b>: <b>+${faNum(perfectBonus)}</b> امتیاز اضافه`; }
  else rc.classList.add('hidden');

  // کارت کلمه: عبارت کامل + معنی فارسی زیر هر کلمه
  const box = $('#result-words');
  box.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'pcard';
  const pw = document.createElement('div');
  pw.className = 'pwords';
  const rawTargets = S.level.kind === 'letter' ? [item.en] : Engine.tokenize(item.en);
  rawTargets.forEach((tw) => {
    const d = r.detail.find(x => Engine.normWord(x.target) === Engine.normWord(tw));
    const w = document.createElement('div');
    w.className = 'pword' + (d && !d.ok ? ' bad' : '');
    const fa = wordFa(item, Engine.normWord(tw));
    w.innerHTML = `<span class="en">${tw}</span>` +
      (d && !d.ok ? `<span class="typed">✗ ${d.typed || '—'}</span>` : '') +
      `<span class="fa">${fa}</span>`;
    pw.appendChild(w);
  });
  card.appendChild(pw);
  const allFa = document.createElement('div');
  allFa.className = 'pfa';
  allFa.textContent = '🇮🇷 ' + item.fa;
  card.appendChild(allFa);
  box.appendChild(card);

  $('#btn-retry-wrong').style.display = wrongs.length ? '' : 'none';
  $('#practice-bar').style.width = ((S.idx + 1) / S.queue.length * 100) + '%';
  renderSess();
  show('result');
}

function nextItem() {
  if (!S) return;
  Engine.stopSpeak();
  stopTimer();
  setPlaying('#btn-play', '#wave', false);
  S.idx++;
  if (S.idx >= S.queue.length) { show('levels'); renderHome(); return; }
  show('practice');
  loadItem();
}
$('#btn-next').addEventListener('click', () => nextItem());
$('#btn-replay').addEventListener('click', () => {
  if (S && S.finishedItem) Engine.speak(S.finishedItem.en);
});
$('#btn-retry-wrong').addEventListener('click', () => {
  if (!S) return;
  const items = S.wrongWords.map(w => ({ en: w.en, fa: w.fa, topic: 'مرور خطا' }));
  startLevel(S.level.id, items, ' — مرور غلط‌ها');
});
/* Enter/Space روی صفحه نتیجه = تمرین بعدی */
document.addEventListener('keydown', (e) => {
  if (!$('#screen-result') || !$('#screen-result').classList.contains('active')) return;
  if (e.target && e.target.matches && e.target.matches('input,textarea')) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextItem(); }
});

/* ---------- کیبورد روی صفحه (QWERTY) ---------- */
function buildOSK(boxSel, tag) {
  const box = $(boxSel);
  if (!box) return;
  const rows = ['qwertyuiop', 'asdfghjkl', "zxcvbnm'"];
  box.innerHTML = '';
  rows.forEach((r, ri) => {
    const row = document.createElement('div');
    row.className = 'osk-row';
    r.split('').forEach(ch => {
      const k = document.createElement('button');
      k.type = 'button'; k.className = 'osk-key'; k.textContent = ch;
      k.addEventListener('click', () => oskPress(tag, ch));
      row.appendChild(k);
    });
    if (ri === 2) {
      const bk = document.createElement('button');
      bk.type = 'button'; bk.className = 'osk-key fn'; bk.textContent = '⌫'; bk.title = 'پاک کردن';
      bk.addEventListener('click', () => oskPress(tag, 'BKSP'));
      row.appendChild(bk);
    }
    box.appendChild(row);
  });
  const srow = document.createElement('div');
  srow.className = 'osk-row';
  const sp = document.createElement('button');
  sp.type = 'button'; sp.className = 'osk-key wide'; sp.textContent = 'فاصله';
  sp.addEventListener('click', () => oskPress(tag, 'SPACE'));
  srow.appendChild(sp);
  box.appendChild(srow);
}
function oskPress(tag, key) {
  const sess = sessOf(tag);
  if (sessLocked(sess)) return;
  if (key === 'BKSP') doBackspace(tag);
  else if (key === 'SPACE') doSpace(tag);
  else doChar(tag, key);
}
function setupKbToggle(btnSel, boxSel, tag) {
  const btn = $(btnSel), box = $(boxSel);
  if (!btn || !box) return;
  buildOSK(boxSel, tag);
  const set = (on) => { box.classList.toggle('hidden', !on); btn.classList.toggle('on', on); };
  set(IS_TOUCH);
  btn.addEventListener('click', () => { set(box.classList.contains('hidden')); });
}
setupKbToggle('#kb-toggle', '#osk', 'p');
setupKbToggle('#place-kb-toggle', '#place-osk', 'pl');

/* ---------- مرور خطاها ---------- */
function renderReview() {
  const box = $('#review-list');
  box.innerHTML = '';
  if (!P.mistakes.length) {
    box.innerHTML = '<div class="empty">هنوز خطایی ثبت نشده.<br>برو تمرین کن، خطاهات اینجا جمع می‌شن 📝</div>';
    return;
  }
  Engine.shuffle(P.mistakes).slice(0, 30).forEach(m => {
    const row = document.createElement('div');
    row.className = 'rw bad';
    row.innerHTML = `<span class="en">${m.en}</span><span class="fa">${m.fa}</span>`;
    box.appendChild(row);
  });
}
$('#btn-review-practice').addEventListener('click', () => {
  if (!P.mistakes.length) return;
  const items = Engine.shuffle(P.mistakes).slice(0, 15).map(m => ({ en: m.en, fa: m.fa, topic: 'مرور' }));
  startLevel(1, items, ' — مرور خطاها');
});
$('#btn-review-clear').addEventListener('click', () => {
  if (confirm('همه خطاهای ذخیره‌شده پاک بشن؟')) { P.mistakes = []; store.save(); renderReview(); renderHome(); }
});

/* ---------- آمار ---------- */
function renderStats() {
  $('#s-xp').textContent = faNum(P.xp);
  $('#s-streak').textContent = faNum(P.streak);
  $('#s-done').textContent = faNum(P.done);
  $('#s-acc').textContent = P.done ? faNum(Math.round(P.accSum / P.done)) + '٪' : '—';
  $('#s-wpm').textContent = P.done ? faNum(Math.round(P.wpmSum / P.done)) : '—';
  $('#s-words').textContent = faNum(P.correctWords);
}
$('#btn-reset').addEventListener('click', () => {
  if (confirm('کل پیشرفت (امتیاز، استریک، تاریخچه) پاک بشه؟')) {
    localStorage.removeItem(LS_KEY);
    location.reload();
  }
});

/* ---------- شروع ---------- */
renderHome();

/* ---------- سینک با سرور (در صورت لاگین) ---------- */
const Server = {
  user: null,
  maxPlays: 3,
  async boot() {
    try {
      const r = await TH.api('/api/public/site');
      if (r.body.ok && r.body.site) {
        if (r.body.site.max_plays) this.maxPlays = parseInt(r.body.site.max_plays, 10) || 3;
      }
    } catch (e) { /* آفلاین: ادامه با لوکال */ }
    let u = null;
    try { u = await TH.me(); } catch (e) { u = null; }
    this.user = u;
    const area = document.getElementById('auth-area');
    if (u) {
      area.innerHTML = '';
      const chip = document.createElement('button');
      chip.className = 'user-chip';
      chip.textContent = '👤 ' + u.name;
      chip.title = 'خروج از حساب';
      chip.addEventListener('click', () => { if (confirm('از حساب خارج بشی؟')) TH.logout(); });
      area.appendChild(chip);
      document.getElementById('btn-logout').classList.remove('hidden');
      document.getElementById('guest-banner').classList.add('hidden');
      try {
        const r = await TH.api('/api/th/progress', 'POST', { progress: P });
        if (r.body.ok && r.body.progress) {
          Object.assign(P, r.body.progress);
          store.save(); renderHome();
        }
      } catch (e) { /* بعداً دوباره تلاش می‌شود */ }
    } else {
      const a = document.createElement('a');
      a.className = 'login-link'; a.href = 'index.html'; a.textContent = 'ورود';
      area.appendChild(a);
      document.getElementById('guest-banner').classList.remove('hidden');
    }
  },
  push() {
    if (!this.user) return;
    TH.api('/api/th/progress', 'POST', { progress: P }).catch(() => {});
  }
};
Server.boot();
$('#btn-logout').addEventListener('click', () => { if (confirm('از حساب خارج بشی؟')) TH.logout(); });

/* ---------- تعیین سطح 🎯 (مدل کپسولی) ---------- */
let PL = null; // { qs, idx, correct, playsLeft, slow, t0, st, done }

function buildPlacementQs() {
  return [1, 2, 3, 4, 5, 6].map(lid => {
    const lv = LEVELS.find(l => l.id === lid);
    return lv.items[Math.floor(lv.items.length / 2)];
  });
}

$('#btn-placement').addEventListener('click', () => {
  PL = { qs: buildPlacementQs(), idx: 0, correct: 0, playsLeft: 2, slow: false, t0: null, st: null, done: false };
  $('#place-result').classList.add('hidden');
  show('placement');
  loadPlaceQ();
});

function loadPlaceQ() {
  const q = PL.qs[PL.idx];
  PL.playsLeft = 2; PL.slow = false; PL.t0 = null; PL.done = false;
  PL.st = newPills(Engine.tokenize(q.en).map(Engine.normWord));
  $('#place-count').textContent = `${faNum(PL.idx + 1)} / ${faNum(PL.qs.length)}`;
  $('#place-bar').style.width = (PL.idx / PL.qs.length * 100) + '%';
  $('#place-slow').classList.remove('on');
  updatePlacePlays();
  renderPills('pl');
  setTimeout(() => { focusHidden('pl'); placePlay(); }, 350);
}

function updatePlacePlays() { if (PL) $('#place-plays').textContent = faNum(PL.playsLeft); }

async function placePlay() {
  if (!PL || PL.playsLeft <= 0 || PL.done) return;
  PL.playsLeft--;
  updatePlacePlays();
  setPlaying('#place-play', '#place-wave', true);
  await Engine.speak(PL.qs[PL.idx].en, { rate: PL.slow ? 0.75 : null });
  setPlaying('#place-play', '#place-wave', false);
}
$('#place-play').addEventListener('click', placePlay);
$('#place-slow').addEventListener('click', (e) => {
  if (!PL || PL.done) return;
  PL.slow = !PL.slow;
  e.currentTarget.classList.toggle('on', PL.slow);
  placePlay();
  focusHidden('pl');
});

$('#place-check').addEventListener('click', () => trySubmit('pl'));
$('#place-skip').addEventListener('click', () => doSkip('pl'));

function placeSubmit() {
  if (!PL || PL.done) return;
  PL.done = true;
  setPlaying('#place-play', '#place-wave', false);
  const typed = pillsText(PL.st);
  const r = Engine.score(PL.qs[PL.idx].en, typed, 5, 'word');
  if (r.accuracy === 100) PL.correct++;
  setTimeout(placeNext, 650);
}

function placeNext() {
  if (!PL) return;
  Engine.stopSpeak();
  setPlaying('#place-play', '#place-wave', false);
  PL.idx++;
  if (PL.idx >= PL.qs.length) return placeFinish();
  loadPlaceQ();
}

function placeFinish() {
  const c = PL.correct;
  const suggest = c <= 0 ? 0 : c === 1 ? 1 : c === 2 ? 2 : c === 3 ? 3 : c === 4 ? 4 : 5;
  const lv = LEVELS.find(l => l.id === suggest);
  $('#place-bar').style.width = '100%';
  const box = $('#place-result');
  box.classList.remove('hidden');
  box.innerHTML = `<h3>نتیجه تعیین سطح 🎯</h3>
    <div class="big">${faNum(c)} از ${faNum(6)}</div>
    <p>سطح پیشنهادی برای تو:<br><b>${lv.name}</b> — ${lv.desc}</p>
    <button class="btn grad big" id="place-start">شروع از ${lv.name} ▶</button>
    <div style="margin-top:10px"><button class="btn ghost" data-nav="levels">دیدن همه سطح‌ها</button></div>`;
  $('#place-start').addEventListener('click', () => startLevel(suggest));
  PL = null;
}
