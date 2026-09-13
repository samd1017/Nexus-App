/**
 * Hard UI soak: demo + 45k large-test.
 * Measures app-ready separately from fixed waits. Fails on the ~1s common-op bar
 * (cold open may exceed 1s if progress is visible and the UI stays responsive).
 *
 * Run: node scripts/stress-ui-multisize.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const OUT = "/opt/cursor/artifacts/stress/ui-multisize.json";
const SHOT_DIR = "/opt/cursor/artifacts/stress/shots";
const COMMON_OP_MS = 1000;
const SWITCH_P95_MS = 700;
const OPEN_OK_MS = 30000;
const OPEN_INTERACTIVE_MS = 1500;
const LONG_TASK_FAIL_MS = 1000;

mkdirSync(SHOT_DIR, { recursive: true });

function now() {
  return performance.now();
}

async function probe(page) {
  return page.evaluate(() => {
    const fn = window.__NEXUS_STRESS__;
    const last = window.__NEXUS_SOAK_LAST__;
    return {
      stress: typeof fn === "function" ? fn() : null,
      last: last || null,
    };
  });
}

async function clearVault(page) {
  await page.evaluate(() => {
    try {
      localStorage.removeItem("nexus-vault-v1");
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("nexus-")) localStorage.removeItem(k);
      }
      // clearVault wipes coach; keep it dismissed so it cannot cover the editor.
      localStorage.setItem("nexus-first-run-coach-v1", "done");
    } catch {}
  });
}

async function waitFor(page, fn, timeoutMs, intervalMs = 50) {
  const t0 = now();
  let last = null;
  while (now() - t0 < timeoutMs) {
    last = await fn();
    if (last) return { ok: true, value: last, waitedMs: Math.round(now() - t0) };
    await page.waitForTimeout(intervalMs);
  }
  return { ok: false, value: last, waitedMs: Math.round(now() - t0) };
}

async function appReadyOp(page, work, ready, timeoutMs = 8000) {
  const t0 = now();
  await work();
  const readyAt = await waitFor(page, ready, timeoutMs, 25);
  return {
    appReadyMs: Math.round(now() - t0),
    waitMs: readyAt.waitedMs,
    ready: readyAt.ok,
    value: readyAt.value,
  };
}

function p95(samples) {
  if (!samples.length) return 0;
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)];
}

async function switchSample(page, id) {
  return appReadyOp(
    page,
    () => page.evaluate((noteId) => window.__NEXUS_SOAK__?.setActiveNote?.(noteId), id),
    async () => {
      const p = await probe(page);
      if (p.stress?.activeNoteId !== id) return null;
      const shown = await page
        .locator(`[data-testid="nexus-editor"][data-active-note="${id}"] .ProseMirror`)
        .count();
      return shown ? id : null;
    },
    3000,
  );
}

function failIfSlow(result, key, ms, budget, blockers) {
  result.steps[`${key}BudgetMs`] = budget;
  if (ms > budget) {
    blockers.push(`${key} app-ready ${ms}ms > ${budget}ms`);
    result.ok = false;
  }
}

async function openPalette(page) {
  await page.keyboard.press("Control+k");
  const input = page.locator('[cmdk-input], input[placeholder*="Search"], [role="combobox"]').first();
  await input.waitFor({ state: "visible", timeout: 4000 });
  return input;
}

async function typeInEditor(page, text) {
  const editor = page
    .locator(
      "[data-testid='nexus-editor'] .ProseMirror, [data-testid='nexus-editor'] [contenteditable='true'], [data-testid='nexus-editor'] [aria-label='Markdown source']",
    )
    .first();
  try {
    await editor.waitFor({ state: "visible", timeout: 6000 });
  } catch {
    return { typed: false, reason: "no editor" };
  }
  await editor.click({ timeout: 4000 });
  await page.keyboard.type(text, { delay: 8 });
  const seen = await page.evaluate((needle) => {
    const root = document.querySelector("[data-testid='nexus-editor']");
    const el = root?.querySelector(".ProseMirror, [contenteditable='true']");
    const src = root?.querySelector("[aria-label='Markdown source'], textarea, .cm-content");
    const hay = `${el?.textContent || ""} ${src?.textContent || ""}`;
    return hay.includes(needle.trim());
  }, text);
  return { typed: seen, reason: seen ? null : "typed text not in editor" };
}

async function waitStress(page, timeoutMs = 15000) {
  const r = await waitFor(
    page,
    async () => {
      const ok = await page.evaluate(() => typeof window.__NEXUS_STRESS__ === "function");
      return ok ? true : null;
    },
    timeoutMs,
    50,
  );
  return r.ok;
}

async function runDemoStress(page, errors) {
  const result = {
    size: "demo (~10 notes)",
    steps: {},
    blockers: [],
    ok: true,
  };
  const t0 = now();

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await clearVault(page);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await waitStress(page);

  const openBtn = page.getByRole("button", { name: /Explore demo|explore the demo/i }).first();
  const open = await appReadyOp(
    page,
    () => openBtn.click({ timeout: 15000 }),
    async () => {
      const p = await probe(page);
      return p.stress && p.stress.notes >= 5 && !p.stress.connecting ? p : null;
    },
    20000,
  );
  result.steps.open = open;
  if (!open.ready) {
    result.ok = false;
    result.blockers.push("demo did not mount");
  }

  const tNote = now();
  // Do not click /Welcome/ — that matches the canvas "Welcome board" and unmounts TipTap.
  const welcomeRow = page
    .locator('[data-file-tree] [data-testid="tree-note-row"]')
    .filter({ hasText: /^Welcome$/ })
    .first();
  if (await welcomeRow.count()) {
    await welcomeRow.click({ timeout: 4000 }).catch(() => {});
  }
  await page
    .locator("[data-testid='nexus-editor'] .ProseMirror")
    .first()
    .waitFor({ state: "visible", timeout: 8000 })
    .catch(() => {});
  result.steps.openNoteMs = Math.round(now() - tNote);

  const typed = await typeInEditor(page, " Stress-test edit line.");
  result.steps.editorTyped = typed.typed;
  result.steps.editorError = typed.reason;
  if (!typed.typed) {
    result.ok = false;
    result.blockers.push("demo editorTyped=false");
  }

  const search = await appReadyOp(
    page,
    async () => {
      const input = await openPalette(page);
      await input.fill("welcome");
    },
    async () => {
      const hits = await page.getByRole("option").count();
      return hits >= 1 ? hits : null;
    },
    4000,
  );
  result.steps.search = search;
  await page.keyboard.press("Escape").catch(() => {});
  if (!search.ready) {
    result.ok = false;
    result.blockers.push("demo search returned 0 options");
  }
  failIfSlow(result, "search", search.appReadyMs, COMMON_OP_MS, result.blockers);

  const graph = await appReadyOp(
    page,
    () => page.keyboard.press("Control+g"),
    async () => {
      const n = await page.locator("[data-exit-graph], [data-graph-host]").count();
      return n >= 1 ? n : null;
    },
    4000,
  );
  result.steps.graph = graph;
  result.steps.graphEngineMs = await page
    .locator("[data-graph-engine='ready']")
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  failIfSlow(result, "graph", graph.appReadyMs, COMMON_OP_MS, result.blockers);
  await page.keyboard.press("Escape").catch(() => {});
  await waitFor(
    page,
    async () => {
      const p = await probe(page);
      return p.stress?.graphMode &&
        p.stress.graphMode !== "fullscreen" &&
        p.stress.rightTab !== "graph"
        ? p
        : null;
    },
    2000,
    25,
  );

  const before = await probe(page);
  const created = await appReadyOp(
    page,
    () => page.evaluate(() => window.__NEXUS_SOAK__?.createNote(null, "Soak Created")),
    async () => {
      const p = await probe(page);
      if (p.stress && before.stress && p.stress.notes > before.stress.notes) return p;
      return null;
    },
    4000,
  );
  result.steps.newNote = created;
  failIfSlow(result, "newNote", created.appReadyMs, COMMON_OP_MS, result.blockers);

  await page.screenshot({ path: `${SHOT_DIR}/demo-after-stress.png`, fullPage: false });
  result.probe = (await probe(page)).stress;
  result.totalMs = Math.round(now() - t0);
  result.pageErrors = errors.splice(0);
  if (result.pageErrors.some((e) => /Maximum update depth|QuotaExceeded/i.test(e))) {
    result.ok = false;
    result.blockers.push("demo page error");
  }
  return result;
}

async function runLargeStress(page, errors) {
  const result = {
    size: "large-test-vault (45k)",
    steps: {},
    blockers: [],
    ok: true,
  };
  const t0 = now();

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await clearVault(page);
  const largeUrl = new URL("?vault=45k", BASE).href;
  const progressPhases = [];
  const rafSamples = [];
  let interactiveMs = null;
  const openT0 = now();
  const open = await appReadyOp(
    page,
    () => page.goto(largeUrl, { waitUntil: "domcontentloaded", timeout: 60000 }),
    async () => {
      const p = await probe(page);
      const phase = p.stress?.openProgress?.phase;
      if (phase && !progressPhases.includes(phase)) progressPhases.push(phase);
      const banner = await page.locator("[data-open-progress]").count();
      if (banner) result.steps.openProgressVisible = true;
      if (
        interactiveMs == null &&
        p.stress?.notes === 45000 &&
        p.stress?.vaultId
      ) {
        interactiveMs = Math.round(now() - openT0);
        const raf = await page
          .evaluate(
            () =>
              new Promise((resolve) => {
                const t = performance.now();
                requestAnimationFrame(() => {
                  requestAnimationFrame(() =>
                    resolve(Math.round(performance.now() - t)),
                  );
                });
              }),
          )
          .catch(() => null);
        if (typeof raf === "number") rafSamples.push(raf);
      }
      return p.stress &&
        p.stress.notes === 45000 &&
        !p.stress.connecting &&
        p.last?.openMs
        ? p
        : null;
    },
    90000,
  );
  result.steps.openedVia = "query";
  const longTasks = await page
    .evaluate(() => window.__NEXUS_LONG_TASKS__ || [])
    .catch(() => []);
  const longTaskMax = longTasks.length
    ? Math.max(...longTasks.map((t) => t.duration || 0))
    : 0;
  result.steps.open = {
    ...open,
    storeOpenMs: open.value?.last?.openMs ?? null,
    storeInteractiveMs: open.value?.last?.interactiveMs ?? interactiveMs,
    storeIndexMs: open.value?.last?.indexMs ?? null,
    harnessInteractiveMs: interactiveMs,
    progressPhases,
    progressVisible: Boolean(result.steps.openProgressVisible),
    rafSamplesMs: rafSamples,
    longTaskCount: longTasks.length,
    longTaskMaxMs: longTaskMax,
    longTasks: longTasks.filter((t) => (t.duration || 0) >= 200).slice(0, 12),
  };
  if (!open.ready || open.value?.stress?.notes !== 45000) {
    result.ok = false;
    result.blockers.push(
      `45k exact count failed (notes=${open.value?.stress?.notes ?? "null"})`,
    );
  }
  if ((open.appReadyMs || 0) > OPEN_OK_MS) {
    result.ok = false;
    result.blockers.push(`cold open ${open.appReadyMs}ms > ${OPEN_OK_MS}ms`);
  } else if ((open.appReadyMs || 0) > COMMON_OP_MS) {
    result.steps.openWarn = `cold open ${open.appReadyMs}ms (progress OK if UI responsive)`;
  }
  if (!result.steps.open.progressVisible && !progressPhases.length) {
    result.ok = false;
    result.blockers.push("cold open never showed a progress banner");
  }
  if (longTaskMax > LONG_TASK_FAIL_MS) {
    result.ok = false;
    result.blockers.push(
      `cold open long-task ${longTaskMax}ms > ${LONG_TASK_FAIL_MS}ms (UI freeze)`,
    );
  }
  if (rafSamples.some((ms) => ms > LONG_TASK_FAIL_MS)) {
    result.ok = false;
    result.blockers.push(
      `cold open rAF ${Math.max(...rafSamples)}ms > ${LONG_TASK_FAIL_MS}ms (UI freeze)`,
    );
  }
  const interactive = open.value?.last?.interactiveMs ?? interactiveMs;
  if (interactive != null && interactive > OPEN_INTERACTIVE_MS) {
    result.steps.openInteractiveWarn = `interactive ${interactive}ms > ${OPEN_INTERACTIVE_MS}ms`;
  }

  await page.screenshot({ path: `${SHOT_DIR}/large-after-open.png`, fullPage: false });

  const tree = await appReadyOp(
    page,
    async () => {
      for (const name of ["00-Inbox", "01-Projects", "02-Areas"]) {
        const row = page
          .locator(`[data-file-tree] [data-node-kind="folder"]`, { hasText: name })
          .first();
        if (await row.count()) await row.click({ timeout: 2000 }).catch(() => {});
      }
      const noteRow = page.locator('[data-file-tree] [data-testid="tree-note-row"]').first();
      if (await noteRow.count()) {
        await noteRow.click({ timeout: 3000 }).catch(() => {});
      }
    },
    async () => {
      const p = await probe(page);
      return p.stress?.activeNoteId ? p.stress.activeNoteId : null;
    },
    6000,
  );
  result.steps.tree = tree;
  failIfSlow(result, "tree", tree.appReadyMs, COMMON_OP_MS, result.blockers);

  const tScroll = now();
  await page.evaluate(() => {
    const scrollers = [
      ...document.querySelectorAll(
        "[data-tree-scroll], [data-radix-scroll-area-viewport], .overflow-auto, .overflow-y-auto",
      ),
    ];
    for (const el of scrollers.slice(0, 4)) {
      el.scrollTop = el.scrollHeight;
      el.scrollTop = 0;
      el.scrollTop = Math.floor(el.scrollHeight / 2);
    }
  });
  result.steps.scrollMs = Math.round(now() - tScroll);

  const search = await appReadyOp(
    page,
    async () => {
      const input = await openPalette(page);
      await input.fill("project");
    },
    async () => {
      const hits = await page.getByRole("option").count();
      return hits >= 1 ? hits : null;
    },
    5000,
  );
  result.steps.search = search;
  await page.keyboard.press("Escape").catch(() => {});
  if (!search.ready) {
    result.ok = false;
    result.blockers.push("45k search returned 0 options");
  }
  failIfSlow(result, "search", search.appReadyMs, COMMON_OP_MS, result.blockers);

  const graph = await appReadyOp(
    page,
    () => page.keyboard.press("Control+g"),
    async () => {
      const n = await page.locator("[data-exit-graph], [data-graph-host]").count();
      return n >= 1 ? n : null;
    },
    4000,
  );
  result.steps.graph = graph;
  result.steps.graphProgress = await page.locator("[data-graph-progress]").count();
  if (!graph.ready) {
    result.ok = false;
    result.blockers.push("45k graph chrome did not become ready");
  }
  failIfSlow(result, "graph", graph.appReadyMs, COMMON_OP_MS, result.blockers);
  await page.keyboard.press("Escape").catch(() => {});
  await waitFor(
    page,
    async () => {
      const p = await probe(page);
      return p.stress?.graphMode &&
        p.stress.graphMode !== "fullscreen" &&
        p.stress.rightTab !== "graph"
        ? p
        : null;
    },
    2000,
    25,
  );
  await page.screenshot({ path: `${SHOT_DIR}/large-after-graph.png`, fullPage: false });

  const beforeCreate = await probe(page);
  const created = await appReadyOp(
    page,
    async () => {
      const id = await page.evaluate(() => window.__NEXUS_SOAK__?.createNote(null, "Soak Created"));
      return id;
    },
    async () => {
      const p = await probe(page);
      return p.stress?.notes === 45001 ? p : null;
    },
    4000,
  );
  result.steps.newNote = created;
  if (!created.ready) {
    result.ok = false;
    result.blockers.push(`create did not reach 45001 (notes=${created.value?.stress?.notes})`);
  }
  failIfSlow(result, "newNote", created.appReadyMs, COMMON_OP_MS, result.blockers);

  const typed = await typeInEditor(page, " 45k editor type");
  result.steps.editorTyped = typed.typed;
  result.steps.editorError = typed.reason;
  if (!typed.typed) {
    result.ok = false;
    result.blockers.push("45k editorTyped=false");
  }

  const ids = await page.evaluate(() => window.__NEXUS_SOAK__?.noteIds?.(8) || []);
  let switchCount = 0;
  const switchSamples = [];
  for (const id of ids) {
    const one = await switchSample(page, id);
    switchSamples.push(one.appReadyMs);
    if (one.ready) switchCount += 1;
  }
  const switchMax = switchSamples.length ? Math.max(...switchSamples) : 0;
  const switchP95 = p95(switchSamples);
  result.steps.switchNotes = {
    switchNotesCount: switchCount,
    samplesMs: switchSamples,
    appReadyMs: switchMax,
    p95Ms: switchP95,
    graphPanel: false,
    ready: switchCount >= 2,
  };
  if (switchCount < 2) {
    result.ok = false;
    result.blockers.push(`switchNotesCount=${switchCount} (need >0 real switches)`);
  }
  failIfSlow(result, "switchNotes", switchMax, COMMON_OP_MS, result.blockers);

  await page.evaluate(() => window.__NEXUS_SOAK__?.setRightTab?.("graph"));
  const graphPanel = await waitFor(
    page,
    async () => {
      const n = await page.locator("[data-graph-host][data-graph-engine='ready']").count();
      return n >= 1 ? n : null;
    },
    8000,
    50,
  );
  result.steps.graphPanelReady = graphPanel;
  const graphIds = await page.evaluate(() => window.__NEXUS_SOAK__?.noteIds?.(8) || []);
  let graphSwitchCount = 0;
  const graphSwitchSamples = [];
  for (const id of graphIds) {
    const one = await switchSample(page, id);
    graphSwitchSamples.push(one.appReadyMs);
    if (one.ready) graphSwitchCount += 1;
  }
  const graphSwitchMax = graphSwitchSamples.length ? Math.max(...graphSwitchSamples) : 0;
  const graphSwitchP95 = p95(graphSwitchSamples);
  result.steps.switchGraphPanel = {
    switchNotesCount: graphSwitchCount,
    samplesMs: graphSwitchSamples,
    appReadyMs: graphSwitchMax,
    p95Ms: graphSwitchP95,
    graphPanel: true,
    ready: graphSwitchCount >= 2,
  };
  result.steps.switchGraphPanelBudgetMs = SWITCH_P95_MS;
  if (graphSwitchCount < 2) {
    result.ok = false;
    result.blockers.push("switchGraphPanel count < 2");
  }
  if (graphSwitchP95 > SWITCH_P95_MS) {
    result.ok = false;
    result.blockers.push(
      `switchGraphPanel p95 ${graphSwitchP95}ms > ${SWITCH_P95_MS}ms`,
    );
  }
  if (graphSwitchMax > COMMON_OP_MS) {
    result.ok = false;
    result.blockers.push(
      `switchGraphPanel max ${graphSwitchMax}ms > ${COMMON_OP_MS}ms`,
    );
  }

  const save = await appReadyOp(
    page,
    () => page.keyboard.press("Control+s"),
    async () => {
      const p = await probe(page);
      return p.stress ? p : null;
    },
    3000,
  );
  result.steps.save = save;

  const postCreate = await probe(page);
  result.steps.exact45kAfterCreate = postCreate.stress?.notes === 45001;
  if (postCreate.stress?.notes !== 45001) {
    result.ok = false;
    result.blockers.push(`post-create notes ${postCreate.stress?.notes} !== 45001`);
  }

  if (
    !postCreate.stress?.lastNotePath ||
    !/Soak Created/i.test(String(postCreate.stress.lastNotePath))
  ) {
    result.ok = false;
    result.blockers.push(
      `createNote lastNotePath=${postCreate.stress?.lastNotePath} (expected Soak Created)`,
    );
  }

  const seedPair = await page.evaluate(() => {
    const soak = window.__NEXUS_SOAK__;
    const primary =
      soak?.findNoteId?.("Brief-41936-jrg") ||
      soak?.findNoteId?.("Concept-14473-dep") ||
      (soak?.noteIds?.(12) || []).find((id) => !/Soak_Created/.test(id)) ||
      null;
    const secondary =
      soak?.findNoteId?.("Brief-02193-eyp") ||
      soak?.findNoteId?.("Concept-15332-ycl") ||
      (soak?.noteIds?.(16) || []).find((id) => id !== primary && !/Soak_Created/.test(id)) ||
      null;
    if (primary) soak?.setActiveNote?.(primary);
    if (secondary) soak?.setSecondaryNote?.(secondary);
    return { primary, secondary };
  });
  await waitFor(
    page,
    async () => {
      const p = await probe(page);
      return p.stress?.activeNoteId === seedPair.primary && p.stress?.workspaceSplit
        ? p
        : null;
    },
    4000,
    25,
  );
  const preReload = await probe(page);
  const expectPath = preReload.stress?.activeNotePath;
  const expectSplit = Boolean(preReload.stress?.workspaceSplit);
  const expectSecondaryPath = preReload.stress?.lastSecondaryNotePath ?? null;
  if (!expectPath || /Brief-41569-wka/.test(expectPath)) {
    result.ok = false;
    result.blockers.push(
      `reload pre-state was default inbox (${expectPath}) — need a non-default seed path`,
    );
  }
  const reload = await appReadyOp(
    page,
    () => page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }),
    async () => {
      const ready = await page.evaluate(() => typeof window.__NEXUS_STRESS__ === "function");
      if (!ready) return null;
      const p = await probe(page);
      return p.stress && p.stress.notes >= 45000 && !p.stress.connecting && p.stress.activeNoteId
        ? p
        : null;
    },
    45000,
  );
  result.steps.reload = reload;
  result.steps.reloadRestore = {
    notes: reload.value?.stress?.notes ?? null,
    activeNotePath: reload.value?.stress?.activeNotePath ?? null,
    expectedPath: expectPath ?? null,
    workspaceSplit: Boolean(reload.value?.stress?.workspaceSplit),
    expectedSplit: expectSplit,
    expectedSecondaryPath: expectSecondaryPath,
    lastSecondaryNotePath: reload.value?.stress?.lastSecondaryNotePath ?? null,
    vaultId: reload.value?.stress?.vaultId ?? null,
    openMs: reload.value?.last?.openMs ?? null,
    interactiveMs: reload.value?.last?.interactiveMs ?? null,
  };
  if (!reload.ready) {
    result.ok = false;
    result.blockers.push("reload remount did not restore 45k");
  } else if (
    expectPath &&
    reload.value?.stress?.activeNotePath &&
    reload.value.stress.activeNotePath !== expectPath
  ) {
    result.ok = false;
    result.blockers.push(
      `reload active ${reload.value.stress.activeNotePath} !== ${expectPath}`,
    );
  } else if (!reload.value?.stress?.vaultId) {
    result.ok = false;
    result.blockers.push("reload landed on Welcome (vaultId null)");
  } else if (expectSplit && !reload.value?.stress?.workspaceSplit) {
    result.ok = false;
    result.blockers.push("reload did not restore workspace split");
  } else if (
    expectPath &&
    !/Brief-41569-wka/.test(expectPath) &&
    reload.value?.stress?.activeNotePath === expectPath
  ) {
    result.steps.reloadNonDefault = true;
  }

  const post = await probe(page);
  result.steps.postProbe = post.stress;
  result.steps.exact45kAfterReload = post.stress?.notes === 45000;
  if (post.stress?.notes !== 45000) {
    result.ok = false;
    result.blockers.push(
      `post-reload notes ${post.stress?.notes} !== 45000 (seed remount drops Soak Created)`,
    );
  }
  if ((post.stress?.bodiesLoaded ?? 99) > 20) {
    result.steps.bodyWarn = `bodiesLoaded=${post.stress.bodiesLoaded}`;
  }
  result.totalMs = Math.round(now() - t0);
  result.pageErrors = errors.splice(0);
  if (result.pageErrors.some((e) => /Maximum update depth|QuotaExceeded|out of memory/i.test(e))) {
    result.ok = false;
    result.blockers.push("45k page error");
  }
  void beforeCreate;
  return result;
}

async function withFreshPage(browser, fn) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    window.__NEXUS_LONG_TASKS__ = [];
    try {
      const obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__NEXUS_LONG_TASKS__.push({
            duration: Math.round(e.duration),
            start: Math.round(e.startTime),
            name: e.name,
          });
        }
      });
      obs.observe({ type: "longtask", buffered: true });
    } catch {
      /* PerformanceObserver longtask is Chromium-only */
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  try {
    return await fn(page, errors);
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome",
  });
  const report = {
    startedAt: new Date().toISOString(),
    base: BASE,
    commonOpBudgetMs: COMMON_OP_MS,
    suites: [],
  };

  console.log("=== UI stress: demo ===");
  try {
    report.suites.push(await withFreshPage(browser, runDemoStress));
  } catch (e) {
    report.suites.push({
      size: "demo (~10 notes)",
      ok: false,
      fatal: String(e).slice(0, 400),
    });
  }

  console.log("=== UI stress: 45k ===");
  try {
    report.suites.push(await withFreshPage(browser, runLargeStress));
  } catch (e) {
    report.suites.push({
      size: "large-test-vault (45k)",
      ok: false,
      fatal: String(e).slice(0, 400),
    });
  }

  report.finishedAt = new Date().toISOString();
  report.pass = report.suites.every((s) => s.ok);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(report.pass ? "PASS ui-multisize" : "FAIL ui-multisize");
  await browser.close();
  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
