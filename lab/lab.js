/* MUSE Lab page (lab/index.html): language switch, note sounds, the music-and-painting hero,
   navigation, scroll reveal, featured-paper tabs, publication filters, the folded news and the
   viewer for research figures. */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function closest(el, sel) { return el && el.closest ? el.closest(sel) : null; }

  /* ---------- language ---------- */
  function setLang(l, persist) {
    root.classList.remove("lang-en", "lang-zh");
    root.classList.add("lang-" + l);
    root.lang = l === "zh" ? "zh-CN" : "en";
    document.title = l === "zh" ? "MUSE Lab · 深圳大学" : "MUSE Lab · Shenzhen University";
    if (persist) { try { localStorage.setItem("lang", l); } catch (e) {} }
    showSound();
  }
  all("[data-set-lang]").forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.getAttribute("data-set-lang"), true); });
  });
  setLang(root.classList.contains("lang-zh") ? "zh" : "en", false);

  /* ---------- top bar: frosted after scrolling, section in view, phone menu ---------- */
  var bar = document.querySelector(".bar");
  var menuBtn = document.querySelector(".menu-btn");
  var navLinks = all('.nav a[href^="#"]');

  function onScroll() { bar.classList.toggle("is-scrolled", window.scrollY > 24); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function setMenu(open) {
    bar.classList.toggle("is-open", open);
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  menuBtn.addEventListener("click", function () { setMenu(!bar.classList.contains("is-open")); });
  document.addEventListener("click", function (e) {
    if (bar.classList.contains("is-open") && (closest(e.target, ".nav a") || !closest(e.target, ".bar"))) setMenu(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && bar.classList.contains("is-open")) { setMenu(false); menuBtn.focus(); }
  });

  if ("IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    all(".hero, main > section").forEach(function (s) { spy.observe(s); });
  }

  /* ---------- scroll reveal (cards in a row come in one after another) ---------- */
  if (root.classList.contains("js-reveal")) {
    all(".reveal").forEach(function (el) {
      var i = all(":scope > .reveal", el.parentNode).indexOf(el);
      if (i > 0) el.style.setProperty("--d", Math.min(i, 4) * 0.09 + "s");
    });
    var shown = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); shown.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
    all(".reveal").forEach(function (el) { shown.observe(el); });
    window.__labReady = true;
  }

  /* soft light that follows the pointer over cards */
  var lit = null;
  document.addEventListener("pointermove", function (e) {
    var card = closest(e.target, ".spotlight");
    if (lit && lit !== card) { lit.style.removeProperty("--mx"); lit.style.removeProperty("--my"); }
    lit = card;
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty("--mx", e.clientX - r.left + "px");
    card.style.setProperty("--my", e.clientY - r.top + "px");
  }, { passive: true });

  /* ---------- featured papers: tabs (arrow keys move between them) ---------- */
  var tabs = all(".ftab"), strip = document.querySelector(".ftabs");
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab, panel = document.getElementById(t.getAttribute("aria-controls"));
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      if (panel) panel.classList.toggle("is-active", on);
    });
    if (focus) tab.focus({ preventScroll: true });
    if (strip && strip.scrollWidth > strip.clientWidth) {
      strip.scrollTo({ left: tab.offsetLeft - strip.clientWidth / 2 + tab.offsetWidth / 2, behavior: reduce ? "auto" : "smooth" });
    }
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { selectTab(t, false); });
    t.addEventListener("keydown", function (e) {
      var j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      selectTab(tabs[(j + tabs.length) % tabs.length], true);
    });
  });

  /* ---------- publications: filter by research direction ---------- */
  var chips = all(".chip");
  function applyFilter(f, quiet) {
    chips.forEach(function (c) {
      var on = c.getAttribute("data-filter") === f;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    all(".year").forEach(function (y) {
      var any = false;
      all(".pitem", y).forEach(function (p) {
        var show = f === "all" || p.getAttribute("data-theme") === f;
        p.hidden = !show;
        p.classList.remove("pop");
        if (show) {
          any = true;
          if (!reduce && !quiet) { void p.offsetWidth; p.classList.add("pop"); }
        }
      });
      y.hidden = !any;
    });
  }
  chips.forEach(function (c) {
    c.addEventListener("click", function () { applyFilter(c.getAttribute("data-filter")); });
  });

  /* a paper link in a research card: show the paper (even if filtered out), settle its
     entrance animation first so the scroll lands on its final place, then flash it */
  document.addEventListener("click", function (e) {
    var a = closest(e.target, 'a[href^="#p-"]'), target = a && document.getElementById(a.getAttribute("href").slice(1));
    if (!target) return;
    e.preventDefault();
    if (target.hidden) applyFilter("all", true);
    var group = closest(target, ".reveal");
    if (group && !group.classList.contains("is-in")) {
      group.style.transition = "none";
      group.classList.add("is-in");
      void group.offsetWidth;
      group.style.transition = "";
    }
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    if (history.replaceState) history.replaceState(null, "", "#" + target.id);
    setTimeout(function () {
      target.classList.remove("flash");
      void target.offsetWidth;
      target.classList.add("flash");
    }, reduce ? 0 : 600);
  });

  /* ---------- research figures open large; a link carries the image, its caption waits in a
     <template> (without scripts the link simply opens the image) ---------- */
  var box = null, boxFrom = null;
  function closeBox() {
    if (!box) return;
    var b = box;
    box = null;
    b.classList.remove("is-open");
    root.classList.remove("no-scroll");
    document.removeEventListener("keydown", boxKey);
    setTimeout(function () { b.remove(); }, reduce ? 0 : 320);
    if (boxFrom) boxFrom.focus({ preventScroll: true });
  }
  function boxKey(e) { if (e.key === "Escape") closeBox(); }
  document.addEventListener("click", function (e) {
    var a = closest(e.target, "a[data-zoom]");
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    var img = a.querySelector("img"), cap = document.getElementById(a.getAttribute("data-zoom"));
    boxFrom = a;
    box = document.createElement("div");
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.innerHTML = '<button type="button" class="lightbox__close"><span aria-hidden="true">×</span><span class="vh en">Close</span><span class="vh zh">关闭</span></button>' +
      '<figure class="lightbox__fig"><img class="lightbox__img" alt=""><figcaption class="lightbox__cap"></figcaption></figure>';
    var big = box.querySelector(".lightbox__img");
    big.src = a.getAttribute("href");
    big.alt = img ? img.alt : a.getAttribute("data-alt") || "";
    if (cap) box.querySelector(".lightbox__cap").innerHTML = cap.innerHTML;
    box.addEventListener("click", closeBox);   // a click anywhere closes it; the paper link then goes on to the list
    document.body.appendChild(box);
    root.classList.add("no-scroll");
    document.addEventListener("keydown", boxKey);
    requestAnimationFrame(function () { if (box) box.classList.add("is-open"); });
    box.querySelector(".lightbox__close").focus({ preventScroll: true });
  });

  /* ---------- news: show the folded older entries ---------- */
  var more = document.querySelector(".more");
  if (more) {
    more.addEventListener("click", function () {
      document.querySelector(".nlist").classList.remove("is-folded");
      more.setAttribute("aria-expanded", "true");
      more.hidden = true;
    });
  }

  /* ---------- sound: soft mallet notes on a pentatonic scale, higher on the
     screen = higher in pitch. Browsers allow audio only after a click, tap
     or key press, so the first one wakes it up; the speaker button mutes it. ---------- */
  var PENTA = [0, 2, 4, 7, 9];
  var soundBtn = document.querySelector(".sound");
  var soundOn = true, audio = null, nextNote = 0, voices = 0, tapAt = null;
  try { soundOn = localStorage.getItem("lab-sound") !== "off"; } catch (e) {}

  function makeAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    var ac = new AC();
    var soft = ac.createBiquadFilter(), master = ac.createGain();
    soft.type = "lowpass";
    soft.frequency.value = 2600;
    master.gain.value = 0.5;
    soft.connect(master);
    master.connect(ac.destination);
    /* a dark two-second room, so every note rings out gently */
    var len = Math.round(ac.sampleRate * 2.2), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (var c = 0; c < 2; c++) {
      var data = ir.getChannelData(c), y = 0;
      for (var i = 0; i < len; i++) {
        var u = 1 - i / len;
        y += (Math.random() * 2 - 1 - y) * 0.3;
        data[i] = y * u * u * u;
      }
    }
    var room = ac.createConvolver(), wet = ac.createGain();
    room.buffer = ir;
    wet.gain.value = 0.35;
    soft.connect(room);
    room.connect(wet);
    wet.connect(master);
    return { ctx: ac, input: soft };
  }

  function wakeAudio() {
    if (!soundOn) return;
    if (!audio) audio = makeAudio();
    if (audio && audio.ctx.state !== "running") audio.ctx.resume().catch(function () {});
  }

  /* runs fn once the audio is really playing (a new context starts a moment later) */
  function whenAudible(fn) {
    if (!soundOn || !audio) return;
    if (audio.ctx.state === "running") { fn(); return; }
    var asked = performance.now();
    audio.ctx.resume().then(function () {
      if (soundOn && audio.ctx.state === "running" && performance.now() - asked < 800) fn();
    }, function () {});
  }

  /* one soft mallet note: a sine with a brief octave shimmer, faded in over 12 ms */
  function tone(freq, pan, level, t) {
    var ac = audio.ctx, dest = audio.input, panner = null;
    if (ac.createStereoPanner) {
      panner = ac.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(dest);
      dest = panner;
    }
    var peak = 0.2 * level * Math.pow(262 / freq, 0.35);   // high notes a little quieter
    voices++;
    [[1, peak, 0.42], [2, peak * 0.28, 0.09]].forEach(function (p, j) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = freq * p[0];
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(p[1], t + 0.012);
      g.gain.setTargetAtTime(0, t + 0.012, p[2]);
      o.connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + 1.8);
      if (j === 0) o.onended = function () { voices--; if (panner) panner.disconnect(); };
    });
  }

  /* scale steps run up the major pentatonic from middle C. Notes are spaced
     at least 60 ms apart, so a sweep across the staff becomes an arpeggio. */
  function chime(step, x, level) {
    if (!soundOn || !audio || audio.ctx.state !== "running" || voices > 14) return;
    var now = audio.ctx.currentTime, t = Math.max(now + 0.01, nextNote);
    if (t > now + 0.4) return;   // too crowded: skip rather than lag behind
    nextNote = t + 0.06;
    var freq = 261.63 * Math.pow(2, Math.floor(step / 5) + PENTA[step % 5] / 12);
    tone(freq, clamp((x / W) * 2 - 1, -1, 1) * 0.55, level * (0.9 + Math.random() * 0.2), t);
  }

  /* a note on the staff sounds its place: top line G5 … bottom line C4 */
  function chimeAt(pos, x, level) { chime(Math.round((2 - pos) * 2), x, level); }

  /* a click strums three notes, pitched by how high up the hero it lands */
  function strum(x, y) {
    whenAudible(function () {
      var step = Math.round(clamp(1 - y / H, 0, 1) * 6);
      for (var i = 0; i < 3; i++) chime(step + i * 2, x, 0.8);
    });
  }

  function showSound() {
    if (!soundBtn) return;
    var zh = root.classList.contains("lang-zh");
    soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    soundBtn.title = soundOn ? (zh ? "关闭声音" : "Mute") : (zh ? "打开声音" : "Sound on");
  }

  if (soundBtn) {
    if (reduce || !(window.AudioContext || window.webkitAudioContext)) soundBtn.hidden = true;
    soundBtn.addEventListener("click", function () {
      soundOn = !soundOn;
      try { localStorage.setItem("lab-sound", soundOn ? "on" : "off"); } catch (e) {}
      showSound();
      if (soundOn) {
        wakeAudio();
        var x = soundBtn.getBoundingClientRect().left;
        whenAudible(function () { chime(4, x, 0.7); chime(7, x, 0.6); });
      } else if (audio) {
        audio.ctx.suspend();
      }
    });
    showSound();
  }

  /* ---------- the music-and-painting hero ----------
     A soft brush "M" painted behind the title, a five-line staff that can be
     plucked, notes that float along it and leap when touched, and a
     watercolour brush that follows the pointer. It only runs while the hero
     is on screen; coordinates are relative to the hero. */
  var stage = document.querySelector(".hero");
  var canvas = document.getElementById("art");
  var ctx = canvas.getContext("2d");
  var hint = document.querySelector(".hint");
  var inner = document.querySelector(".hero__inner");
  var titleEl = document.querySelector(".title");
  var actions = document.querySelector(".actions");

  var NAVY = [20, 41, 74], ORANGE = [247, 146, 63], SKY = [72, 170, 210];
  var LAV = [146, 126, 214], ROSE = [222, 128, 152], MINT = [92, 184, 146];
  var PAINT = [SKY, LAV, ROSE, ORANGE, MINT];
  var NOTE_COLORS = [NAVY, ORANGE, SKY, LAV, ROSE];
  var M_COLOR = [150, 198, 232];
  var TIP_STEPS = 40, STEP = 14;

  var W = 0, H = 0, NP = 0, GAP = 12, mobile = false, mid = 0.88, dpr = 1;
  var baseY = new Float32Array(0), spread = new Float32Array(0);
  var disp = [], vel = [], tips = [], stamps = [], notes = [];
  var pointer = { x: -1e4, y: -1e4, px: -1e4, py: -1e4, vx: 0, active: false, lastMove: -1e9 };
  var lastPluck = [0, 0, 0, 0, 0];
  var brush = null, ghost = null, ghostEnd = 0, hue = 0, lastRider = 0;
  var start = performance.now(), last = start, running = false, onScreen = true;

  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function pick(list) { return list[(Math.random() * list.length) | 0]; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function smoothstep(a, b, x) { var q = clamp((x - a) / (b - a), 0, 1); return q * q * (3 - 2 * q); }

  function makeTip(c, core, midA) {
    var tip = document.createElement("canvas");
    tip.width = tip.height = 64;
    var g = tip.getContext("2d");
    var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, rgba(c, core));
    grad.addColorStop(0.5, rgba(c, midA));
    grad.addColorStop(1, rgba(c, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return tip;
  }

  /* soft round brush tips, one per colour step along the palette */
  function buildTips() {
    for (var i = 0; i < TIP_STEPS; i++) {
      var p = (i / TIP_STEPS) * PAINT.length, a = PAINT[Math.floor(p) % PAINT.length];
      var b = PAINT[(Math.floor(p) + 1) % PAINT.length], f = p - Math.floor(p);
      tips.push(makeTip([0, 1, 2].map(function (j) { return Math.round(a[j] + (b[j] - a[j]) * f); }), 1, 0.55));
    }
  }

  /* ---- the soft brush "M": one continuous stroke with a tapering, arcing tail ---- */
  var M_PATH = [                    // in units of the M box (x right, y down); the tail runs past it
    [0.02, 0.96], [0.06, 0.60], [0.11, 0.22], [0.16, 0.05],
    [0.23, 0.30], [0.32, 0.60], [0.40, 0.70],
    [0.48, 0.50], [0.56, 0.22], [0.62, 0.06],
    [0.68, 0.32], [0.74, 0.68], [0.80, 0.92],
    [0.92, 1.10], [1.20, 1.24], [1.70, 1.27], [2.30, 1.22], [2.85, 1.02], [3.25, 0.75], [3.55, 0.48], [3.70, 0.32]
  ];
  var M_TAIL_FROM = 12, M_DELAY = 900, M_DUR = 3600;
  var mLayer = document.createElement("canvas"), mctx = mLayer.getContext("2d");
  var mTip = makeTip(M_COLOR, 0.8, 0.36), mStamps = [], mDrawn = 0;

  function buildM() {
    var left = inner.offsetLeft + titleEl.offsetLeft, top = inner.offsetTop + titleEl.offsetTop;
    var w = clamp(titleEl.offsetWidth * 0.42, 110, 300), h = w * 1.1;
    var x0 = left - w * 0.18, y0 = top - h * 0.08;
    var pts = M_PATH.map(function (p) { return [x0 + p[0] * w, y0 + p[1] * h]; });
    /* Catmull-Rom through the control points: rounded peaks, a curved tail */
    var dense = [], seg = 24;
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (var s = 0; s < seg; s++) {
        var t = s / seg, t2 = t * t, t3 = t2 * t, xy = [0, 1].map(function (k) {
          return 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
        });
        dense.push(xy);
      }
    }
    dense.push(pts[pts.length - 1]);
    var lens = [0];
    for (i = 1; i < dense.length; i++) lens.push(lens[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    var total = lens[lens.length - 1], tail0 = lens[M_TAIL_FROM * seg], base = w * 0.075, j = 1;
    mStamps = [];
    for (var d = 0; d <= total; d += 2.2) {
      while (j < lens.length - 1 && lens[j] < d) j++;
      var sl = Math.max(1e-6, lens[j] - lens[j - 1]), f = (d - lens[j - 1]) / sl;
      var dy = (dense[j][1] - dense[j - 1][1]) / sl;               // > 0 on downstrokes
      var r = base * (0.6 + 0.4 * clamp(dy, 0, 1)), a = 0.065;     // heavier downstrokes, light upstrokes
      if (d < total * 0.04) r *= 0.5 + 0.5 * d / (total * 0.04);   // brush touches down softly
      if (d > tail0) {                                             // full through the arc, trailing off at the end
        var q = Math.pow((d - tail0) / (total - tail0), 1.6);
        r = Math.max(r, base * 0.78) * (1 - 0.75 * q);
        a *= 1 - 0.55 * q;
      }
      mStamps.push({ x: dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * f, y: dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * f, r: r, a: a });
    }
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mLayer.width, mLayer.height);
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mDrawn = 0;
  }

  /* paints the M progressively (ease-in-out, so the tail trails off slowly) */
  function paintM(now, instant) {
    var p = instant ? 1 : clamp((now - start - M_DELAY) / M_DUR, 0, 1);
    var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    var upto = Math.floor(e * mStamps.length);
    if (upto <= mDrawn) return;
    mctx.globalCompositeOperation = "multiply";
    for (; mDrawn < upto; mDrawn++) {
      var s = mStamps[mDrawn];
      mctx.globalAlpha = s.a;
      mctx.drawImage(mTip, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    mctx.globalAlpha = 1;
    mctx.globalCompositeOperation = "source-over";
  }

  /* the staff runs through the free band between the buttons and the hint
     and, on wide screens, sweeps up the empty right margin, gently waving */
  function staffY(x, t) {
    var u = x / W;
    var base = mobile
      ? mid + 0.015 * Math.sin(u * Math.PI)
      : mid - 0.02 + 0.02 * Math.sin(u * Math.PI) - (mid - 0.52) * smoothstep(0.72, 1, u);
    return H * (base + 0.014 * Math.sin(u * 5.6 + t * 0.35) + 0.005 * Math.sin(u * 16 - t * 0.7));
  }

  function computeStaff(t) {
    for (var k = 0; k < NP; k++) baseY[k] = staffY(k * STEP, t);
    for (k = 0; k < NP; k++) {
      var k0 = Math.max(0, k - 1), k1 = Math.min(NP - 1, k + 1);
      var slope = (baseY[k1] - baseY[k0]) / ((k1 - k0) * STEP);
      spread[k] = Math.sqrt(1 + slope * slope);   // keeps the five lines evenly spaced on slopes
    }
  }

  function lineAt(i, k) { return baseY[k] + (i - 2) * GAP * spread[k] + disp[i][k]; }

  /* y of a staff position (-2..2 = top..bottom line, halves are spaces) at any x */
  function staffPos(pos, x) {
    var fx = clamp(x / STEP, 0, NP - 1.001), k = Math.floor(fx), f = fx - k;
    var li = clamp(Math.round(pos + 2), 0, 4);
    var y0 = baseY[k] + pos * GAP * spread[k] + disp[li][k];
    var y1 = baseY[k + 1] + pos * GAP * spread[k + 1] + disp[li][k + 1];
    return y0 + (y1 - y0) * f;
  }

  /* find the free band from the layout (offsets ignore the entrance transforms) */
  function measure() {
    var bottom = inner.offsetTop + actions.offsetTop + actions.offsetHeight;
    var below = hint && hint.offsetParent ? hint.offsetTop : H;
    mid = clamp((bottom + below) / 2 / H, 0.55, 0.95);
    GAP = clamp(Math.round((below - bottom - 24) / 4.5), 7, mobile ? 9 : 12);   // fit the staff into the band
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = stage.clientWidth;
    H = stage.clientHeight;
    mobile = W < 700;
    canvas.width = mLayer.width = Math.round(W * dpr);
    canvas.height = mLayer.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    NP = Math.ceil(W / STEP) + 2;
    baseY = new Float32Array(NP);
    spread = new Float32Array(NP);
    disp = [];
    vel = [];
    for (var i = 0; i < 5; i++) {
      disp.push(new Float32Array(NP));
      vel.push(new Float32Array(NP));
    }
    measure();
    buildM();
  }

  /* ---- strings: spring + neighbour coupling, pushed aside by the pointer ---- */
  function stepStaff(f) {
    var R = 70;
    for (var i = 0; i < 5; i++) {
      var d = disp[i], v = vel[i];
      for (var k = 1; k < NP - 1; k++) {
        var acc = -0.02 * d[k] + 0.24 * (d[k - 1] + d[k + 1] - 2 * d[k]);
        if (pointer.active) {
          var dx = k * STEP - pointer.x;
          if (dx > -R && dx < R) {
            var dy = lineAt(i, k) - pointer.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < R) {
              var s = 1 - dist / R;
              acc += (dy >= 0 ? 1 : -1) * s * s * 0.8;
            }
          }
        }
        v[k] = (v[k] + acc * f) * Math.pow(0.93, f);
      }
      for (k = 1; k < NP - 1; k++) d[k] = clamp(d[k] + v[k] * f, -34, 34);
    }
  }

  /* crossing a string plucks it and releases a note */
  function checkPluck(now) {
    if (!pointer.active || pointer.px < -1e3 || pointer.x < 0 || pointer.x > W) return;
    for (var i = 0; i < 5; i++) {
      var before = staffPos(i - 2, pointer.px) - pointer.py;
      var after = staffPos(i - 2, pointer.x) - pointer.y;
      if (before * after >= 0) continue;
      var k = Math.round(pointer.x / STEP), dir = pointer.y > pointer.py ? 1 : -1;
      for (var j = -2; j <= 2; j++) {
        if (k + j > 0 && k + j < NP - 1) vel[i][k + j] += dir * (3.4 - Math.abs(j) * 0.9);
      }
      if (now - lastPluck[i] > 140) {
        lastPluck[i] = now;
        fly({ x: pointer.x, y: staffPos(i - 2, pointer.x) }, NOTE_COLORS[i], (Math.random() - 0.5) * 1.4, -2.4 - Math.random() * 1.2);
        chimeAt(i - 2, pointer.x, 0.85);
      }
    }
  }

  /* a click near the staff sets the nearby strings ringing */
  function shake(x, y) {
    for (var i = 0; i < 5; i++) {
      if (Math.abs(staffPos(i - 2, x) - y) > 70) continue;
      var k = Math.round(x / STEP);
      for (var j = -3; j <= 3; j++) if (k + j > 0 && k + j < NP - 1) vel[i][k + j] += (3 - Math.abs(j) * 0.8) * (i % 2 ? 1 : -1);
    }
  }

  /* ---- watercolour brush: overlapping soft stamps that fade and bleed.
     The path is smoothed (quadratic curves through the midpoints), so fast
     strokes bend into arcs; a big jump starts a new stroke instead of a line. ---- */
  function paintTo(x, y, ghostly) {
    var now = performance.now();
    if (!brush) { brush = { x: x, y: y, mx: x, my: y, t: now, w: 8 }; return; }
    var dx = x - brush.x, dy = y - brush.y, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 2) return;
    if (dist > 160) { brush = { x: x, y: y, mx: x, my: y, t: now, w: 8 }; return; }
    var speed = dist / Math.max(8, now - brush.t);
    var target = clamp((mobile ? 15 : 22) - speed * 7, 5, mobile ? 15 : 22);
    var w = brush.w + (target - brush.w) * 0.25;
    var mx = (brush.x + x) / 2, my = (brush.y + y) / 2;
    var len = Math.hypot(brush.x - brush.mx, brush.y - brush.my) + Math.hypot(mx - brush.x, my - brush.y);
    var n = Math.max(1, Math.ceil(len / 2.6)), tip = tips[(hue | 0) % TIP_STEPS];
    for (var j = 1; j <= n; j++) {
      var t = j / n, u = 1 - t;
      stamps.push({
        x: u * u * brush.mx + 2 * u * t * brush.x + t * t * mx + (Math.random() - 0.5) * 1.2,
        y: u * u * brush.my + 2 * u * t * brush.y + t * t * my + (Math.random() - 0.5) * 1.2,
        r: brush.w + (w - brush.w) * t,
        tip: tip,
        born: now,
        life: ghostly ? 2400 : 1800,
        a: ghostly ? 0.07 : 0.1
      });
    }
    if (stamps.length > 1600) stamps.splice(0, stamps.length - 1600);
    hue = (hue + dist / 90) % TIP_STEPS;
    brush = { x: x, y: y, mx: mx, my: my, t: now, w: w };
  }

  function splash(x, y) {
    var now = performance.now(), tip = tips[(hue | 0) % TIP_STEPS];
    for (var i = 0; i < 12; i++) {
      var ang = Math.random() * Math.PI * 2, rad = Math.random() * 26;
      stamps.push({ x: x + Math.cos(ang) * rad, y: y + Math.sin(ang) * rad, r: 14 + Math.random() * 18, tip: tip, born: now, life: 2200, a: 0.085 });
    }
    hue = (hue + 6) % TIP_STEPS;
  }

  function drawStamps(now) {
    ctx.globalCompositeOperation = "multiply";
    var alive = 0;
    for (var i = 0; i < stamps.length; i++) {
      var s = stamps[i], age = now - s.born;
      if (age > s.life) continue;
      stamps[alive++] = s;
      var k = 1 - age / s.life, r = s.r * (1 + 0.3 * (1 - k));
      ctx.globalAlpha = s.a * Math.pow(k, 1.6);
      ctx.drawImage(s.tip, s.x - r, s.y - r, r * 2, r * 2);
    }
    stamps.length = alive;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /* an invisible painter keeps the canvas alive when nobody is moving the mouse:
     it sweeps soft arcs in the empty margins */
  function startGhost(now) {
    var cx, cy, r;
    if (mobile) {
      cx = W * (0.2 + Math.random() * 0.6);
      cy = Math.random() < 0.5 ? H * 0.12 : H * 0.94;
      r = W * (0.25 + Math.random() * 0.15);
    } else {
      var left = Math.random() < 0.5;
      cx = W * (left ? 0.1 + Math.random() * 0.06 : 0.84 + Math.random() * 0.06);
      cy = H * (0.35 + Math.random() * 0.3);
      r = Math.min(W * 0.09, H * 0.22) * (0.8 + Math.random() * 0.4);
    }
    var sweep = Math.PI * (0.8 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1);
    ghost = { start: now, dur: 2400 + Math.random() * 900, cx: cx, cy: cy, r: r, a0: Math.random() * Math.PI * 2, sweep: sweep };
    brush = null;
  }

  function stepGhost(now) {
    if (ghost) {
      var q = (now - ghost.start) / ghost.dur;
      if (q >= 1) { ghost = null; brush = null; ghostEnd = now; return; }
      var e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
      var a = ghost.a0 + ghost.sweep * e, rr = ghost.r * (1 + 0.12 * Math.sin(e * Math.PI));
      paintTo(ghost.cx + Math.cos(a) * rr, ghost.cy + Math.sin(a) * rr * 0.85, true);
    } else if (now - pointer.lastMove > 3800 && now - ghostEnd > 2600) {
      startGhost(now);
    }
  }

  /* ---- notes ---- */
  function spawnRider(x) {
    notes.push({
      mode: "ride", x: x, y: 0, pos: (((Math.random() * 9) | 0) - 4) * 0.5,
      speed: mobile ? 26 + Math.random() * 4 : 38 + Math.random() * 6, size: GAP * 0.92,
      type: (Math.random() * 3) | 0, col: pick(NOTE_COLORS), rot: 0, phase: Math.random() * 6.3, age: 0
    });
  }

  function launch(n, vx, vy) {
    n.mode = "fly";
    n.vx = vx;
    n.vy = vy;
    n.vr = (Math.random() - 0.5) * 0.12;
    n.age = 0;
    n.life = 1500 + Math.random() * 600;
  }

  function fly(at, col, vx, vy) {
    var n = { x: at.x, y: at.y, size: GAP * (0.95 + Math.random() * 0.35), type: (Math.random() * 3) | 0, col: col || pick(NOTE_COLORS), rot: (Math.random() - 0.5) * 0.4 };
    launch(n, vx, vy);
    notes.push(n);
  }

  function burst(x, y) {
    for (var i = 0; i < 5; i++) {
      var ang = -Math.PI / 2 + (i - 2) * 0.42 + (Math.random() - 0.5) * 0.2, sp = 2.4 + Math.random() * 1.6;
      fly({ x: x, y: y }, null, Math.cos(ang) * sp, Math.sin(ang) * sp);
    }
  }

  function stepNotes(t, dt) {
    var f = dt / 16.67, alive = 0;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      n.age += dt;
      if (n.mode === "ride") {
        n.x += (n.speed * dt) / 1000;
        if (n.x > W + 40) continue;
        n.y = staffPos(n.pos, n.x) + Math.sin(t * 2 + n.phase) * 1.2;
        var dx = n.x - pointer.x, dy = n.y - pointer.y;
        if (pointer.active && dx * dx + dy * dy < 46 * 46) {
          launch(n, (Math.random() - 0.5) * 1.6 + pointer.vx * 0.12, -2.6 - Math.random() * 1.4);
          chimeAt(n.pos, n.x, 1);
        }
      } else {
        n.x += n.vx * f;
        n.y += n.vy * f;
        n.vy += 0.03 * f;
        n.vx *= Math.pow(0.985, f);
        n.rot += n.vr * f;
        if (n.age > n.life) continue;
      }
      notes[alive++] = n;
    }
    notes.length = alive;
  }

  function head(x, y, s) {
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.6, s * 0.44, -0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  function stem(x, y, s, top) {
    ctx.beginPath();
    ctx.moveTo(x + s * 0.53, y - s * 0.12);
    ctx.lineTo(x + s * 0.53, y - top);
    ctx.stroke();
  }

  function drawNote(n, alpha, scale) {
    var s = n.size * scale;
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.rotate(n.rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ctx.strokeStyle = rgba(n.col, 1);
    ctx.lineWidth = Math.max(1.2, s * 0.14);
    ctx.lineCap = "round";
    if (n.type === 2) {
      head(0, 0, s);
      head(s * 2.1, -s * 0.45, s);
      stem(0, 0, s, s * 2.95);
      stem(s * 2.1, -s * 0.45, s, s * 2.95);
      ctx.lineWidth = s * 0.42;
      ctx.beginPath();
      ctx.moveTo(s * 0.53, -s * 2.95);
      ctx.lineTo(s * 2.63, -s * 3.4);
      ctx.stroke();
    } else {
      head(0, 0, s);
      stem(0, 0, s, s * 2.9);
      if (n.type === 1) {
        ctx.beginPath();
        ctx.moveTo(s * 0.53, -s * 2.9);
        ctx.bezierCurveTo(s * 1.35, -s * 2.3, s * 1.45, -s * 1.6, s * 1.05, -s * 1.15);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawNotes() {
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.mode === "ride") {
        var a = clamp((n.x + 24) / 80, 0, 1) * clamp((W + 40 - n.x) / 100, 0, 1);
        drawNote(n, a * (n.col === NAVY ? 0.55 : 0.85), 1);
      } else {
        var q = n.age / n.life, pop = n.age < 200 ? n.age / 200 : Math.max(0, 1 - (n.age - 200) / 600);
        drawNote(n, Math.pow(1 - q, 1.3) * 0.9, 1 + 0.35 * pop);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawStaff() {
    ctx.lineWidth = 1.15;
    for (var i = 0; i < 5; i++) {
      ctx.strokeStyle = rgba(NAVY, i === 2 ? 0.18 : 0.14);
      ctx.beginPath();
      var px = 0, py = lineAt(i, 0);
      ctx.moveTo(px, py);
      for (var k = 1; k < NP; k++) {
        var x = k * STEP, y = lineAt(i, k);
        ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
        px = x;
        py = y;
      }
      ctx.lineTo(px, py);
      ctx.stroke();
    }
  }

  function frame(now) {
    if (!onScreen || document.hidden) { running = false; return; }
    var dt = Math.min(48, now - last), t = (now - start) / 1000;
    last = now;
    ctx.clearRect(0, 0, W, H);
    paintM(now, false);
    ctx.drawImage(mLayer, 0, 0, W, H);
    computeStaff(t);
    stepGhost(now);
    stepStaff(dt / 16.67);
    checkPluck(now);
    drawStamps(now);
    drawStaff();
    if (now - lastRider > (mobile ? 3400 : 3000)) {
      spawnRider(-24);
      lastRider = now;
    }
    stepNotes(t, dt);
    drawNotes();
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    requestAnimationFrame(frame);
  }

  function run() {
    if (running || !onScreen || document.hidden) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  /* start with a melody already spread along the staff */
  function seedRiders() {
    notes = [];
    var spacing = mobile ? 95 : 123;
    for (var x = W + 20; x > -24; x -= spacing) spawnRider(x - Math.random() * spacing * 0.3);
  }

  function staticScene() {
    ctx.clearRect(0, 0, W, H);
    paintM(0, true);
    ctx.drawImage(mLayer, 0, 0, W, H);
    computeStaff(0);
    drawStaff();
    seedRiders();
    stepNotes(0, 0);
    drawNotes();
  }

  var hideTimer = null;
  function hideHintSoon() {
    if (hideTimer || !hint) return;
    hideTimer = setTimeout(function () { hint.classList.add("is-hidden"); }, 2600);
  }

  /* pointer position in the hero, or null when it is outside it or over the top bar */
  function inHero(e) {
    var r = stage.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom || closest(e.target, ".bar")) return null;
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function leave() { pointer.active = false; pointer.x = pointer.y = -1e4; brush = null; }

  /* a click or tap in the hero: paint splash, a fan of notes, nearby strings ring, a strum */
  function play(x, y, target) {
    splash(x, y);
    burst(x, y);
    shake(x, y);
    if (!closest(target, ".sound")) {
      if (audio) strum(x, y);
      else tapAt = [x, y];
    }
    pointer.lastMove = performance.now();
    hideHintSoon();
  }

  buildTips();
  resize();
  if (reduce) {
    staticScene();
    window.addEventListener("resize", function () { resize(); staticScene(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { resize(); staticScene(); });
  } else {
    seedRiders();
    var pending = 0;
    var relayout = function () {
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = 0;
        if (stage.clientWidth !== W || stage.clientHeight !== H) resize();
        else { measure(); buildM(); }
      });
    };
    window.addEventListener("resize", relayout);
    /* re-measure once the web fonts have set the final title width */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    if ("ResizeObserver" in window) new ResizeObserver(relayout).observe(stage);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[entries.length - 1].isIntersecting;
        if (onScreen) run(); else leave();
      }).observe(stage);
    }
    document.addEventListener("visibilitychange", run);

    window.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;   // a finger scrolls the page instead of painting
      var p = inHero(e), now = performance.now();
      if (!p) { if (pointer.active) leave(); return; }
      if (ghost) { ghost = null; brush = null; }
      if (now - pointer.lastMove > 250) brush = null;
      pointer.vx = pointer.x > -1e3 ? p.x - pointer.x : 0;
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.active = true;
      pointer.lastMove = now;
      paintTo(p.x, p.y, false);
      hideHintSoon();
    }, { passive: true });

    /* mouse and pen play on press; a finger plays when a tap ends, so swiping to scroll stays quiet */
    var tap = null;
    window.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse") wakeAudio();
      var p = inHero(e);
      if (!p) return;
      if (e.pointerType === "touch") tap = { x: p.x, y: p.y, cx: e.clientX, cy: e.clientY, t: performance.now(), target: e.target };
      else play(p.x, p.y, e.target);
    }, { passive: true });
    window.addEventListener("pointercancel", function () { tap = null; }, { passive: true });
    /* a touch only counts as permission to play once the tap ends */
    window.addEventListener("pointerup", function (e) {
      if (tap && Math.abs(e.clientX - tap.cx) < 12 && Math.abs(e.clientY - tap.cy) < 12 && performance.now() - tap.t < 600) play(tap.x, tap.y, tap.target);
      tap = null;
      wakeAudio();
      if (tapAt) { strum(tapAt[0], tapAt[1]); tapAt = null; }
    }, { passive: true });
    window.addEventListener("touchend", wakeAudio, { passive: true });
    window.addEventListener("keydown", wakeAudio);
    window.addEventListener("scroll", function () { if (pointer.active) leave(); }, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    run();
  }
  canvas.classList.add("is-ready");
})();
