// @ts-nocheck
(function (root) {
  "use strict";

  const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

  function exportBackup(words, schemaVersion) {
    const backup = {
      app: "Word Garden Personal Dictionary",
      schemaVersion: schemaVersion,
      exportedAt: new Date().toISOString(),
      words: words.map(function (word) {
        return {
          word: word.vocabulary,
          partOfSpeech: word.partOfSpeech,
          meaning: word.meaning,
          pronunciation: word.pronunciation || "",
          example: word.example || "",
          createdAt: word.createdAt,
          updatedAt: word.updatedAt,
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

  root.LexiloBackup = { exportBackup: exportBackup, readBackup: readBackup };
})(window);
