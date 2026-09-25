/* ===== TypeHub App — منطق اصلی ===== */
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

/* ---------- ناوبری ---------- */
function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-' + name).classList.add('active');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.nav === name));
  window.scrollTo(0, 0);
  if (name === 'levels') renderLevels();
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
  // حلقه هدف روزانه
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
}
$('#btn-continue').addEventListener('click', () => {
  // اولین سطحی که هنوز کامل نشده
  const lvl = LEVELS.find(l => (P.levelDone[l.id] || 0) < l.items.length) || LEVELS[LEVELS.length - 1];
  startLevel(lvl.id);
});

/* ---------- لیست سطح‌ها ---------- */
function renderLevels() {
  const box = $('#level-list');
  box.innerHTML = '';
  LEVELS.forEach(l => {
    const done = Math.min(P.levelDone[l.id] || 0, l.items.length);
    const el = document.createElement('div');
    el.className = 'level-card';
    el.innerHTML = `
      <div class="level-num">${l.icon}</div>
      <div class="level-info">
        <div class="level-name">${l.name}</div>
        <div class="level-desc">${l.desc}</div>
        ${l.tip ? `<div class="level-tip">💡 ${l.tip}</div>` : ''}
        <div class="level-prog">${faNum(done)} از ${faNum(l.items.length)} تمرین انجام شده</div>
      </div>`;
    el.addEventListener('click', () => startLevel(l.id));
    box.appendChild(el);
  });
}

/* ---------- جلسه تمرین ---------- */
let S = null; // { level, queue, idx, playsLeft, slow, t0, wrongWords }

function startLevel(levelId, customItems = null, titleSuffix = '') {
  const level = LEVELS.find(l => l.id === levelId);
  const items = customItems || Engine.shuffle(level.items);
  S = { level, queue: items, idx: 0, playsLeft: 3, slow: false, t0: null, wrongWords: [], titleSuffix };
  show('practice');
  loadItem();
}

function currentItem() { return S.queue[S.idx]; }

function loadItem() {
  const item = currentItem();
  const total = S.queue.length;
  S.submitted = false;
  S.combo = 0; S.comboBest = 0; S.spokenIdx = -1;
  const cp = $('#combo-pill'); if (cp) cp.classList.add('hidden');
  $('#practice-level').textContent = S.level.name + S.titleSuffix;
  $('#practice-count').textContent = `${faNum(S.idx + 1)} / ${faNum(total)}`;
  $('#practice-bar').style.width = (S.idx / total * 100) + '%';
  $('#type-input').value = '';
  $('#live-acc').textContent = '—';
  $('#btn-slow').classList.remove('on');
  S.slow = false; S.playsLeft = Server.maxPlays; S.t0 = null;
  updatePlays();
  renderChips(item, '');
  setTimeout(() => { $('#type-input').focus({ preventScroll: true }); playAudio(); }, 350);
}

function updatePlays() { $('#plays-left').textContent = faNum(S.playsLeft); }

async function playAudio() {
  if (S.playsLeft <= 0) return;
  const item = currentItem();
  S.playsLeft--;
  updatePlays();
  const btn = $('#btn-play');
  btn.classList.add('playing');
  // کارائوکه: کلمه‌ای که دارد گفته می‌شود روشن می‌شود
  await Engine.speakKaraoke(item.en, { slow: S.slow, onWord: (i) => { S.spokenIdx = i; karaokeHL('#word-chips', i); } });
  btn.classList.remove('playing');
  S.spokenIdx = -1;
  karaokeHL('#word-chips', -1);
}
// هایلایت چیپ شماره i داخل باکس (i منفی = پاک کردن)
function karaokeHL(boxSel, i) {
  const box = $(boxSel);
  if (!box) return;
  const kids = box.children;
  for (let k = 0; k < kids.length; k++) kids[k].classList.toggle('spoken', k === i);
}
$('#btn-play').addEventListener('click', playAudio);
$('#btn-slow').addEventListener('click', (e) => {
  S.slow = !S.slow;
  e.currentTarget.classList.toggle('on', S.slow);
  if (S.playsLeft < Server.maxPlays) { S.playsLeft++; updatePlays(); } // پخش آهسته یک شانس اضافه
  playAudio();
});

function renderChips(item, typed) {
  const box = $('#word-chips');
  const prev = box._st || [];
  box.innerHTML = '';
  const targets = S.level.kind === 'letter' ? [item.en] : Engine.tokenize(item.en);
  const typedWords = typed.split(/\s+/).map(Engine.normWord);
  const now = [];
  targets.forEach((tw, i) => {
    const d = document.createElement('div');
    d.className = 'chip-w';
    d.textContent = tw;
    const yw = typedWords[i] || '';
    let st = '';
    if (yw !== '') {
      if (yw === tw) st = 'ok';
      else if (typedWords.length > i + 1 || (S.level.kind !== 'letter' && typed.endsWith(' ')) || yw.length >= tw.length) st = 'bad';
    }
    now.push(st);
    if (st) d.classList.add(st);
    if (i === S.spokenIdx) d.classList.add('spoken'); // حفظ هایلایت کارائوکه هنگام تایپ
    // حس بازی: کلمه‌ای که تازه درست شد می‌پرد + کمبو
    if (st === 'ok' && prev[i] !== 'ok') {
      d.classList.add('pop');
      S.combo++;
      if (S.combo > S.comboBest) S.comboBest = S.combo;
      updateComboPill(false);
    }
    // خطا کمبو را می‌شکند
    if (st === 'bad' && prev[i] !== 'bad' && S.combo > 0) {
      S.combo = 0;
      updateComboPill(true);
    }
    box.appendChild(d);
  });
  box._st = now;
}

// نمایش/به‌روزرسانی نشان کمبو
function updateComboPill(broken) {
  const pill = $('#combo-pill');
  if (!pill) return;
  if (S.combo >= 2) {
    pill.classList.remove('hidden');
    $('#combo-n').textContent = faNum(S.combo);
    pill.classList.remove('pop', 'shake');
    void pill.offsetWidth; // ری‌استارت انیمیشن
    pill.classList.add(broken ? 'shake' : 'pop');
  } else {
    pill.classList.add('hidden');
  }
}

$('#type-input').addEventListener('input', (e) => {
  if (!S) return;
  const item = currentItem();
  if (!S.t0) S.t0 = Date.now();
  let v = e.target.value;
  if (S.level.kind === 'letter' && v.length > 1) { v = v.slice(-1); e.target.value = v; }
  renderChips(item, v);
  const acc = Engine.liveAccuracy(item.en, v);
  $('#live-acc').textContent = acc === null ? '—' : faNum(acc) + '٪';
  // تشخیص خودکار: وقتی کل جواب درست تایپ شد، بدون دکمه دستی ثبت می‌شود
  if (!S.submitted) {
    const targets = S.level.kind === 'letter' ? [item.en] : Engine.tokenize(item.en);
    const want = targets.map(Engine.normWord).join(' ');
    const got = Engine.tokenize(v).join(' ');
    if (got !== '' && got === want) {
      S.submitted = true;
      e.target.classList.add('auto-ok');
      setTimeout(() => { e.target.blur(); finishItem(); }, 500);
    }
  }
});

$('#btn-check').addEventListener('click', finishItem);
$('#type-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishItem(); }
});
$('#btn-skip').addEventListener('click', () => { nextItem(false); });

function wordFa(item, enWord) {
  if (item.w) {
    const f = item.w.find(([en]) => Engine.normWord(en) === Engine.normWord(enWord));
    if (f) return f[1];
  }
  return item.fa || '';
}

function finishItem() {
  const item = currentItem();
  const typed = $('#type-input').value;
  const secs = S.t0 ? (Date.now() - S.t0) / 1000 : 5;
  const r = Engine.score(item.en, typed, secs, S.level.kind);

  // ثبت پیشرفت (+ بونوس کمبو)
  const comboBonus = S.comboBest >= 3 ? S.comboBest * 2 : 0;
  const gainedXp = r.xp + comboBonus;
  P.done++; P.xp += gainedXp; P.correctWords += r.correct; P.totalWords += r.total;
  P.accSum += r.accuracy; P.wpmSum += r.wpm;
  const today0 = Engine.todayKey();
  if (!P.dayDone) P.dayDone = {};
  P.dayDone[today0] = (P.dayDone[today0] || 0) + 1;
  P.levelDone[S.level.id] = (P.levelDone[S.level.id] || 0) + 1;
  // استریک
  const today = Engine.todayKey();
  if (P.lastDay !== today) {
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    P.streak = (P.lastDay === y) ? P.streak + 1 : 1;
    P.lastDay = today;
  }
  // خطاها
  const wrongs = r.wrong.map(wr => ({ en: wr.target, fa: wordFa(item, wr.target), level: S.level.id }));
  wrongs.forEach(wr => {
    if (!P.mistakes.some(m => m.en === wr.en)) P.mistakes.push(wr);
  });
  if (P.mistakes.length > 200) P.mistakes = P.mistakes.slice(-200);
  S.wrongWords = wrongs;
  store.save();
  Server.push(); // همگام‌سازی با سرور (اگر لاگین است)

  // نمایش نتیجه
  $('#result-title').textContent = r.accuracy === 100 ? 'عالی بود! 🎉' : r.accuracy >= 70 ? 'خوب پیش می‌ری! 💪' : 'اشکال نداره، ادامه بده 🌱';
  $('#r-acc').textContent = faNum(r.accuracy) + '٪';
  $('#r-wpm').textContent = faNum(r.wpm);
  $('#r-xp').textContent = '+' + faNum(gainedXp);
  const rc = $('#r-combo');
  if (rc) {
    if (comboBonus > 0) { rc.classList.remove('hidden'); rc.innerHTML = `🔥 بونوس کمبو <b>×${faNum(S.comboBest)}</b>: <b>+${faNum(comboBonus)}</b>`; }
    else rc.classList.add('hidden');
  }
  const box = $('#result-words');
  box.innerHTML = '';
  r.detail.forEach(d => {
    const row = document.createElement('div');
    row.className = 'rw ' + (d.ok ? 'ok' : 'bad');
    const fa = wordFa(item, d.target);
    row.innerHTML = d.ok
      ? `<span class="en">${d.target}</span><span class="fa">${fa}</span>`
      : `<span class="en">${d.target}</span><span class="fix">✗ ${d.typed || '—'}</span><span class="fa">${fa}</span>`;
    box.appendChild(row);
  });
  // معنی کل جمله
  const all = document.createElement('div');
  all.className = 'rw';
  all.innerHTML = `<span class="en" style="font-weight:400">${item.en}</span><span class="fa">🇮🇷 ${item.fa}</span>`;
  box.appendChild(all);
  $('#btn-retry-wrong').style.display = wrongs.length ? '' : 'none';
  $('#practice-bar').style.width = ((S.idx + 1) / S.queue.length * 100) + '%';
  show('result');
}

function nextItem(counted = true) {
  Engine.stopSpeak();
  S.idx++;
  if (S.idx >= S.queue.length) { show('levels'); renderHome(); return; }
  show('practice');
  loadItem();
}
$('#btn-next').addEventListener('click', () => nextItem());
$('#btn-retry-wrong').addEventListener('click', () => {
  const items = S.wrongWords.map(w => ({ en: w.en, fa: w.fa, topic: 'مرور خطا' }));
  startLevel(S.level.id, items, ' — مرور غلط‌ها');
});

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
      // سینک: پیشرفت لوکال را بفرست، نسخه ادغام‌شده سرور را بگیر
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

/* ---------- تعیین سطح 🎯 ---------- */
let PL = null; // { qs, idx, correct, playsLeft, slow, t0, done }

function buildPlacementQs() {
  // از هر سطح ۱ تا ۶ یک سؤال نمونه (وسط لیست)
  return [1, 2, 3, 4, 5, 6].map(lid => {
    const lv = LEVELS.find(l => l.id === lid);
    return lv.items[Math.floor(lv.items.length / 2)];
  });
}

$('#btn-placement').addEventListener('click', () => {
  PL = { qs: buildPlacementQs(), idx: 0, correct: 0, playsLeft: 2, slow: false, t0: null, done: false };
  $('#place-result').classList.add('hidden');
  show('placement');
  loadPlaceQ();
});

function loadPlaceQ() {
  const q = PL.qs[PL.idx];
  PL.playsLeft = 2; PL.slow = false; PL.t0 = null; PL.done = false; PL.spokenIdx = -1;
  $('#place-count').textContent = `${faNum(PL.idx + 1)} / ${faNum(PL.qs.length)}`;
  $('#place-bar').style.width = (PL.idx / PL.qs.length * 100) + '%';
  const inp = $('#place-input');
  inp.value = ''; inp.classList.remove('auto-ok');
  $('#place-slow').classList.remove('on');
  updatePlacePlays();
  renderPlaceChips(q, '');
  setTimeout(() => { inp.focus({ preventScroll: true }); placePlay(); }, 350);
}

function updatePlacePlays() { $('#place-plays').textContent = faNum(PL.playsLeft); }

function renderPlaceChips(q, typed) {
  const box = $('#place-chips');
  box.innerHTML = '';
  const targets = Engine.tokenize(q.en);
  const typedWords = typed.split(/\s+/).map(Engine.normWord);
  targets.forEach((tw, i) => {
    const d = document.createElement('div');
    d.className = 'chip-w';
    d.textContent = tw;
    const yw = typedWords[i] || '';
    if (yw !== '') {
      if (yw === tw) d.classList.add('ok');
      else if (typedWords.length > i + 1 || typed.endsWith(' ') || yw.length >= tw.length) d.classList.add('bad');
    }
    if (PL && i === PL.spokenIdx) d.classList.add('spoken');
    box.appendChild(d);
  });
}

async function placePlay() {
  if (!PL || PL.playsLeft <= 0) return;
  PL.playsLeft--;
  updatePlacePlays();
  const b = $('#place-play');
  b.classList.add('playing');
  await Engine.speakKaraoke(PL.qs[PL.idx].en, { slow: PL.slow, onWord: (i) => { PL.spokenIdx = i; karaokeHL('#place-chips', i); } });
  b.classList.remove('playing');
  PL.spokenIdx = -1;
  karaokeHL('#place-chips', -1);
}
$('#place-play').addEventListener('click', placePlay);
$('#place-slow').addEventListener('click', (e) => {
  if (!PL) return;
  PL.slow = !PL.slow;
  e.currentTarget.classList.toggle('on', PL.slow);
  placePlay();
});

$('#place-input').addEventListener('input', (e) => {
  if (!PL) return;
  const q = PL.qs[PL.idx];
  if (!PL.t0) PL.t0 = Date.now();
  const v = e.target.value;
  renderPlaceChips(q, v);
  const want = Engine.tokenize(q.en).map(Engine.normWord).join(' ');
  const got = Engine.tokenize(v).join(' ');
  if (got !== '' && got === want && !PL.done) {
    PL.done = true;
    e.target.classList.add('auto-ok');
    setTimeout(() => { PL.correct++; placeNext(); }, 500);
  }
});
$('#place-skip').addEventListener('click', () => { if (PL) placeNext(); });

function placeNext() {
  Engine.stopSpeak();
  PL.idx++;
  const inp = $('#place-input');
  inp.classList.remove('auto-ok'); inp.blur();
  if (PL.idx >= PL.qs.length) return placeFinish();
  loadPlaceQ();
}

function placeFinish() {
  const c = PL.correct;
  // نگاشت نمره به سطح پیشنهادی: ۰→الفبا، ۱→سطح۱، …، ۵و۶→سطح۵
  const suggest = c <= 0 ? 0 : c === 1 ? 1 : c === 2 ? 2 : c === 3 ? 3 : c === 4 ? 4 : 5;
  const lv = LEVELS.find(l => l.id === suggest);
  $('#place-bar').style.width = '100%';
  const box = $('#place-result');
  box.classList.remove('hidden');
  box.innerHTML = `<h3>نتیجه تعیین سطح 🎯</h3>
    <div class="big">${faNum(c)} از ${faNum(6)}</div>
    <p>سطح پیشنهادی برای تو:<br><b>${lv.name}</b> — ${lv.desc}</p>
    <button class="btn primary big" id="place-start">شروع از ${lv.name} ▶</button>
    <div style="margin-top:10px"><button class="btn ghost" data-nav="levels">دیدن همه سطح‌ها</button></div>`;
  $('#place-start').addEventListener('click', () => startLevel(suggest));
  PL = null;
}
