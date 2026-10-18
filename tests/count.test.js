// Checks the instant-runoff count in index.html against the ballots stored in the page.
// Run: node tests/count.test.js
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const snap = JSON.parse(html.match(/id="snapshot">([\s\S]*?)<\/script>/)[1]);
const code = html.match(/<script>\n(\/\/ Instant-runoff[\s\S]*?)<\/script>/)[1];
const mod = { exports: {} };
new Function("module", code)(mod);
const { runoff } = mod.exports;

const n = snap.candidates.length;
const place = i => snap.candidates[i].split("|")[0].trim();
const ROM_NAP = snap.candidates.findIndex(c => c.includes("ROM - NAP"));
let failed = 0;

function check(name, fn) {
  try { fn(); console.log("ok   " + name); }
  catch (e) { failed++; console.log("FAIL " + name + "\n     " + e.message); }
}

check("snapshot holds 114 full ballots over 6 destinations", () => {
  assert.strictEqual(n, 6);
  assert.strictEqual(snap.ballots.length, 114);
  for (const b of snap.ballots) assert.match(b, /^[1-6]{6}$/);
});

check("50% + 1: ROM - NAP wins in round 1 with 62 of 114, count stops there", () => {
  const r = runoff(n, snap.ballots, { pct: 0.5 });
  assert.strictEqual(r.winner, ROM_NAP, "winner " + place(r.winner));
  assert.strictEqual(r.winRound, 0);
  assert.strictEqual(r.rounds.length, 1);
  assert.strictEqual(r.rounds[0].need, 58);
  assert.strictEqual(r.rounds[0].tot[ROM_NAP], 62);
  assert.strictEqual(r.rounds[0].eliminated, null);
});

check("70% + 1: ROM - NAP wins in round 5 with 81 (needs 80)", () => {
  const r = runoff(n, snap.ballots, { pct: 0.7 });
  assert.strictEqual(r.winner, ROM_NAP);
  assert.strictEqual(r.winRound, 4);
  assert.strictEqual(r.rounds.length, 5);
  assert.strictEqual(r.rounds[4].need, 80);
  assert.strictEqual(r.rounds[4].tot[ROM_NAP], 81);
});

check("98 votes: no winner, ROM - NAP leads the final round with 81", () => {
  const r = runoff(n, snap.ballots, { abs: 98 });
  assert.strictEqual(r.winner, null);
  assert.strictEqual(r.rounds.length, 5);
  assert.strictEqual(r.leader, ROM_NAP);
  const last = r.rounds[4];
  assert.strictEqual(last.alive.size, 2);
  assert.strictEqual(last.tot[ROM_NAP], 81);
  for (const rd of r.rounds) assert.strictEqual(rd.need, 98);
});

check("81 votes: reached exactly, ROM - NAP wins in round 5", () => {
  const r = runoff(n, snap.ballots, { abs: 81 });
  assert.strictEqual(r.winner, ROM_NAP);
  assert.strictEqual(r.winRound, 4);
});

check("every round keeps all 114 votes and moves the eliminated one's votes on", () => {
  const r = runoff(n, snap.ballots, { abs: 98 });
  r.rounds.forEach((rd, k) => {
    const sum = [...rd.alive].reduce((s, i) => s + rd.tot[i], 0);
    assert.strictEqual(sum + rd.exhausted, 114, "round " + (k + 1));
    if (k > 0) {
      const prev = r.rounds[k - 1];
      const moved = rd.transfers.reduce((a, b) => a + b, 0) + rd.toExhausted;
      assert.strictEqual(moved, prev.tot[prev.eliminated], "transfers into round " + (k + 1));
    }
  });
});

check("last-place tie goes to the one with fewer votes in the earlier round", () => {
  // round 1: A 4, B 3, C 2, D 1 -> D out, its vote goes to C
  // round 2: A 4, B 3, C 3 -> B and C tie; C had fewer in round 1, so C is out
  const ballots = ["1234", "1234", "1234", "1234", "2134", "2134", "2134", "2314", "2314", "3421"];
  const r = runoff(4, ballots, { pct: 0.9 });
  assert.strictEqual(r.rounds[0].eliminated, 3);
  assert.deepStrictEqual([r.rounds[1].tot[1], r.rounds[1].tot[2]], [3, 3]);
  assert.strictEqual(r.rounds[1].eliminated, 2);
  assert.strictEqual(r.rounds[1].tieBroken, true);
});

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
