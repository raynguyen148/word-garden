// @ts-nocheck
(function (root) {
  "use strict";

  const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

  const BACKUP_SCHEMA_VERSION = 2;

  function getSrs(word) {
    if (root.DictionaryLogic && root.DictionaryLogic.normalizeSrs) {
      return root.DictionaryLogic.normalizeSrs(word);
    }
    return {
      srsInterval: typeof word.srsInterval === "number" ? word.srsInterval : 0,
      srsEase: typeof word.srsEase === "number" ? word.srsEase : 2.5,
      srsDueAt: typeof word.srsDueAt === "string" ? word.srsDueAt : null,
      srsReviewCount: typeof word.srsReviewCount === "number" ? word.srsReviewCount : 0,
    };
  }

  function exportBackup(words) {
    const backup = {
      app: "Word Garden Personal Dictionary",
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      words: words.map(function (word) {
        const srs = getSrs(word);
        return {
          word: word.vocabulary,
          // Keep the original single-value field so version 1 backups remain
          // readable by earlier app builds. New builds use the array below.
          partOfSpeech: word.partOfSpeech,
          partsOfSpeech: word.partsOfSpeech,
          meaning: word.meaning,
          pronunciation: word.pronunciation || "",
          example: word.example || "",
          createdAt: word.createdAt,
          updatedAt: word.updatedAt,
          // SRS review progress — ignored by older app builds.
          srsInterval: srs.srsInterval,
          srsEase: srs.srsEase,
          srsDueAt: srs.srsDueAt,
          srsReviewCount: srs.srsReviewCount,
        };
      }),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "word-garden-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function readBackup(file, logic) {
    if (file.size > MAX_IMPORT_BYTES) throw new Error("Choose a JSON file smaller than 10 MB.");
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (error) {
      throw new Error("This is not a valid JSON backup.");
    }
    const rawWords = Array.isArray(parsed) ? parsed : parsed && parsed.words;
    if (!Array.isArray(rawWords)) throw new Error("The file does not contain a words list.");
    const prepared = logic.prepareImportedWords(rawWords, new Date().toISOString());
    if (!prepared.words.length) throw new Error("No valid vocabulary records were found.");
    return prepared;
  }

  root.LexiloBackup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportBackup: exportBackup,
    readBackup: readBackup,
  };
})(window);
