/* ===== TypeHub Engine — TTS، اعتبارسنجی تایپ، نمره‌دهی ===== */
const Engine = (() => {

  /* ---------- متن به گفتار ---------- */
  let voices = [];
  function loadVoices() {
    voices = speechSynthesis.getVoices();
  }
  if ('speechSynthesis' in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }
  function pickVoice() {
    // ترجیح: صدای انگلیسی باکیفیت (روی iOS معمولاً Samantha)
    const en = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
    const pref = en.find(v => /samantha|google us english|zira|aria/i.test(v.name))
      || en.find(v => v.lang === 'en-US')
      || en[0];
    return pref || null;
  }
  function speak(text, { slow = false, onend = null } = {}) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { resolve(); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = 'en-US';
      u.rate = slow ? 0.6 : 0.92;
      u.pitch = 1;
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      u.onend = () => { onend && onend(); fin(); };
      u.onerror = fin;
      setTimeout(fin, Math.max(4000, text.length * 220)); // failsafe
      speechSynthesis.speak(u);
    });
  }
  function stopSpeak() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    karaokeSeq++; // باطل کردن تایمرهای کارائوکه قبلی
  }

  /* ---------- کارائوکه: هایلایت زنده کلمه هم‌زمان با پخش صدا ---------- */
  // نگاشت کلمات به بازه کاراکتری در متن خام (برای رویداد boundary)
  function wordSpans(text) {
    const spans = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text)) !== null) spans.push({ word: m[0], start: m.index, end: m.index + m[0].length });
    return spans;
  }
  // نزدیک‌ترین کلمه به موقعیت کاراکتر (فاصله/علائم بعد از کلمه به همان کلمه می‌چسبند)
  function wordIndexAt(spans, ci) {
    for (let i = 0; i < spans.length; i++) {
      if (ci <= spans[i].end) return i;
    }
    return spans.length - 1;
  }
  let karaokeSeq = 0;
  function speakKaraoke(text, { slow = false, onWord = null, onend = null } = {}) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { resolve(); return; }
      const mySeq = ++karaokeSeq;
      const alive = () => mySeq === karaokeSeq;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = 'en-US';
      const rate = slow ? 0.6 : 0.92;
      u.rate = rate;
      u.pitch = 1;
      const spans = wordSpans(text);
      let cur = -1, heard = false, done = false;
      const timers = [];
      const later = (fn, ms) => { const t = setTimeout(() => { if (alive() && !done) fn(); }, ms); timers.push(t); };
      const emit = (i) => {
        if (i === cur || i < 0 || i >= spans.length) return;
        cur = i;
        try { onWord && onWord(i); } catch (e) {}
      };
      u.onboundary = (e) => {
        if (e.charIndex === undefined || e.charIndex === null) return;
        heard = true;
        emit(wordIndexAt(spans, e.charIndex));
      };
      // اگر صدا/مرورگر boundary نفرستاد: تخمین زمانیِ یکنواخت
      const startFallback = () => {
        const perWord = 470 / rate;
        const t0 = Date.now() + 200;
        spans.forEach((s, i) => {
          later(() => { if (!heard) emit(i); }, Math.max(0, t0 - Date.now() + i * perWord));
        });
      };
      const fin = () => {
        if (!alive() || done) return;
        done = true;
        timers.forEach(clearTimeout);
        try { onend && onend(); } catch (e) {}
        resolve();
      };
      u.onend = fin;
      u.onerror = fin;
      later(startFallback, 400); // کمی بعد از شروع واقعی پخش
      later(fin, Math.max(6000, spans.length * (700 / rate) + 3000)); // failsafe کلی
      speechSynthesis.speak(u);
    });
  }

  /* ---------- نرمال‌سازی و مقایسه ---------- */
  function normWord(w) {
    return w.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
  }
  function tokenize(text) {
    return text.split(/\s+/).map(normWord).filter(Boolean);
  }
  // مقایسه کلمه‌به‌کلمه: برمی‌گرداند آرایه {target, typed, ok}
  function checkWords(targetText, typedText) {
    const t = tokenize(targetText);
    const y = typedText.split(/\s+/).map(normWord);
    return t.map((tw, i) => {
      const yw = y[i] || '';
      return { target: tw, typed: yw, ok: yw !== '' && yw === tw };
    });
  }
  // دقت لحظه‌ای بر اساس کلمات کامل‌شده
  function liveAccuracy(targetText, typedText) {
    const res = checkWords(targetText, typedText);
    const answered = res.filter(r => r.typed !== '');
    if (!answered.length) return null;
    const ok = answered.filter(r => r.ok).length;
    return Math.round(ok / answered.length * 100);
  }

  /* ---------- نمره‌دهی ---------- */
  function score(targetText, typedText, seconds, kind) {
    const res = checkWords(targetText, typedText);
    const total = res.length;
    const correct = res.filter(r => r.ok).length;
    const accuracy = total ? Math.round(correct / total * 100) : 0;
    const correctChars = res.filter(r => r.ok).reduce((s, r) => s + r.target.length, 0);
    const mins = Math.max(seconds, 1) / 60;
    const wpm = Math.round((correctChars / 5) / mins);
    const wrong = res.filter(r => !r.ok);
    // امتیاز
    let xp = correct * (kind === 'letter' ? 5 : 10);
    if (accuracy === 100 && total > 0) xp = Math.round(xp * 1.25);
    return { total, correct, accuracy, wpm, wrong, xp, detail: res };
  }

  /* ---------- ابزار ---------- */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  return { speak, speakKaraoke, stopSpeak, checkWords, liveAccuracy, score, shuffle, todayKey, normWord, tokenize, wordSpans, wordIndexAt };
})();
