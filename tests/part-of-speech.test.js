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
      return JSON.stringify({ words: [{ word: "light", partsOfSpeech: ["noun", "adjective"], meaning: "ánh sáng; nhẹ" }] });
    },
  }, logic);

  assert.deepEqual(oldBackup.words[0].partsOfSpeech, ["verb"]);
  assert.deepEqual(newBackup.words[0].partsOfSpeech, ["noun", "adjective"]);

  window.LexiloBackup.exportBackup(newBackup.words);
  const exported = JSON.parse(await exportedBlob.text());
  assert.equal(exported.schemaVersion, 2);
  assert.equal(exported.words[0].partOfSpeech, "noun");
  assert.deepEqual(exported.words[0].partsOfSpeech, ["noun", "adjective"]);
});
