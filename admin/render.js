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
     News, papers and the PI's name, title and photo come from the homepage's data; data/lab.json
     holds what only the lab page shows: mission, introduction, the MUSE acronym, figures,
     research directions, collaboration note and contact. */
  var LAB_REGIONS = ["lab-latest", "lab-topics", "lab-news", "lab-mission", "lab-about", "lab-pi", "lab-acronym", "lab-stats",
    "lab-research-intro", "lab-index", "lab-directions", "lab-featured", "lab-filters", "lab-publications", "lab-cta", "lab-contact"];
  var LINK_ICONS = { paper: "paper", code: "code", project: "globe" };
  var VENUE_RE = /\b(EMNLP|ACM MM|ICASSP|CVPR|ICCV|ECCV|ICLR|NeurIPS|ICML|AAAI|IJCAI|ACL|NAACL|KDD)\s*((?:19|20)\d\d)\b/;

  function icon(id) {
    return '<svg class="icon" aria-hidden="true"><use href="#i-' + attr(id) + '"/></svg>';
  }

  function labNews(news) {
    return news.filter(function (n) { return n.lab !== false; });
  }

  /* the newest lab news as a one-line link in the hero */
  function latest(news) {
    var n = labNews(news)[0];
    if (!n) return "";
    return '<a class="latest" href="#news"><span class="latest__tag"><span class="en">New</span><span class="zh">最新</span></span>' +
      '<span class="latest__text"><span class="en">' + text(plain(pick(n, "en"))) + '</span><span class="zh">' + text(plain(pick(n, "zh"))) +
      '</span></span><span class="latest__arrow" aria-hidden="true">→</span></a>';
  }

  /* the research directions as chips in the hero, each jumping to its block */
  function topics(l) {
    return (l.directions || []).map(function (d) {
      return '<li><a href="#dir-' + attr(d.id) + '">' + bi(d.title) + "</a></li>";
    }).join("\n");
  }

  /* what a news card shows in its picture: the venue it mentions, or the month */
  function newsLabel(n) {
    var s = plain(n.en || n.zh || ""), m = VENUE_RE.exec(s);
    if (m) return m[1] + " " + m[2];
    if (/Automatica Sinica/i.test(s)) return "IEEE/CAA JAS";
    if (/preprint|arXiv/i.test(s)) return "Preprint";
    return n.date;
  }

  function newsKind(n) {
    var s = (n.icon || "") + " " + plain(n.en || "");
    if (/🏆|award|prize/i.test(s)) return { en: "Award", zh: "获奖" };
    if (/accepted/i.test(s)) return { en: "Accepted", zh: "论文录用" };
    if (/published/i.test(s)) return { en: "Published", zh: "论文发表" };
    if (/📄|arXiv|preprint|code/i.test(s)) return { en: "Release", zh: "论文发布" };
    return { en: "News", zh: "动态" };
  }

  function newsCards(news) {
    return labNews(news).slice(0, 6).map(function (n, i) {
      return [
        '<article class="ncard reveal">',
        '  <div class="ncard__art ncard__art--' + (i % 6) + '" aria-hidden="true"><span class="ncard__label">' + text(newsLabel(n)) + "</span></div>",
        '  <div class="ncard__body">',
        '    <p class="ncard__meta"><span class="ncard__kind">' + bi(newsKind(n)) + '</span><span class="ncard__date">' + text(n.date) + "</span></p>",
        '    <p class="ncard__text"><span class="en">' + inline(pick(n, "en")) + '</span><span class="zh">' + inline(pick(n, "zh")) + "</span></p>",
        "  </div>",
        "</article>"
      ].join("\n");
    }).join("\n");
  }

  function acronym(l) {
    return (l.acronym || []).map(function (a) {
      return [
        '<li class="acro">',
        '  <span class="acro__letter" aria-hidden="true">' + text(a.letter) + "</span>",
        '  <div class="acro__body">',
        '    <strong class="acro__word">' + text(a.word) + (a.zh ? '<span class="zh"> · ' + text(a.zh) + "</span>" : "") + "</strong>"
      ].concat(indent(biBlock("p", "", a.text), "    "), ["  </div>", "</li>"]).join("\n");
    }).join("\n");
  }

  /* big figures; the number counts up when it scrolls into view */
  function stats(l) {
    return (l.stats || []).map(function (s) {
      var m = /^(\d+)(.*)$/.exec(String(s.value || "")), count = m ? ' data-count="' + m[1] + '" data-suffix="' + attr(m[2]) + '"' : "";
      return '<div class="stat"><span class="stat__num"' + count + ">" + text(s.value) + '</span><span class="stat__label">' + bi(s.label) + "</span></div>";
    }).join("\n");
  }

  /* the PI: name, title and photo from home.json, links from lab.json */
  function piCard(h, l) {
    var p = h.profile || {}, photo = p.photo || {}, n = p.name || {}, t = p.title || {}, pi = l.pi || {};
    return [
      '<img class="pi__photo" src="' + attr(rebase(photo.src)) + '"' + (photo.width && photo.height ? ' width="' + photo.width + '" height="' + photo.height + '"' : "") +
        ' loading="lazy" alt="' + attr([n.en, n.zh].filter(Boolean).join(" ")) + '">',
      '<div class="pi__body">',
      '  <p class="pi__role"><span class="en">Principal Investigator</span><span class="zh">实验室负责人</span></p>',
      '  <p class="pi__name"><span class="en">' + text(n.en) + ' <span class="pi__alt" lang="zh-CN">' + text(n.zh) + '</span></span><span class="zh">' +
        text(n.zh) + ' <span class="pi__alt" lang="en">' + text(n.en) + "</span></span></p>",
      '  <p class="pi__title"><span class="en">' + text((t.en || []).join(", ")) + '</span><span class="zh">' + text((t.zh || []).join(" ")) + "</span></p>",
      '  <p class="pi__links">' + (pi.links || []).map(function (x) { return link(x.url, icon(x.icon || "link") + bi(x), ' class="pbtn"'); }).join("") + "</p>",
      "</div>"
    ].join("\n");
  }

  /* a paper's short name: its tag without the venue ("StateTrack · EMNLP'26" → "StateTrack") */
  function shortName(p) {
    return String(p.tag || "").split(" · ")[0].trim() || p.title;
  }

  function two(i) {
    return (i < 9 ? "0" : "") + (i + 1);
  }

  /* the list of directions that stays beside the research blocks on wide screens */
  function researchIndex(l) {
    return (l.directions || []).map(function (d, i) {
      return '<li><a class="rindex__link" href="#dir-' + attr(d.id) + '"><span class="rindex__num">' + two(i) + '</span><span class="rindex__seal" aria-hidden="true">' +
        text(d.seal) + '</span><span class="rindex__title">' + bi(d.title) + "</span></a></li>";
    }).join("\n");
  }

  /* small looping illustrations for each direction (decorative) */
  var VISUALS = {
    scan: function () {   // a beam reads the tokens; a few flare up as risky, then settle once corrected
      var cells = "", risky = { 13: 1, 26: 1, 37: 1 };
      for (var i = 0; i < 40; i++) cells += "<i" + (risky[i] ? ' class="is-risk"' : "") + ' style="--c:' + (i % 10) + '"></i>';
      return '<div class="viz__grid">' + cells + '</div><span class="viz__beam"></span>';
    },
    timeline: function () {
      var frames = "", bars = "", hs = [28, 46, 38, 72, 94, 66, 40, 30, 52, 86, 58, 34, 26, 44, 62, 36];
      for (var i = 0; i < 8; i++) frames += '<i style="--i:' + i + '"></i>';
      hs.forEach(function (h, j) { bars += '<b style="--h:' + h + "%;--i:" + j + '"></b>'; });
      return '<div class="viz__frames">' + frames + '</div><div class="viz__bars">' + bars + '</div><span class="viz__window"></span><span class="viz__head"></span>';
    },
    waves: function () {
      var wave = function (amp, y) {   // four periods of a soft wave; the drawing slides by one period and loops
        var d = "M0 " + y;
        for (var x = 0, up = true; x < 1200; x += 150, up = !up) d += " Q" + (x + 75) + " " + (up ? y - amp : y + amp) + " " + (x + 150) + " " + y;
        return d;
      };
      return '<svg class="viz__waves" viewBox="0 0 600 200" preserveAspectRatio="none"><path class="w1" d="' + wave(46, 100) + '"/><path class="w2" d="' +
        wave(30, 104) + '"/><path class="w3" d="' + wave(18, 96) + '"/></svg><span class="viz__pulse"></span>';
    },
    shield: function () {
      return '<span class="viz__ring"></span><span class="viz__ring"></span><span class="viz__ring"></span>' +
        '<svg class="viz__shield" viewBox="0 0 64 72"><path d="M32 4 7 14v19c0 17 10.6 29 25 35 14.4-6 25-18 25-35V14z"/><path class="viz__tick" d="m21 36 8 8 15-16"/></svg>' +
        '<i class="viz__dot"></i><i class="viz__dot"></i><i class="viz__dot"></i><i class="viz__dot"></i>';
    },
    path: function () {
      var d = "M40 170 C 130 40, 230 210, 320 115 S 500 30, 560 80";
      return '<svg class="viz__path" viewBox="0 0 600 220" preserveAspectRatio="xMidYMid meet"><path class="viz__track" d="' + d + '"/>' +
        '<circle class="viz__node" cx="40" cy="170" r="7"/><circle class="viz__node" cx="320" cy="115" r="7"/><circle class="viz__node" cx="560" cy="80" r="7"/>' +
        '<circle class="viz__bot" r="11"><animateMotion dur="6s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.55 1" path="' +
        d + '"/></circle></svg>';
    }
  };

  function grantsFor(h, d) {
    var all = (h.grants || []).concat(h.grantsEarlier || []);
    return (d.grants || []).map(function (title) {
      return all.filter(function (g) { return g.title && String(g.title.zh || "").indexOf(title) === 0; })[0];
    }).filter(Boolean);
  }

  /* one research direction: heading, summary, illustration, topics, papers and projects */
  function direction(d, i, h, pubs) {
    var byId = {};
    pubs.forEach(function (p) { byId[p.id] = p; });
    var papers = (d.papers || []).map(function (id) { return byId[id]; }).filter(Boolean);
    var grants = grantsFor(h, d);
    var refs = [];
    if (papers.length) {
      refs.push('  <div class="dir__refs reveal">', '    <p class="dir__refs-label"><span class="en">Papers</span><span class="zh">代表论文</span></p>', '    <div class="dir__papers">');
      papers.forEach(function (p) {
        refs.push('      <a href="#p-' + attr(p.id) + '"><span class="dir__name">' + text(shortName(p)) + '</span><span class="dir__venue">' + text(p.venue) + "</span></a>");
      });
      refs.push("    </div>", "  </div>");
    }
    if (grants.length) {
      refs.push('  <div class="dir__refs reveal">', '    <p class="dir__refs-label"><span class="en">Projects</span><span class="zh">相关项目</span></p>', '    <ul class="dir__grants">');
      grants.forEach(function (g) { refs.push("      <li>" + bi(g.title) + '<span class="dir__funder">' + bi(g.funder) + "</span></li>"); });
      refs.push("    </ul>", "  </div>");
    }
    return [
      '<article class="dir dir--' + attr(d.id) + '" id="dir-' + attr(d.id) + '">',
      '  <header class="dir__head reveal">',
      '    <span class="dir__num">' + two(i) + "</span>",
      '    <span class="dir__seal" aria-hidden="true">' + text(d.seal) + "</span>",
      '    <h3 class="dir__title">' + bi(d.title) + "</h3>",
      "  </header>"
    ].concat(indent(biBlock("p", "dir__summary reveal", d.summary), "  "), [
      '  <div class="viz viz--' + attr(d.visual || "scan") + ' reveal" aria-hidden="true">' + (VISUALS[d.visual] || VISUALS.scan)() + "</div>",
      '  <div class="dir__topics">'
    ], (d.topics || []).map(function (t) {
      return ['    <section class="topic reveal">', '      <h4 class="topic__title">' + bi(t.title) + "</h4>"]
        .concat(indent(biBlock("p", "topic__text", t.text), "      "), ["    </section>"]).join("\n");
    }), ["  </div>"], refs, ["</article>"]).join("\n");
  }

  function buttons(p) {
    return LINKS.filter(function (l) { return p[l[0]]; }).map(function (l) {
      return link(p[l[0]], icon(LINK_ICONS[l[0]]) + "<span>" + l[1] + "</span>", ' class="pbtn"');
    }).join("");
  }

  /* the selected papers as tabs, one panel each with figure, summary and links */
  function featured(pubs) {
    var sel = pubs.filter(function (p) { return p.selected; });
    var tabs = sel.map(function (p, i) {
      return '<button type="button" class="ftab' + (i ? "" : " is-active") + '" role="tab" id="ftab-' + attr(p.id) + '" aria-controls="feature-' +
        attr(p.id) + '" aria-selected="' + !i + '"' + (i ? ' tabindex="-1"' : "") + '><span class="ftab__name">' + text(shortName(p)) +
        '</span><span class="ftab__venue">' + text(p.venue) + "</span></button>";
    });
    var panels = sel.map(function (p, i) {
      var sum = { en: p.summaryEn, zh: p.summaryZh };
      return [
        '<article class="feature' + (i ? "" : " is-active") + '" role="tabpanel" id="feature-' + attr(p.id) + '" aria-labelledby="ftab-' + attr(p.id) + '">',
        "  " + media(p),
        '  <div class="feature__body">',
        '    <div class="pub-meta"><span class="pub-venue">' + text(p.venue) + "</span>" + (p.note ? '<span class="pub-badge">' + text(p.note) + "</span>" : "") + "</div>",
        '    <h4 class="feature__title">' + text(p.title) + "</h4>",
        '    <p class="feature__authors">' + authors(p.authors) + "</p>"
      ].concat(sum.en || sum.zh ? [
        '    <p class="feature__desc en">' + inline(pick(sum, "en")) + "</p>",
        '    <p class="feature__desc zh">' + inline(pick(sum, "zh")) + "</p>"
      ] : [], ['    <p class="feature__links">' + buttons(p) + "</p>", "  </div>", "</article>"]).join("\n");
    });
    return ['<div class="ftabs" role="tablist" aria-labelledby="featured-title">'].concat(indent(tabs, "  "), ["</div>", '<div class="features">'],
      indent(panels, "  "), ["</div>"]).join("\n");
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
      '<li class="pitem" id="p-' + attr(p.id) + '" data-theme="' + attr(p.theme) + '">',
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
      return ['<section class="year reveal" data-year="' + attr(y) + '">', '  <h3 class="year__label">' + text(y) + "</h3>", '  <ol class="plist">']
        .concat(indent(groups[y].map(function (p) { return entry(p, seals); }), "    "), ["  </ol>", "</section>"]).join("\n");
    }).join("\n");
  }

  function labCta(l) {
    var c = l.cta || {};
    return ['<h2 class="cta__title">' + bi(c.title) + "</h2>"].concat(biBlock("p", "cta__text", c.text)).join("\n");
  }

  function labContact(l) {
    return ((l.contact || {}).items || []).map(function (x) {
      return '<li class="crow">' + icon(x.icon || "link") + '<span class="crow__label">' + bi(x.label) + '</span><span class="crow__value">' +
        (x.url ? link(x.url, bi(x.value)) : bi(x.value)) + "</span></li>";
    }).join("\n");
  }

  function labSections(data) {
    var h = data.home || {}, news = data.news || [], pubs = data.publications || [], l = data.lab || {};
    return {
      "lab-latest": latest(news),
      "lab-topics": topics(l),
      "lab-news": newsCards(news),
      "lab-mission": biBlock("p", "mission__text", l.mission).join("\n"),
      "lab-about": (l.about || []).map(function (p) { return biBlock("p", "", p).join("\n"); }).join("\n"),
      "lab-pi": piCard(h, l),
      "lab-acronym": acronym(l),
      "lab-stats": stats(l),
      "lab-research-intro": bi(l.researchIntro),
      "lab-index": researchIndex(l),
      "lab-directions": (l.directions || []).map(function (d, i) { return direction(d, i, h, pubs); }).join("\n"),
      "lab-featured": featured(pubs),
      "lab-filters": filters(h, pubs, l),
      "lab-publications": labPublications(h, pubs),
      "lab-cta": labCta(l),
      "lab-contact": labContact(l)
    };
  }

  function buildLab(html, data) {
    base = "../";
    try {
      var parts = labSections(data);
      LAB_REGIONS.forEach(function (name) { html = region(html, name, parts[name]); });
      return html;
    } finally {
      base = "";
    }
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
    buildLab: buildLab
  };
});
