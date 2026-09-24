/**
 * Classic script. Runs while the desktop document parses, before boot.ts.
 * Reads the last titles-live page from localStorage and draws it.
 * No imports and no awaits — a module crawl cannot sit in front of this.
 */
(function () {
  var READY = "Ready · titles and open notes";
  var ROOT_KEY = "nexus-desktop-vault-root";
  var PREFS_KEY = "nexus-prefs-v1";
  var PAGE_KEY = "nexus-desktop-saved-page";
  try {
    var root = localStorage.getItem(ROOT_KEY);
    if (!root) return;
    var prefsRaw = localStorage.getItem(PREFS_KEY);
    if (prefsRaw) {
      try {
        var prefs = JSON.parse(prefsRaw);
        if (prefs && prefs.state && prefs.state.openLastVault === false) return;
      } catch (ignorePrefs) {}
    }
    var raw = localStorage.getItem(PAGE_KEY);
    if (!raw) return;
    var page = JSON.parse(raw);
    if (!page || page.root !== root || !page.names || !page.names.length) return;
    var host = document.getElementById("nexus-boot-banner");
    if (!host) return;
    var names = [];
    var i;
    for (i = 0; i < page.names.length && names.length < 12; i++) {
      if (typeof page.names[i] === "string" && page.names[i]) names.push(page.names[i]);
    }
    if (!names.length) return;
    host.replaceChildren();
    var bar = document.createElement("div");
    bar.setAttribute("role", "status");
    bar.setAttribute("data-open-progress", "ready");
    bar.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:8px",
      "padding:6px 12px",
      "font:12px/1.3 ui-sans-serif,system-ui,sans-serif",
      "color:#30d158",
      "background:rgba(48,209,88,0.08)",
      "border-bottom:1px solid rgba(48,209,88,0.28)",
    ].join(";");
    var dot = document.createElement("span");
    dot.style.cssText = "width:6px;height:6px;border-radius:99px;background:#30d158;flex:none";
    var label = document.createElement("span");
    label.textContent = READY;
    bar.append(dot, label);
    host.append(bar);
    var list = document.createElement("div");
    list.style.cssText = [
      "padding:8px 12px",
      "font:13px/1.4 ui-sans-serif,system-ui,sans-serif",
      "color:#f2f2f7",
      "background:#050507",
    ].join(";");
    for (i = 0; i < names.length; i++) {
      var row = document.createElement("div");
      row.textContent = String(names[i]).replace(/\.md$/i, "");
      list.append(row);
    }
    host.append(list);
    host.hidden = false;
    var boot = (window.__NEXUS_BOOT__ = window.__NEXUS_BOOT__ || {});
    boot.paintedFromPage = true;
    boot.t0 = performance.now();
    boot.pagePaintMs = Math.round(boot.t0);
  } catch (ignorePage) {}
})();
