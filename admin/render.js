/* Builds every content section of index.html from data/home.json, data/news.json and
   data/publications.json, and those of lab/index.html from the same files plus data/lab.json.
   Shared by the page editor (admin/editor.js) and `node tools/render_site.js`; loads as a
   browser global (SiteRender) or a CommonJS module.
   With ed = true the HTML also carries data-yy* attributes, which the editor turns into
   in-place editing; the published page never contains them. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SiteRender = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ME = ["Yifan Yuan"];                       // highlighted in author lists
  var LINKS = [["paper", "Paper"], ["code", "Code"], ["project", "Project"]];
  var MUTED = { preprint: true, chapter: true }; // grey badge in the full list
  var ICON_CLASS = { uni: "icon icon--szu", lab: "icon icon--accent" };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* the generated parts of index.html, each between <!-- name:start --> and <!-- name:end --> */
  var REGIONS = ["profile", "contacts", "intro", "h-news", "news", "h-research", "lab", "themes", "applications",
    "h-publications", "selected", "publications", "h-experience", "experience", "h-grants", "grants",
    "grants-earlier", "h-service", "service", "footer"];

  /* every news entry and paper is written with these keys, in this order
     (lab: false keeps a news entry off the lab page) */
  var NEWS_FIELDS = { date: "", icon: "", en: "", zh: "", lab: true };
  var PUB_FIELDS = {
    id: "", title: "", authors: "", venue: "", type: "conference", details: "", note: "",
    paper: "", code: "", project: "", theme: "", tag: "",
    selected: false, image: "", imageWidth: null, imageHeight: null, imageAlt: "",
    summaryEn: "", summaryZh: ""
  };

  function normalize(item, fields) {
    var out = {};
    Object.keys(fields).forEach(function (k) {
      var v = item && item[k] != null ? item[k] : fields[k];
      out[k] = typeof v === "string" ? v.trim() : v;
    });
    return out;
  }

  function serialize(value) {
    return JSON.stringify(value, null, 2) + "\n";
  }

  function text(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function attr(s) {
    return text(s).replace(/"/g, "&quot;");
  }

  function safeUrl(url) {
    var u = String(url || "").trim(), scheme = /^([a-z][a-z0-9+.-]*):/i.exec(u);
    return scheme && !/^(https?|mailto)$/i.test(scheme[1]) ? "#" : u;
  }

  /* links in the data are relative to the site root; a page in a subfolder (lab/) sets base = "../" */
  var base = "";

  function rebase(url) {
    var u = String(url || "").trim();
    if (!base || !u || /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(u)) return u;
    return base + u.replace(/^\.\//, "");
  }

  function link(url, html, extra) {
    var u = rebase(safeUrl(url)), newTab = /^https?:/i.test(u) || /\.pdf$/i.test(u);
    return '<a href="' + attr(u) + '"' + (newTab ? ' target="_blank" rel="noopener"' : "") + (extra || "") + ">" + html + "</a>";
  }

  /* **bold**, ==highlight== and *italic*, applied to already-escaped text */
  function emphasis(s) {
    return s.replace(/\*\*(?=\S)(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/==(?=\S)(.+?)==/g, '<mark class="hl">$1</mark>')
      .replace(/\*([^\s*](?:[^*]*[^\s*])?)\*/g, "<em>$1</em>");
  }

  /* free text: **bold**, ==highlight==, *italic* and [label](url) */
  function inline(src) {
    var links = [];
    var s = String(src == null ? "" : src).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      links.push([label, url]);
      return "\u0000" + (links.length - 1) + "\u0000";
    });
    return emphasis(text(s)).replace(/\u0000(\d+)\u0000/g, function (m, i) {
      return link(links[i][1], emphasis(text(links[i][0])));
    });
  }

  /* the same text with the markup removed */
  function plain(src) {
    return String(src == null ? "" : src)
      .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
      .replace(/\*\*(?=\S)(.+?)\*\*/g, "$1")
      .replace(/==(?=\S)(.+?)==/g, "$1")
      .replace(/\*([^\s*](?:[^*]*[^\s*])?)\*/g, "$1");
  }

  function isMe(name) {
    return ME.indexOf(name.replace(/[\s*†‡#]+$/, "")) !== -1;
  }

  function authors(list) {
    return String(list || "").split(/\s*[,，]\s*/).filter(Boolean).map(function (name) {
      return isMe(name) ? '<span class="me">' + text(name) + "</span>" : text(name);
    }).join(", ");
  }

  /* ---------- hooks for in-place editing (only with ed) ---------- */
  function A(ed, path, rich) {  // the element's text is the field at path
    return ed ? ' data-yy="' + path + '"' + (rich ? " data-yy-rich" : "") : "";
  }

  function W(ed, path, html, rich) {  // wrap a piece of text that is the field at path
    return ed ? "<span" + A(ed, path, rich) + ">" + html + "</span>" : html;
  }

  function I(ed, kind, i) {  // an entry of a list that can be edited, moved or deleted
    return ed ? ' data-yy-item="' + kind + ":" + i + '"' : "";
  }

  function ADD(ed, kind, tag) {  // where the "+ add" button goes
    return ed ? "<" + tag + ' data-yy-add="' + kind + '"></' + tag + ">" : "";
  }

  /* one language of a bilingual field; the published page falls back to the other language */
  function pick(o, lang, ed) {
    o = o || {};
    return ed ? o[lang] || "" : o[lang] || o[lang === "en" ? "zh" : "en"] || "";
  }

  /* a bilingual field as two spans, or as plain text when both languages read the same */
  function bi(o, ed, path, rich) {
    var f = rich ? inline : text, en = pick(o, "en", ed), zh = pick(o, "zh", ed);
    if (!ed && en === zh) return f(en);
    return '<span class="en"' + A(ed, path + ".en", rich) + ">" + f(en) + '</span><span class="zh"' +
      A(ed, path + ".zh", rich) + ">" + f(zh) + "</span>";
  }

  /* a bilingual paragraph as <tag class="en"> and <tag class="zh"> */
  function biBlock(tag, cls, o, ed, path) {
    return ["en", "zh"].map(function (lang) {
      return "<" + tag + ' class="' + (cls ? cls + " " : "") + lang + '"' + A(ed, path + "." + lang, true) + ">" +
        inline(pick(o, lang, ed)) + "</" + tag + ">";
    });
  }

  function indent(lines, pad) {
    return lines.join("\n").split("\n").map(function (l) { return l ? pad + l : l; });
  }

  /* ---------- sidebar ---------- */
  function profile(h, ed) {
    var p = h.profile || {}, photo = p.photo || {}, n = p.name || {}, t = p.title || {}, m = p.motto || {};
    var name = function (lang) { return W(ed, "home.profile.name." + lang, text(n[lang])); };
    var title = function (lang, sep) {
      return (t[lang] || []).map(function (line, i) { return W(ed, "home.profile.title." + lang + "." + i, text(line)); })
        .join('<span class="title-sep">' + sep + "</span><br>");
    };
    return [
      '<img class="author__avatar" src="' + attr(photo.src) + '"' +
        (photo.width && photo.height ? ' width="' + photo.width + '" height="' + photo.height + '"' : "") +
        ' alt="' + attr([n.en, n.zh].filter(Boolean).join(" ")) + '"' + (ed ? " data-yy-photo" : "") + ">",
      '<div class="author__content">',
      '  <h3 class="author__name"><span class="en">' + name("en") + ' <span lang="zh-CN">' + name("zh") + "</span></span>" +
        '<span class="zh">' + name("zh") + " " + name("en") + "</span></h3>",
      '  <p class="author__title">',
      '    <span class="en">' + title("en", ", ") + "</span>",
      '    <span class="zh">' + title("zh", " ") + "</span>",
      "  </p>",
      '  <p class="author__bio"><span class="author__motto" lang="zh-CN"' + A(ed, "home.profile.motto.zh") + ">" + text(m.zh) +
        '</span><span class="author__motto-en en"' + A(ed, "home.profile.motto.en") + ">" + text(m.en) + "</span></p>",
      "</div>"
    ].join("\n");
  }

  function contact(c, i, ed) {
    var icon = '<svg class="' + (ICON_CLASS[c.icon] || "icon") + '" aria-hidden="true"><use href="#i-' + attr(c.icon || "link") + '"/></svg>';
    var label = bi(c, ed, "home.contacts." + i);
    return "<li" + I(ed, "contacts", i) + ">" + (c.url ? link(c.url, icon + label) : icon + label) + "</li>";
  }

  /* ---------- greeting, tagline, introduction ---------- */
  function intro(h, ed) {
    var g = h.greeting || {}, wave = ' <span class="wave" aria-hidden="true">👋</span> ';
    var greet = function (lang) {
      return (g[lang] || []).map(function (s, i) { return W(ed, "home.greeting." + lang + "." + i, text(s)); }).join(wave);
    };
    var out = [
      '<h1 class="main-heading">',
      '  <span class="en">' + greet("en") + "</span>",
      '  <span class="zh">' + greet("zh") + "</span>",
      "</h1>",
      '<p class="tagline">',
      '  <span class="en"' + A(ed, "home.tagline.en", true) + ">" + inline(pick(h.tagline, "en", ed)) + "</span>",
      '  <span class="zh"' + A(ed, "home.tagline.zh", true) + ">" + inline(pick(h.tagline, "zh", ed)) + "</span>",
      "</p>"
    ];
    (h.intro || []).forEach(function (p, i) {
      var pair = biBlock("p", "", p, ed, "home.intro." + i);
      out.push("");
      if (ed) out.push('<div class="yy-group"' + I(ed, "intro", i) + ">", "  " + pair[0], "  " + pair[1], "</div>");
      else out.push(pair[0], pair[1]);
    });
    if (ed) out.push(ADD(ed, "intro", "p"));
    return out.join("\n");
  }

  function heading(h, key, addKind, ed) {
    return bi((h.headings || {})[key], ed, "home.headings." + key) + (addKind ? ADD(ed, addKind, "span") : "");
  }

  /* ---------- news ---------- */
  function newsItem(n, i, ed) {
    return "<li" + I(ed, "news", i) + '><span class="news-date">' + text(n.date) + "</span> " + (n.icon ? text(n.icon) + " " : "") +
      '<span class="en"' + A(ed, "news." + i + ".en", true) + ">" + inline(pick(n, "en", ed)) + "</span>" +
      '<span class="zh"' + A(ed, "news." + i + ".zh", true) + ">" + inline(pick(n, "zh", ed)) + "</span></li>";
  }

  /* ---------- research ---------- */
  function lab(l, ed) {
    l = l || {};
    return [
      "<strong" + A(ed, "home.lab.name") + ">" + text(l.name) + "</strong>",
      '<span class="lab-banner__full"' + A(ed, "home.lab.full") + ">" + text(l.full) + "</span>"
    ].concat(biBlock("p", "", l, ed, "home.lab")).join("\n");
  }

  /* tag links under a research card; selected papers jump to their card, others to the full list */
  function tags(pubs, theme) {
    return pubs.filter(function (p) { return p.theme === theme && p.tag; }).map(function (p) {
      return '<a href="#' + (p.selected ? "pub-" : "full-") + attr(p.id) + '">' + text(p.tag) + "</a>";
    });
  }

  function theme(t, i, pubs, ed) {
    var path = "home.themes." + i;
    return [
      '<article class="theme-card theme-card--' + attr(t.id) + ' spotlight"' + I(ed, "themes", i) + ">",
      '  <div class="theme-card__head">',
      '    <span class="theme-seal" aria-hidden="true"' + A(ed, path + ".seal") + ">" + text(t.seal) + "</span>",
      '    <h3 class="theme-card__title">' + bi(t.title, ed, path + ".title") + "</h3>",
      "  </div>"
    ].concat(indent(biBlock("p", "", t.text, ed, path + ".text"), "  "), ['  <div class="theme-card__refs">'],
      indent(tags(pubs, t.id), "    "), ["  </div>", "</article>"]).join("\n");
  }

  /* ---------- publications ---------- */
  function linkList(p) {
    return LINKS.filter(function (l) { return p[l[0]]; })
      .map(function (l) { return link(p[l[0]], "[" + l[1] + "]"); }).join("");
  }

  /* papers without a figure get a tile with the venue name */
  function venueTile(p) {
    var m = /^(.*?)\s*((?:19|20)\d\d)$/.exec(p.venue || ""), name = m ? m[1] : p.venue || "";
    return '<div class="pub-media venue-tile' + (name.length > 7 ? " venue-tile--long" : "") + '" aria-hidden="true">' +
      '<span class="venue-tile__name">' + text(name) + "</span>" +
      (m ? '<span class="venue-tile__year">' + m[2] + "</span>" : "") + "</div>";
  }

  function media(p) {
    if (!p.image) return venueTile(p);
    var size = p.imageWidth && p.imageHeight ? ' width="' + p.imageWidth + '" height="' + p.imageHeight + '"' : "";
    var src = attr(rebase(p.image));
    return '<a class="pub-media" href="' + src + '" target="_blank" rel="noopener"><img src="' + src + '"' +
      size + ' loading="lazy" alt="' + attr(p.imageAlt || p.title) + '"></a>';
  }

  /* a "Selected Publications" card */
  function card(p, i, ed) {
    var path = "pubs." + i, en = pick({ en: p.summaryEn, zh: p.summaryZh }, "en", ed), zh = pick({ en: p.summaryEn, zh: p.summaryZh }, "zh", ed);
    return [
      '<div class="publication-card spotlight" id="pub-' + attr(p.id) + '"' + I(ed, "pubs", i) + ">",
      "  " + media(p),
      '  <div class="pub-body">',
      '    <strong class="pub-title"' + A(ed, path + ".title") + ">" + text(p.title) + "</strong>",
      '    <div class="pub-authors"' + A(ed, path + ".authors") + ">" + authors(p.authors) + "</div>"
    ].concat(ed || en ? [
      '    <p class="pub-desc en"' + A(ed, path + ".summaryEn", true) + ">" + inline(en) + "</p>",
      '    <p class="pub-desc zh"' + A(ed, path + ".summaryZh", true) + ">" + inline(zh) + "</p>"
    ] : [], [
      '    <div class="pub-meta"><span class="pub-venue">' + text(p.venue) + "</span>" +
        (p.note ? '<span class="pub-badge">' + text(p.note) + "</span>" : "") + linkList(p) + "</div>",
      "  </div>",
      "</div>"
    ]).join("\n");
  }

  /* an entry of the full publication list */
  function listItem(p, i, ed) {
    var path = "pubs." + i, names = String(p.authors || "").trim(), links = linkList(p);
    return [
      '<li id="full-' + attr(p.id) + '"' + I(ed, "pubs", i) + ">",
      '  <span class="pub-list-badge' + (MUTED[p.type] ? " pub-list-badge--muted" : "") + '">' + text(p.venue) + "</span>",
      '  <span class="pub-list-title"' + A(ed, path + ".title") + ">" + text(p.title) + "</span><br>",
      '  <span class="pub-list-authors">' + W(ed, path + ".authors", authors(names)) + (/[.!?。]$/.test(names) ? "" : ".") +
        (p.details ? " " + W(ed, path + ".details", inline(p.details), true) : "") + "</span>"
    ].concat(
      p.note ? ['  <span class="pub-list-note">' + text(p.note) + "</span>"] : [],
      links ? ['  <span class="pub-list-links">' + links + "</span>"] : [],
      ["</li>"]
    ).join("\n");
  }

  /* ---------- experience, grants, service ---------- */
  function experienceItem(x, i, ed) {
    var path = "home.experience." + i, org = x.org || {};
    return [
      '<div class="experience-card spotlight"' + I(ed, "experience", i) + ">"
    ].concat(x.logo ? ['  <img class="experience-logo" src="' + attr(x.logo) + '" alt="' + attr((org.en || org.zh || "") + " logo") + '">'] : [], [
      '  <div class="experience-info">',
      "    <strong>" + bi(x.org, ed, path + ".org") + "</strong><br>",
      "    <em>" + bi(x.dates, ed, path + ".dates") + "</em><br>"
    ], indent(biBlock("span", "", x.role, ed, path + ".role"), "    "), ["  </div>", "</div>"]).join("\n");
  }

  function grantItem(g, i, kind, ed) {
    var path = "home." + kind + "." + i, role = g.role || {}, lines = ["<li" + I(ed, kind, i) + ">"];
    if (role.en || role.zh) {
      lines.push('  <span class="pub-list-badge' + (g.level ? " pub-list-badge--" + attr(g.level) : "") + '">' + bi(role, ed, path + ".role") + "</span>");
    }
    lines.push(
      '  <span class="pub-list-title">' + bi(g.title, ed, path + ".title") + "</span><br>",
      '  <span class="pub-list-authors">' + bi(g.funder, ed, path + ".funder") + (g.period ? " · " + W(ed, path + ".period", text(g.period)) : "") + "</span>",
      "</li>"
    );
    return lines.join("\n");
  }

  function grantsEarlier(h, ed) {
    var items = (h.grantsEarlier || []).map(function (g, i) { return grantItem(g, i, "grantsEarlier", ed); });
    if (ed) items.push(ADD(ed, "grantsEarlier", "li"));
    return ["<summary>" + bi(h.grantsEarlierSummary, ed, "home.grantsEarlierSummary") + "</summary>", '<ul class="grant-list">']
      .concat(indent(items, "  "), ["</ul>"]).join("\n");
  }

  function footer(h, ed) {
    var f = h.footer || {}, m = /^(\d{4})-(\d{1,2})/.exec(f.updated || "") || [], year = m[1] || "", month = +m[2] || 0;
    var name = ((h.profile || {}).name || {}).en || "";
    var links = (f.links || []).map(function (l, i) { return "  " + link(l.url, bi(l, ed, "home.footer.links." + i), I(ed, "footer", i)); });
    return ['<div class="page__footer-follow">', '  <span class="en">Follow:</span><span class="zh">联系：</span>']
      .concat(links, ed ? ["  " + ADD(ed, "footer", "span")] : [], [
        "</div>",
        '<div class="page__footer-copyright">',
        "  © " + year + " " + text(name) + ' · <span class="en">Last updated ' + (MONTHS[month - 1] || "") + " " + year +
          '</span><span class="zh">最后更新：' + year + " 年 " + month + " 月</span> ·",
        '  <span class="en">Design inspired by</span><span class="zh">设计参考</span>',
        '  <a href="https://github.com/academicpages/academicpages.github.io" target="_blank" rel="noopener">AcademicPages</a> &amp;',
        '  <a href="https://github.com/WD7ang/WowPage" target="_blank" rel="noopener">WowPage</a>',
        "</div>"
      ]).join("\n");
  }

  /* ---------- the whole page ---------- */
  function sections(data, ed) {
    var h = data.home || {}, news = data.news || [], pubs = data.publications || [];
    var list = function (items, render, addKind, addTag) {
      return items.map(render).concat(ed && addKind ? [ADD(ed, addKind, addTag)] : []).join("\n");
    };
    return {
      profile: profile(h, ed),
      contacts: list(h.contacts || [], function (c, i) { return contact(c, i, ed); }, "contacts", "li"),
      intro: intro(h, ed),
      "h-news": heading(h, "news", "news", ed),
      news: news.map(function (n, i) { return newsItem(n, i, ed); }).join("\n"),
      "h-research": heading(h, "research", "", ed),
      lab: lab(h.lab, ed),
      themes: (h.themes || []).map(function (t, i) { return theme(t, i, pubs, ed); }).join("\n"),
      applications: bi(h.applications, ed, "home.applications", true),
      "h-publications": heading(h, "publications", "pubs", ed),
      selected: pubs.map(function (p, i) { return p.selected ? card(p, i, ed) : ""; }).filter(Boolean).join("\n\n"),
      publications: pubs.map(function (p, i) { return listItem(p, i, ed); }).join("\n"),
      "h-experience": heading(h, "experience", "experience", ed),
      experience: (h.experience || []).map(function (x, i) { return experienceItem(x, i, ed); }).join("\n"),
      "h-grants": heading(h, "grants", "grants", ed),
      grants: (h.grants || []).map(function (g, i) { return grantItem(g, i, "grants", ed); }).join("\n"),
      "grants-earlier": grantsEarlier(h, ed),
      "h-service": heading(h, "service", "service", ed),
      service: list(h.service || [], function (s, i) { return "<li" + I(ed, "service", i) + ">" + bi(s, ed, "home.service." + i, true) + "</li>"; }),
      footer: footer(h, ed)
    };
  }

  /* replace what sits between <!-- name:start --> and <!-- name:end -->, keeping the indentation */
  function region(html, name, inner) {
    var start = "<!-- " + name + ":start -->", end = "<!-- " + name + ":end -->";
    var i = html.indexOf(start), j = i < 0 ? -1 : html.indexOf(end, i);
    if (j < 0) throw new Error("the page is missing the " + start + " … " + end + " markers");
    var lead = html.slice(html.lastIndexOf("\n", i) + 1, i);
    if (/\S/.test(lead)) return html.slice(0, i + start.length) + inner + html.slice(j);  // markers inside a line
    var nl = html.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
    var body = inner ? inner.split("\n").map(function (line) { return line ? lead + line : line; }).join(nl) + nl : "";
    return html.slice(0, i + start.length) + nl + body + lead + html.slice(j);
  }

  function build(html, data) {
    var parts = sections(data, false);
    REGIONS.forEach(function (name) { html = region(html, name, parts[name]); });
    return html;
  }

  /* ---------- the lab page (lab/index.html) ----------
     News, papers and the PI's name, title and photo come from the homepage's data; data/lab.json holds
     what only the lab page shows: the hero's tagline and topics, section headings, introduction, the MUSE
     acronym, research directions, featured work (each with its own page), news stories and contact.
     With ed these carry data-yy* hooks like the homepage. */
  var LAB_HEADINGS = ["about", "research", "work", "news", "publications", "contact"];
  var LAB_REGIONS = ["lab-tagline", "lab-topics", "lab-latest", "lab-about", "lab-pi", "lab-acronym", "lab-research", "lab-work",
    "lab-news", "lab-filters", "lab-publications", "lab-contact-intro", "lab-contact", "lab-credits"]
    .concat(LAB_HEADINGS.map(function (k) { return "lab-h-" + k; }));
  var VENUES = {   // full names for the citations on project pages
    EMNLP: "Proceedings of the {y} Conference on Empirical Methods in Natural Language Processing",
    "ACM MM": "Proceedings of the ACM International Conference on Multimedia",
    ICASSP: "IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)"
  };
  var LINK_ICONS = { paper: "paper", code: "code", project: "globe" };

  function icon(id) {
    return '<svg class="icon" aria-hidden="true"><use href="#i-' + attr(id) + '"/></svg>';
  }

  function labNews(news) {
    return news.filter(function (n) { return n.lab !== false; });
  }

  /* in edit mode: news and papers are shared with the homepage and edited there */
  function sharedNote(ed, what) {
    return ed ? '<p class="yy-note">' + what + "和个人主页共用：请在个人主页的编辑模式里修改，发布后两边一起更新。</p>" : "";
  }

  /* all the lab's news in the hero, a few lines at a time; lab.js scrolls them up one by one */
  function ticker(news, ed) {
    var items = labNews(news);
    if (!items.length) return sharedNote(ed, "动态");
    return [
      '<div class="ticker">',
      '  <span class="ticker__tag"><span class="en">News</span><span class="zh">最新</span></span>',
      '  <div class="ticker__view">',
      '    <ul class="ticker__list">'
    ].concat(items.map(function (n) {
      return '      <li class="ticker__item"><span class="ticker__date">' + text(n.date) + '</span><span class="ticker__text">' +
        (n.icon ? '<span class="ticker__icon" aria-hidden="true">' + text(n.icon) + "</span>" : "") + '<span class="en">' +
        inline(pick(n, "en")) + '</span><span class="zh">' + inline(pick(n, "zh")) + "</span></span></li>";
    }), ["    </ul>", "  </div>", "</div>"], ed ? [sharedNote(ed, "动态")] : []).join("\n");
  }

  /* the hero's tagline (==marked== words get the highlighter) and its row of topics */
  function tagline(l, ed) {
    var t = (l.hero || {}).tagline || {};
    return '<span class="en"' + A(ed, "lab.hero.tagline.en", true) + ">" + inline(pick(t, "en", ed)) + '</span><span class="zh"' +
      A(ed, "lab.hero.tagline.zh", true) + ">" + inline(pick(t, "zh", ed)) + "</span>";
  }

  function heroTopics(l, ed) {
    var items = ((l.hero || {}).topics || []).map(function (t, i) {
      return "<li" + I(ed, "heroTopics", i) + ">" + bi(t, ed, "lab.hero.topics." + i) + "</li>";
    });
    return items.concat(ed ? [ADD(ed, "heroTopics", "li")] : []).join("\n");
  }

  function labHeading(l, key, ed) {
    return bi((l.headings || {})[key], ed, "lab.headings." + key);
  }

  function labAbout(l, ed) {
    var out = [];
    (l.about || []).forEach(function (p, i) {
      var pair = biBlock("p", "", p, ed, "lab.about." + i);
      if (ed) out.push('<div class="yy-group"' + I(ed, "labAbout", i) + ">", "  " + pair[0], "  " + pair[1], "</div>");
      else out.push(pair[0], pair[1]);
    });
    if (ed) out.push(ADD(ed, "labAbout", "p"));
    return out.join("\n");
  }

  function acronym(l, ed) {
    return (l.acronym || []).map(function (a, i) {
      var path = "lab.acronym." + i;
      return [
        '<li class="acro reveal"' + I(ed, "acronym", i) + ">",
        '  <span class="acro__letter" aria-hidden="true"' + A(ed, path + ".letter") + ">" + text(a.letter) + "</span>",
        '  <div class="acro__body">',
        '    <strong class="acro__word">' + W(ed, path + ".word", text(a.word)) +
          (a.zh || ed ? '<span class="zh"> · ' + W(ed, path + ".zh", text(a.zh)) + "</span>" : "") + "</strong>"
      ].concat(indent(biBlock("p", "", a.text, ed, path + ".text"), "    "), ["  </div>", "</li>"]).join("\n");
    }).join("\n");
  }

  /* the PI: name, title and photo from home.json, links from lab.json */
  function piCard(h, l, ed) {
    var p = h.profile || {}, photo = p.photo || {}, n = p.name || {}, t = p.title || {}, pi = l.pi || {};
    return [
      '<img class="pi__photo" src="' + attr(rebase(photo.src)) + '"' + (photo.width && photo.height ? ' width="' + photo.width + '" height="' + photo.height + '"' : "") +
        ' loading="lazy" alt="' + attr([n.en, n.zh].filter(Boolean).join(" ")) + '">',
      '<div class="pi__body">',
      '  <p class="pi__role"><span class="en">Principal Investigator</span><span class="zh">实验室负责人</span></p>',
      '  <p class="pi__name"><span class="en">' + text(n.en) + ' <span class="pi__alt" lang="zh-CN">' + text(n.zh) + '</span></span><span class="zh">' +
        text(n.zh) + ' <span class="pi__alt" lang="en">' + text(n.en) + "</span></span></p>",
      '  <p class="pi__title"><span class="en">' + text((t.en || []).join(", ")) + '</span><span class="zh">' + text((t.zh || []).join(" ")) + "</span></p>",
      '  <p class="pi__links">' + (pi.links || []).map(function (x, i) {
        return link(x.url, icon(x.icon || "link") + bi(x, ed, "lab.pi.links." + i), ' class="pbtn"' + I(ed, "piLinks", i));
      }).join("") + (ed ? ADD(ed, "piLinks", "span") : "") + "</p>",
      "</div>"
    ].join("\n");
  }

  /* a paper's short name: its tag without the venue ("StateTrack · EMNLP'26" → "StateTrack") */
  function shortName(p) {
    return String(p.tag || "").split(" · ")[0].trim() || p.title;
  }

  function byIds(pubs) {
    var o = {};
    pubs.forEach(function (p) { o[p.id] = p; });
    return o;
  }

  function projectOf(l, slug) {
    return (l.projects || []).filter(function (x) { return x.slug === slug; })[0];
  }

  /* ---------- featured work: tall panes in a row, each opening its project page ---------- */
  function pane(x, i, pubs, ed) {
    var p = byIds(pubs)[x.paper] || {}, path = "lab.projects." + i;
    var second = p.code ? link(p.code, "<span>Code</span>", ' class="pane__btn pane__btn--ghost"') :
      p.paper ? link(p.paper, "<span>Paper</span>", ' class="pane__btn pane__btn--ghost"') : "";
    return ['<article class="pane tone-' + attr(x.tone || "steel") + ' reveal"' + I(ed, "projects", i) + ">",
      '  <h3 class="pane__title">' + text(shortName(p) || x.slug) + "</h3>"]
      .concat(indent(biBlock("p", "pane__blurb", x.blurb, ed, path + ".blurb"), "  "), [
        x.visual ? '  <img class="pane__visual" src="' + attr(rebase(x.visual)) + '" alt="" loading="lazy">' : '  <span class="pane__visual"></span>',
        '  <p class="pane__actions"><a class="pane__btn" href="projects/' + attr(x.slug) + '/"><span class="en">Learn more</span><span class="zh">了解更多</span></a>' + second + "</p>",
        "</article>"
      ]).join("\n");
  }

  /* ---------- latest news: a headline anyone can follow, its date and kind, a square picture ---------- */
  function story(s, i, l, ed) {
    var path = "lab.stories." + i, x = s.project ? projectOf(l, s.project) : null;
    var href = x ? "projects/" + x.slug + "/" : rebase(safeUrl(s.url)), ext = /^https?:/i.test(href);
    var a = function (inner, cls) {
      return href ? '<a href="' + attr(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + (cls ? ' class="' + cls + '"' : "") + ">" + inner + "</a>" : inner;
    };
    var img = s.image || (x && x.visual) || "";
    return [
      '<article class="story reveal"' + I(ed, "stories", i) + ">",
      '  <div class="story__text">',
      '    <h3 class="story__title">' + a(bi(s.title, ed, path + ".title"), "story__link") + "</h3>",
      '    <p class="story__meta"><span class="story__date">' + text(s.date) + '</span><span class="story__tag">' +
        bi(s.tag, ed, path + ".tag") + "</span>" + (href ? a('<span class="en">Learn more</span><span class="zh">了解更多</span><span class="story__chev" aria-hidden="true">›</span>', "story__more") : "") + "</p>",
      "  </div>",
      '  <span class="story__thumb tone-' + attr((x && x.tone) || "steel") + '" aria-hidden="true">' + (img ? '<img src="' + attr(rebase(img)) + '" alt="" loading="lazy">' : "") + "</span>",
      "</article>"
    ].join("\n");
  }

  /* ---------- research directions: picture cards in a row that scrolls sideways ---------- */
  /* the picture across the top of a direction card */
  function cover(d) {
    var shots = (d.cover || []).filter(function (c) { return c.src; });
    if (!shots.length) return [];
    return ['  <div class="dir__cover dir__cover--' + shots.length + '">'].concat(shots.map(function (c) {
      return '    <span class="dir__shot"><img src="' + attr(rebase(c.src)) + '" alt="' + attr(c.alt || "") + '" loading="lazy"' +
        (c.position ? ' style="object-position:' + attr(c.position) + '"' : "") + "></span>";
    }), ["  </div>"]);
  }

  /* one research direction as a card: picture, seal and title, one line, its topics, papers;
     its colour is a tone class (lab.css .tone-*) */
  function direction(d, i, pubs, ed) {
    var byId = byIds(pubs), path = "lab.directions." + i;
    var papers = (d.papers || []).map(function (id) { return byId[id]; }).filter(Boolean);
    var body = [
      '  <div class="dir__body">',
      '    <div class="dir__head">',
      '      <span class="dir__seal" aria-hidden="true"' + A(ed, path + ".seal") + ">" + text(d.seal) + "</span>",
      '      <h3 class="dir__title">' + bi(d.title, ed, path + ".title") + "</h3>",
      "    </div>"
    ].concat(indent(biBlock("p", "dir__text", d.summary, ed, path + ".summary"), "    "));
    if ((d.topics || []).length) {
      body.push('    <ul class="dir__topics">');
      d.topics.forEach(function (t, j) { body.push("      <li>" + bi(t, ed, path + ".topics." + j) + "</li>"); });
      body.push("    </ul>");
    }
    if (papers.length) {
      body.push('    <p class="dir__label"><span class="en">Representative work</span><span class="zh">代表工作</span></p>', '    <ul class="dir__papers">');
      papers.forEach(function (p) {
        body.push('      <li><a href="#p-' + attr(p.id) + '"><span class="dir__name">' + text(shortName(p)) + '</span><span class="dir__venue">' + text(p.venue) + "</span></a></li>");
      });
      body.push("    </ul>");
    }
    body.push("  </div>");
    var cls = "dir dir--" + attr(d.id) + " tone-" + attr(d.tone || "steel") + " spotlight reveal";
    return ['<article class="' + cls + '" id="dir-' + attr(d.id) + '"' + I(ed, "directions", i) + ">"].concat(cover(d), body, ["</article>"]).join("\n");
  }

  /* ---------- project pages (lab/projects/<slug>/): one template for every featured work ---------- */
  function bibtex(p, slug) {
    var y = yearOf(p), venue = String(p.venue || "").replace(/\s*(?:19|20)\d\d\s*$/, "").trim();
    var names = String(p.authors || "").split(/\s*[,，]\s*/).filter(Boolean).map(function (n) { return n.replace(/[*†‡#]+/g, "").trim(); });
    var key = ((names[0] || "").split(" ").pop().toLowerCase().replace(/[^a-z]/g, "") || "muse") + y + slug.split("-")[0].replace(/[^a-z0-9]/gi, "");
    var f = [["title", p.title], ["author", names.join(" and ")]], type = "inproceedings";
    if (p.type === "journal") {
      var d = String(p.details || ""), j = /^([^,]+),/.exec(d), v = /(\d+)\((\d+)\):\s*(\d+)\s*[–-]+\s*(\d+)/.exec(d);
      type = "article";
      f.push(["journal", j ? j[1].trim() : venue]);
      if (v) f.push(["volume", v[1]], ["number", v[2]], ["pages", v[3] + "--" + v[4]]);
    } else if (p.type === "preprint") {
      var ax = /(\d{4}\.\d{4,5})/.exec(String(p.details || "") + " " + String(p.paper || ""));
      type = "article";
      f.push(["journal", ax ? "arXiv preprint arXiv:" + ax[1] : "arXiv preprint"]);
    } else if (p.type === "chapter") {
      type = "incollection";
      f.push(["booktitle", String(p.details || venue).replace(/\.$/, "")]);
    } else {
      f.push(["booktitle", (VENUES[venue] || venue).replace("{y}", y)]);
    }
    f.push(["year", y]);
    var doi = /doi\.org\/(.+)$/i.exec(p.paper || "");
    if (doi) f.push(["doi", doi[1]]);
    else if (/^https?:/i.test(p.paper || "")) f.push(["url", p.paper]);
    f = f.filter(function (x) { return x[1]; });
    var w = Math.max.apply(null, f.map(function (x) { return x[0].length; }));
    return "@" + type + "{" + key + ",\n" + f.map(function (x) {
      return "  " + x[0] + new Array(w - x[0].length + 2).join(" ") + "= {" + x[1] + "}";
    }).join(",\n") + "\n}";
  }

  var SPRITE = [
    '<symbol id="i-paper" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/></symbol>',
    '<symbol id="i-code" viewBox="0 0 24 24"><path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/><path d="m13.5 4-3 16"/></symbol>',
    '<symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/></symbol>',
    '<symbol id="i-quote" viewBox="0 0 24 24"><path d="M7 7h4v4H7c0 3 1 4 3 5"/><path d="M14 7h4v4h-4c0 3 1 4 3 5"/></symbol>',
    '<symbol id="i-prev" viewBox="0 0 24 24"><path d="m14.5 5.5-6.5 6.5 6.5 6.5"/></symbol>'
  ];

  /* the page of one featured work: what it is in a sentence, the paper's own summary, three highlights,
     the method figure, a citation to copy, and the other featured works */
  function projectPage(data, slug) {
    var l = data.lab || {}, x = projectOf(l, slug);
    if (!x) return "";
    base = "../../../";
    try {
      var byId = byIds(data.publications || []), p = byId[x.paper] || {}, name = shortName(p) || slug, blurb = x.blurb || {};
      var sum = { en: p.summaryEn, zh: p.summaryZh }, url = "https://yifanyuan.com/lab/projects/" + slug + "/";
      var year = (/^(\d{4})/.exec((((data.home || {}).footer || {}).updated) || "") || [])[1] || yearOf(p);
      var heading = function (en, zh) { return '      <h2 class="project__h"><span class="en">' + en + '</span><span class="zh">' + zh + "</span></h2>"; };
      var btn = function (key, label) { return p[key] ? link(p[key], icon(LINK_ICONS[key]) + "<span>" + label + "</span>", ' class="pbtn"') : ""; };
      var others = (l.projects || []).filter(function (o) { return o.slug && o.slug !== slug; }).map(function (o) {
        return '        <a class="pcard tone-' + attr(o.tone || "steel") + '" href="../' + attr(o.slug) + '/">' +
          (o.visual ? '<span class="pcard__visual"><img src="' + attr(rebase(o.visual)) + '" alt="" loading="lazy"></span>' : "") +
          '<span class="pcard__name">' + text(shortName(byId[o.paper] || {}) || o.slug) + '</span><span class="pcard__blurb"><span class="en">' +
          text(plain(pick(o.blurb, "en"))) + '</span><span class="zh">' + text(plain(pick(o.blurb, "zh"))) + "</span></span></a>";
      });
      var out = [
        "<!DOCTYPE html>",
        '<html lang="en" class="lang-en">',
        "<head>",
        '  <meta charset="utf-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1">',
        "  <title>" + text(name) + " · MUSE Lab</title>",
        "  <script>",
        "    /* the language before first paint, as on the lab page: ?lang= → saved choice → browser language */",
        "    (function () {",
        "      var d = document.documentElement, l = null;",
        '      try { l = new URLSearchParams(location.search).get("lang"); } catch (e) {}',
        '      if (l !== "zh" && l !== "en") { try { l = localStorage.getItem("lang"); } catch (e) {} }',
        '      if (l !== "zh" && l !== "en") { l = /^zh/i.test(navigator.language || "") ? "zh" : "en"; }',
        '      d.className = "js lang-" + l;',
        '      d.lang = l === "zh" ? "zh-CN" : "en";',
        "    })();",
        "  </script>",
        '  <meta name="description" content="' + attr(plain(pick(blurb, "en"))) + '">',
        '  <link rel="canonical" href="' + url + '">',
        '  <meta property="og:type" content="article">',
        '  <meta property="og:site_name" content="MUSE Lab">',
        '  <meta property="og:title" content="' + attr(name + " · MUSE Lab") + '">',
        '  <meta property="og:description" content="' + attr(plain(pick(blurb, "en"))) + '">',
        '  <meta property="og:url" content="' + url + '">'
      ].concat(p.image ? ['  <meta property="og:image" content="https://yifanyuan.com/' + attr(p.image) + '">'] : [], [
        '  <meta name="theme-color" content="#fbf8f2">',
        '  <link rel="icon" type="image/png" href="../../../images/muse-favicon.png">',
        '  <link rel="preload" href="../../../assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>',
        '  <link rel="preload" href="../../../assets/fonts/fraunces-semibold.woff2" as="font" type="font/woff2" crossorigin>',
        '  <link rel="stylesheet" href="../../lab.css">',
        "</head>",
        '<body class="project-page">',
        '  <svg xmlns="http://www.w3.org/2000/svg" style="display: none">'
      ], indent(SPRITE, "    "), [
        "  </svg>",
        "  <!-- Generated from data/lab.json (\"projects\") and data/publications.json by admin/render.js, like the",
        "       lab page: run `node tools/render_site.js`, or publish from the page editor; hand edits are overwritten. -->",
        "",
        '  <div class="washes" aria-hidden="true"><span class="wash w1"></span><span class="wash w2"></span><span class="wash w3"></span><span class="wash w4"></span></div>',
        "",
        '  <header class="bar is-scrolled">',
        '    <a class="brand" href="../../"><img src="../../../images/muse-logo.png" width="480" height="435" alt=""><span>MUSE Lab</span></a>',
        '    <div class="tools">',
        '      <a class="bar__back" href="../../#work">' + icon("prev") + '<span class="en">All featured work</span><span class="zh">全部代表作</span></a>',
        '      <div class="lang-switch" role="group" aria-label="Language / 语言">',
        '        <button type="button" data-set-lang="en" lang="en">EN</button>',
        '        <button type="button" data-set-lang="zh" lang="zh-CN">中文</button>',
        "      </div>",
        '      <a class="corner-logo" href="../../"><img src="../../../images/muse-logo.png" width="480" height="435" alt="MUSE Lab"></a>',
        "    </div>",
        "  </header>",
        "",
        '  <main class="project tone-' + attr(x.tone || "steel") + '" id="content">',
        '    <section class="project__hero">',
        '      <div class="project__intro">',
        '        <p class="project__venue"><span class="pub-venue">' + text(p.venue) + "</span>" + (p.note ? '<span class="pub-badge">' + text(p.note) + "</span>" : "") + "</p>",
        '        <h1 class="project__title">' + text(name) + "</h1>"
      ], p.title && p.title !== name ? ['        <p class="project__paper">' + text(p.title) + "</p>"] : [],
      indent(biBlock("p", "project__blurb", blurb), "        "), [
        '        <p class="project__authors">' + authors(p.authors) + "</p>",
        '        <p class="project__links">' + btn("paper", "Paper") + btn("code", "Code") + btn("project", "Project") +
          '<a class="pbtn" href="#cite">' + icon("quote") + "<span>BibTeX</span></a></p>",
        "      </div>"
      ], x.visual ? ['      <div class="project__visual"><img src="' + attr(rebase(x.visual)) + '" alt=""></div>'] : [], ["    </section>"]);
      if (sum.en || sum.zh) {
        out.push("", '    <section class="project__section">', heading("Overview", "概览"),
          '      <p class="project__text en">' + inline(pick(sum, "en")) + "</p>", '      <p class="project__text zh">' + inline(pick(sum, "zh")) + "</p>", "    </section>");
      }
      if ((x.points || []).length) {
        out.push("", '    <section class="project__section">', heading("Highlights", "要点"), '      <ol class="project__points">');
        x.points.forEach(function (pt) { out.push("        <li>" + bi(pt, false, "", true) + "</li>"); });
        out.push("      </ol>", "    </section>");
      }
      if (p.image) {
        out.push("", '    <section class="project__section project__section--wide">', heading("Method", "方法"),
          '      <figure class="project__figure"><a href="' + attr(rebase(p.image)) + '" target="_blank" rel="noopener"><img src="' + attr(rebase(p.image)) + '"' +
            (p.imageWidth && p.imageHeight ? ' width="' + p.imageWidth + '" height="' + p.imageHeight + '"' : "") + ' loading="lazy" alt="' + attr(p.imageAlt || p.title) + '"></a>' +
            (p.imageAlt ? "<figcaption>" + text(p.imageAlt) + "</figcaption>" : "") + "</figure>", "    </section>");
      }
      out.push("", '    <section class="project__section" id="cite">', heading("Citation", "引用"),
        '      <div class="project__bib"><pre><code>' + text(bibtex(p, slug)) + "</code></pre>" +
          '<button type="button" class="pbtn project__copy" data-copy><span class="en">Copy</span><span class="zh">复制</span></button></div>', "    </section>");
      if (others.length) {
        out.push("", '    <section class="project__section project__section--wide">', heading("More featured work", "更多代表作"), '      <div class="project__more">');
        out.push.apply(out, others);
        out.push("      </div>", "    </section>");
      }
      out.push("  </main>", "",
        '  <footer class="foot">',
        "    <p>© " + text(year) + ' MUSE Lab · <span class="en">College of Artificial Intelligence, Shenzhen University</span><span class="zh">深圳大学人工智能学院</span></p>',
        '    <a class="to-top" href="../../">' + icon("prev") + '<span class="en">MUSE Lab home</span><span class="zh">实验室主页</span></a>',
        "  </footer>",
        "",
        "  <script>",
        "    /* the language switch (one choice for the whole lab site) and copying the citation */",
        "    (function () {",
        "      var root = document.documentElement;",
        '      [].forEach.call(document.querySelectorAll("[data-set-lang]"), function (b) {',
        '        b.addEventListener("click", function () {',
        '          var l = b.getAttribute("data-set-lang");',
        '          root.classList.remove("lang-en", "lang-zh");',
        '          root.classList.add("lang-" + l);',
        '          root.lang = l === "zh" ? "zh-CN" : "en";',
        '          try { localStorage.setItem("lang", l); } catch (e) {}',
        "        });",
        "      });",
        '      var copy = document.querySelector("[data-copy]");',
        "      if (copy && navigator.clipboard) {",
        '        copy.addEventListener("click", function () {',
        '          navigator.clipboard.writeText(document.querySelector(".project__bib code").textContent).then(function () {',
        '            copy.classList.add("is-done");',
        '            setTimeout(function () { copy.classList.remove("is-done"); }, 1600);',
        "          });",
        "        });",
        "      }",
        "    })();",
        "  </script>",
        "</body>",
        "</html>");
      return out.join("\n") + "\n";
    } finally {
      base = "";
    }
  }

  /* every project page as { path, html } */
  function projectPages(data) {
    return ((data.lab || {}).projects || []).filter(function (x) { return x.slug; }).map(function (x) {
      return { path: "lab/projects/" + x.slug + "/index.html", html: projectPage(data, x.slug) };
    });
  }

  function filters(h, pubs, l) {
    var short = l.themeShort || {};
    var chips = ['<button type="button" class="chip is-active" data-filter="all" aria-pressed="true"><span class="en">All</span><span class="zh">全部</span>' +
      '<span class="chip__n">' + pubs.length + "</span></button>"];
    (h.themes || []).forEach(function (t) {
      var n = pubs.filter(function (p) { return p.theme === t.id; }).length;
      if (n) {
        chips.push('<button type="button" class="chip chip--' + attr(t.id) + '" data-filter="' + attr(t.id) + '" aria-pressed="false">' +
          '<span class="chip__seal" aria-hidden="true">' + text(t.seal) + "</span>" + bi(short[t.id] || t.title) + '<span class="chip__n">' + n + "</span></button>");
      }
    });
    return chips.join("\n");
  }

  function yearOf(p) {
    var m = String(p.venue || "").match(/(?:19|20)\d\d/g) || String(p.details || "").match(/(?:19|20)\d\d/g);
    return m ? m[m.length - 1] : "";
  }

  function entry(p, seals) {
    var names = String(p.authors || "").trim(), links = linkList(p);
    var extra = (p.note ? '<span class="pitem__note">' + text(p.note) + "</span>" : "") + (links ? '<span class="pitem__links">' + links + "</span>" : "");
    return [
      '<li class="pitem reveal" id="p-' + attr(p.id) + '" data-theme="' + attr(p.theme) + '">',
      '  <span class="pitem__venue' + (MUTED[p.type] ? " pitem__venue--muted" : "") + '">' + text(p.venue) + "</span>",
      '  <div class="pitem__body">',
      '    <span class="pitem__title">' + text(p.title) + "</span>",
      '    <span class="pitem__authors">' + authors(names) + (/[.!?。]$/.test(names) ? "" : ".") + (p.details ? " " + inline(p.details) : "") + "</span>"
    ].concat(extra ? ['    <span class="pitem__extra">' + extra + "</span>"] : [], ["  </div>"],
      seals[p.theme] ? ['  <span class="pitem__seal pitem__seal--' + attr(p.theme) + '" aria-hidden="true">' + text(seals[p.theme]) + "</span>"] : [],
      ["</li>"]).join("\n");
  }

  /* every paper, grouped by year, newest year first */
  function labPublications(h, pubs) {
    var seals = {}, years = [], groups = {};
    (h.themes || []).forEach(function (t) { seals[t.id] = t.seal; });
    pubs.forEach(function (p) {
      var y = yearOf(p) || "—";
      if (!groups[y]) { groups[y] = []; years.push(y); }
      groups[y].push(p);
    });
    years.sort(function (a, b) { return (+b || 0) - (+a || 0); });
    return years.map(function (y) {
      return ['<section class="year" data-year="' + attr(y) + '">', '  <h3 class="year__label reveal">' + text(y) + "</h3>", '  <ol class="plist">']
        .concat(indent(groups[y].map(function (p) { return entry(p, seals); }), "    "), ["  </ol>", "</section>"]).join("\n");
    }).join("\n");
  }

  function labContact(l, ed) {
    var items = ((l.contact || {}).items || []).map(function (x, i) {
      var path = "lab.contact.items." + i, value = bi(x.value, ed, path + ".value");
      return '<li class="crow reveal"' + I(ed, "labContact", i) + ">" + icon(x.icon || "link") + '<span class="crow__label">' +
        bi(x.label, ed, path + ".label") + '</span><span class="crow__value">' + (x.url ? link(x.url, value) : value) + "</span></li>";
    });
    return items.concat(ed ? [ADD(ed, "labContact", "li")] : []).join("\n");
  }

  /* who took the photos on the research cards */
  function credits(l) {
    var list = [];
    (l.directions || []).forEach(function (d) {
      (d.cover || []).forEach(function (c) { if (c.credit) list.push(c.credit); });
    });
    if (!list.length) return "";
    return '<span class="en">Photos:</span><span class="zh">图片来源：</span> ' + list.map(function (c) {
      return c.url ? link(c.url, bi(c)) : bi(c);
    }).join(" · ");
  }

  function labSections(data, ed) {
    var h = data.home || {}, news = data.news || [], pubs = data.publications || [], l = data.lab || {};
    var parts = {
      "lab-tagline": tagline(l, ed),
      "lab-topics": heroTopics(l, ed),
      "lab-latest": ticker(news, ed),
      "lab-about": labAbout(l, ed),
      "lab-pi": piCard(h, l, ed),
      "lab-acronym": acronym(l, ed),
      "lab-research": (l.directions || []).map(function (d, i) { return direction(d, i, pubs, ed); }).concat(ed ? [ADD(ed, "directions", "div")] : []).join("\n"),
      "lab-work": (l.projects || []).map(function (x, i) { return pane(x, i, pubs, ed); }).concat(ed ? [ADD(ed, "projects", "div")] : []).join("\n"),
      "lab-news": (ed ? [ADD(ed, "stories", "div")] : []).concat((l.stories || []).map(function (s, i) { return story(s, i, l, ed); })).join("\n"),
      "lab-filters": filters(h, pubs, l),
      "lab-publications": (ed ? sharedNote(ed, "论文") + "\n" : "") + labPublications(h, pubs),
      "lab-contact-intro": bi(l.contactIntro, ed, "lab.contactIntro", true),
      "lab-contact": labContact(l, ed),
      "lab-credits": credits(l)
    };
    LAB_HEADINGS.forEach(function (k) { parts["lab-h-" + k] = labHeading(l, k, ed); });
    return parts;
  }

  /* the lab page's regions with links made relative to lab/ (the editor draws them with ed = true) */
  function labParts(data, ed) {
    base = "../";
    try {
      return labSections(data, ed);
    } finally {
      base = "";
    }
  }

  function buildLab(html, data) {
    var parts = labParts(data, false);
    LAB_REGIONS.forEach(function (name) { html = region(html, name, parts[name]); });
    return html;
  }

  return {
    ME: ME,
    REGIONS: REGIONS,
    LAB_REGIONS: LAB_REGIONS,
    normalizeNews: function (n) { return normalize(n, NEWS_FIELDS); },
    normalizePub: function (p) { return normalize(p, PUB_FIELDS); },
    serialize: serialize,
    escape: attr,
    inline: inline,
    plain: plain,
    authors: authors,
    sections: sections,
    build: build,
    labParts: labParts,
    buildLab: buildLab,
    projectPages: projectPages
  };
});
