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

  await check("stepping through the rounds with ▶ ends each step with the right bars, numbers and order", async () => {
    await open("#n98");
    for (let r = 2; r <= 5; r++) {
      await page.click("#next");
      await page.waitForFunction(() => painted === cur && !document.querySelector(".ghost") && !document.getAnimations().length);
      const problems = await page.evaluate(() => {
        const rd = res.rounds[cur], out = [];
        const px = rowEls[order[0]].track.getBoundingClientRect().width / scale;
        for (const i of order) {
          const w = rowEls[i].chunks.reduce((s, c) => s + c.el.getBoundingClientRect().width, 0);
          const want = rd.alive.has(i) ? rd.tot[i] * px : 0;
          if (Math.abs(w - want) > 1.5) out.push(`bar ${i}: ${w.toFixed(1)}px, want ${want.toFixed(1)}px`);
          if (Math.round(rowEls[i].shown) !== (rd.alive.has(i) ? rd.tot[i] : 0)) out.push(`number ${i}: ${rowEls[i].shown}`);
        }
        const tops = order.filter(i => rd.alive.has(i)).map(i => [rd.tot[i], rowEls[i].row.getBoundingClientRect().top]).sort((a, b) => a[1] - b[1]);
        for (let k = 1; k < tops.length; k++) if (tops[k][0] > tops[k - 1][0]) out.push("rows not sorted by votes");
        return out;
      });
      assert.deepStrictEqual(problems, [], `round ${r}`);
    }
  });

  await check("no JavaScript errors", async () => {
    assert.deepStrictEqual(errors, []);
  });

  await browser.close();
  if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
  console.log("\nall checks passed");
})().catch(e => { console.error(e); process.exit(1); });
