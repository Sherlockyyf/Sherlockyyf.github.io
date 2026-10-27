(function () {
  "use strict";

  var root = document.documentElement;
  var TITLES = { en: "Yifan Yuan (袁一帆) · Homepage", zh: "袁一帆 · 个人主页" };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  /* ---------- language ---------- */
  function setLang(lang, persist) {
    if (lang !== "zh" && lang !== "en") return;
    root.classList.remove("lang-en", "lang-zh");
    root.classList.add("lang-" + lang);
    root.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = TITLES[lang];
    document.querySelectorAll("[data-set-lang]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-set-lang") === lang));
    });
    if (!persist) return;
    try { localStorage.setItem("lang", lang); } catch (e) { /* private mode */ }
    try {
      var url = new URL(window.location.href);
      url.searchParams.set("lang", lang);
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch (e) { /* old browsers: keep URL as is */ }
    var layout = document.querySelector(".layout");
    if (layout && layout.animate && !reduceMotion) {
      layout.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 380, easing: "ease-out" });
    }
  }

  document.querySelectorAll("[data-set-lang]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setLang(btn.getAttribute("data-set-lang"), true);
    });
  });
  setLang(root.classList.contains("lang-zh") ? "zh" : "en", false);

  /* ---------- publications: selected / full list ---------- */
  var pubButtons = document.querySelectorAll("[data-pub-view]");
  pubButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var view = btn.getAttribute("data-pub-view");
      pubButtons.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", String(on));
      });
      document.querySelectorAll(".publication-view").forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-view") !== view;
      });
    });
  });

  /* ---------- links to a paper (it may sit in the hidden full list) ---------- */
  document.addEventListener("click", function (event) {
    var link = event.target.closest && event.target.closest('a[href^="#pub-"], a[href^="#full-"]');
    if (!link) return;
    var target = document.getElementById(link.getAttribute("href").slice(1));
    if (!target) return;
    event.preventDefault();
    var panel = target.closest(".publication-view");
    if (panel && panel.hidden) {
      var tab = document.querySelector('[data-pub-view="' + panel.getAttribute("data-view") + '"]');
      if (tab) tab.click();
    }
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    target.classList.remove("flash");
    void target.offsetWidth; /* restart the highlight animation */
    target.classList.add("flash");
  });

  /* ---------- mobile navigation ---------- */
  var masthead = document.querySelector(".masthead");
  var navToggle = document.querySelector(".nav-toggle");
  function closeNav() {
    masthead.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  }
  navToggle.addEventListener("click", function (event) {
    event.stopPropagation();
    var open = !masthead.classList.contains("is-open");
    masthead.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll(".site-nav a").forEach(function (link) {
    link.addEventListener("click", closeNav);
  });

  /* ---------- sidebar links dropdown (small screens) ---------- */
  var urlsWrapper = document.querySelector(".author__urls-wrapper");
  var followBtn = document.querySelector(".follow-btn");
  function closeFollow() {
    urlsWrapper.classList.remove("is-open");
    followBtn.setAttribute("aria-expanded", "false");
  }
  followBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    var open = !urlsWrapper.classList.contains("is-open");
    urlsWrapper.classList.toggle("is-open", open);
    followBtn.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", function (event) {
    if (!urlsWrapper.contains(event.target)) closeFollow();
    if (!masthead.contains(event.target)) closeNav();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeFollow();
      closeNav();
    }
  });

  /* ---------- highlight the section in view ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".site-nav a[href^='#']"));
  var sections = navLinks
    .map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); })
    .filter(Boolean);
  if ("IntersectionObserver" in window && sections.length) {
    var visible = {};
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { visible[entry.target.id] = entry.isIntersecting; });
      var current = null;
      sections.forEach(function (s) { if (visible[s.id] && !current) current = s.id; });
      if (!current) return;
      navLinks.forEach(function (a) {
        a.classList.toggle("is-active", a.getAttribute("href") === "#" + current);
      });
    }, { rootMargin: "-80px 0px -55% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------- scroll reveal: blocks float up as they enter the viewport ---------- */
  var REVEAL = [
    ".author > *", ".main-heading", ".tagline", ".page__content > p", ".section > h2", ".section > p",
    ".news-list li", ".lab-banner", ".theme-card", ".applications", ".pub-button-container", ".pub-legend",
    "#core-publications .publication-card", ".experience-card", ".grant-list > li", ".grant-more", "#service li"
  ].join(",");
  if (root.classList.contains("js-reveal")) {
    var items = Array.prototype.slice.call(document.querySelectorAll(REVEAL));
    /* stagger siblings that reveal together */
    var counters = new Map();
    items.forEach(function (el) {
      var n = counters.get(el.parentNode) || 0;
      counters.set(el.parentNode, n + 1);
      el.style.setProperty("--reveal-delay", Math.min(n, 6) * 0.08 + "s");
    });
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
    items.forEach(function (el) { revealer.observe(el); });
    window.__revealReady = true;
  }

  /* ---------- scroll progress, header shadow, back-to-top ---------- */
  var bar = document.querySelector(".scroll-progress span");
  var toTop = document.querySelector(".to-top");
  var ticking = false;
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.setProperty("--progress", max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
    masthead.classList.toggle("is-scrolled", y > 8);
    if (toTop) toTop.classList.toggle("is-shown", y > 700);
    ticking = false;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();
  if (toTop) {
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  /* ---------- pointer effects (mouse/trackpad only) ---------- */
  if (finePointer && !reduceMotion) {
    /* card spotlight follows the pointer */
    document.addEventListener("pointermove", function (event) {
      var card = event.target.closest && event.target.closest(".spotlight");
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (event.clientX - r.left) + "px");
      card.style.setProperty("--my", (event.clientY - r.top) + "px");
    });
    document.querySelectorAll(".spotlight").forEach(function (card) {
      card.addEventListener("pointerleave", function () {
        card.style.removeProperty("--mx");
        card.style.removeProperty("--my");
      });
    });

    /* portrait tilts slightly toward the pointer */
    var photo = document.querySelector(".author__avatar");
    if (photo) {
      photo.addEventListener("pointermove", function (event) {
        if (window.innerWidth <= 1024) return;
        var r = photo.getBoundingClientRect();
        var px = (event.clientX - r.left) / r.width - 0.5;
        var py = (event.clientY - r.top) / r.height - 0.5;
        photo.style.transform = "perspective(800px) rotateX(" + (-py * 7).toFixed(2) + "deg) rotateY(" + (px * 7).toFixed(2) + "deg) scale(1.02)";
      });
      photo.addEventListener("pointerleave", function () {
        photo.style.transform = "";
      });
    }
  }
})();
