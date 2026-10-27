/* Sign-in page: checks a fine-grained GitHub token against the site's repository, remembers it
   on this device, and sends the owner to the homepage in edit mode (admin/editor.js). */
(function () {
  "use strict";

  var S = window.SiteAdmin, CONFIG = window.ADMIN_CONFIG || {};
  var EDIT = new URL("../?edit", location.href).href;

  function $(sel) {
    return document.querySelector(sel);
  }

  function show(state, message) {
    $("#checking").hidden = state !== "checking";
    $("#signed-in").hidden = state !== "in";
    $("#login-form").hidden = state !== "out";
    var err = $("#login-error");
    err.textContent = message || "";
    err.hidden = !message;
    if (state === "out") {
      updateTokenLink();
      ($("#login-repo").value ? $("#login-token") : $("#login-repo")).focus();
    }
  }

  function updateTokenLink() {
    var r = S.parseRepo($("#login-repo").value);
    $("#token-link").href = "https://github.com/settings/personal-access-tokens/new?" + [
      "name=" + encodeURIComponent("yifanyuan.com admin " + new Date().toISOString().slice(0, 10)),
      "description=" + encodeURIComponent("Lets the website's editor update its content"),
      r ? "target_name=" + encodeURIComponent(r.owner) : "",
      "expires_in=366",
      "contents=write"
    ].filter(Boolean).join("&");
  }

  $("#login-repo").addEventListener("input", updateTokenLink);

  $("#login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("#login-submit"), repoText = $("#login-repo").value, token = $("#login-token").value.trim();
    var remember = $("#login-remember").checked;
    btn.disabled = true;
    btn.textContent = "正在连接…";
    $("#login-error").hidden = true;
    S.connect(repoText, token, CONFIG).then(function (repo) {
      S.storageRemove(S.KEYS.token);
      S.storageSet(S.KEYS.token, token, !remember);
      S.storageSet(S.KEYS.repo, repo.owner + "/" + repo.name);
      location.href = EDIT;
    }, function (err) {
      btn.disabled = false;
      btn.textContent = "登录";
      show("out", err.message);
    });
  });

  $("#logout").addEventListener("click", function () {
    S.storageRemove(S.KEYS.token);
    show("out");
  });

  (function boot() {
    var repoText = S.storageGet(S.KEYS.repo) || CONFIG.repo || "", token = S.storageGet(S.KEYS.token);
    $("#login-repo").value = repoText;
    if (!token || !S.parseRepo(repoText)) return show("out");
    show("checking");
    S.connect(repoText, token, CONFIG).then(function (repo) {
      $("#who").textContent = repo.owner + "/" + repo.name;
      if (/[?&]next=edit\b/.test(location.search)) return location.replace(EDIT);
      show("in");
    }, function (err) {
      if (err.status === 401 || err.status === 404) S.storageRemove(S.KEYS.token);
      show("out", err.message);
    });
  })();
})();
