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

  return { speak, stopSpeak, checkWords, liveAccuracy, score, shuffle, todayKey, normWord, tokenize };
})();
