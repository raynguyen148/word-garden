// @ts-nocheck
(function (root) {
  "use strict";

  // Matches the original Word Garden database schema exactly.
  const DB_NAME = "word-garden";
  const DB_VERSION = 1;
  const WORD_STORE = "words";
  const LEGACY_DB_NAME = "lexilo_personal_dictionary";

  function createId() {
    return root.crypto && root.crypto.randomUUID
      ? root.crypto.randomUUID()
      : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function requestToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Database request failed.")); };
    });
  }

  function transactionToPromise(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () { resolve(); };
      transaction.onerror = function () { reject(transaction.error || new Error("Database transaction failed.")); };
      transaction.onabort = function () { reject(transaction.error || new Error("Database transaction was cancelled.")); };
    });
  }

  function normalizePartsOfSpeech(record) {
    const value = record && (record.partsOfSpeech || record.partOfSpeech);
    if (root.DictionaryLogic && root.DictionaryLogic.normalizePartsOfSpeech) {
      return root.DictionaryLogic.normalizePartsOfSpeech(value);
    }
    const values = Array.isArray(value) ? value : [value];
    const known = ["noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "interjection", "phrase", "other"];
    const selected = values.filter(function (part) { return known.includes(String(part || "").toLowerCase()); });
    return selected.length ? Array.from(new Set(selected)) : ["other"];
  }

  function normalizeSrs(record) {
    if (root.DictionaryLogic && root.DictionaryLogic.normalizeSrs) {
      return root.DictionaryLogic.normalizeSrs(record);
    }
    return {
      srsInterval: 0,
      srsEase: 2.5,
      srsDueAt: null,
      srsReviewCount: 0,
    };
  }

  // UI modules call the field vocabulary; persisted Word Garden records use word.
  function toAppWord(record) {
    if (!record) return record;
    var partsOfSpeech = normalizePartsOfSpeech(record);
    var srs = normalizeSrs(record);
    return Object.assign({}, record, {
      vocabulary: record.word || record.vocabulary || "",
      // Preserve this compatibility field for old backups and older app builds.
      partOfSpeech: partsOfSpeech[0],
      partsOfSpeech: partsOfSpeech,
      // SRS fields — default to "new" state when absent (backward compatible).
      srsInterval: srs.srsInterval,
      srsEase: srs.srsEase,
      srsDueAt: srs.srsDueAt,
      srsReviewCount: srs.srsReviewCount,
    });
  }

  function toStoredWord(record, forcedId) {
    const word = String(record.word || record.vocabulary || "").trim();
    const now = new Date().toISOString();
    const partsOfSpeech = normalizePartsOfSpeech(record);
    const srs = normalizeSrs(record);
    return {
      id: forcedId || record.id || createId(),
      word: word,
      wordKey: record.wordKey || word.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " "),
      // `partsOfSpeech` is canonical. The primary singular value lets
      // previously exported backups continue to be understood by old builds.
      partOfSpeech: partsOfSpeech[0],
      partsOfSpeech: partsOfSpeech,
      meaning: String(record.meaning || "").trim(),
      pronunciation: String(record.pronunciation || "").trim(),
      example: String(record.example || "").trim(),
      createdAt: record.createdAt || now,
      updatedAt: record.updatedAt || now,
      // SRS fields — preserved when present, omitted for new words.
      srsInterval: srs.srsInterval,
      srsEase: srs.srsEase,
      srsDueAt: srs.srsDueAt,
      srsReviewCount: srs.srsReviewCount,
    };
  }

  function openDatabase(onVersionChange) {
    return new Promise(function (resolve, reject) {
      if (!("indexedDB" in root)) {
        reject(new Error("IndexedDB is not supported by this browser."));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function (event) {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(WORD_STORE)) {
          const store = database.createObjectStore(WORD_STORE, { keyPath: "id" });
          store.createIndex("wordKey", "wordKey", { unique: true });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
      request.onsuccess = function () {
        const database = request.result;
        database.onversionchange = function () {
          database.close();
          if (onVersionChange) onVersionChange();
        };
        resolve(database);
      };
      request.onerror = function () { reject(request.error || new Error("Could not open browser storage.")); };
      request.onblocked = function () { reject(new Error("Browser storage is open in another tab.")); };
    });
  }

  async function readLexiloWordsIfPresent() {
    if (!indexedDB.databases) return [];
    const databases = await indexedDB.databases();
    if (!databases.some(function (item) { return item.name === LEGACY_DB_NAME; })) return [];
    return new Promise(function (resolve) {
      const request = indexedDB.open(LEGACY_DB_NAME);
      request.onsuccess = function () {
        const legacy = request.result;
        if (!legacy.objectStoreNames.contains(WORD_STORE)) { legacy.close(); resolve([]); return; }
        const getAll = legacy.transaction(WORD_STORE, "readonly").objectStore(WORD_STORE).getAll();
        getAll.onsuccess = function () { const words = getAll.result || []; legacy.close(); resolve(words); };
        getAll.onerror = function () { legacy.close(); resolve([]); };
      };
      request.onerror = function () { resolve([]); };
    });
  }

  async function migrateLexiloWords(database) {
    const legacyWords = await readLexiloWordsIfPresent();
    if (!legacyWords.length) return;
    const existing = await requestToPromise(database.transaction(WORD_STORE, "readonly").objectStore(WORD_STORE).getAll());
    const existingKeys = new Set(existing.map(function (word) { return word.wordKey; }));
    const records = legacyWords.filter(function (word) { return word && word.wordKey && !existingKeys.has(word.wordKey); })
      .map(function (word) { return toStoredWord(word, createId()); });
    if (!records.length) return;
    const transaction = database.transaction(WORD_STORE, "readwrite");
    records.forEach(function (record) { transaction.objectStore(WORD_STORE).put(record); });
    await transactionToPromise(transaction);
  }

  async function createStorage(onVersionChange) {
    const database = await openDatabase(onVersionChange);
    await migrateLexiloWords(database);

    async function getAllWords() {
      const transaction = database.transaction(WORD_STORE, "readonly");
      const records = await requestToPromise(transaction.objectStore(WORD_STORE).getAll());
      return records.map(toAppWord);
    }

    async function insertWord(word) {
      const stored = toStoredWord(word);
      const transaction = database.transaction(WORD_STORE, "readwrite");
      const completion = transactionToPromise(transaction);
      transaction.objectStore(WORD_STORE).put(stored);
      await completion;
      return stored.id;
    }

    function updateWord(id, changes) {
      return new Promise(function (resolve, reject) {
        const transaction = database.transaction(WORD_STORE, "readwrite");
        const store = transaction.objectStore(WORD_STORE);
        const request = store.get(id);
        request.onsuccess = function () {
          const existing = request.result;
          if (!existing) { transaction.abort(); return; }
          const mappedChanges = Object.assign({}, changes);
          if (Object.prototype.hasOwnProperty.call(mappedChanges, "vocabulary")) {
            mappedChanges.word = mappedChanges.vocabulary;
            delete mappedChanges.vocabulary;
          }
          store.put(toStoredWord(Object.assign({}, existing, mappedChanges, { id: id }), id));
        };
        request.onerror = function () { reject(request.error || new Error("Could not find that word.")); };
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error || new Error("Could not save that change.")); };
        transaction.onabort = function () { reject(transaction.error || new Error("Could not save that change.")); };
      });
    }

    async function removeWords(ids) {
      const transaction = database.transaction(WORD_STORE, "readwrite");
      const completion = transactionToPromise(transaction);
      const store = transaction.objectStore(WORD_STORE);
      ids.forEach(function (id) { store.delete(id); });
      await completion;
    }

    async function importWords(importedWords, existingWords) {
      const existingByKey = new Map(existingWords.map(function (word) { return [word.wordKey, word]; }));
      const transaction = database.transaction(WORD_STORE, "readwrite");
      const completion = transactionToPromise(transaction);
      const store = transaction.objectStore(WORD_STORE);
      let addedCount = 0;
      let updatedCount = 0;
      importedWords.forEach(function (incoming) {
        const existing = existingByKey.get(incoming.wordKey);
        if (existing) {
          store.put(toStoredWord(Object.assign({}, existing, incoming, { createdAt: existing.createdAt || incoming.createdAt }), existing.id));
          updatedCount += 1;
        } else {
          const stored = toStoredWord(incoming);
          store.put(stored);
          existingByKey.set(stored.wordKey, toAppWord(stored));
          addedCount += 1;
        }
      });
      await completion;
      return { addedCount: addedCount, updatedCount: updatedCount };
    }

    return { getAllWords, insertWord, updateWord, removeWords, importWords, close: function () { database.close(); } };
  }

  root.LexiloStorage = { version: DB_VERSION, open: createStorage };
})(window);
