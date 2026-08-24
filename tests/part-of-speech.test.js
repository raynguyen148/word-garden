const assert = require("node:assert/strict");
const test = require("node:test");
const logic = require("../logic.js");

test("normalizes legacy and multi-value parts of speech", function () {
  assert.deepEqual(logic.normalizePartsOfSpeech("verb"), ["verb"]);
  assert.deepEqual(
    logic.normalizePartsOfSpeech(["verb", "noun", "verb", "unknown"]),
    ["noun", "verb"]
  );

  const legacy = logic.sanitizeImportedWord({
    word: "run",
    partOfSpeech: "verb",
    meaning: "chạy",
  }, "2026-01-01T00:00:00.000Z");
  const modern = logic.sanitizeImportedWord({
    word: "light",
    partsOfSpeech: ["noun", "adjective"],
    meaning: "ánh sáng; nhẹ",
  }, "2026-01-01T00:00:00.000Z");

  assert.deepEqual(legacy.partsOfSpeech, ["verb"]);
  assert.equal(legacy.partOfSpeech, "verb");
  assert.deepEqual(modern.partsOfSpeech, ["noun", "adjective"]);
  assert.equal(modern.partOfSpeech, "noun");
});

test("filters a word by any assigned part of speech", function () {
  const words = [
    { vocabulary: "run", meaning: "chạy", partOfSpeech: "verb", partsOfSpeech: ["verb"] },
    { vocabulary: "light", meaning: "ánh sáng; nhẹ", partOfSpeech: "noun", partsOfSpeech: ["noun", "adjective"] },
  ];

  assert.deepEqual(
    logic.filterAndSortWords(words, "", "adjective", "a-z").map(function (word) { return word.vocabulary; }),
    ["light"]
  );
});

test("keeps optional work-English practice details backward compatibly", function () {
  const word = logic.sanitizeImportedWord({
    word: "My main concern is…",
    partOfSpeech: "phrase",
    meaning: "Điều tôi lo nhất là…",
    cardType: "phrase",
    lesson: "Safe rollouts",
    tags: "migration, rollout, Migration",
    situation: "Nêu rủi ro chính của một migration.",
    recognitionReviewCount: 2,
    productionReviewCount: 1,
  }, "2026-08-24T00:00:00.000Z");

  assert.equal(word.cardType, "phrase");
  assert.equal(word.lesson, "Safe rollouts");
  assert.deepEqual(word.tags, ["migration", "rollout"]);
  assert.equal(word.situation, "Nêu rủi ro chính của một migration.");
  assert.equal(word.recognitionReviewCount, 2);
  assert.equal(word.productionReviewCount, 1);
});

test("includes only phrase cards in practice packs and pack filters", function () {
  const words = [
    { vocabulary: "accurate", meaning: "chinh xac", partsOfSpeech: ["adjective"], lesson: "Safe rollouts", cardType: "phrase" },
    { vocabulary: "small, reversible steps", meaning: "cac buoc nho", partsOfSpeech: ["phrase"], lesson: "Safe rollouts", cardType: "phrase" },
  ];

  assert.deepEqual(logic.getPracticePacks(words).map(function (pack) { return pack.total; }), [1]);
  assert.deepEqual(
    logic.filterAndSortWords(words, "", "all", "a-z", "Safe rollouts").map(function (word) { return word.vocabulary; }),
    ["small, reversible steps"]
  );
});

test("filters vocabulary and all practice cards as distinct content types", function () {
  const words = [
    { vocabulary: "accurate", meaning: "chính xác", partsOfSpeech: ["adjective"] },
    { vocabulary: "What’s the downside?", meaning: "Điểm bất lợi là gì?", partsOfSpeech: ["phrase"], lesson: "Safe rollouts" },
    { vocabulary: "Small steps.", meaning: "Các bước nhỏ.", partsOfSpeech: ["phrase"], lesson: "Direct push vs PR" },
  ];

  assert.deepEqual(
    logic.filterAndSortWords(words, "", "all", "a-z", "", "vocabulary").map(function (word) { return word.vocabulary; }),
    ["accurate"]
  );
  assert.deepEqual(
    logic.filterAndSortWords(words, "", "noun", "a-z", "", "practice").map(function (word) { return word.vocabulary; }),
    ["Small steps.", "What’s the downside?"]
  );
  assert.deepEqual(
    logic.filterAndSortWords(words, "", "all", "a-z", "Safe rollouts", "practice").map(function (word) { return word.vocabulary; }),
    ["What’s the downside?"]
  );
});

test("recognizes phrase cards in a practice pack as locked practice cards", function () {
  assert.equal(logic.isPracticePackCard({ partsOfSpeech: ["phrase"], lesson: "Direct push vs PR" }), true);
  assert.equal(logic.isPracticePackCard({ partsOfSpeech: ["phrase"] }), false);
  assert.equal(logic.isPracticePackCard({ partsOfSpeech: ["verb"], lesson: "Direct push vs PR" }), false);
});

test("tracks speaking completion for each practice pack by local calendar day", function () {
  const words = [
    { vocabulary: "Small, reversible steps.", meaning: "Các bước nhỏ", partsOfSpeech: ["phrase"], lesson: "Safe rollouts", productionReviewCount: 2, productionLastReviewedAt: "2026-08-24T04:00:00.000Z" },
    { vocabulary: "What’s the downside?", meaning: "Điểm bất lợi là gì?", partsOfSpeech: ["phrase"], lesson: "Safe rollouts", productionReviewCount: 1, productionLastReviewedAt: "2026-08-23T04:00:00.000Z" },
  ];

  const pack = logic.getPracticePacks(words, "2026-08-24T12:00:00.000Z")[0];
  assert.equal(pack.spokenTodayCount, 1);
  assert.equal(pack.spokenTodayRemaining, 1);
  assert.equal(pack.completedToday, false);
});

test("prepares a pasted practice lesson without a remote service", function () {
  const lesson = logic.preparePracticeLesson([
    "Key phrases to practise",
    "• “What’s the downside?” → Điểm bất lợi là gì?",
    "• “Small, reversible steps.” → Các bước nhỏ và có thể rollback.",
    "Speaking pattern for today",
    "First we X. Then we Y. Once Z is stable, we can A.",
    "For example:",
    "First we test it locally. Then we run it in staging. Once we’re confident, we can deploy it to production.",
  ].join("\n"), { lesson: "Safe rollouts", tags: "migration, rollout" });

  assert.equal(lesson.invalidCount, 0);
  assert.equal(lesson.words.length, 4);
  assert.equal(lesson.words[0].lesson, "Safe rollouts");
  assert.deepEqual(lesson.words[0].tags, ["migration", "rollout"]);
  assert.equal(lesson.words[0].cardType, "phrase");
  assert.equal(lesson.words[2].cardType, "pattern");
  assert.equal(lesson.words[3].cardType, "phrase");
});

test("imports old and new backups and exports the compatible v2 shape", async function () {
  let exportedBlob;
  global.window = {
    setTimeout: function (callback) { callback(); },
  };
  global.document = {
    body: { appendChild: function () {} },
    createElement: function () { return { click: function () {}, remove: function () {} }; },
  };
  global.URL = {
    createObjectURL: function (blob) { exportedBlob = blob; return "blob:word-garden-test"; },
    revokeObjectURL: function () {},
  };
  delete require.cache[require.resolve("../backup.js")];
  require("../backup.js");

  const oldBackup = await window.LexiloBackup.readBackup({
    size: 100,
    text: async function () {
      return JSON.stringify({ words: [{ word: "run", partOfSpeech: "verb", meaning: "chạy" }] });
    },
  }, logic);
  const newBackup = await window.LexiloBackup.readBackup({
    size: 100,
    text: async function () {
      return JSON.stringify({ words: [{
        word: "light",
        partsOfSpeech: ["noun", "adjective"],
        meaning: "ánh sáng; nhẹ",
        srsInterval: 7,
        srsEase: 2.35,
        srsDueAt: "2026-01-08T00:00:00.000Z",
        srsReviewCount: 2,
        cardType: "phrase",
        lesson: "Safe rollouts",
        tags: ["migration"],
        situation: "Nêu điều lo ngại chính.",
        productionReviewCount: 1,
      }] });
    },
  }, logic);

  assert.deepEqual(oldBackup.words[0].partsOfSpeech, ["verb"]);
  assert.deepEqual(newBackup.words[0].partsOfSpeech, ["noun", "adjective"]);
  assert.equal(newBackup.words[0].srsInterval, 7);
  assert.equal(newBackup.words[0].srsEase, 2.35);
  assert.equal(newBackup.words[0].srsReviewCount, 2);

  window.LexiloBackup.exportBackup(newBackup.words);
  const exported = JSON.parse(await exportedBlob.text());
  assert.equal(exported.schemaVersion, 2);
  assert.equal(exported.words[0].partOfSpeech, "noun");
  assert.deepEqual(exported.words[0].partsOfSpeech, ["noun", "adjective"]);
  assert.equal(exported.words[0].srsInterval, 7);
  assert.equal(exported.words[0].srsEase, 2.35);
  assert.equal(exported.words[0].srsDueAt, "2026-01-08T00:00:00.000Z");
  assert.equal(exported.words[0].srsReviewCount, 2);
  assert.equal(exported.words[0].cardType, "phrase");
  assert.equal(exported.words[0].lesson, "Safe rollouts");
  assert.deepEqual(exported.words[0].tags, ["migration"]);
  assert.equal(exported.words[0].productionReviewCount, 1);
});
