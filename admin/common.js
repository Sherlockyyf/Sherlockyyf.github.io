/* Shared by the sign-in page (admin/) and the page editor (admin/editor.js):
   remembered sign-in, the GitHub REST API, and image/file helpers. */
(function () {
  "use strict";

  var API = "https://api.github.com";
  var RAW = "application/vnd.github.raw+json";
  var KEYS = { token: "yyAdmin.token", repo: "yyAdmin.repo", hint: "yyAdmin.hint" };

  /* ---------- storage (may be unavailable, e.g. in private windows) ---------- */
  function storageGet(key) {
    var v = "";
    try { v = localStorage.getItem(key) || ""; } catch (e) {}
    if (!v) try { v = sessionStorage.getItem(key) || ""; } catch (e) {}
    return v;
  }

  function storageSet(key, value, sessionOnly) {
    try { (sessionOnly ? sessionStorage : localStorage).setItem(key, value); } catch (e) {}
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
    try { sessionStorage.removeItem(key); } catch (e) {}
  }

  function parseRepo(text) {
    var m = /^\s*(?:https?:\/\/github\.com\/)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?\s*$/.exec(text || "");
    return m ? { owner: m[1], name: m[2] } : null;
  }

  /* ---------- GitHub ---------- */
  function apiError(status, message) {
    var stale = status === 422 && /fast.?forward/i.test(message);
    var text =
      status === 401 ? "令牌无效或已过期。请重新登录；过期的令牌可以照登录页的步骤重新生成。" :
      status === 403 && /rate limit/i.test(message) ? "请求太频繁，请过几分钟再试。" :
      status === 403 ? "这个令牌没有修改仓库的权限。生成令牌时要把 Contents 设为 Read and write，并勾选网站仓库。" :
      status === 404 ? "找不到仓库或文件。请确认仓库名写对了，并且生成令牌时勾选了这个仓库。" :
      stale ? "仓库刚好有别的更新，请再点一次发布。" :
      "GitHub 返回了错误（" + status + (message ? "：" + message : "") + "）。";
    var e = new Error(text);
    e.status = status;
    e.stale = stale;
    return e;
  }

  function Repo(token, owner, name) {
    this.token = token;
    this.owner = owner;
    this.name = name;
    this.branch = "main";
    this.root = "";
  }

  Repo.prototype.request = function (method, path, body, accept) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 90000) : 0;
    var headers = { Authorization: "Bearer " + this.token, Accept: accept || "application/vnd.github+json" };
    if (body) headers["Content-Type"] = "application/json";
    return fetch(API + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (res.ok) return accept === RAW ? res.text() : res.json();
      return res.json().catch(function () { return {}; }).then(function (j) { throw apiError(res.status, j.message || ""); });
    }).then(function (data) {
      clearTimeout(timer);
      return data;
    }, function (err) {
      clearTimeout(timer);
      if (err && err.status) throw err;
      if (err && err.name === "AbortError") throw new Error("连接 GitHub 超时，请检查网络后再试。");
      if (err instanceof TypeError) throw new Error("连不上 GitHub，请检查网络后再试。");
      throw err;
    });
  };

  Repo.prototype.api = function (path) {
    return "/repos/" + encodeURIComponent(this.owner) + "/" + encodeURIComponent(this.name) + (path || "");
  };

  Repo.prototype.refApi = function (kind) {
    return this.api("/git/" + kind + "/heads/" + this.branch.split("/").map(encodeURIComponent).join("/"));
  };

  Repo.prototype.path = function (file) {
    return this.root ? this.root + "/" + file : file;
  };

  Repo.prototype.head = function () {
    return this.request("GET", this.refApi("ref")).then(function (ref) { return ref.object.sha; });
  };

  Repo.prototype.read = function (file, ref) {
    var p = this.path(file).split("/").map(encodeURIComponent).join("/");
    return this.request("GET", this.api("/contents/" + p + "?ref=" + encodeURIComponent(ref)), null, RAW);
  };

  /* one commit for several files: blobs → tree → commit → move the branch */
  Repo.prototype.commit = function (parent, files, message, onStep) {
    var self = this;
    return this.request("GET", this.api("/git/commits/" + parent)).then(function (c) {
      return Promise.all(files.map(function (f) {
        var body = f.base64 != null ? { content: f.base64, encoding: "base64" } : { content: f.text, encoding: "utf-8" };
        return self.request("POST", self.api("/git/blobs"), body).then(function (blob) {
          return { path: self.path(f.path), mode: "100644", type: "blob", sha: blob.sha };
        });
      })).then(function (tree) {
        if (onStep) onStep("正在提交…");
        return self.request("POST", self.api("/git/trees"), { base_tree: c.tree.sha, tree: tree });
      });
    }).then(function (tree) {
      return self.request("POST", self.api("/git/commits"), { message: message, tree: tree.sha, parents: [parent] });
    }).then(function (c) {
      return self.request("PATCH", self.refApi("refs"), { sha: c.sha, force: false }).then(function () { return c.sha; });
    });
  };

  /* check the token and find the branch */
  function connect(repoText, token, config) {
    var r = parseRepo(repoText);
    if (!r) return Promise.reject(new Error("仓库请写成“用户名/仓库名”，例如 Sherlockyyf/yifanyuan.com。"));
    if (!token) return Promise.reject(new Error("请粘贴 GitHub 令牌。"));
    var repo = new Repo(token, r.owner, r.name);
    config = config || {};
    repo.root = String(config.root || "").replace(/^\/+|\/+$/g, "");
    return repo.request("GET", repo.api()).then(function (info) {
      repo.branch = config.branch || info.default_branch || "main";
      return repo;
    });
  }

  /* ---------- files ---------- */
  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(",")[1] || ""); };
      reader.onerror = function () { reject(new Error("读取文件失败，请再试一次。")); };
      reader.readAsDataURL(blob);
    });
  }

  function canvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  /* scale an image to at most maxWidth wide; JPEG on white, or PNG to keep transparency */
  function shrinkImage(file, maxWidth, type) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      var fail = function () { reject(new Error("这张图片读不出来，请换一张 PNG 或 JPG。")); };
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight, src = img;
        if (!w || !h) return fail();
        var target = Math.min(maxWidth, w);
        while (w / 2 >= target) {  // halve step by step: smoother than one big jump
          var half = canvas(Math.round(w / 2), Math.round(h / 2));
          half.getContext("2d").drawImage(src, 0, 0, half.width, half.height);
          src = half;
          w = half.width;
          h = half.height;
        }
        var out = canvas(target, Math.max(1, Math.round(h * target / w))), ctx = out.getContext("2d");
        if (type !== "image/png") {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, out.width, out.height);
        }
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(src, 0, 0, out.width, out.height);
        out.toBlob(function (blob) {
          if (blob) resolve({ blob: blob, width: out.width, height: out.height });
          else reject(new Error("图片处理失败，请换一张试试。"));
        }, type || "image/jpeg", 0.9);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        fail();
      };
      img.src = url;
    });
  }

  function formatSize(bytes) {
    return bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / 1048576).toFixed(1) + " MB";
  }

  window.SiteAdmin = {
    KEYS: KEYS,
    storageGet: storageGet,
    storageSet: storageSet,
    storageRemove: storageRemove,
    parseRepo: parseRepo,
    connect: connect,
    toBase64: toBase64,
    shrinkImage: shrinkImage,
    formatSize: formatSize
  };
})();
