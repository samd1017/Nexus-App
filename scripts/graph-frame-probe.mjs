/**
 * Graph frame pacing at scale.
 *
 * Opens a synthetic vault on the dev server, enters the fullscreen graph and
 * records rAF frame intervals, long tasks and renderer counts while the map
 * idles, orbits, pans, zooms and is hovered — at the folder-map root, a capped
 * folder level and the ego neighborhood. Also samples frames while search runs
 * and right after open while the indexes are still filling.
 *
 * Run: node scripts/graph-frame-probe.mjs [baseUrl] --notes 100000,500000
 *      [--out /opt/cursor/artifacts/graph/frame-probe.json] [--shots dir]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { checkedUrl } from "./browser-guard.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = checkedUrl(argv.find((a) => /^https?:/.test(a)) || "http://127.0.0.1:8080/");
const SIZES = String(flag("--notes", "100000"))
  .split(",")
  .map((n) => Number(n.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
const OUT = flag("--out", "/opt/cursor/artifacts/graph/frame-probe.json");
const SHOTS = flag("--shots", "");
const SAMPLE_MS = Number(flag("--sample-ms", "3000"));
/** Render with the desktop shell's graph settings (no MSAA, pixel ratio 1). */
const DESKTOP = argv.includes("--desktop");
const VIEW = { width: 1440, height: 900 };

function stats(deltas, longTasks, ms) {
  const s = [...deltas].sort((a, b) => a - b);
  const q = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0);
  const round = (n) => Math.round(n * 10) / 10;
  return {
    frames: deltas.length,
    fps: round((deltas.length * 1000) / Math.max(1, ms)),
    p50: round(q(0.5)),
    p95: round(q(0.95)),
    p99: round(q(0.99)),
    max: round(s.length ? s[s.length - 1] : 0),
    over33: deltas.filter((d) => d > 33.4).length,
    over50: deltas.filter((d) => d > 50).length,
    longTasks: longTasks.length,
    longTaskMaxMs: round(longTasks.length ? Math.max(...longTasks) : 0),
    longTaskTotalMs: round(longTasks.reduce((a, b) => a + b, 0)),
  };
}

async function installRecorder(page) {
  await page.evaluate(() => {
    if (window.__FRAMES__) return;
    const rec = { on: false, last: 0, deltas: [], longTasks: [] };
    window.__FRAMES__ = rec;
    const loop = (t) => {
      if (rec.on) {
        if (rec.last) rec.deltas.push(t - rec.last);
        rec.last = t;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    try {
      new PerformanceObserver((list) => {
        if (!rec.on) return;
        for (const e of list.getEntries()) rec.longTasks.push(e.duration);
      }).observe({ type: "longtask", buffered: false });
    } catch {
      /* no longtask support */
    }
  });
}

async function startSample(page) {
  await page.evaluate(() => {
    const r = window.__FRAMES__;
    r.deltas = [];
    r.longTasks = [];
    r.last = 0;
    r.on = true;
  });
  return performance.now();
}

async function stopSample(page, t0) {
  const ms = performance.now() - t0;
  const raw = await page.evaluate(() => {
    const r = window.__FRAMES__;
    r.on = false;
    return { deltas: r.deltas, longTasks: r.longTasks };
  });
  return stats(raw.deltas, raw.longTasks, ms);
}

async function graphStats(page) {
  return page.evaluate(() => window.__NEXUS_GRAPH__?.stats?.() ?? null);
}

async function sample(page, name, work) {
  const t0 = await startSample(page);
  await work();
  const frames = await stopSample(page, t0);
  const renderer = await graphStats(page);
  return { name, ...frames, renderer };
}

const center = () => ({ x: VIEW.width / 2, y: VIEW.height / 2 });

async function orbit(page, ms, button = "left") {
  const c = center();
  await page.mouse.move(c.x, c.y);
  await page.mouse.down({ button });
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    i += 1;
    await page.mouse.move(c.x + Math.sin(i / 14) * 260, c.y + Math.cos(i / 20) * 120);
    await page.waitForTimeout(12);
  }
  await page.mouse.up({ button });
}

async function zoom(page, ms) {
  const c = center();
  await page.mouse.move(c.x, c.y);
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    i += 1;
    await page.mouse.wheel(0, Math.floor(i / 25) % 2 ? 90 : -90);
    await page.waitForTimeout(24);
  }
}

async function hover(page, ms) {
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    i += 1;
    const x = VIEW.width * (0.2 + 0.6 * ((i * 37) % 100) / 100);
    const y = VIEW.height * (0.25 + 0.5 * ((i * 53) % 100) / 100);
    await page.mouse.move(x, y, { steps: 3 });
    await page.waitForTimeout(20);
  }
  await page.mouse.move(8, VIEW.height - 8);
}

async function waitFor(page, fn, timeoutMs, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function scenarioSet(page, label, shots) {
  const out = [];
  // Idle first: the fullscreen map starts its slow orbit after a short quiet.
  await page.waitForTimeout(2500);
  out.push(await sample(page, `${label}:idle`, () => page.waitForTimeout(SAMPLE_MS)));
  if (shots) await page.screenshot({ path: `${shots}/${label.replace(/[^a-z0-9]+/gi, "-")}.png` });
  out.push(await sample(page, `${label}:orbit`, () => orbit(page, SAMPLE_MS)));
  out.push(await sample(page, `${label}:pan`, () => orbit(page, SAMPLE_MS, "right")));
  out.push(await sample(page, `${label}:zoom`, () => zoom(page, SAMPLE_MS)));
  out.push(await sample(page, `${label}:hover`, () => hover(page, SAMPLE_MS)));
  return out;
}

async function runSize(browser, n) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  const page = await context.newPage();
  if (DESKTOP) {
    await page.addInitScript(() => {
      window.__NEXUS_GRAPH_DESKTOP__ = true;
    });
  }
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  const result = { notes: n, desktopRender: DESKTOP, samples: [], errors };
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("nexus-")) localStorage.removeItem(k);
      }
      localStorage.setItem("nexus-first-run-coach-v1", "done");
    } catch {
      /* ok */
    }
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await waitFor(page, () => typeof window.__NEXUS_SOAK__?.open === "function", 30000);
  await installRecorder(page);

  const tOpen = Date.now();
  await page.evaluate((count) => {
    void window.__NEXUS_SOAK__.open(count);
  }, n);
  const opened = await waitFor(
    page,
    (count) => {
      const s = window.__NEXUS_STRESS__?.();
      return Boolean(s && s.notes >= count && !s.connecting);
    },
    240000,
    n,
  );
  result.openMs = Date.now() - tOpen;
  if (!opened) {
    result.fatal = "vault did not open";
    await context.close();
    return result;
  }

  // Map right after open, while search and link indexes are still filling.
  // The shortcut is ignored until the shell has taken focus, so retry it.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Control+g");
    const ready = await waitFor(
      page,
      () => Boolean(document.querySelector("[data-graph-engine='ready']")),
      4000,
    );
    if (ready) break;
  }
  result.samples.push(
    await sample(page, "fill:idle", () => page.waitForTimeout(SAMPLE_MS)),
  );
  result.samples.push(await sample(page, "fill:orbit", () => orbit(page, SAMPLE_MS)));

  result.samples.push(...(await scenarioSet(page, "root", SHOTS)));

  const levelPath = "10-Projects/00";
  await page.evaluate((p) => window.__NEXUS_GRAPH__?.browse?.(p), levelPath);
  await page.waitForTimeout(1200);
  result.samples.push(...(await scenarioSet(page, "level", SHOTS)));

  const egoId = "n_10_Projects_00_Topic_1_md";
  await page.evaluate((id) => window.__NEXUS_GRAPH__?.ego?.(id), egoId);
  await page.waitForTimeout(1500);
  result.samples.push(...(await scenarioSet(page, "ego", SHOTS)));

  result.samples.push(
    await sample(page, "ego:orbit+search", async () => {
      const searching = page.evaluate(async () => {
        const soak = window.__NEXUS_SOAK__;
        for (const q of ["topic 12", "retrieval", "hub", "agents index", "graph links"]) {
          await soak.search(q, 40);
        }
      });
      await orbit(page, SAMPLE_MS);
      await searching;
    }),
  );

  result.samples.push(
    await sample(page, "ego:note-switch", async () => {
      const ids = await page.evaluate(() => window.__NEXUS_SOAK__.noteIds(6));
      for (const id of ids) {
        await page.evaluate((x) => window.__NEXUS_SOAK__.setActiveNote(x), id);
        await page.waitForTimeout(350);
      }
    }),
  );

  result.final = await graphStats(page);
  await context.close();
  return result;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome",
    args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const report = { base: BASE, view: VIEW, sampleMs: SAMPLE_MS, runs: [] };
  for (const n of SIZES) {
    console.log(`=== graph frame probe: ${n.toLocaleString()} notes ===`);
    try {
      report.runs.push(await runSize(browser, n));
    } catch (e) {
      report.runs.push({ notes: n, fatal: String(e).slice(0, 400) });
    }
    const run = report.runs[report.runs.length - 1];
    for (const s of run.samples ?? []) {
      const r = s.renderer ?? {};
      console.log(
        `${s.name.padEnd(20)} fps ${String(s.fps).padStart(5)}  p50 ${String(s.p50).padStart(5)}  p95 ${String(s.p95).padStart(6)}  max ${String(s.max).padStart(6)}  >50ms ${String(s.over50).padStart(3)}  LT ${String(s.longTasks).padStart(2)}/${String(s.longTaskMaxMs).padStart(5)}ms  nodes ${r.nodes ?? "?"} links ${r.links ?? "?"} calls ${r.calls ?? "?"} tex ${r.textures ?? "?"} geo ${r.geometries ?? "?"}`,
      );
    }
    if (run.fatal) console.log(`fatal: ${run.fatal}`);
    if (run.errors?.length) console.log(`page errors: ${run.errors.length}`);
  }
  await browser.close();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
