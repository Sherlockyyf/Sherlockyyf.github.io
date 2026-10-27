/* Builds every content section of index.html from data/home.json, data/news.json and
   data/publications.json. Shared by the page editor (admin/editor.js) and
   `node tools/render_site.js`; loads as a browser global (SiteRender) or a CommonJS module.
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

  /* every news entry and paper is written with these keys, in this order */
  var NEWS_FIELDS = { date: "", icon: "", en: "", zh: "" };
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

  function link(url, html, extra) {
    var u = safeUrl(url), newTab = /^https?:/i.test(u) || /\.pdf$/i.test(u);
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
    return '<a class="pub-media" href="' + attr(p.image) + '" target="_blank" rel="noopener"><img src="' + attr(p.image) + '"' +
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
    if (j < 0) throw new Error("index.html is missing the " + start + " … " + end + " markers");
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

  return {
    ME: ME,
    REGIONS: REGIONS,
    normalizeNews: function (n) { return normalize(n, NEWS_FIELDS); },
    normalizePub: function (p) { return normalize(p, PUB_FIELDS); },
    serialize: serialize,
    escape: attr,
    inline: inline,
    plain: plain,
    authors: authors,
    sections: sections,
    build: build
  };
});
