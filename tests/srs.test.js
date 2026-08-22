const assert = require("node:assert/strict");
const test = require("node:test");
const logic = require("../logic.js");

test("getDefaultSrs returns correct initial state", function () {
  const srs = logic.getDefaultSrs();
  assert.equal(srs.srsInterval, 0);
  assert.equal(srs.srsEase, 2.5);
  assert.equal(srs.srsDueAt, null);
  assert.equal(srs.srsReviewCount, 0);
});

test("normalizeSrs handles legacy / missing fields gracefully", function () {
  const normalized = logic.normalizeSrs({ word: "hello" });
  assert.equal(normalized.srsInterval, 0);
  assert.equal(normalized.srsEase, 2.5);
  assert.equal(normalized.srsDueAt, null);
  assert.equal(normalized.srsReviewCount, 0);
});

test("normalizeSrs clamps malformed progress and invalid due dates safely", function () {
  const normalized = logic.normalizeSrs({
    srsInterval: -4.9,
    srsEase: 9,
    srsDueAt: "not-a-date",
    srsReviewCount: 2.8,
  });
  assert.equal(normalized.srsInterval, 0);
  assert.equal(normalized.srsEase, 3);
  assert.equal(normalized.srsDueAt, null);
  assert.equal(normalized.srsReviewCount, 2);
});

test("gradeSrs computes correct interval and ease for new words", function () {
  const now = "2026-08-22T00:00:00.000Z";
  const newWord = logic.getDefaultSrs();

  // Again: reset to 1 day, ease decreases
  const againResult = logic.gradeSrs(newWord, "again", now);
  assert.equal(againResult.srsInterval, 1);
  assert.equal(againResult.srsEase, 2.3);
  assert.equal(againResult.srsDueAt, "2026-08-23T00:00:00.000Z");
  assert.equal(againResult.srsReviewCount, 1);

  // Hard: interval 1, ease decreases slightly
  const hardResult = logic.gradeSrs(newWord, "hard", now);
  assert.equal(hardResult.srsInterval, 1);
  assert.equal(hardResult.srsEase, 2.35);
  assert.equal(hardResult.srsReviewCount, 1);

  // Good: interval 1, ease unchanged
  const goodResult = logic.gradeSrs(newWord, "good", now);
  assert.equal(goodResult.srsInterval, 1);
  assert.equal(goodResult.srsEase, 2.5);
  assert.equal(goodResult.srsReviewCount, 1);

  // Easy: interval 4, ease increases
  const easyResult = logic.gradeSrs(newWord, "easy", now);
  assert.equal(easyResult.srsInterval, 4);
  assert.equal(easyResult.srsEase, 2.65);
  assert.equal(easyResult.srsReviewCount, 1);
});

test("gradeSrs scales interval by ease for review words", function () {
  const now = "2026-08-22T00:00:00.000Z";
  const word = {
    srsInterval: 10,
    srsEase: 2.5,
    srsDueAt: "2026-08-22T00:00:00.000Z",
    srsReviewCount: 3,
  };

  // Good: 10 * 2.5 = 25 days
  const goodResult = logic.gradeSrs(word, "good", now);
  assert.equal(goodResult.srsInterval, 25);
  assert.equal(goodResult.srsEase, 2.5);
  assert.equal(goodResult.srsReviewCount, 4);

  // Easy: 10 * 2.5 * 1.3 = 32.5 -> 33 days, ease +0.15
  const easyResult = logic.gradeSrs(word, "easy", now);
  assert.equal(easyResult.srsInterval, 33);
  assert.equal(easyResult.srsEase, 2.65);

  // Hard: 10 * 1.2 = 12 days, ease -0.15
  const hardResult = logic.gradeSrs(word, "hard", now);
  assert.equal(hardResult.srsInterval, 12);
  assert.equal(hardResult.srsEase, 2.35);

  // Again: reset to 1 day, ease -0.2
  const againResult = logic.gradeSrs(word, "again", now);
  assert.equal(againResult.srsInterval, 1);
  assert.equal(againResult.srsEase, 2.3);
});

test("gradeSrs rejects unknown grades and caps ease at 3.0", function () {
  assert.throws(function () {
    logic.gradeSrs(logic.getDefaultSrs(), "forgotten", "2026-08-22T00:00:00.000Z");
  }, /Unknown review grade/);

  const result = logic.gradeSrs({ srsInterval: 30, srsEase: 3, srsReviewCount: 4 }, "easy", "2026-08-22T00:00:00.000Z");
  assert.equal(result.srsEase, 3);
});

test("previewGradeIntervals computes previews without mutating", function () {
  const now = "2026-08-22T00:00:00.000Z";
  const word = {
    srsInterval: 5,
    srsEase: 2.5,
    srsDueAt: now,
    srsReviewCount: 2,
  };

  const preview = logic.previewGradeIntervals(word, now);
  assert.equal(preview.again, 1);
  assert.equal(preview.hard, 6); // 5 * 1.2
  assert.equal(preview.good, 13); // 5 * 2.5 = 12.5 -> 13
  assert.equal(preview.easy, 16); // 5 * 2.5 * 1.3 = 16.25 -> 16
});

test("getSrsLevel correctly categorizes words", function () {
  assert.equal(logic.getSrsLevel({ srsReviewCount: 0 }), "new");
  assert.equal(logic.getSrsLevel({ srsReviewCount: 1, srsInterval: 2 }), "learning");
  assert.equal(logic.getSrsLevel({ srsReviewCount: 2, srsInterval: 14 }), "reviewing");
  assert.equal(logic.getSrsLevel({ srsReviewCount: 5, srsInterval: 20 }), "reviewing");
  assert.equal(logic.getSrsLevel({ srsReviewCount: 5, srsInterval: 21 }), "mastered");
  assert.equal(logic.getSrsLevel({ srsReviewCount: 5, srsInterval: 30 }), "mastered");
});

test("getDueWords filters correctly based on due date and new status", function () {
  const now = "2026-08-22T12:00:00.000Z";
  const words = [
    { vocabulary: "new-word", srsReviewCount: 0 },
    { vocabulary: "due-word", srsReviewCount: 2, srsDueAt: "2026-08-22T00:00:00.000Z" },
    { vocabulary: "missing-due-date", srsReviewCount: 1, srsInterval: 1 },
    { vocabulary: "future-word", srsReviewCount: 3, srsDueAt: "2026-08-25T00:00:00.000Z" },
  ];

  const due = logic.getDueWords(words, now);
  assert.deepEqual(due.map(w => w.vocabulary), ["new-word", "due-word", "missing-due-date"]);
});

test("getSrsStats computes accurate totals", function () {
  const now = "2026-08-22T12:00:00.000Z";
  const words = [
    { srsReviewCount: 0 }, // new + due
    { srsReviewCount: 1, srsInterval: 2, srsDueAt: "2026-08-20T00:00:00.000Z" }, // learning + due
    { srsReviewCount: 3, srsInterval: 10, srsDueAt: "2026-08-25T00:00:00.000Z" }, // reviewing (not due)
    { srsReviewCount: 5, srsInterval: 40, srsDueAt: "2026-08-21T00:00:00.000Z" }, // master + due
  ];

  const stats = logic.getSrsStats(words, now);
  assert.equal(stats.newCount, 1);
  assert.equal(stats.dueCount, 3);
  assert.equal(stats.learningCount, 1);
  assert.equal(stats.reviewingCount, 1);
  assert.equal(stats.masterCount, 1);
});

test("formatInterval formats time spans accurately", function () {
  assert.equal(logic.formatInterval(0), "< 1 day");
  assert.equal(logic.formatInterval(1), "1 day");
  assert.equal(logic.formatInterval(4), "4 days");
  assert.equal(logic.formatInterval(7), "1 week");
  assert.equal(logic.formatInterval(14), "2 weeks");
  assert.equal(logic.formatInterval(30), "1 month");
  assert.equal(logic.formatInterval(60), "2 months");
  assert.equal(logic.formatInterval(365), "1 year");
});

test("buildReviewQueue prioritizes due words and caps new words", function () {
  const now = "2026-08-22T12:00:00.000Z";
  const words = [
    { vocabulary: "due1", srsReviewCount: 2, srsDueAt: "2026-08-20T00:00:00.000Z" },
    { vocabulary: "due2", srsReviewCount: 1, srsDueAt: "2026-08-21T00:00:00.000Z" },
    { vocabulary: "missing-due-date", srsReviewCount: 1, srsInterval: 1 },
    { vocabulary: "future", srsReviewCount: 3, srsDueAt: "2026-08-30T00:00:00.000Z" },
    { vocabulary: "new1", srsReviewCount: 0 },
    { vocabulary: "new2", srsReviewCount: 0 },
    { vocabulary: "new3", srsReviewCount: 0 },
  ];

  // Cap new words to 2
  const queue = logic.buildReviewQueue(words, now, 2, () => 0.5);
  assert.equal(queue.length, 5); // 3 due + 2 capped new
  assert.ok(!queue.some(w => w.vocabulary === "future"));
});
