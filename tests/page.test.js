// Opens index.html in headless Chromium and checks it renders without errors.
// Google Sheets is blocked, so the page shows the ballots stored in it.
// Run: node tests/page.test.js   (needs the playwright package and its Chromium)
const path = require("path");
const assert = require("assert");
const { chromium } = require("playwright");

const url = "file://" + path.join(__dirname, "..", "index.html");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1300 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.route(/docs\.google\.com/, r => r.abort());

  const open = async hash => {
    await page.goto("about:blank");
    await page.goto(url + hash);
    await page.waitForFunction(() => /Εμφανίζονται|Ζωντανά/.test(document.getElementById("srcMsg").textContent));
    return page.evaluate(() => ({
      thr: document.getElementById("thr").value,
      eyebrow: document.getElementById("boardEyebrow").textContent,
      why: document.getElementById("leaderWhy").textContent,
      rounds: document.querySelectorAll("#dots button").length,
      outChips: document.querySelectorAll(".val .chip.out").length,
    }));
  };
  let failed = 0;
  const check = async (name, fn) => {
    try { await fn(); console.log("ok   " + name); }
    catch (e) { failed++; console.log("FAIL " + name + "\n     " + e.message); }
  };

  await check("50% + 1: winner in round 1, all five others marked as out", async () => {
    const s = await open("#t50");
    assert.strictEqual(s.thr, "0.5");
    assert.strictEqual(s.rounds, 1);
    assert.match(s.why, /στον γύρο 1 με 62 \/ 114/);
    assert.strictEqual(s.outChips, 5);
  });

  await check("#n98: no winner, 17 votes short", async () => {
    const s = await open("#n98");
    assert.strictEqual(s.thr, "abs");
    assert.strictEqual(s.eyebrow, "Κανείς δεν έφτασε το όριο");
    assert.match(s.why, /Λείπουν 17 ψήφοι/);
    assert.strictEqual(s.rounds, 5);
  });

  await check("a blank vote box keeps the last valid threshold", async () => {
    await open("#n81");
    await page.fill("#thrN", "");
    await page.evaluate(() => build());
    assert.match(await page.textContent("#leaderWhy"), /\(81 ψήφοι\) στον γύρο 5/);
  });

  await check("no JavaScript errors", async () => {
    assert.deepStrictEqual(errors, []);
  });

  await browser.close();
  if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
  console.log("\nall checks passed");
})().catch(e => { console.error(e); process.exit(1); });
