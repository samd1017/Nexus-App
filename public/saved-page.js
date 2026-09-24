/**
 * Classic script. Runs while the desktop document parses, before boot.ts.
 * Reads the last titles-live page and draws it in the band under the title.
 * No imports and no awaits — a module crawl cannot sit in front of this.
 */
(function () {
  var READY = "Ready · titles and open notes";
  var ROOT_KEY = "nexus-desktop-vault-root";
  var PREFS_KEY = "nexus-prefs-v1";
  var PAGE_KEY = "nexus-desktop-saved-page";
  var hit = 0;
  var reason = "throw";

  function clockLine(phase) {
    var now = Date.now();
    var clock = (window.__NEXUS_READY_CLOCK__ = window.__NEXUS_READY_CLOCK__ || {});
    if (phase === "document" && typeof clock.document !== "number") clock.document = now;
    if (phase === "early") {
      clock.early = now;
      clock.earlyHit = hit;
      clock.earlyReason = reason;
    }
    var token = String(clock.earlyReason || "-").replace(/[^a-z0-9-]/gi, "") || "-";
    var line = [
      "NEXUS_READY_CLOCK",
      "phase=" + phase,
      "t=" + now,
      "window=" + (clock.window || 0),
      "document=" + (clock.document || 0),
      "early=" + (clock.early || 0),
      "hit=" + (clock.earlyHit || 0),
      "reason=" + token,
      "shell=" + (clock.shell || 0),
    ].join(" ");
    try {
      console.log(line);
    } catch (ignoreLog) {}
    try {
      document.documentElement.setAttribute("data-ready-clock", line);
    } catch (ignoreAttr) {}
    try {
      var last = (window.__NEXUS_SOAK_LAST__ = window.__NEXUS_SOAK_LAST__ || {});
      last.readyClock = {
        window: clock.window || 0,
        document: clock.document || 0,
        early: clock.early || 0,
        earlyHit: clock.earlyHit || 0,
        earlyReason: token,
        shell: clock.shell || 0,
        line: line,
      };
    } catch (ignoreLast) {}
    try {
      var invoke =
        window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
      if (invoke) {
        var pending = invoke("ready_clock_log", { line: line });
        if (pending && pending.catch) pending.catch(function () {});
      }
    } catch (ignoreInvoke) {}
  }

  clockLine("document");
  try {
    var root = localStorage.getItem(ROOT_KEY);
    if (!root) {
      reason = "no-root";
      return;
    }
    var prefsRaw = localStorage.getItem(PREFS_KEY);
    if (prefsRaw) {
      try {
        var prefs = JSON.parse(prefsRaw);
        if (prefs && prefs.state && prefs.state.openLastVault === false) {
          reason = "open-last-off";
          return;
        }
      } catch (ignorePrefs) {}
    }
    var norm = function (value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    };
    var fail = "no-page";
    var pageFrom = function (raw) {
      if (!raw) return null;
      var page;
      try {
        page = JSON.parse(raw);
      } catch (ignoreRaw) {
        return null;
      }
      if (!page || !page.names || !page.names.length) {
        if (page && page.names) fail = "no-names";
        return null;
      }
      if (norm(page.root) !== norm(root)) {
        fail = "root-mismatch";
        return null;
      }
      return page;
    };
    var raw = null;
    try {
      raw = localStorage.getItem(PAGE_KEY);
    } catch (ignoreStore) {}
    var page = pageFrom(raw);
    if (!page) {
      var parts = String(document.cookie || "").split(";");
      var prefix = PAGE_KEY + "=";
      var c;
      for (c = 0; c < parts.length; c++) {
        var bit = parts[c].replace(/^\s+/, "");
        if (bit.indexOf(prefix) !== 0) continue;
        try {
          page = pageFrom(decodeURIComponent(bit.slice(prefix.length)));
        } catch (ignoreCookie) {
          page = null;
        }
        if (page) break;
      }
    }
    if (!page) {
      reason = fail;
      return;
    }
    var host = document.getElementById("nexus-boot-banner");
    if (!host) {
      reason = "no-host";
      return;
    }
    var names = [];
    var i;
    for (i = 0; i < page.names.length && names.length < 12; i++) {
      if (typeof page.names[i] === "string" && page.names[i]) names.push(page.names[i]);
    }
    if (!names.length) {
      reason = "no-names";
      return;
    }
    host.replaceChildren();
    var bar = document.createElement("div");
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");
    bar.setAttribute("aria-label", READY);
    bar.setAttribute("data-open-progress", "ready");
    // White on black at 32px. A faint green line is in the DOM but a screenshot
    // of the first frame does not read it. No extra dot — it OCRs as a letter.
    bar.style.cssText = [
      "display:flex",
      "align-items:center",
      "min-height:64px",
      "padding:16px 20px",
      "font:700 32px/1.15 ui-sans-serif,system-ui,sans-serif",
      "color:#ffffff",
      "background:#000000",
      "border-bottom:3px solid #30d158",
    ].join(";");
    var label = document.createElement("span");
    label.textContent = READY;
    label.style.cssText = "color:#ffffff;font-weight:700;font-size:32px;line-height:1.15";
    bar.append(label);
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
    // Same slot as the in-app Ready line: directly under the 44px title bar.
    // The strip above it is solid title color so the top of the window is not blank.
    host.style.position = "fixed";
    host.style.top = "0";
    host.style.left = "0";
    host.style.right = "0";
    host.style.zIndex = "200";
    // Drawn over the title bar; clicks go through to the gear and the list.
    host.style.pointerEvents = "none";
    host.style.paddingTop = "44px";
    host.style.background = "#08080a";
    host.hidden = false;
    host.removeAttribute("hidden");
    try {
      document.title = READY;
    } catch (ignoreTitle) {}
    var boot = (window.__NEXUS_BOOT__ = window.__NEXUS_BOOT__ || {});
    boot.paintedFromPage = true;
    boot.t0 = performance.now();
    boot.pagePaintMs = Math.round(boot.t0);
    hit = 1;
    reason = "painted";
  } catch (ignorePage) {
    if (!hit) reason = "throw";
  } finally {
    function injectBootModules() {
      var boots = document.querySelectorAll('meta[name="nexus-boot-src"]');
      var b;
      for (b = 0; b < boots.length; b++) {
        var src = boots[b].getAttribute("content");
        if (!src) continue;
        var mod = document.createElement("script");
        mod.type = "module";
        mod.src = src;
        document.body.appendChild(mod);
      }
    }
    if (!hit) {
      clockLine("early");
      injectBootModules();
      return;
    }
    var paintedHost = document.getElementById("nexus-boot-banner");
    if (paintedHost) void paintedHost.offsetHeight;
    // Show the window only after this line has been painted. A hidden
    // webview may not run frames; the timeout still reveals.
    var revealed = false;
    function reveal() {
      if (revealed) return;
      revealed = true;
      clockLine("early");
      injectBootModules();
    }
    var frames = 0;
    function frame() {
      frames += 1;
      if (frames >= 2) reveal();
      else requestAnimationFrame(frame);
    }
    try {
      requestAnimationFrame(frame);
    } catch (ignoreFrame) {
      reveal();
    }
    setTimeout(reveal, 48);
  }
})();
