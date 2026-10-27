/* In-place editor for the homepage, loaded by index.html on a device that signed in at admin/.
   Every text can be edited where it is; list entries get buttons to edit, move and delete them,
   with a side panel for the details; "发布到网站" commits the data files, the regenerated
   index.html and any new images to the site's GitHub repository in one go. */
(function () {
  "use strict";

  var R = window.SiteRender, S = window.SiteAdmin, CONFIG = window.ADMIN_CONFIG || {};
  var ADMIN = new URL(".", document.currentScript.src).href;
  var SITE = new URL("../", ADMIN).href;
  var PHOTO_WIDTH = 1200, FIGURE_WIDTH = 1400, LOGO_WIDTH = 320, PDF_LIMIT = 25 * 1024 * 1024;
  var NEWS_ICONS = [["🎉🎉", "论文录用"], ["📄", "新论文 / 预印本"], ["🏆", "获奖"], ["🎤", "报告 / 讲座"],
    ["🏫", "任职"], ["🎓", "毕业"], ["📢", "其他"], ["", "不加图标"]];
  var CONTACT_ICONS = [["pin", "地点"], ["mail", "邮箱"], ["uni", "学校 / 学院"], ["lab", "实验室"],
    ["user", "个人主页"], ["cap", "Google Scholar"], ["link", "其他链接"]];
  var STOP = ["a", "an", "the", "of", "for", "and", "in", "on", "to", "with", "via", "from", "by", "toward", "towards"];
  var FIELD_NAMES = [
    [/^home\.profile\.name/, "姓名"], [/^home\.profile\.title/, "职位"], [/^home\.profile\.motto/, "签名"],
    [/^home\.greeting/, "欢迎语"], [/^home\.tagline/, "标语"], [/^home\.intro/, "个人简介"], [/^home\.headings/, "栏目标题"],
    [/^home\.lab/, "实验室介绍"], [/^home\.themes/, "研究方向"], [/^home\.applications/, "应用场景"],
    [/^home\.contacts/, "联系方式"], [/^home\.experience/, "经历"], [/^home\.grantsEarlier/, "此前的项目"],
    [/^home\.grants/, "科研项目"], [/^home\.service/, "学术服务"], [/^home\.footer/, "页脚"],
    [/^news/, "动态"], [/^pubs/, "论文"]
  ];

  var repo = null;
  var data = null;                 // { home, news, pubs } as being edited
  var base = null;                 // the same, serialized as it is on the site
  var headSha = "", prevHead = "";
  var uploads = {}, urls = {};     // repository path -> base64 waiting to be published / object URL for showing it
  var changes = [], undoStack = [];
  var markers = {};                // region name -> [start comment, end comment]
  var editing = null;              // the text being edited in place
  var stale = false;               // data changed by an in-place edit, page not redrawn yet
  var drawer = null;               // the open side panel
  var previewing = false, leaving = false, root = null, toastTimer = 0, renderTimer = 0;
  var esc = R.escape;

  function $(sel) {
    return root.querySelector(sel);
  }

  function $$(sel, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(sel));
  }

  /* ---------- small helpers ---------- */
  function snapshot() {
    return JSON.stringify(data);
  }

  function getPath(path) {
    return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, data);
  }

  function setPath(path, value) {
    var keys = path.split("."), last = keys.pop();
    keys.reduce(function (o, k) { return o[k]; }, data)[last] = value;
  }

  function trimDeep(v) {
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return v.map(trimDeep);
    if (v && typeof v === "object") {
      var out = {};
      Object.keys(v).forEach(function (k) { out[k] = trimDeep(v[k]); });
      return out;
    }
    return v;
  }

  function clean(s) {
    return String(s || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  }

  function thisMonth() {
    var d = new Date();
    return d.getFullYear() + "." + ("0" + (d.getMonth() + 1)).slice(-2);
  }

  function normDate(s) {
    var m = /^\s*(\d{4})\s*[.\-\/年]\s*(\d{1,2})\s*月?\s*$/.exec(s || "");
    return m && +m[2] >= 1 && +m[2] <= 12 ? m[1] + "." + ("0" + +m[2]).slice(-2) : "";
  }

  function clip(s, n) {
    s = String(s || "");
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function shortTitle(title) {
    var head = String(title || "").split(/[:：]/)[0].trim();
    return clip(head.length <= 40 ? head : title, 40);
  }

  function debounce(fn, ms) {
    var t = 0;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function slug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }

  function makeId(title, venue, skip) {
    var head = String(title || "").split(/[:：]/)[0].trim();
    var words = /^[A-Za-z0-9-]{2,24}$/.test(head) ? [head] :
      String(title || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)
        .filter(function (w) { return w && STOP.indexOf(w) < 0; }).slice(0, 3);
    var year = /((?:19|20)\d\d)/.exec(venue || "");
    var id = (slug(words.join("-")) || "paper") + (year ? year[1].slice(2) : ""), n = 2, baseId = id;
    while (data.pubs.some(function (p, k) { return k !== skip && p.id === id; })) id = baseId + "-" + n++;
    return id;
  }

  function suggestTag(title, venue) {
    var head = String(title || "").split(/[:：]/)[0].trim();
    var name = head.length <= 24 ? head : head.split(/\s+/).slice(0, 3).join(" ");
    var m = /^(.*?)\s*((?:19|20)\d\d)$/.exec(String(venue || "").trim());
    if (!m || /chapter|book/i.test(m[1])) return name;
    var abbr = /preprint|arxiv/i.test(m[1]) ? "arXiv" : m[1].split(/\s+/).pop().split("/").pop();
    return name + " · " + abbr + "'" + m[2].slice(2);
  }

  function fieldName(path) {
    for (var i = 0; i < FIELD_NAMES.length; i++) if (FIELD_NAMES[i][0].test(path)) return FIELD_NAMES[i][1];
    return "内容";
  }

  function logChange(text) {
    if (changes.indexOf(text) < 0) changes.push(text);
  }

  /* files the page refers to */
  function referenced() {
    var used = {};
    used[(data.home.profile.photo || {}).src] = true;
    (data.home.experience || []).forEach(function (x) { used[x.logo] = true; });
    data.pubs.forEach(function (p) { used[p.image] = true; used[p.paper] = true; });
    return used;
  }

  function usedUploads() {
    var used = referenced();
    return Object.keys(uploads).filter(function (p) { return used[p]; });
  }

  /* a file name nothing on the page uses yet, so undo never publishes a replaced file */
  function freePath(dir, name, ext) {
    var used = referenced();
    Object.keys(uploads).forEach(function (p) { used[p] = true; });
    if (drawer) Object.keys(drawer.pending).forEach(function (p) { used[p] = true; });
    var path = dir + (name || "file") + ext, n = 2;
    while (used[path]) path = dir + (name || "file") + "-" + n++ + ext;
    return path;
  }

  function fileUrl(path) {
    return (drawer && drawer.pending[path] && drawer.pending[path].url) || urls[path] || new URL(path, SITE).href;
  }

  /* show files that are not on the site yet */
  function withFiles(html) {
    var map = {};
    Object.keys(urls).forEach(function (p) { map[p] = urls[p]; });
    if (drawer) Object.keys(drawer.pending).forEach(function (p) { map[p] = drawer.pending[p].url; });
    Object.keys(map).forEach(function (p) { html = html.split('"' + esc(p) + '"').join('"' + map[p] + '"'); });
    return html;
  }

  function isDirty() {
    return R.serialize(data.home) !== base.home || R.serialize(data.news) !== base.news ||
      R.serialize(data.pubs) !== base.pubs || usedUploads().length > 0;
  }

  /* ---------- the lists that can be edited ---------- */
  var PUB_TYPES = [["conference", "会议论文"], ["journal", "期刊论文"], ["preprint", "预印本"], ["chapter", "书籍章节"]];
  var KINDS = {
    news: {
      name: "动态", add: "添加动态", at: "start", move: true, remove: true,
      list: function () { return data.news; },
      blank: function () { return R.normalizeNews({ date: thisMonth(), icon: "🎉🎉" }); },
      fields: [
        { k: "date", label: "日期", placeholder: "2026.11", half: true },
        { k: "icon", t: "icons", label: "图标" },
        { k: "zh", t: "rich", label: "中文" },
        { k: "en", t: "rich", label: "English" }
      ],
      validate: function (n) {
        if (!normDate(n.date)) return ["日期请写成“年.月”，例如 2026.11。", "date"];
        if (!clean(n.zh) && !clean(n.en)) return ["中文和英文至少写一种。", "zh"];
      },
      finish: function (n) {
        n.date = normDate(n.date);
        return R.normalizeNews(n);
      },
      label: function (n) { return n.date; }
    },
    pubs: {
      name: "论文", add: "添加论文", at: "start", move: true, remove: true,
      list: function () { return data.pubs; },
      blank: function () { return R.normalizePub({}); },
      fields: function () {
        var shown = function (v) { return v.selected; };
        return [
          { t: "lookup" },
          { group: "基本信息" },
          { k: "title", label: "标题" },
          { k: "authors", t: "authors", label: "作者", hint: "用英文逗号分隔；共同一作在名字后加 *，通讯作者加 †。你的名字会自动加粗。" },
          { k: "venue", label: "发表于", placeholder: "EMNLP 2026", half: true },
          { k: "type", t: "select", label: "类型", options: PUB_TYPES, half: true },
          { k: "details", label: "出版信息", optional: "可选，显示在完整列表的作者后面", placeholder: "期刊名, 2026, 12(4): 705–718." },
          { k: "note", label: "标注", optional: "可选", placeholder: "CCF A、JCR Q1 …" },
          { group: "链接" },
          { k: "paper", label: "论文", pdf: true, placeholder: "https://arxiv.org/abs/…" },
          { k: "code", label: "代码", placeholder: "https://github.com/…", half: true },
          { k: "project", label: "项目主页", optional: "可选", placeholder: "https://…", half: true },
          { group: "研究方向标签" },
          { k: "theme", t: "select", label: "放在", half: true, options: [["", "不放"]].concat(data.home.themes.map(function (t) {
            return [t.id, t.seal + " · " + (t.title.zh || t.title.en)];
          })) },
          { k: "tag", label: "标签文字", half: true },
          { group: "代表论文" },
          { k: "selected", t: "switch", label: "显示在“代表论文”里，配框架图和简介" },
          { k: "image", t: "figure", label: "框架图", show: shown },
          { k: "imageAlt", label: "图片说明", optional: "英文一句话，给读屏软件和搜索引擎", placeholder: "Overview of …", show: shown },
          { k: "summaryZh", t: "rich", label: "中文简介", show: shown },
          { k: "summaryEn", t: "rich", label: "English summary", show: shown },
          { group: "高级", collapsed: true },
          { k: "id", label: "编号", optional: "页面内跳转用（#pub-编号），只能用小写字母、数字和 -，留空自动生成" }
        ];
      },
      validate: function (p, index) {
        if (!clean(p.title)) return ["请填写标题。", "title"];
        if (!clean(p.authors)) return ["请填写作者。", "authors"];
        if (!clean(p.venue)) return ["请填写“发表于”，例如 EMNLP 2026；还没录用就写 Preprint 2026。", "venue"];
        var bad = ["paper", "code", "project"].filter(function (k) { return clean(p[k]) && !/^(https?:\/\/|files\/)/i.test(clean(p[k])); })[0];
        if (bad) return ["链接要以 https:// 开头。", bad];
        var id = clean(p.id).toLowerCase();
        if (id && !/^[a-z0-9][a-z0-9-]*$/.test(id)) return ["编号只能用小写字母、数字和 -。", "id"];
        if (id && data.pubs.some(function (q, k) { return k !== index && q.id === id; })) return ["编号“" + id + "”已经被另一篇论文用了，请换一个。", "id"];
      },
      finish: function (p, index) {
        p = R.normalizePub(p);
        p.authors = p.authors.split(/\s*[,，]\s*/).filter(Boolean).join(", ");
        p.id = p.id.toLowerCase() || makeId(p.title, p.venue, index);
        if (p.theme && !p.tag) p.tag = suggestTag(p.title, p.venue);
        if (p.type === "preprint" && !p.details) {
          var ax = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/i.exec(p.paper);
          if (ax) p.details = "arXiv:" + ax[1] + ".";
        }
        return p;
      },
      label: function (p) { return shortTitle(p.title); }
    },
    intro: {
      name: "简介段落", add: "添加一段", at: "end", move: true, remove: true,
      list: function () { return data.home.intro; },
      blank: function () { return { en: "", zh: "" }; },
      fields: [{ k: "zh", t: "rich", label: "中文", rows: 6 }, { k: "en", t: "rich", label: "English", rows: 6 }],
      validate: function (x) { if (!clean(x.zh) && !clean(x.en)) return ["中文和英文至少写一种。", "zh"]; }
    },
    contacts: {
      name: "联系方式", add: "添加联系方式", at: "end", move: true, remove: true,
      list: function () { return data.home.contacts; },
      blank: function () { return { icon: "link", url: "", en: "", zh: "" }; },
      fields: [
        { k: "icon", t: "select", label: "图标", options: CONTACT_ICONS },
        { k: "zh", label: "显示文字（中文）" },
        { k: "en", label: "显示文字（English）" },
        { k: "url", label: "链接", placeholder: "https://… 或 mailto:…", hint: "地点这类不需要链接的留空即可。" }
      ],
      validate: function (c) {
        if (!clean(c.zh) && !clean(c.en)) return ["请填写显示文字。", "zh"];
        if (clean(c.url) && !/^(https?:\/\/|mailto:|[\w.-]+\/)/i.test(clean(c.url))) return ["链接要以 https:// 或 mailto: 开头。", "url"];
      },
      label: function (c) { return c.zh || c.en; }
    },
    themes: {
      name: "研究方向", move: false, remove: false,
      list: function () { return data.home.themes; },
      note: "卡片底部的论文标签，在对应论文的编辑面板里设置。",
      fields: [
        { k: "seal", label: "印章字", half: true, maxlength: 2 },
        { k: "title", bi: true, label: "标题" },
        { k: "text", bi: true, t: "rich", label: "介绍" }
      ],
      validate: function (t) { if (!clean(t.title.zh) && !clean(t.title.en)) return ["请填写标题。", "title.zh"]; },
      label: function (t) { return t.title.zh || t.title.en; }
    },
    experience: {
      name: "经历", add: "添加经历", at: "start", move: true, remove: true,
      list: function () { return data.home.experience; },
      blank: function () { return { logo: "", org: { en: "", zh: "" }, dates: { en: "", zh: "" }, role: { en: "", zh: "" } }; },
      fields: [
        { k: "logo", t: "image", label: "校徽 / Logo", dir: "images/logos/", width: LOGO_WIDTH, type: "image/png" },
        { k: "org", bi: true, label: "单位" },
        { k: "dates", bi: true, label: "时间", hint: "例如 2025.04 – 至今 / 2025.04 – Present" },
        { k: "role", bi: true, t: "rich", label: "职位与说明" }
      ],
      validate: function (x) { if (!clean(x.org.zh) && !clean(x.org.en)) return ["请填写单位。", "org.zh"]; },
      label: function (x) { return x.org.zh || x.org.en; }
    },
    grants: {
      name: "科研项目", add: "添加项目", at: "start", move: true, remove: true,
      list: function () { return data.home.grants; },
      blank: function () { return { role: { en: "Participant", zh: "参与" }, level: "muted", title: { en: "", zh: "" }, funder: { en: "", zh: "" }, period: "" }; },
      fields: [
        { k: "title", bi: true, label: "项目名称" },
        { k: "funder", bi: true, label: "项目来源" },
        { k: "period", label: "起止时间", placeholder: "2025.08 – 2028.08", half: true },
        { k: "level", t: "select", label: "标签颜色", half: true, options: [["solid", "深色（主持）"], ["", "浅色（负责）"], ["muted", "灰色（参与）"]] },
        { k: "role", bi: true, label: "我的角色" }
      ],
      validate: function (g) { if (!clean(g.title.zh) && !clean(g.title.en)) return ["请填写项目名称。", "title.zh"]; },
      label: function (g) { return clip(g.title.zh || g.title.en, 20); }
    },
    grantsEarlier: {
      name: "此前的项目", add: "添加此前的项目", at: "start", move: true, remove: true,
      list: function () { return data.home.grantsEarlier; },
      blank: function () { return { title: { en: "", zh: "" }, funder: { en: "", zh: "" }, period: "" }; },
      note: "加减项目后，记得顺手改一下折叠标题里的项目数量。",
      fields: [
        { k: "title", bi: true, label: "项目名称" },
        { k: "funder", bi: true, label: "项目来源" },
        { k: "period", label: "起止时间", placeholder: "2019.06 – 2022.05", half: true }
      ],
      validate: function (g) { if (!clean(g.title.zh) && !clean(g.title.en)) return ["请填写项目名称。", "title.zh"]; },
      label: function (g) { return clip(g.title.zh || g.title.en, 20); }
    },
    service: {
      name: "学术服务", add: "添加一条", at: "end", move: true, remove: true,
      list: function () { return data.home.service; },
      blank: function () { return { en: "", zh: "" }; },
      fields: [
        { k: "zh", t: "rich", label: "中文", hint: "例如 **会议审稿人：**ICLR、NeurIPS" },
        { k: "en", t: "rich", label: "English", hint: "例如 **Conference reviewer:** ICLR, NeurIPS" }
      ],
      validate: function (s) { if (!clean(s.zh) && !clean(s.en)) return ["中文和英文至少写一种。", "zh"]; }
    },
    footer: {
      name: "页脚链接", add: "添加链接", at: "end", move: true, remove: true,
      list: function () { return data.home.footer.links; },
      blank: function () { return { en: "", zh: "", url: "" }; },
      fields: [
        { k: "zh", label: "文字（中文）", half: true },
        { k: "en", label: "文字（English）", half: true },
        { k: "url", label: "链接", placeholder: "https://… 或 mailto:…" }
      ],
      validate: function (l) {
        if (!clean(l.zh) && !clean(l.en)) return ["请填写文字。", "zh"];
        if (!/^(https?:\/\/|mailto:|[\w.-]+\/)/i.test(clean(l.url))) return ["链接要以 https:// 或 mailto: 开头。", "url"];
      },
      label: function (l) { return l.zh || l.en; }
    }
  };

  function fieldsOf(kind) {
    var f = KINDS[kind].fields;
    return typeof f === "function" ? f() : f;
  }

  /* ---------- rendering into the page ---------- */
  function findMarkers() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT), node;
    while ((node = walker.nextNode())) {
      var m = /^\s*([\w-]+):(start|end)\s*$/.exec(node.nodeValue);
      if (m) (markers[m[1]] = markers[m[1]] || [])[m[2] === "start" ? 0 : 1] = node;
    }
    return R.REGIONS.every(function (name) { return markers[name] && markers[name][0] && markers[name][1]; });
  }

  function setRegion(name, html) {
    var pair = markers[name], range = document.createRange();
    range.setStartAfter(pair[0]);
    range.setEndBefore(pair[1]);
    range.deleteContents();
    range.insertNode(range.createContextualFragment(html));
  }

  function renderAll() {
    clearTimeout(renderTimer);
    stale = false;
    var parts = R.sections({ home: data.home, news: data.news, publications: data.pubs }, true);
    R.REGIONS.forEach(function (name) { setRegion(name, withFiles(parts[name])); });
    decorate();
    updateBar();
  }

  function renderSoon() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderAll, 120);
  }

  function toolButton(act, label, title, cls, disabled) {
    return '<button type="button" data-act="' + act + '" title="' + title + '" aria-label="' + title + '"' +
      (cls ? ' class="' + cls + '"' : "") + (disabled ? " disabled" : "") + ">" + label + "</button>";
  }

  /* buttons on each list entry, and the "+ add" buttons */
  function decorate() {
    $$("[data-yy-item]").forEach(function (el) {
      var parts = el.getAttribute("data-yy-item").split(":"), k = KINDS[parts[0]], i = +parts[1], n = k.list().length;
      var tools = document.createElement("span");
      tools.className = "yy-tools";
      tools.setAttribute("contenteditable", "false");
      tools.innerHTML = (k.move ? toolButton("up", "↑", "上移", "", i === 0) + toolButton("down", "↓", "下移", "", i === n - 1) : "") +
        toolButton("edit", "编辑", "编辑" + k.name, "yy-tools__edit") +
        (k.remove ? toolButton("delete", "删除", "删除", "yy-tools__delete") : "");
      el.appendChild(tools);
    });
    $$("[data-yy-add]").forEach(function (el) {
      var kind = el.getAttribute("data-yy-add");
      el.className = "yy-add-slot";
      el.innerHTML = '<button type="button" class="yy-add" data-add="' + kind + '">＋ ' + KINDS[kind].add + "</button>";
    });
    $$("[data-yy]").forEach(function (el) { el.tabIndex = 0; });  // Tab to a text, Enter to edit it
    $$(".sidebar img, main img").forEach(function (img) {  // just published, not on the site yet: show it from the repository
      img.addEventListener("error", function () {
        var src = img.getAttribute("src") || "";
        if (/^(blob:|data:|https?:)/.test(src)) return;
        img.src = "https://raw.githubusercontent.com/" + repo.owner + "/" + repo.name + "/" + headSha + "/" + repo.path(src);
      }, { once: true });
    });
  }

  function itemElement(kind, index) {
    return document.querySelector('[data-yy-item="' + kind + ":" + index + '"]');
  }

  /* bring an entry into view, switching to the full publication list when it is only there */
  function reveal(kind, index) {
    var el = itemElement(kind, index);
    if (!el) return;
    if (el.closest("[hidden]")) {
      var panel = el.closest(".publication-view");
      var tab = panel && document.querySelector('[data-pub-view="' + panel.getAttribute("data-view") + '"]');
      if (tab) tab.click();
    }
    var details = el.closest("details");
    if (details) details.open = true;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /* ---------- editing text where it is ---------- */
  function placeCaret(el, x, y) {
    var range = null;
    if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(x, y);
    else if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
      }
    }
    if (!range || !el.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function startEdit(el, x, y) {
    var path = el.getAttribute("data-yy");
    editing = {
      el: el, path: path, rich: el.hasAttribute("data-yy-rich"), before: snapshot(),
      start: getPath(path) == null ? "" : String(getPath(path)), html: el.innerHTML, keep: false
    };
    el.setAttribute("contenteditable", "true");
    el.setAttribute("spellcheck", "false");
    el.addEventListener("keydown", onEditKey);
    el.addEventListener("keyup", onEditKeyUp);
    el.addEventListener("paste", onPaste);
    el.addEventListener("drop", onDrop);
    el.addEventListener("blur", onEditBlur);
    el.focus({ preventScroll: true });
    placeCaret(el, x, y);
    showFormatBar();
  }

  /* <b>, <i>, <a>, <mark> written by the browser → the site's light markup */
  function toMarkdown(node) {
    var out = "";
    Array.prototype.forEach.call(node.childNodes, function (n) {
      if (n.nodeType === 3) {
        out += n.nodeValue;
        return;
      }
      if (n.nodeType !== 1 || n.classList.contains("yy-tools")) return;
      var tag = n.tagName, inner = toMarkdown(n);
      var wrap = function (mark) {
        var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
        return m[2] ? m[1] + mark + m[2] + mark + m[3] : inner;
      };
      if (tag === "B" || tag === "STRONG") out += wrap("**");
      else if (tag === "I" || tag === "EM") out += wrap("*");
      else if (tag === "MARK") out += wrap("==");
      else if (tag === "A" && clean(inner)) out += "[" + clean(inner) + "](" + (n.getAttribute("href") || "") + ")";
      else if (tag === "BR" || tag === "DIV" || tag === "P") out += " " + inner;
      else out += inner;
    });
    return out;
  }

  /* later: another text is about to be edited, so the page is redrawn when that one is done */
  function finishEdit(commit, later) {
    var ed = editing, changed = false;
    if (!ed) return false;
    editing = null;
    hideFormatBar();
    var el = ed.el;
    el.removeAttribute("contenteditable");
    el.removeEventListener("keydown", onEditKey);
    el.removeEventListener("keyup", onEditKeyUp);
    el.removeEventListener("paste", onPaste);
    el.removeEventListener("drop", onDrop);
    el.removeEventListener("blur", onEditBlur);
    if (commit) {
      var value = clean(ed.rich ? toMarkdown(el) : el.textContent);
      if (value !== clean(ed.start)) {
        undoStack.push(ed.before);
        setPath(ed.path, value);
        logChange("修改" + fieldName(ed.path));
        languageHint(ed.path);
        stale = changed = true;
      }
    }
    if (!changed) el.innerHTML = ed.html;
    if (stale && !later) renderAll();
    else updateBar();
    return changed;
  }

  function onEditKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      finishEdit(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finishEdit(false);
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      var key = e.key.toLowerCase();
      if (key === "k" && editing.rich) {
        e.preventDefault();
        openLinkBox();
      } else if ((key === "b" || key === "i" || key === "u") && !editing.rich) {
        e.preventDefault();
      } else if (key === "u") {
        e.preventDefault();
      }
    }
  }

  /* a space typed inside <summary> would otherwise fold the section */
  function onEditKeyUp(e) {
    if (e.key === " ") e.preventDefault();
  }

  function onPaste(e) {
    e.preventDefault();
    var t = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, clean(t));
  }

  function onDrop(e) {
    e.preventDefault();
  }

  function onEditBlur() {
    var el = this;
    setTimeout(function () {
      if (editing && editing.el === el && !editing.keep && document.activeElement !== el) finishEdit(true);
    }, 0);
  }

  function languageHint(path) {
    if (!/\.(en|zh)$/.test(path) || S.storageGet("yyAdmin.langHint")) return;
    S.storageSet("yyAdmin.langHint", "1", true);
    var zh = /\.zh$/.test(path);
    toast(zh ? "已修改中文版。点底部的 EN 可以修改英文版。" : "已修改英文版。点底部的“中文”可以修改中文版。");
  }

  function showFormatBar() {
    var bar = $("#fmt"), ed = editing;
    $$("[data-cmd]", bar).forEach(function (b) {
      var cmd = b.getAttribute("data-cmd");
      b.hidden = cmd !== "done" && (!ed.rich || (cmd === "mark" && !/^home\.tagline/.test(ed.path)));
    });
    bar.hidden = false;
    placeFormatBar();
  }

  function placeFormatBar() {
    if (!editing) return;
    var bar = $("#fmt"), r = editing.el.getBoundingClientRect(), h = bar.offsetHeight || 38, w = bar.offsetWidth || 200;
    var top = r.top - h - 10 < 8 ? r.bottom + 10 : r.top - h - 10;
    bar.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, top)) + "px";
    bar.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + "px";
  }

  function hideFormatBar() {
    $("#fmt").hidden = true;
    $("#linkpop").hidden = true;
  }

  function closestIn(node, tag, within) {
    for (var n = node; n && n !== within; n = n.parentNode) if (n.nodeType === 1 && n.tagName === tag) return n;
    return null;
  }

  function unwrap(el) {
    var parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }

  function toggleMark() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0), mark = closestIn(range.commonAncestorContainer, "MARK", editing.el);
    if (mark) return unwrap(mark);
    if (range.collapsed) return;
    var el = document.createElement("mark");
    el.className = "hl";
    el.appendChild(range.extractContents());
    range.insertNode(el);
  }

  var linkState = null;

  function openLinkBox() {
    var sel = window.getSelection();
    if (!editing || !sel.rangeCount) return;
    var range = sel.getRangeAt(0).cloneRange(), a = closestIn(range.commonAncestorContainer, "A", editing.el);
    linkState = { range: range, anchor: a };
    editing.keep = true;
    var box = $("#linkpop"), input = $("#link-input"), r = $("#fmt").getBoundingClientRect();
    input.value = a ? a.getAttribute("href") : "https://";
    $("#link-remove").hidden = !a;
    box.hidden = false;
    box.style.top = Math.min(window.innerHeight - 60, r.bottom + 6) + "px";
    box.style.left = Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, r.left)) + "px";
    input.focus();
    input.select();
  }

  function closeLinkBox(apply, remove) {
    var st = linkState;
    linkState = null;
    $("#linkpop").hidden = true;
    if (!editing || !st) return;
    editing.keep = false;
    editing.el.focus({ preventScroll: true });
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(st.range);
    if (!apply) return;
    var url = $("#link-input").value.trim();
    if (remove || !url || url === "https://") {
      if (st.anchor) unwrap(st.anchor);
    } else if (st.anchor) {
      st.anchor.setAttribute("href", url);
    } else if (st.range.collapsed) {
      document.execCommand("insertHTML", false, '<a href="' + esc(url) + '">' + esc(url) + "</a>");
    } else {
      document.execCommand("createLink", false, url);
    }
  }

  /* ---------- list entries ---------- */
  function itemAction(btn) {
    var host = btn.closest("[data-yy-item]"), parts = host.getAttribute("data-yy-item").split(":");
    var kind = parts[0], i = +parts[1], act = btn.getAttribute("data-act"), k = KINDS[kind], list = k.list();
    if (act === "edit") return openDrawer(kind, i);
    if (act === "delete") {
      var label = k.label ? k.label(list[i]) : R.plain(list[i].zh || list[i].en);
      return confirmBox("删除这条" + k.name + "？", "“" + clip(label, 60) + "”\n点“发布到网站”之后才会从网站上消失。", "删除", true).then(function (ok) {
        if (!ok) return;
        undoStack.push(snapshot());
        list.splice(i, 1);
        logChange("删除" + k.name + "：" + clip(label, 20));
        renderAll();
      });
    }
    var j = i + (act === "up" ? -1 : 1);
    if (j < 0 || j >= list.length) return;
    undoStack.push(snapshot());
    list.splice(j, 0, list.splice(i, 1)[0]);
    logChange("调整" + k.name + "顺序");
    renderAll();
    var moved = itemElement(kind, j);
    if (moved) {
      moved.classList.add("yy-active");
      moved.scrollIntoView({ block: "nearest" });
      var again = moved.querySelector('.yy-tools [data-act="' + act + '"]');
      if (again && !again.disabled) again.focus();
    }
  }

  /* ---------- the side panel ---------- */
  function fieldHtml(f) {
    var id = "f-" + (f.k || f.t).replace(/\W/g, "-");
    var label = function (forId) {
      var inner = esc(f.label || "") + (f.optional ? " <small>" + esc(f.optional) + "</small>" : "");
      return forId ? '<label class="field__label" for="' + forId + '">' + inner + "</label>" : '<span class="field__label">' + inner + "</span>";
    };
    var input = function (name, inputId, ph) {
      return '<input id="' + inputId + '" name="' + name + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") +
        (f.maxlength ? ' maxlength="' + f.maxlength + '"' : "") + ' autocomplete="off" spellcheck="false">';
    };
    var area = function (name, inputId) {
      return '<div class="rich"><span class="md-tools" data-target="' + inputId + '"><button type="button" data-md="bold">加粗</button>' +
        '<button type="button" data-md="link">链接</button></span><textarea id="' + inputId + '" name="' + name + '" rows="' + (f.rows || 3) + '"></textarea></div>';
    };
    var pair = function (make) {
      return '<div class="pair"><span class="pair__tag">中</span>' + make(f.k + ".zh", id + "-zh") + "</div>" +
        '<div class="pair"><span class="pair__tag">EN</span>' + make(f.k + ".en", id + "-en") + "</div>";
    };
    var wrap = function (inner) {
      return '<div class="field' + (f.half ? " field--half" : "") + '" data-field="' + (f.k || f.t) + '">' + inner +
        (f.hint ? '<p class="hint">' + esc(f.hint) + "</p>" : "") + "</div>";
    };
    switch (f.t) {
      case "lookup":
        return '<div class="lookup"><label class="field__label" for="lookup-input">自动填写</label><div class="lookup__row">' +
          '<input id="lookup-input" placeholder="粘贴 arXiv 链接、arXiv 编号或 DOI" autocomplete="off" spellcheck="false">' +
          '<button type="button" class="btn" id="lookup-btn">填写</button></div>' +
          '<p class="lookup__status" id="lookup-status" aria-live="polite">会自动填好标题、作者和论文链接。</p></div>';
      case "icons":
        return wrap(label() + '<div class="chips" role="radiogroup">' + NEWS_ICONS.map(function (ic) {
          return '<button type="button" class="chip' + (ic[0] ? "" : " chip--none") + '" role="radio" aria-checked="false" data-icon="' +
            ic[0] + '" title="' + ic[1] + '" aria-label="' + ic[1] + '">' + (ic[0] || "无") + "</button>";
        }).join("") + "</div>");
      case "select":
        return wrap(label(id) + '<select id="' + id + '" name="' + f.k + '">' + f.options.map(function (o) {
          return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + "</option>";
        }).join("") + "</select>");
      case "switch":
        return wrap('<label class="switch"><input type="checkbox" name="' + f.k + '"><span class="switch__track" aria-hidden="true"></span>' + esc(f.label) + "</label>");
      case "image":
      case "figure":
        return wrap(label() + '<div class="figure-pick"><img class="figure-pick__thumb" data-thumb="' + f.k + '" alt="" hidden>' +
          '<div class="figure-pick__side"><div class="figure-pick__buttons"><label class="btn btn--small btn--file">选择图片' +
          '<input type="file" data-image="' + f.k + '" accept="image/png,image/jpeg,image/webp"></label>' +
          '<button type="button" class="link-btn" data-image-remove="' + f.k + '" hidden>移除</button></div>' +
          '<p class="hint" data-image-info="' + f.k + '"></p></div></div>');
      case "authors":
        return wrap('<div class="field__top">' + label(id) + '<span class="md-tools" data-target="' + id + '"><button type="button" data-insert="*" title="共同第一作者">插入 *</button>' +
          '<button type="button" data-insert="†" title="通讯作者">插入 †</button></span></div>' + input(f.k, id, f.placeholder));
      case "rich":
        return wrap(f.bi ? label() + pair(area) : label(id) + area(f.k, id));
      default:
        if (f.bi) return wrap(label() + pair(function (name, inputId) { return input(name, inputId, ""); }));
        if (f.pdf) {
          return wrap(label(id) + '<div class="input-with-btn">' + input(f.k, id, f.placeholder) +
            '<label class="btn btn--file">上传 PDF<input type="file" data-pdf="' + f.k + '" accept="application/pdf"></label></div>' +
            '<p class="hint" data-pdf-info hidden></p>');
        }
        return wrap(label(id) + input(f.k, id, f.placeholder));
    }
  }

  function formHtml(kind) {
    var out = [], close = "";
    if (KINDS[kind].note) out.push('<p class="drawer__note">' + esc(KINDS[kind].note) + "</p>");
    fieldsOf(kind).forEach(function (f) {
      if (f.group) {
        out.push(close);
        out.push(f.collapsed ? '<details class="group group--advanced"><summary>' + esc(f.group) + "</summary>" :
          '<fieldset class="group"><legend>' + esc(f.group) + "</legend>");
        close = f.collapsed ? "</details>" : "</fieldset>";
        return;
      }
      out.push(fieldHtml(f));
    });
    out.push(close);
    return out.join("");
  }

  function formField(name) {
    return drawer.form.elements.namedItem(name);
  }

  function fillForm() {
    var item = drawer.item;
    drawer.fields.forEach(function (f) {
      if (!f.k || f.t === "lookup") return;
      if (f.bi) {
        ["zh", "en"].forEach(function (l) { formField(f.k + "." + l).value = (item[f.k] || {})[l] || ""; });
      } else if (f.t === "switch") {
        formField(f.k).checked = !!item[f.k];
      } else if (f.t === "icons") {
        setIcon(item[f.k] || "");
      } else if (f.t === "image" || f.t === "figure") {
        imageInfo(f);
      } else {
        formField(f.k).value = item[f.k] == null ? "" : item[f.k];
      }
    });
    applyShow();
    updateTagPlaceholder();
  }

  function readForm() {
    var item = drawer.item;
    drawer.fields.forEach(function (f) {
      if (!f.k || f.t === "lookup" || f.t === "icons" || f.t === "image" || f.t === "figure") return;
      if (f.bi) {
        item[f.k] = item[f.k] || {};
        ["zh", "en"].forEach(function (l) { item[f.k][l] = formField(f.k + "." + l).value; });
      } else if (f.t === "switch") {
        item[f.k] = formField(f.k).checked;
      } else {
        item[f.k] = formField(f.k).value;
      }
    });
  }

  function applyShow() {
    drawer.fields.forEach(function (f) {
      if (!f.show) return;
      var el = drawer.form.querySelector('[data-field="' + f.k + '"]');
      if (el) el.hidden = !f.show(drawer.item);
    });
  }

  function setIcon(icon) {
    drawer.item.icon = icon;
    $$(".chip", drawer.form).forEach(function (c) { c.setAttribute("aria-checked", c.getAttribute("data-icon") === icon ? "true" : "false"); });
  }

  function updateTagPlaceholder() {
    if (drawer.kind !== "pubs") return;
    var tag = formField("tag");
    tag.placeholder = clean(drawer.item.title) ? suggestTag(drawer.item.title, drawer.item.venue) : "ReMCTS · EMNLP'26";
  }

  function imageInfo(f, text, isError) {
    var path = f.t === "figure" ? drawer.item.image : drawer.item[f.k];
    var thumb = drawer.form.querySelector('[data-thumb="' + f.k + '"]'), info = drawer.form.querySelector('[data-image-info="' + f.k + '"]');
    thumb.hidden = !path;
    if (path) thumb.src = fileUrl(path);
    drawer.form.querySelector('[data-image-remove="' + f.k + '"]').hidden = !path;
    info.textContent = text || (path ? path.split("/").pop() :
      f.t === "figure" ? "PNG 或 JPG，会自动压缩到 1400 像素宽。没有图时显示会议名方块。" : "PNG 或 JPG，透明背景的 PNG 最好。");
    info.classList.toggle("is-error", !!isError);
  }

  function dropPending(path) {
    if (drawer && path && drawer.pending[path]) {
      URL.revokeObjectURL(drawer.pending[path].url);
      delete drawer.pending[path];
    }
  }

  function openDrawer(kind, index, preset) {
    finishEdit(true);
    if (drawer) closeDrawer(false);
    var k = KINDS[kind], list = k.list(), isNew = index == null, before = snapshot();
    if (isNew) {
      index = k.at === "end" ? list.length : 0;
      list.splice(index, 0, preset ? Object.assign(k.blank(), preset) : k.blank());
    }
    drawer = {
      kind: kind, index: index, isNew: isNew, before: before, original: JSON.stringify(list[index]),
      item: list[index], pending: {}, fields: fieldsOf(kind), form: $("#drawer-form"), dirty: !!preset
    };
    $("#drawer-title").textContent = (isNew ? "添加" : "编辑") + k.name;
    drawer.form.innerHTML = formHtml(kind);
    drawer.form.scrollTop = 0;
    fillForm();
    formError("");
    $("#drawer").hidden = false;
    $("#shield").hidden = false;
    $("#bar").classList.add("is-shifted");
    document.documentElement.classList.add("yy-drawer-open");
    renderAll();
    setTimeout(function () { reveal(kind, index); }, 60);
    var first = kind === "pubs" && isNew ? $("#lookup-input") : drawer.form.querySelector("input:not([type=file]), textarea, select");
    if (first) first.focus({ preventScroll: true });
  }

  function closeDrawer(save) {
    var d = drawer;
    if (!d) return true;
    var k = KINDS[d.kind], list = k.list();
    if (save) {
      readForm();
      var err = k.validate && k.validate(d.item, d.index);
      if (err) {
        formError(err[0], err[1]);
        return false;
      }
      var item = k.finish ? k.finish(trimDeep(d.item), d.index) : trimDeep(d.item);
      var kept = Object.keys(d.pending).filter(function (p) {
        return p === item.image || p === item.paper || p === item.logo;
      });
      Object.keys(d.pending).forEach(function (p) {
        if (kept.indexOf(p) >= 0) {
          uploads[p] = d.pending[p].base64;
          urls[p] = d.pending[p].url;
        } else {
          URL.revokeObjectURL(d.pending[p].url);
        }
      });
      list.splice(d.index, 1);
      var at = d.index;
      if (d.kind === "news") {  // keep the news newest first
        at = list.findIndex(function (n) { return n.date <= item.date; });
        if (at < 0) at = list.length;
      }
      list.splice(at, 0, item);
      if (d.isNew || kept.length || JSON.stringify(item) !== d.original) {
        undoStack.push(d.before);
        logChange((d.isNew ? "新增" : "修改") + k.name + (k.label ? "：" + clip(k.label(item), 20) : ""));
      }
      d.saved = item;
    } else {
      if (d.isNew) list.splice(d.index, 1);
      else list[d.index] = JSON.parse(d.original);
      Object.keys(d.pending).forEach(function (p) { URL.revokeObjectURL(d.pending[p].url); });
    }
    drawer = null;
    $("#drawer").hidden = true;
    $("#shield").hidden = true;
    $("#bar").classList.remove("is-shifted");
    document.documentElement.classList.remove("yy-drawer-open");
    renderAll();
    if (save && d.kind === "pubs" && d.isNew) {
      var p = d.saved;
      toast("论文已添加。要不要顺便写一条动态？", { action: "写动态", onAction: function () { openDrawer("news", null, newsFor(p)); } });
    }
    return true;
  }

  function cancelDrawer() {
    if (!drawer) return;
    readForm();
    var changed = drawer.dirty || Object.keys(drawer.pending).length > 0 ||
      JSON.stringify(trimDeep(drawer.item)) !== JSON.stringify(trimDeep(JSON.parse(drawer.original)));
    if (!changed) return closeDrawer(false);
    confirmBox("放弃这次编辑？", "刚才填写的内容还没有保存。", "放弃", true).then(function (ok) {
      if (ok) closeDrawer(false);
    });
  }

  function formError(text, fieldName) {
    var p = $("#drawer-error");
    p.textContent = text;
    p.hidden = !text;
    if (fieldName) {
      var el = formField(fieldName);
      if (el) {
        var details = el.closest("details");
        if (details) details.open = true;
        el.focus();
      }
    }
  }

  function newsFor(p) {
    var link = function (label) { return p.paper ? "[" + label + "](" + p.paper + ")" : label; };
    if (p.type === "preprint") return { date: thisMonth(), icon: "📄", zh: "新 Preprint " + link(p.title) + "。", en: "New preprint: " + link(p.title) + "." };
    return { date: thisMonth(), icon: "🎉🎉", zh: "一篇论文被 **" + p.venue + "** 接收。", en: "One paper accepted to **" + p.venue + "**." };
  }

  /* bold / link buttons for text boxes, and * † for author lists */
  function markdownTool(tools, b) {
    var input = drawer.form.querySelector("#" + tools.getAttribute("data-target")), en = /-en$/.test(input.id);
    var s = input.selectionStart, end = input.selectionEnd, sel = input.value.slice(s, end);
    input.focus();
    if (b.getAttribute("data-insert")) {
      input.setRangeText(b.getAttribute("data-insert"), s, end, "end");
    } else if (b.getAttribute("data-md") === "bold") {
      var t = sel || (en ? "bold text" : "加粗文字");
      input.setRangeText("**" + t + "**", s, end, "end");
      input.setSelectionRange(s + 2, s + 2 + t.length);
    } else {
      var label = sel || (en ? "link text" : "链接文字");
      input.setRangeText("[" + label + "](https://)", s, end, "end");
      input.setSelectionRange(s + label.length + 3, s + label.length + 11);
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /* ---------- paper metadata from arXiv (via DataCite) or a DOI (Crossref) ---------- */
  function getJson(url) {
    return fetch(url).then(function (res) {
      if (res.ok) return res.json();
      var e = new Error(res.status === 404 ? "没查到这篇论文。刚发布的论文可能要过一两天才查得到，可以先手动填写。" :
        "查询失败（" + res.status + "），可以先手动填写。");
      e.status = res.status;
      throw e;
    }, function () {
      throw new Error("连不上查询服务，请检查网络，或者手动填写。");
    });
  }

  function htmlText(s) {
    var doc = new DOMParser().parseFromString("<!DOCTYPE html><body>" + String(s == null ? "" : s), "text/html");
    return clean(doc.body.textContent);
  }

  function personName(c) {
    if (c.givenName || c.familyName) return htmlText([c.givenName, c.familyName].filter(Boolean).join(" "));
    return htmlText(String(c.name || "").replace(/^([^,]+),\s*(.+)$/, "$2 $1"));
  }

  function fromDatacite(doi, paperUrl) {
    return getJson("https://api.datacite.org/dois/" + doi).then(function (j) {
      var a = j.data.attributes;
      return { title: htmlText(a.titles && a.titles[0] && a.titles[0].title), authors: (a.creators || []).map(personName).filter(Boolean).join(", "), paper: paperUrl };
    });
  }

  function fromCrossref(doi) {
    return getJson("https://api.crossref.org/works/" + encodeURIComponent(doi)).then(function (j) {
      var w = j.message || {}, date = w.issued || w["published-print"] || w["published-online"] || {};
      var year = date["date-parts"] && date["date-parts"][0] && date["date-parts"][0][0] ? String(date["date-parts"][0][0]) : "";
      var where = htmlText((w["container-title"] || [])[0]), pages = w.page ? w.page.replace(/\s*-+\s*/, "–") : "";
      var volume = w.volume ? w.volume + (w.issue ? "(" + w.issue + ")" : "") : "";
      var details = [where, year].filter(Boolean).join(", ");
      if (volume) details += (details ? ", " : "") + volume + (pages ? ": " + pages : "");
      else if (pages) details += (details ? ": " : "") + pages;
      return {
        title: htmlText((w.title || [])[0]),
        authors: (w.author || []).map(function (a) { return htmlText(a.given ? a.given + " " + a.family : a.name || a.family); }).filter(Boolean).join(", "),
        paper: "https://doi.org/" + doi,
        details: details ? details + "." : "",
        type: { "journal-article": "journal", "proceedings-article": "conference", "book-chapter": "chapter", "posted-content": "preprint" }[w.type] || ""
      };
    }, function (err) {
      if (err.status === 404) return fromDatacite(encodeURIComponent(doi), "https://doi.org/" + doi);
      throw err;
    });
  }

  function lookup(textIn) {
    var s = String(textIn || "").trim(), doi = /\b(10\.\d{4,9}\/[^\s"<>]+)/.exec(s);
    var arxiv = /arxiv/i.test(s) || !doi ? /(\d{4}\.\d{4,5})(?:v\d+)?/.exec(s) : null;
    if (arxiv) return fromDatacite("10.48550/arXiv." + arxiv[1], "https://arxiv.org/abs/" + arxiv[1]);
    if (doi) return fromCrossref(doi[1].replace(/[.,;)\]]+$/, ""));
    return Promise.reject(new Error("没认出来。请粘贴 arXiv 链接或编号（如 2609.09909），或者 DOI（如 10.1109/…）。"));
  }

  function runLookup() {
    var btn = $("#lookup-btn"), status = $("#lookup-status"), q = $("#lookup-input").value;
    var say = function (t, kind) {
      status.textContent = t;
      status.className = "lookup__status" + (kind ? " is-" + kind : "");
    };
    if (!q.trim()) return say("请先粘贴 arXiv 链接、编号或 DOI。", "error");
    btn.disabled = true;
    say("正在查询…");
    lookup(q).then(function (meta) {
      if (!drawer) return;
      var item = drawer.item;
      item.title = meta.title;
      item.authors = meta.authors;
      item.paper = meta.paper;
      if (meta.type && drawer.isNew) item.type = meta.type;
      if (meta.details && !clean(item.details)) item.details = meta.details;
      drawer.dirty = true;
      fillForm();
      renderSoon();
      say("已填好标题、作者和论文链接。请补上 * † 标记，并填写“发表于”。", "ok");
      if (!clean(item.venue)) formField("venue").focus();
    }, function (err) {
      say(err.message, "error");
    }).then(function () {
      btn.disabled = false;
    });
  }

  function pickImage(input) {
    var key = input.getAttribute("data-image"), f = drawer.fields.filter(function (x) { return x.k === key; })[0];
    var file = input.files[0];
    input.value = "";
    if (!file) return;
    imageInfo(f, "正在处理图片…");
    var figure = f.t === "figure";
    S.shrinkImage(file, figure ? FIGURE_WIDTH : f.width, figure ? "image/jpeg" : f.type).then(function (img) {
      return S.toBase64(img.blob).then(function (b64) {
        if (!drawer) return;
        var item = drawer.item;
        dropPending(figure ? item.image : item[key]);
        var name = figure ? clean(item.id) || makeId(item.title, item.venue, drawer.index) : slug((item.org || {}).en) || "logo";
        var path = freePath(figure ? "images/papers/" : f.dir, name, figure ? ".jpg" : ".png");
        drawer.pending[path] = { base64: b64, url: URL.createObjectURL(img.blob) };
        drawer.dirty = true;
        if (figure) {
          item.image = path;
          item.imageWidth = img.width;
          item.imageHeight = img.height;
          if (!clean(item.imageAlt)) {
            item.imageAlt = "Overview of " + shortTitle(item.title || "the method");
            formField("imageAlt").value = item.imageAlt;
          }
        } else {
          item[key] = path;
        }
        imageInfo(f, img.width + " × " + img.height + " · " + S.formatSize(img.blob.size) + "，发布时一起上传。");
        readForm();
        renderAll();
      });
    }).catch(function (err) {
      imageInfo(f, err.message, true);
    });
  }

  function removeImage(key) {
    var f = drawer.fields.filter(function (x) { return x.k === key; })[0], item = drawer.item;
    if (f.t === "figure") {
      dropPending(item.image);
      item.image = "";
      item.imageWidth = null;
      item.imageHeight = null;
    } else {
      dropPending(item[key]);
      item[key] = "";
    }
    drawer.dirty = true;
    imageInfo(f);
    renderSoon();
  }

  function pickPdf(input) {
    var file = input.files[0], info = drawer.form.querySelector("[data-pdf-info]");
    input.value = "";
    if (!file) return;
    info.hidden = false;
    if (file.size > PDF_LIMIT) {
      info.textContent = "PDF 不能超过 25 MB。";
      return;
    }
    S.toBase64(file).then(function (b64) {
      if (!drawer) return;
      var item = drawer.item;
      dropPending(item.paper);
      var path = freePath("files/papers/", clean(item.id) || makeId(item.title, item.venue, drawer.index), ".pdf");
      drawer.pending[path] = { base64: b64, url: URL.createObjectURL(file) };
      item.paper = path;
      formField("paper").value = path;
      drawer.dirty = true;
      info.textContent = "已选好 " + file.name + "（" + S.formatSize(file.size) + "），发布时一起上传。";
      renderSoon();
    }, function (err) {
      info.textContent = err.message;
    });
  }

  /* ---------- the photo ---------- */
  function pickPhoto(input) {
    var file = input.files[0];
    input.value = "";
    if (!file) return;
    busy("正在处理照片…");
    S.shrinkImage(file, PHOTO_WIDTH, "image/jpeg").then(function (img) {
      return S.toBase64(img.blob).then(function (b64) {
        var path = freePath("images/", "yifan-yuan", ".jpg");
        uploads[path] = b64;
        urls[path] = URL.createObjectURL(img.blob);
        undoStack.push(snapshot());
        data.home.profile.photo = { src: path, width: img.width, height: img.height };
        logChange("更换照片");
        busy("");
        renderAll();
      });
    }).catch(function (err) {
      busy("");
      toast(err.message, { error: true });
    });
  }

  /* ---------- feedback ---------- */
  function toast(text, opts) {
    opts = opts || {};
    var el = $("#toast"), action = $("#toast-action");
    $("#toast-text").textContent = text;
    el.classList.toggle("toast--error", !!opts.error);
    action.hidden = !opts.action;
    action.textContent = opts.action || "";
    action.onclick = opts.action ? function () { el.hidden = true; opts.onAction(); } : null;
    el.hidden = true;
    void el.offsetWidth;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, opts.action || opts.error ? 10000 : 5000);
  }

  function busy(text) {
    $("#busy-text").textContent = text;
    $("#busy").hidden = !text;
  }

  function confirmBox(title, text, okLabel, danger) {
    var d = $("#confirm"), ok = $("#confirm-ok");
    $("#confirm-title").textContent = title;
    $("#confirm-text").textContent = text || "";
    ok.textContent = okLabel || "确定";
    ok.className = "btn " + (danger ? "btn--danger" : "btn--primary");
    d.returnValue = "";
    d.showModal();
    (danger ? $("#confirm-cancel") : ok).focus();
    return new Promise(function (resolve) {
      d.addEventListener("close", function () { resolve(d.returnValue === "ok"); }, { once: true });
    });
  }

  function updateBar() {
    var dirty = isDirty();
    if (!dirty) changes = [];
    $("#bar-dot").classList.toggle("is-dirty", dirty);
    $("#bar-status").textContent = dirty ? "有 " + Math.max(1, changes.length) + " 处修改还没发布" : "所有修改都已发布";
    $("#bar-undo").disabled = !undoStack.length;
    $("#bar-discard").disabled = !dirty;
    $("#bar-publish").disabled = !dirty;
    var en = document.documentElement.classList.contains("lang-en");
    $$("#bar-lang button", root).forEach(function (b) { b.classList.toggle("is-on", (b.getAttribute("data-lang") === "en") === en); });
  }

  /* ---------- undo, discard, publish ---------- */
  function restore(json) {
    var d = JSON.parse(json);
    data.home = d.home;
    data.news = d.news;
    data.pubs = d.pubs;
  }

  function undo() {
    finishEdit(true);
    if (drawer || !undoStack.length) return;
    restore(undoStack.pop());
    renderAll();
  }

  function discard() {
    confirmBox("放弃所有没发布的修改？", "网站保持现在的样子，刚才的修改会全部丢失。", "放弃修改", true).then(function (ok) {
      if (!ok) return;
      restore(JSON.stringify({ home: JSON.parse(base.home), news: JSON.parse(base.news), pubs: JSON.parse(base.pubs) }));
      Object.keys(uploads).forEach(function (p) {
        URL.revokeObjectURL(urls[p]);
        delete urls[p];
      });
      uploads = {};
      changes = [];
      undoStack = [];
      renderAll();
    });
  }

  function parseJson(text, name, list) {
    var v;
    try { v = JSON.parse(text); } catch (e) { throw new Error(name + " 不是有效的 JSON（" + e.message + "）。"); }
    if (list && !Array.isArray(v)) throw new Error(name + " 的内容应该是一个列表。");
    return v;
  }

  function readData(sha) {
    return Promise.all([repo.read("data/home.json", sha), repo.read("data/news.json", sha), repo.read("data/publications.json", sha)]).then(function (f) {
      return {
        home: parseJson(f[0], "data/home.json"),
        news: parseJson(f[1], "data/news.json", true).map(R.normalizeNews),
        pubs: parseJson(f[2], "data/publications.json", true).map(R.normalizePub)
      };
    });
  }

  function serialized(d) {
    return { home: R.serialize(d.home), news: R.serialize(d.news), pubs: R.serialize(d.pubs) };
  }

  function load() {
    return repo.head().then(function (sha) {
      return Promise.all([readData(sha), repo.read("index.html", sha)]).then(function (r) {
        try {
          R.build(r[1], { home: r[0].home, news: r[0].news, publications: r[0].pubs });
        } catch (e) {
          throw new Error("仓库里的 index.html 缺少自动生成标记，编辑器没法更新它。");
        }
        headSha = sha;
        data = r[0];
        base = serialized(data);
      });
    });
  }

  function commitMessage() {
    var msg = "网页编辑：" + (changes.length ? changes.join("；") : "更新内容");
    return msg.length > 140 ? msg.slice(0, 139) + "…" : msg;
  }

  function publish(isRetry) {
    finishEdit(true);
    if (drawer) return toast("请先保存或取消右边的编辑面板。");
    var d = new Date(), home = JSON.parse(JSON.stringify(data.home));
    home.footer = home.footer || { links: [] };
    home.footer.updated = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
    var texts = { home: R.serialize(home), news: R.serialize(data.news), pubs: R.serialize(data.pubs) };
    busy("正在读取网站的最新版本…");
    return repo.head().then(function (head) {
      if (head === prevHead) head = headSha;  // GitHub can briefly report the branch as it was before our last publish
      var check = head === headSha ? Promise.resolve() : readData(head).then(function (remote) {
        var r = serialized(remote);
        if (r.home !== base.home || r.news !== base.news || r.pubs !== base.pubs) {
          var e = new Error("网站内容在别处被改过（比如在另一台设备上发布过）。为了不覆盖那边的修改，这次没有发布。请记下你的修改，点“重新载入”后再改一次。");
          e.conflict = true;
          throw e;
        }
      });
      return check.then(function () {
        return repo.read("index.html", head);
      }).then(function (remoteIndex) {
        var html = R.build(remoteIndex, { home: home, news: data.news, publications: data.pubs });
        var files = [];
        if (texts.home !== base.home) files.push({ path: "data/home.json", text: texts.home });
        if (texts.news !== base.news) files.push({ path: "data/news.json", text: texts.news });
        if (texts.pubs !== base.pubs) files.push({ path: "data/publications.json", text: texts.pubs });
        if (html !== remoteIndex) files.push({ path: "index.html", text: html });
        usedUploads().forEach(function (p) { files.push({ path: p, base64: uploads[p] }); });
        if (!files.length) return { head: head };
        busy("正在上传 " + files.length + " 个文件…");
        return repo.commit(head, files, commitMessage(), busy).then(function (sha) { return { head: head, sha: sha }; });
      });
    }).then(function (res) {
      if (res.sha) {
        prevHead = res.head;
        headSha = res.sha;
      } else {
        headSha = res.head;
      }
      data.home = home;
      base = texts;
      uploads = {};
      changes = [];
      undoStack = [];
      busy("");
      renderAll();
      toast("已发布。网站一般在 1 分钟内更新。", {
        action: "查看网站",
        onAction: function () { window.open(CONFIG.siteUrl || SITE, "_blank", "noopener"); }
      });
    }).catch(function (err) {
      busy("");
      if (err.stale && !isRetry) return publish(true);
      toast(err.message, err.conflict ? { error: true, action: "重新载入", onAction: reload } : { error: true });
    });
  }

  function reload() {
    leaving = true;
    location.reload();
  }

  function exit() {
    finishEdit(true);
    var go = function () {
      leaving = true;
      location.href = location.pathname + location.hash;
    };
    if (!isDirty()) return go();
    confirmBox("退出编辑？", "还有修改没发布，退出后会丢失。", "退出", true).then(function (ok) { if (ok) go(); });
  }

  function togglePreview() {
    finishEdit(true);
    previewing = !previewing;
    document.documentElement.classList.toggle("yy-preview", previewing);
    $("#bar-preview").textContent = previewing ? "继续编辑" : "预览";
  }

  /* ---------- page events ---------- */
  function pageTarget(e) {
    var t = e.target;
    return previewing || !(t instanceof Element) || t.closest("#yy-editor") ? null : t;
  }

  /* editing starts on mousedown, so a redraw of the previous text can never swallow the click */
  function onPageDown(e) {
    var t = pageTarget(e);
    if (!t || e.button !== 0) return;
    if (t.closest(".yy-tools, [data-add], [data-yy-photo]")) {
      if (editing) e.preventDefault();  // keep the text focused until the click finishes it
      return;
    }
    var field = t.closest("[data-yy]");
    if (!field || (editing && editing.el === field)) return;  // inside the text being edited: move the caret
    e.preventDefault();
    if (editing) finishEdit(true, true);
    startEdit(field, e.clientX, e.clientY);
  }

  function onPageClick(e) {
    var t = pageTarget(e);
    if (!t) return;
    var tool = t.closest(".yy-tools button"), add = t.closest("[data-add]"), photo = t.closest("[data-yy-photo]");
    var field = t.closest("[data-yy]");
    if (tool || add || photo || field) {
      e.preventDefault();  // no link navigation, no <summary> toggling
      e.stopPropagation();
    }
    if (tool || add || photo) {
      finishEdit(true);
      if (tool) return itemAction(tool);
      if (add) return openDrawer(add.getAttribute("data-add"));
      return $("#photo-input").click();
    }
    if (field) return;
    var a = t.closest("a[href]");
    if (a && !/^#/.test(a.getAttribute("href")) && !t.closest(".masthead")) e.preventDefault();  // stay on the page while editing
    $$(".yy-active").forEach(function (el) { el.classList.remove("yy-active"); });
    var item = t.closest("[data-yy-item]");
    if (item) item.classList.add("yy-active");  // touch screens: show the entry's buttons
  }

  function onPageKey(e) {
    var t = e.composedPath()[0];
    if (e.key === "Enter" && !editing && !drawer && !previewing && t instanceof Element && t.hasAttribute("data-yy")) {
      e.preventDefault();
      var r = t.getBoundingClientRect();
      return startEdit(t, r.right - 1, r.bottom - 1);
    }
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey || editing || drawer) return;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    e.preventDefault();
    undo();
  }

  function photoTip(e) {
    var img = e.target instanceof Element && e.target.closest("[data-yy-photo]"), tip = $("#photo-tip");
    if (!img || previewing || drawer) return (tip.hidden = true);
    var r = img.getBoundingClientRect();
    tip.style.left = r.left + r.width / 2 + "px";
    tip.style.top = r.bottom - 14 + "px";
    tip.hidden = false;
  }

  /* ---------- the editor's own interface ---------- */
  var CHROME =
    '<div class="bar" id="bar" hidden>' +
    '<span class="bar__mode"><span class="bar__dot" id="bar-dot"></span>编辑模式</span>' +
    '<div class="seg" id="bar-lang" role="group" aria-label="语言"><button type="button" data-lang="zh">中文</button><button type="button" data-lang="en">EN</button></div>' +
    '<span class="bar__status" id="bar-status"></span><span class="bar__sep"></span>' +
    '<button type="button" class="btn btn--quiet" id="bar-undo" title="撤销（Ctrl+Z）">撤销</button>' +
    '<button type="button" class="btn btn--quiet" id="bar-preview">预览</button>' +
    '<button type="button" class="btn btn--quiet" id="bar-discard">放弃修改</button>' +
    '<button type="button" class="btn btn--primary" id="bar-publish">发布到网站</button>' +
    '<button type="button" class="btn btn--quiet" id="bar-exit">退出</button></div>' +
    '<div class="shield" id="shield" hidden></div>' +
    '<aside class="drawer" id="drawer" hidden aria-labelledby="drawer-title">' +
    '<header class="drawer__head"><h2 id="drawer-title"></h2><button type="button" class="icon-btn" id="drawer-x" aria-label="关闭">✕</button></header>' +
    '<form class="drawer__body" id="drawer-form" novalidate></form>' +
    '<footer class="drawer__foot"><p class="form-error" id="drawer-error" role="alert" hidden></p>' +
    '<button type="button" class="btn" id="drawer-cancel">取消</button><button type="submit" class="btn btn--primary" form="drawer-form">保存</button></footer></aside>' +
    '<div class="fmt" id="fmt" hidden>' +
    '<button type="button" data-cmd="bold" title="加粗（Ctrl+B）"><b>B</b></button>' +
    '<button type="button" data-cmd="italic" title="斜体（Ctrl+I）"><i>I</i></button>' +
    '<button type="button" data-cmd="link" title="链接（Ctrl+K）">链接</button>' +
    '<button type="button" data-cmd="mark" title="高亮">高亮</button>' +
    '<span class="fmt__hint">Enter 完成 · Esc 取消</span>' +
    '<button type="button" class="fmt__done" data-cmd="done">完成</button></div>' +
    '<div class="linkpop" id="linkpop" hidden><input id="link-input" placeholder="https://" autocomplete="off" spellcheck="false">' +
    '<button type="button" class="btn btn--small btn--primary" id="link-ok">确定</button>' +
    '<button type="button" class="btn btn--small" id="link-remove">去掉链接</button></div>' +
    '<div class="photo-tip" id="photo-tip" hidden>点击更换照片</div>' +
    '<input type="file" id="photo-input" accept="image/png,image/jpeg,image/webp" hidden>' +
    '<dialog class="confirm" id="confirm" aria-labelledby="confirm-title"><form method="dialog"><h2 id="confirm-title"></h2><p id="confirm-text"></p>' +
    '<div class="confirm__actions"><button class="btn" value="cancel" id="confirm-cancel">取消</button>' +
    '<button class="btn btn--primary" value="ok" id="confirm-ok">确定</button></div></form></dialog>' +
    '<div class="toast" id="toast" role="status" aria-live="polite" hidden><span id="toast-text"></span>' +
    '<button type="button" class="toast__action" id="toast-action" hidden></button></div>' +
    '<div class="busy" id="busy" hidden><div class="busy__card"><span class="spinner" aria-hidden="true"></span><span id="busy-text"></span></div></div>';

  function buildChrome() {
    var pageCss = document.createElement("link");
    pageCss.rel = "stylesheet";
    pageCss.href = ADMIN + "editor-page.css";
    document.head.appendChild(pageCss);
    var host = document.createElement("div");
    host.id = "yy-editor";
    host.style.cssText = "position:relative;z-index:2147483000;visibility:hidden";
    document.body.appendChild(host);
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<link rel="stylesheet" href="' + ADMIN + 'editor.css">' + CHROME;
    var css = root.querySelector("link");
    css.onload = css.onerror = function () { host.style.visibility = ""; };

    $("#bar-undo").addEventListener("click", undo);
    $("#bar-preview").addEventListener("click", togglePreview);
    $("#bar-discard").addEventListener("click", discard);
    $("#bar-publish").addEventListener("click", function () { publish(false); });
    $("#bar-exit").addEventListener("click", exit);
    $("#bar-lang").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      finishEdit(true);
      var target = document.querySelector('.masthead [data-set-lang="' + b.getAttribute("data-lang") + '"]');
      if (target) target.click();
      updateBar();
    });
    $("#drawer-x").addEventListener("click", cancelDrawer);
    $("#drawer-cancel").addEventListener("click", cancelDrawer);
    $("#shield").addEventListener("click", function () { toast("请先保存或取消右边的编辑面板。"); });
    $("#photo-input").addEventListener("change", function () { pickPhoto(this); });

    var form = $("#drawer-form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      closeDrawer(true);
    });
    form.addEventListener("input", function (e) {
      if (!drawer) return;
      drawer.dirty = true;
      readForm();
      applyShow();
      updateTagPlaceholder();
      if (e.target.name === "theme" && drawer.item.theme && !clean(drawer.item.tag) && clean(drawer.item.title)) {
        drawer.item.tag = suggestTag(drawer.item.title, drawer.item.venue);
        formField("tag").value = drawer.item.tag;
      }
      renderSoon();
    });
    form.addEventListener("change", function (e) {
      if (!drawer) return;
      if (e.target.hasAttribute("data-image")) pickImage(e.target);
      else if (e.target.hasAttribute("data-pdf")) pickPdf(e.target);
    });
    form.addEventListener("click", function (e) {
      if (!drawer) return;
      var chip = e.target.closest(".chip"), tools = e.target.closest(".md-tools"), remove = e.target.closest("[data-image-remove]");
      if (chip) {
        drawer.dirty = true;
        setIcon(chip.getAttribute("data-icon"));
        renderSoon();
      } else if (tools && e.target.closest("button")) {
        markdownTool(tools, e.target.closest("button"));
      } else if (remove) {
        removeImage(remove.getAttribute("data-image-remove"));
      } else if (e.target.id === "lookup-btn") {
        runLookup();
      }
    });
    form.addEventListener("keydown", function (e) {
      if (e.target.id === "lookup-input" && e.key === "Enter") {
        e.preventDefault();
        runLookup();
      }
    });
    $("#drawer").addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelDrawer();
      }
    });

    var fmt = $("#fmt");
    fmt.addEventListener("mousedown", function (e) { e.preventDefault(); });  // keep the text selected
    fmt.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cmd]");
      if (!b || !editing) return;
      var cmd = b.getAttribute("data-cmd");
      if (cmd === "done") return finishEdit(true);
      if (cmd === "link") return openLinkBox();
      if (cmd === "mark") return toggleMark();
      document.execCommand(cmd);
    });
    $("#link-ok").addEventListener("click", function () { closeLinkBox(true); });
    $("#link-remove").addEventListener("click", function () { closeLinkBox(true, true); });
    $("#link-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        closeLinkBox(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeLinkBox(false);
      }
    });
  }

  function activate() {
    var html = document.documentElement;
    html.classList.remove("js-reveal");
    html.classList.add("yy-editing");
    $$("details.grant-more").forEach(function (d) { d.open = true; });
    renderAll();
    $("#bar").hidden = false;
    document.addEventListener("mousedown", onPageDown, true);
    document.addEventListener("click", onPageClick, true);
    document.addEventListener("keydown", onPageKey);
    document.addEventListener("mouseover", photoTip);
    window.addEventListener("scroll", placeFormatBar, { passive: true });
    window.addEventListener("resize", placeFormatBar);
    new MutationObserver(updateBar).observe(html, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("beforeunload", function (e) {
      if (leaving || !isDirty()) return;
      e.preventDefault();
      e.returnValue = "";
    });
    if (!/[?&]edit\b/.test(location.search)) history.replaceState(null, "", location.pathname + "?edit" + location.hash);
    if (!S.storageGet(S.KEYS.hint)) {
      S.storageSet(S.KEYS.hint, "1");
      toast("点任意文字就能直接修改；鼠标移到条目上可以编辑、排序或删除；栏目标题右边的 ＋ 用来添加。");
    }
  }

  function fail(err) {
    busy("");
    if (err.status === 401 || err.status === 404) S.storageRemove(S.KEYS.token);
    var expired = err.status === 401 || err.status === 404;
    toast(err.message, {
      error: true,
      action: expired ? "去登录" : "重试",
      onAction: function () {
        if (expired) location.href = ADMIN + "?next=edit";
        else location.reload();
      }
    });
  }

  function start() {
    buildChrome();
    var token = S.storageGet(S.KEYS.token), repoText = S.storageGet(S.KEYS.repo) || CONFIG.repo || "";
    if (!token) {
      location.href = ADMIN + "?next=edit";
      return;
    }
    busy("正在载入网站内容…");
    S.connect(repoText, token, CONFIG).then(function (r) {
      repo = r;
      return load();
    }).then(function () {
      if (!findMarkers()) throw new Error("这个页面还是旧版本（缺少可编辑标记）。刚发布过的话，请过一两分钟刷新再试。");
      busy("");
      activate();
    }).catch(fail);
  }

  start();
})();
