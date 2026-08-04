import { chromium } from "playwright";
import fs from "fs";

const url = "http://127.0.0.1:8080/";
const browser = await chromium.launch({ headless: true });

async function runDesktop() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600);

  const demo = page.getByRole("button", { name: /demo/i }).first();
  if (await demo.count()) await demo.click();
  await page.waitForTimeout(1200);
  const mainText = await page.locator("body").innerText();
  const hasMain = mainText.length > 200;

  // Open settings via title bar button
  await page.getByRole("button", { name: /Open settings/i }).click();
  await page.waitForTimeout(500);
  // Scroll settings for memory budget
  const dialog = page.locator('[role="dialog"]').first();
  if (await dialog.count()) {
    await dialog.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    }).catch(() => {});
  }
  // Also scroll any scrollable inside
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"] *').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 40) el.scrollTop = el.scrollHeight;
    });
  });
  await page.waitForTimeout(300);
  let settingsText = await page.locator("body").innerText();
  // Force sample memory by ensuring panel open long enough
  await page.waitForTimeout(1600);
  settingsText = await page.locator("body").innerText();
  const hasScale = /Vault scale/i.test(settingsText);
  const hasMemory = /Memory budget/i.test(settingsText);
  await page.screenshot({ path: "/workspace/screenshots/wave-c-settings.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  const conflict = await page.evaluate(() => {
    const api = window.__NOTEAPP__;
    if (!api?.store) return { ok: false, reason: "no-store" };
    const get = () => api.store.getState();
    const st = get();
    const primary = Object.values(st.nodes).find(
      (n) => n.kind === "note" && !String(n.path).includes(".conflict"),
    );
    if (!primary) return { ok: false, reason: "no-primary" };
    const sibPath =
      primary.path.replace(/\.md$/i, "") + ".conflict-2026-08-03T12-00-00.md";
    const sibId = "wave_c_conflict_sib";
    api.store.setState({
      nodes: {
        ...get().nodes,
        [sibId]: {
          id: sibId,
          path: sibPath,
          name: sibPath.split("/").pop(),
          kind: "note",
          parentId: primary.parentId,
          mtime: Date.now(),
          content: "# Theirs\n\nExternal version body",
        },
      },
    });
    const count = get().getOpenConflictCount();
    get().openConflictStudio({
      primaryPath: primary.path,
      siblingPath: sibPath,
    });
    return { ok: true, count, primary: primary.path, sibPath };
  });

  await page.waitForTimeout(600);
  const studioText = await page.locator("body").innerText();
  const hasStudio = /Conflict Studio/i.test(studioText);
  const hasKeepMine = /Keep mine/i.test(studioText);
  await page.screenshot({ path: "/workspace/screenshots/wave-c-studio.png" });

  if (hasStudio) {
    const keep = page.getByRole("button", { name: /^Keep mine$/i }).first();
    if (await keep.count()) {
      await keep.click();
      await page.waitForTimeout(500);
    }
  }
  const afterResolve = await page.evaluate(() => {
    const st = window.__NOTEAPP__?.store?.getState?.();
    return {
      count: st?.getOpenConflictCount?.() ?? -1,
      open: st?.conflictStudioOpen ?? null,
    };
  });
  await page.screenshot({ path: "/workspace/screenshots/wave-c-resolved.png" });

  const pulse = page.locator('button[title="Pulse"]').first();
  if (await pulse.count()) await pulse.click();
  await page.waitForTimeout(400);
  const pulseText = await page.locator("body").innerText();
  const hasPulse = /Agent inbox|Inbox|Conflicts/i.test(pulseText);
  await page.screenshot({ path: "/workspace/screenshots/wave-c-pulse.png" });

  // Banner check: re-inject and select primary
  await page.evaluate(() => {
    const api = window.__NOTEAPP__;
    const get = () => api.store.getState();
    const primary = Object.values(get().nodes).find(
      (n) => n.kind === "note" && n.path === "Welcome.md",
    );
    if (!primary) return;
    const sibPath = "Welcome.conflict-2026-08-04T01-00-00.md";
    api.store.setState({
      nodes: {
        ...get().nodes,
        wave_c_sib2: {
          id: "wave_c_sib2",
          path: sibPath,
          name: "Welcome.conflict-2026-08-04T01-00-00.md",
          kind: "note",
          parentId: primary.parentId,
          mtime: Date.now(),
          content: "x",
        },
      },
      activeNoteId: primary.id,
    });
  });
  await page.waitForTimeout(400);
  const banner = await page.locator("[data-conflict-banner]").count();
  await page.screenshot({ path: "/workspace/screenshots/wave-c-banner.png" });

  const hardConsole = consoleErrors.filter(
    (e) => !/React state update on a component that hasn't mounted/i.test(e),
  );

  return {
    hasMain,
    hasScale,
    hasMemory,
    conflict,
    hasStudio,
    hasKeepMine,
    afterResolve,
    hasPulse,
    banner,
    consoleErrors: hardConsole,
    pageErrors,
    bodyLen: mainText.length,
    settingsSnippet: settingsText.includes("Vault scale")
      ? "has scale"
      : settingsText.slice(0, 200),
  };
}

async function runMobile() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(500);
  const demo = page.getByRole("button", { name: /demo/i }).first();
  if (await demo.count()) await demo.click();
  await page.waitForTimeout(1000);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 2,
  );
  const text = await page.locator("body").innerText();
  await page.screenshot({ path: "/workspace/screenshots/wave-c-mobile.png" });
  return { overflow, mobileLen: text.length, pageErrors };
}

const d1 = await runDesktop();
const d2 = await runDesktop();
const m1 = await runMobile();
const m2 = await runMobile();

const ok =
  d1.hasMain &&
  d2.hasMain &&
  d1.hasScale &&
  d2.hasScale &&
  d1.hasMemory &&
  d2.hasMemory &&
  d1.hasStudio &&
  d2.hasStudio &&
  d1.hasKeepMine &&
  d2.hasKeepMine &&
  d1.conflict.ok &&
  d2.conflict.ok &&
  d1.afterResolve.count === 0 &&
  d2.afterResolve.count === 0 &&
  d1.hasPulse &&
  d2.hasPulse &&
  d1.banner > 0 &&
  d2.banner > 0 &&
  d1.consoleErrors.length === 0 &&
  d2.consoleErrors.length === 0 &&
  d1.pageErrors.length === 0 &&
  d2.pageErrors.length === 0 &&
  !m1.overflow &&
  !m2.overflow &&
  m1.mobileLen > 100 &&
  m2.mobileLen > 100 &&
  m1.pageErrors.length === 0 &&
  m2.pageErrors.length === 0;

const report = { ok, pass1: d1, pass2: d2, mobile1: m1, mobile2: m2 };
fs.writeFileSync(
  "/workspace/screenshots/wave-c-final-qa.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(ok ? 0 : 1);
