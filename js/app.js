/* ===== TypeHub App — منطق اصلی (مدل دیکته با جای خالی) ===== */
const $ = (s) => document.querySelector(s);
const faNum = (n) => String(n).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

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

/* ---------- وضعیت نشست (حافظه‌ای، نه ذخیره‌شده) ---------- */
let perfectRun = 0;   // تمرین‌های کامل پشت‌سرهم در این نشست
let sessionXp = 0;    // امتیاز گرفته‌شده در این نشست

/* ===== PURE-LOGIC: ماشین حالت جای خالی (بدون DOM — قابل تست در node) ===== */
function newBlanks(targets) { return { targets, vals: targets.map(() => ''), cur: 0 }; }
function fullAt(st, i) { return st.vals[i].length >= st.targets[i].length; }
function allFilled(st) { return st.vals.every((v, i) => fullAt(st, i)); }
function blankTypeChar(st, ch) {
  ch = String(ch).toLowerCase();
  if (!/^[a-z']$/.test(ch)) return false;
  const t = st.targets[st.cur];
  if (st.vals[st.cur].length >= t.length) return false;
  st.vals[st.cur] += ch;
  return true;
}
function blankBackspace(st) {
  // 'del' = یک حرف پاک شد | 'prev' = رفت به جای قبلی | 'noop'
  if (st.vals[st.cur].length > 0) { st.vals[st.cur] = st.vals[st.cur].slice(0, -1); return 'del'; }
  if (st.cur > 0) { st.cur--; return 'prev'; }
  return 'noop';
}
function blankSpace(st) {
  // 'next' = رفت سراغ جای خالی بعدی | 'submit' = همه پرند، ثبت کن | 'noop'
  if (st.vals[st.cur].length === 0) return 'noop';
  if (allFilled(st)) return 'submit';
  for (let k = 1; k <= st.targets.length; k++) {
    const i = (st.cur + k) % st.targets.length;
    if (!fullAt(st, i)) { st.cur = i; return 'next'; }
  }
  return 'submit';
}
function blankEnter(st) { return allFilled(st) ? 'submit' : 'goto-empty'; }
function firstOpenIdx(st) { return st.vals.findIndex((v, i) => !fullAt(st, i)); }
function blankHint(st) {
  // حرف بعدی جای خالی جاری (یا اولین جای ناقص) را نشان می‌دهد
  let i = st.cur;
  if (st.vals[i].length >= st.targets[i].length) {
    i = st.targets.findIndex((t, k) => st.vals[k].length < t.length);
    if (i < 0) return false;
    st.cur = i;
  }
  const t = st.targets[i];
  st.vals[i] += t[st.vals[i].length];
  return true;
}
function blankReveal(st) {
  // کل کلمه‌ی جای خالی جاری (یا اولین جای ناقص) را پر می‌کند
  let i = st.cur;
  if (st.vals[i].length >= st.targets[i].length) {
    i = st.targets.findIndex((t, k) => st.vals[k].length < t.length);
    if (i < 0) return false;
    st.cur = i;
  }
  st.vals[i] = st.targets[i];
  return true;
}
/* ===== /PURE-LOGIC ===== */

/* ---------- ناوبری ---------- */
function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-' + name).classList.add('active');
  document.querySelectorAll('.tab, .tnav').forEach(t => t.classList.toggle('active', t.dataset.nav === name));
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
  $('#pill-xp b').textContent = faNum(P.xp);
  $('#pill-streak b').textContent = faNum(P.streak);
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
$('#demo-play').addEventListener('click', async () => {
  const btn = $('#demo-play');
  btn.disabled = true;
  await Engine.speak('sheep ship');
  btn.disabled = false;
});

/* ---------- ابزارهای مشترک جای خالی ---------- */
const BLANK_UI = {
  p:  { box: '#blank-row',    hint: '#hint-line' },
  pl: { box: '#place-blanks', hint: '#place-hint' }
};
function sessOf(tag) { return tag === 'p' ? S : PL; }
function bInputs(tag) { return Array.from(document.querySelectorAll(BLANK_UI[tag].box + ' .blank')); }
function bSync(tag) {
  const sess = sessOf(tag);
  if (!sess || !sess.st) return;
  bInputs(tag).forEach((inp, i) => { sess.st.vals[i] = inp.value; });
}
function bPaint(tag) {
  const sess = sessOf(tag);
  if (!sess || !sess.st) return;
  bInputs(tag).forEach((inp, i) => {
    inp.classList.toggle('cur', i === sess.st.cur);
    inp.classList.toggle('filled', inp.value.length > 0);
  });
}
function bFocus(tag, i) {
  const inputs = bInputs(tag);
  if (inputs[i]) inputs[i].focus({ preventScroll: true });
}
function renderBlanks(tag) {
  const sess = sessOf(tag);
  const ui = BLANK_UI[tag];
  const box = $(ui.box), hint = $(ui.hint);
  const st = sess.st;
  const isLetter = (tag === 'p') ? sess.level.kind === 'letter' : false;
  box.innerHTML = '';
  box.classList.remove('shake');
  if (hint) {
    if (isLetter) { hint.classList.add('hidden'); hint.innerHTML = ''; }
    else {
      hint.classList.remove('hidden');
      hint.innerHTML = st.targets.map(t =>
        `<span class="hh"><b>${t[0]}</b>${'·'.repeat(Math.max(0, t.length - 1))}</span>`).join('');
    }
  }
  st.targets.forEach((t, i) => {
    const inp = document.createElement('input');
    inp.className = 'blank' + (i === st.cur ? ' cur' : '');
    inp.maxLength = t.length;
    inp.autocomplete = 'off'; inp.autocorrect = 'off'; inp.autocapitalize = 'off'; inp.spellcheck = false;
    inp.setAttribute('aria-label', 'کلمه‌ی ' + faNum(i + 1));
    inp.style.width = Math.max(52, t.length * 22 + 30) + 'px';
    inp.addEventListener('input', () => onBlankInput(tag, inp, i));
    inp.addEventListener('keydown', (e) => onBlankKey(tag, e, inp, i));
    inp.addEventListener('focus', () => {
      const s2 = sessOf(tag);
      if (s2 && !s2.doneOnce) { s2.st.cur = i; bPaint(tag); }
    });
    box.appendChild(inp);
  });
}
function onBlankInput(tag, inp, i) {
  const sess = sessOf(tag);
  if (!sess || sess.doneOnce) return;
  const max = sess.st.targets[i].length;
  inp.value = inp.value.toLowerCase().replace(/[^a-z']/g, '').slice(0, max);
  if (!sess.t0) sess.t0 = Date.now();
  bSync(tag);
  bPaint(tag);
}
function onBlankKey(tag, e, inp, i) {
  const sess = sessOf(tag);
  if (!sess || sess.doneOnce) return;
  if (e.key === 'Backspace' && inp.value === '' && i > 0) {
    e.preventDefault();
    sess.st.cur = i - 1;
    bPaint(tag); bFocus(tag, i - 1);
  } else if (e.key === ' ') {
    e.preventDefault();
    bSync(tag);
    const r = blankSpace(sess.st);
    if (r === 'submit') trySubmit(tag);
    else if (r === 'next') { bPaint(tag); bFocus(tag, sess.st.cur); }
    else shakeBlank(inp);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    bSync(tag);
    if (blankEnter(sess.st) === 'submit') trySubmit(tag);
    else { const fi = firstOpenIdx(sess.st); if (fi >= 0) { sess.st.cur = fi; bPaint(tag); bFocus(tag, fi); } }
  }
}
function shakeBlank(inp) {
  inp.classList.remove('shk'); void inp.offsetWidth; inp.classList.add('shk');
}
function trySubmit(tag) {
  const sess = sessOf(tag);
  if (!sess || sess.doneOnce) return;
  bSync(tag);
  if (!allFilled(sess.st)) {
    const box = $(BLANK_UI[tag].box);
    box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
    const fi = firstOpenIdx(sess.st);
    if (fi >= 0) { sess.st.cur = fi; bPaint(tag); bFocus(tag, fi); }
    return;
  }
  if (tag === 'p') finishItem(); else placeSubmit();
}

/* ---------- جلسه تمرین ---------- */
let S = null; // { level, queue, idx, playsLeft, slow, t0, st, cheated, doneOnce, timerId, finishedItem, titleSuffix, wrongWords }

function startLevel(levelId, customItems = null, titleSuffix = '') {
  const level = LEVELS.find(l => l.id === levelId);
  const items = customItems || Engine.shuffle(level.items);
  S = { level, queue: items, idx: 0, playsLeft: 3, slow: false, t0: null, st: null,
        cheated: false, doneOnce: false, timerId: null, finishedItem: null,
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
  S.st = newBlanks(targets);
  S.cheated = false; S.doneOnce = false; S.t0 = null;
  S.slow = false; S.playsLeft = Server.maxPlays;
  $('#practice-level').textContent = S.level.name + S.titleSuffix;
  $('#practice-count').textContent = `${faNum(S.idx + 1)} / ${faNum(total)}`;
  $('#practice-bar').style.width = (S.idx / total * 100) + '%';
  $('#btn-slow').classList.remove('on');
  $('#btn-hint').classList.remove('used');
  $('#btn-reveal').classList.remove('used');
  updatePlays();
  renderSess();
  renderBlanks('p');
  startTimer();
  setTimeout(() => { bFocus('p', 0); playAudio(); }, 350);
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
  const item = currentItem();
  S.playsLeft--;
  updatePlays();
  const btn = $('#btn-play');
  btn.classList.add('playing');
  await Engine.speak(item.en, { slow: S.slow });
  btn.classList.remove('playing');
}
$('#btn-play').addEventListener('click', playAudio);
$('#btn-slow').addEventListener('click', (e) => {
  if (!S || S.doneOnce) return;
  S.slow = !S.slow;
  e.currentTarget.classList.toggle('on', S.slow);
  if (S.playsLeft < Server.maxPlays) { S.playsLeft++; updatePlays(); } // پخش آهسته یک شانس اضافه
  playAudio();
});

/* راهنمایی: حرف بعدی جای خالی جاری — کمبو می‌شکند */
$('#btn-hint').addEventListener('click', () => {
  if (!S || S.doneOnce) return;
  bSync('p');
  if (blankHint(S.st)) {
    S.cheated = true;
    $('#btn-hint').classList.add('used');
    if (!S.t0) S.t0 = Date.now();
    renderBlanks('p');
    // مقدارها را از state برگردان (renderBlanks ورودی خالی می‌سازد)
    const inputs = bInputs('p');
    inputs.forEach((inp, i) => { inp.value = S.st.vals[i]; });
    bPaint('p'); bFocus('p', S.st.cur);
  }
});
/* نمایش جواب: پر کردن جای خالی جاری — کمبو می‌شکند */
$('#btn-reveal').addEventListener('click', () => {
  if (!S || S.doneOnce) return;
  bSync('p');
  if (blankReveal(S.st)) {
    S.cheated = true;
    $('#btn-reveal').classList.add('used');
    if (!S.t0) S.t0 = Date.now();
    renderBlanks('p');
    const inputs = bInputs('p');
    inputs.forEach((inp, i) => { inp.value = S.st.vals[i]; });
    bPaint('p'); bFocus('p', S.st.cur);
  }
});

$('#btn-check').addEventListener('click', () => trySubmit('p'));
$('#btn-skip').addEventListener('click', () => {
  if (!S) return;
  perfectRun = 0; // رد کردن هم کمبو را می‌شکند
  renderSess();
  stopTimer();
  nextItem();
});

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
  bSync('p');
  const item = currentItem();
  S.finishedItem = item;
  const typed = S.st.vals.join(' ');
  const secs = S.t0 ? (Date.now() - S.t0) / 1000 : 5;
  const r = Engine.score(item.en, typed, secs, S.level.kind);
  const perfect = r.accuracy === 100 && !S.cheated;
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
  const today = Engine.todayKey();
  if (P.lastDay !== today) {
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    P.streak = (P.lastDay === y) ? P.streak + 1 : 1;
    P.lastDay = today;
  }
  const wrongs = r.wrong.map(wr => ({ en: wr.target, fa: wordFa(item, wr.target), level: S.level.id }));
  wrongs.forEach(wr => {
    if (!P.mistakes.some(m => m.en === wr.en)) P.mistakes.push(wr);
  });
  if (P.mistakes.length > 200) P.mistakes = P.mistakes.slice(-200);
  S.wrongWords = wrongs;
  store.save();
  Server.push();

  // جشن Perfect
  const pr = $('#perfect-ribbon');
  if (perfect) {
    let conf = '';
    for (let k = 0; k < 14; k++) conf += '<i></i>';
    pr.innerHTML = `<div class="pf-conf">${conf}</div>
      <div class="pf-big">!Perfect × ${faNum(perfectRun)}</div>
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
  rawTargets.forEach((tw, i) => {
    const d = r.detail[i];
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
  if (!sess || sess.doneOnce || !sess.st) return;
  const inputs = bInputs(tag);
  const i = sess.st.cur;
  const inp = inputs[i];
  if (!inp) return;
  if (key === 'BKSP') {
    if (inp.value.length > 0) inp.value = inp.value.slice(0, -1);
    else if (i > 0) { sess.st.cur = i - 1; bFocus(tag, i - 1); }
  } else if (key === 'SPACE') {
    bSync(tag);
    const r = blankSpace(sess.st);
    if (r === 'submit') { trySubmit(tag); return; }
    if (r === 'next') { bPaint(tag); bFocus(tag, sess.st.cur); return; }
    shakeBlank(inp); return;
  } else {
    const t = sess.st.targets[i];
    if (inp.value.length < t.length && /^[a-z']$/.test(key)) {
      inp.value += key;
      if (!sess.t0) sess.t0 = Date.now();
    } else { shakeBlank(inp); return; }
  }
  bSync(tag);
  bPaint(tag);
  inp.focus({ preventScroll: true });
}
function setupKbToggle(btnSel, boxSel, tag) {
  const btn = $(btnSel), box = $(boxSel);
  if (!btn || !box) return;
  buildOSK(boxSel, tag);
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const set = (on) => { box.classList.toggle('hidden', !on); btn.classList.toggle('on', on); };
  set(isTouch);
  btn.addEventListener('click', () => set(box.classList.contains('hidden')));
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

/* ---------- تعیین سطح 🎯 (مدل جای خالی) ---------- */
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
  PL.st = newBlanks(Engine.tokenize(q.en).map(Engine.normWord));
  $('#place-count').textContent = `${faNum(PL.idx + 1)} / ${faNum(PL.qs.length)}`;
  $('#place-bar').style.width = (PL.idx / PL.qs.length * 100) + '%';
  $('#place-slow').classList.remove('on');
  updatePlacePlays();
  renderBlanks('pl');
  setTimeout(() => { bFocus('pl', 0); placePlay(); }, 350);
}

function updatePlacePlays() { if (PL) $('#place-plays').textContent = faNum(PL.playsLeft); }

async function placePlay() {
  if (!PL || PL.playsLeft <= 0 || PL.done) return;
  PL.playsLeft--;
  updatePlacePlays();
  const b = $('#place-play');
  b.classList.add('playing');
  await Engine.speak(PL.qs[PL.idx].en, { slow: PL.slow });
  b.classList.remove('playing');
}
$('#place-play').addEventListener('click', placePlay);
$('#place-slow').addEventListener('click', (e) => {
  if (!PL || PL.done) return;
  PL.slow = !PL.slow;
  e.currentTarget.classList.toggle('on', PL.slow);
  placePlay();
});

$('#place-check').addEventListener('click', () => trySubmit('pl'));
$('#place-skip').addEventListener('click', () => { if (PL) placeNext(); });

function placeSubmit() {
  if (!PL || PL.done) return;
  PL.done = true;
  bSync('pl');
  const typed = PL.st.vals.join(' ');
  const r = Engine.score(PL.qs[PL.idx].en, typed, 5, 'word');
  if (r.accuracy === 100) PL.correct++;
  setTimeout(placeNext, 650);
}

function placeNext() {
  if (!PL) return;
  Engine.stopSpeak();
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
    <button class="btn coral big" id="place-start">شروع از ${lv.name} ▶</button>
    <div style="margin-top:10px"><button class="btn ghost" data-nav="levels">دیدن همه سطح‌ها</button></div>`;
  $('#place-start').addEventListener('click', () => startLevel(suggest));
  PL = null;
}
