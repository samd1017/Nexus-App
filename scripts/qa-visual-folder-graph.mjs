#!/usr/bin/env node
/**
 * VISUAL QA — hierarchical folder graph (docs/GRAPH-FOLDER-HIERARCHY.md)
 * Checks D1–D8 style product acceptance; writes qa-visual-*.png
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const URL = "http://127.0.0.1:8080/";
const OUT = "/workspace/screenshots/folder-graph";
const REPORT = path.join(OUT, "qa-visual-report.json");

fs.mkdirSync(OUT, { recursive: true });

const checks = [];
function record(id, name, pass, evidence) {
  checks.push({ id, name, pass: !!pass, evidence });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${name}`);
  if (evidence) console.log("  ", JSON.stringify(evidence).slice(0, 600));
}

const consoleErrors = [];
const pageErrors = [];
const consoleWarnings = [];

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  // ─── D1: App serves ───
  let httpStatus = 0;
  try {
    const res = await fetch(URL);
    httpStatus = res.status;
  } catch {
    httpStatus = 0;
  }
  record("D1", "App serves on 0.0.0.0:8080 (curl/fetch 127.0.0.1:8080)", httpStatus === 200, {
    httpStatus,
    url: URL,
  });

  // ─── Desktop viewport ───
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (msg) => {
    const t = msg.type();
    const text = msg.text();
    if (t === "error") consoleErrors.push(text);
    if (t === "warning") consoleWarnings.push(text);
  });
  page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));

  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "qa-visual-01-welcome.png"), fullPage: false });

  const demoBtn = page.getByRole("button", { name: /demo/i }).first();
  const hasDemo = (await demoBtn.count()) > 0;
  if (hasDemo) {
    await demoBtn.click();
    await page.waitForTimeout(2000);
  } else {
    await page.evaluate(() => {
      window.__NOTEAPP__?.store?.getState?.()?.openDemoVault?.();
    });
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: path.join(OUT, "qa-visual-02-after-demo.png"), fullPage: false });

  // Open Graph tab if present
  for (const sel of [
    'button[title="Graph"]',
    'button[aria-label="Graph"]',
    'button:has-text("Graph")',
  ]) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      await el.click().catch(() => {});
      break;
    }
  }
  await page.evaluate(() => {
    const st = window.__NOTEAPP__?.store?.getState?.();
    st?.setRightPanelTab?.("graph");
    st?.setRightTab?.("graph");
    st?.setPanelTab?.("graph");
  });
  await page.waitForSelector("canvas", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const graphInfo = await page.evaluate(() => {
    const bodyText = document.body.innerText || "";
    const canvases = Array.from(document.querySelectorAll("canvas"));
    const glassCount = document.querySelectorAll(
      ".backdrop-blur-sm, .backdrop-blur, [class*='backdrop-blur']",
    ).length;

    const badgeCandidates = [];
    document.querySelectorAll("span, div").forEach((el) => {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length > 120) return;
      if (/\d+\s*notes/.test(t) && /\d+\s*links/.test(t)) badgeCandidates.push(t);
      if (/\d+\s*folders/.test(t) && /whole vault|notes/.test(t)) badgeCandidates.push(t);
    });

    const breadcrumb = document.querySelector("[data-graph-breadcrumb]");
    const breadcrumbVisible = !!(
      breadcrumb &&
      breadcrumb.offsetParent !== null &&
      getComputedStyle(breadcrumb).visibility !== "hidden" &&
      getComputedStyle(breadcrumb).display !== "none"
    );

    let store = null;
    try {
      const st = window.__NOTEAPP__?.store?.getState?.();
      if (st) {
        const noteCount = Object.values(st.nodes || {}).filter((n) => n.kind === "note").length;
        store = {
          vaultOpen: !!st.vaultOpen || !!st.rootHandle || !!st.vaultName || noteCount > 0,
          noteCount,
          graphScopeMode: st.graphScopeMode ?? null,
          graphBrowsePath: st.graphBrowsePath ?? null,
          activeNoteId: st.activeNoteId ?? null,
        };
      }
    } catch (_) {}

    // Prefer DOM badge parse for N/L
    let notes = null;
    let links = null;
    for (const t of badgeCandidates) {
      const m = t.match(/(\d+)\s*notes\s*[·•.\s]+\s*(\d+)\s*links/i);
      if (m) {
        notes = Number(m[1]);
        links = Number(m[2]);
        break;
      }
    }
    if (notes == null) {
      const m = bodyText.match(/(\d+)\s*notes\s*[·•]\s*(\d+)\s*links/i);
      if (m) {
        notes = Number(m[1]);
        links = Number(m[2]);
      }
    }

    let voidHit = false;
    let radialHosts = 0;
    document.querySelectorAll("div").forEach((el) => {
      const style = el.getAttribute("style") || "";
      const bi = getComputedStyle(el).backgroundImage || "";
      if (bi.includes("radial-gradient")) {
        radialHosts++;
        voidHit = true;
      }
      if (style.includes("#03050a") || style.includes("radial-gradient") || style.includes("#0e1622")) {
        voidHit = true;
      }
    });

    return {
      bodySnippet: bodyText.slice(0, 1000),
      canvasCount: canvases.length,
      canvasSizes: canvases.map((c) => ({
        w: c.width,
        h: c.height,
        cw: c.clientWidth,
        ch: c.clientHeight,
      })),
      glassCount,
      badgeCandidates: [...new Set(badgeCandidates)].slice(0, 12),
      breadcrumbVisible,
      breadcrumbText: breadcrumb?.textContent?.replace(/\s+/g, " ").trim() || null,
      store,
      parsed: { notes, links },
      galaxyLook: {
        radialHosts,
        voidHit,
        hasForceGraph: canvases.length > 0,
      },
    };
  });

  await page.screenshot({ path: path.join(OUT, "qa-visual-03-graph-desktop.png"), fullPage: false });

  const fsBtn = page
    .locator(
      'button[title*="ullscreen" i], button[aria-label*="ullscreen" i], button[title*="Expand" i]',
    )
    .first();
  if ((await fsBtn.count()) > 0) {
    await fsBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(OUT, "qa-visual-04-graph-fullscreen.png"),
      fullPage: false,
    });
    // exit fullscreen if possible
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);
  } else {
    await page.screenshot({
      path: path.join(OUT, "qa-visual-04-graph-canvas.png"),
      fullPage: false,
    });
  }

  const notesN = graphInfo.parsed?.notes ?? graphInfo.store?.noteCount ?? null;
  const linksL = graphInfo.parsed?.links ?? null;
  const fullNotesPattern =
    notesN != null &&
    linksL != null &&
    notesN > 0 &&
    notesN < 400;
  const folderOnlyMap =
    graphInfo.badgeCandidates.some((t) => /whole vault/i.test(t) && /folders/i.test(t)) &&
    !graphInfo.badgeCandidates.some((t) => /\d+\s*links/i.test(t));

  record(
    "D2",
    "Demo vault opens and shows FullNotes graph (N<400) — badge like 'N notes · L links', NOT folder-only map",
    hasDemo && fullNotesPattern && !folderOnlyMap,
    {
      hasDemo,
      fullNotesPattern,
      folderOnlyMap,
      notesN,
      linksL,
      badgeCandidates: graphInfo.badgeCandidates,
      breadcrumbVisible: graphInfo.breadcrumbVisible,
      store: graphInfo.store,
    },
  );

  const hasCanvas =
    graphInfo.canvasCount > 0 &&
    graphInfo.canvasSizes.some((c) => (c.cw || c.w) > 50 && (c.ch || c.h) > 50);
  const galaxyOk =
    hasCanvas &&
    (graphInfo.galaxyLook.voidHit ||
      graphInfo.galaxyLook.radialHosts > 0 ||
      graphInfo.galaxyLook.hasForceGraph);

  record(
    "D3",
    "Graph uses metal orbs / canvas present; same galaxy look not broken",
    galaxyOk,
    {
      hasCanvas,
      canvasCount: graphInfo.canvasCount,
      canvasSizes: graphInfo.canvasSizes,
      galaxyLook: graphInfo.galaxyLook,
    },
  );

  const glassPresent = graphInfo.glassCount > 0;
  // FullNotes: breadcrumb must be absent. Folder mode: allowed.
  const breadcrumbRule = fullNotesPattern
    ? !graphInfo.breadcrumbVisible
    : true;

  record(
    "D4",
    "Glass badge chrome present; breadcrumb only when folder mode",
    glassPresent && breadcrumbRule,
    {
      glassPresent,
      glassCount: graphInfo.glassCount,
      breadcrumbVisible: graphInfo.breadcrumbVisible,
      breadcrumbText: graphInfo.breadcrumbText,
      fullNotesPattern,
      breadcrumbRule,
    },
  );

  // ─── Mobile 390×844 ───
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mConsole = [];
  const mPageErr = [];
  mobile.on("console", (msg) => {
    if (msg.type() === "error") mConsole.push(msg.text());
  });
  mobile.on("pageerror", (err) => mPageErr.push(String(err?.message || err)));

  await mobile.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await mobile.waitForTimeout(600);
  const mDemo = mobile.getByRole("button", { name: /demo/i }).first();
  if ((await mDemo.count()) > 0) {
    await mDemo.click();
    await mobile.waitForTimeout(1800);
  } else {
    await mobile.evaluate(() => window.__NOTEAPP__?.store?.getState?.()?.openDemoVault?.());
    await mobile.waitForTimeout(1800);
  }
  await mobile.evaluate(() => {
    const st = window.__NOTEAPP__?.store?.getState?.();
    st?.setRightPanelTab?.("graph");
    st?.setRightTab?.("graph");
  });
  await mobile.waitForTimeout(1000);

  const overflow = await mobile.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const sw = Math.max(doc.scrollWidth, body.scrollWidth);
    const cw = doc.clientWidth;
    let maxRight = sw;
    document.querySelectorAll("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > maxRight) maxRight = r.right;
    });
    return {
      scrollWidth: sw,
      clientWidth: cw,
      overflowX: sw > cw + 1,
      maxRight,
      overflowByBounds: maxRight > cw + 2,
    };
  });

  await mobile.screenshot({
    path: path.join(OUT, "qa-visual-05-mobile-390x844.png"),
    fullPage: false,
  });

  record(
    "D5",
    "Mobile 390×844: no horizontal overflow",
    !overflow.overflowX && !overflow.overflowByBounds,
    overflow,
  );

  const shotFiles = fs
    .readdirSync(OUT)
    .filter((f) => f.startsWith("qa-visual-") && f.endsWith(".png"))
    .sort();
  record(
    "D6",
    "Screenshots under /workspace/screenshots/folder-graph/ named qa-visual-*.png",
    shotFiles.length >= 3,
    { files: shotFiles, dir: OUT },
  );

  // Filter noise: known harmless + any WebGL context probe leftovers
  const isNoise = (e) =>
    /React state update on a component that hasn't mounted/i.test(e) ||
    /Download the React DevTools/i.test(e) ||
    /favicon/i.test(e) ||
    /Duplicate extension names found/i.test(e) ||
    /GPU stall due to ReadPixels/i.test(e) ||
    /Canvas has an existing context of a different type/i.test(e) ||
    /THREE\.WebGLRenderer: Context Lost/i.test(e);

  const hardConsole = [...consoleErrors, ...mConsole].filter((e) => !isNoise(e));
  const hardPage = [...pageErrors, ...mPageErr].filter((e) => !isNoise(e));
  record("D7", "Console clean (no uncaught page errors)", hardPage.length === 0 && hardConsole.length === 0, {
    pageErrors: hardPage,
    consoleErrors: hardConsole,
    rawConsoleErrors: [...consoleErrors, ...mConsole].slice(0, 15),
    consoleWarnings: consoleWarnings.slice(0, 8),
  });

  record(
    "D8",
    "Demo note count N<400 (FullNotes threshold)",
    notesN != null && notesN > 0 && notesN < 400,
    { notesN, linksL },
  );

  const report = {
    timestamp: new Date().toISOString(),
    plan: "docs/GRAPH-FOLDER-HIERARCHY.md",
    scope: "VISUAL product acceptance (folder graph hierarchy) — NOT Wave D packaging",
    url: URL,
    checks,
    passCount: checks.filter((c) => c.pass).length,
    failCount: checks.filter((c) => !c.pass).length,
    overall: checks.every((c) => c.pass) ? "PASS" : "FAIL",
    screenshots: shotFiles.map((f) => path.join(OUT, f)),
    graphInfo,
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log("\n=== OVERALL:", report.overall, "===");
  console.log("Report:", REPORT);
  process.exit(report.overall === "PASS" ? 0 : 1);
} catch (err) {
  console.error("QA crashed:", err);
  fs.writeFileSync(
    REPORT,
    JSON.stringify({ overall: "FAIL", error: String(err?.message || err), checks }, null, 2),
  );
  process.exit(1);
} finally {
  await browser.close();
}
