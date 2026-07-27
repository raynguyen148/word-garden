// @ts-nocheck
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.DictionaryLogic = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PARTS_OF_SPEECH = [
    "noun",
    "verb",
    "adjective",
    "adverb",
    "pronoun",
    "preposition",
    "conjunction",
    "interjection",
    "phrase",
    "other",
  ];

  function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeWord(value) {
    return cleanText(value)
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .replace(/\s+/g, " ");
  }

  function normalizePartOfSpeech(value) {
    const normalized = cleanText(value).toLowerCase();
    return PARTS_OF_SPEECH.includes(normalized) ? normalized : "other";
  }

  // `partOfSpeech` used to be a single string. Keep accepting that shape while
  // making the plural field the canonical representation for new records.
  function normalizePartsOfSpeech(value) {
    const values = Array.isArray(value)
      ? value
      : (typeof value === "string" ? value.split(",") : []);
    const selected = new Set();

    values.forEach(function (part) {
      const normalized = cleanText(part).toLowerCase();
      if (PARTS_OF_SPEECH.includes(normalized)) selected.add(normalized);
    });

    const parts = PARTS_OF_SPEECH.filter(function (part) { return selected.has(part); });
    return parts.length ? parts : ["other"];
  }

  function formatPartsOfSpeech(value) {
    return normalizePartsOfSpeech(value).map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(" · ");
  }

  function safeIsoDate(value, fallback) {
    if (typeof value === "string") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
    return fallback;
  }

  function sanitizeImportedWord(raw, timestamp) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

    const vocabulary = cleanText(raw.vocabulary || raw.word);
    const meaning = cleanText(raw.meaning || raw.definition);
    if (!vocabulary || !meaning) return null;

    const now = timestamp || new Date().toISOString();
    const partsOfSpeech = normalizePartsOfSpeech(raw.partsOfSpeech || raw.partOfSpeech || raw.part_of_speech);
    return {
      vocabulary: vocabulary,
      wordKey: normalizeWord(vocabulary),
      // Keep the singular value for backups made by older versions of the app.
      partOfSpeech: partsOfSpeech[0],
      partsOfSpeech: partsOfSpeech,
      meaning: meaning,
      pronunciation: cleanText(raw.pronunciation),
      example: cleanText(raw.example),
      createdAt: safeIsoDate(raw.createdAt, now),
      updatedAt: safeIsoDate(raw.updatedAt, now),
    };
  }

  function prepareImportedWords(rawWords, timestamp) {
    const uniqueWords = new Map();
    let invalidCount = 0;
    let duplicateCount = 0;

    if (!Array.isArray(rawWords)) {
      return { words: [], invalidCount: 1, duplicateCount: 0 };
    }

    rawWords.forEach(function (raw) {
      const word = sanitizeImportedWord(raw, timestamp);
      if (!word) {
        invalidCount += 1;
        return;
      }
      if (uniqueWords.has(word.wordKey)) duplicateCount += 1;
      uniqueWords.set(word.wordKey, word);
    });

    return {
      words: Array.from(uniqueWords.values()),
      invalidCount: invalidCount,
      duplicateCount: duplicateCount,
    };
  }

  function validateWordDraft(draft) {
    const errors = {};
    if (!cleanText(draft && draft.vocabulary)) {
      errors.vocabulary = "Vocabulary is required.";
    }
    if (!cleanText(draft && draft.meaning)) {
      errors.meaning = "Meaning is required.";
    }
    return errors;
  }

  function filterAndSortWords(words, query, partOfSpeech, sortOrder) {
    const normalizedQuery = normalizeWord(query);
    const selectedPart = cleanText(partOfSpeech).toLowerCase();

    const filtered = words.filter(function (word) {
      const wordParts = normalizePartsOfSpeech(word.partsOfSpeech || word.partOfSpeech);
      const matchesPart = !selectedPart || selectedPart === "all" || wordParts.includes(selectedPart);
      if (!matchesPart) return false;
      if (!normalizedQuery) return true;
      return (
        normalizeWord(word.vocabulary).includes(normalizedQuery) ||
        normalizeWord(word.meaning).includes(normalizedQuery)
      );
    });

    return filtered.sort(function (a, b) {
      if (sortOrder === "z-a") {
        return b.vocabulary.localeCompare(a.vocabulary, "en", { sensitivity: "base", numeric: true });
      }
      return a.vocabulary.localeCompare(b.vocabulary, "en", { sensitivity: "base", numeric: true });
    });
  }

  function paginateWords(words, requestedPage, requestedPageSize) {
    const pageSize = Math.min(100, Math.max(1, Number(requestedPageSize) || 25));
    const totalPages = Math.max(1, Math.ceil(words.length / pageSize));
    const page = Math.min(totalPages, Math.max(1, Number(requestedPage) || 1));
    const start = (page - 1) * pageSize;
    return {
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
      items: words.slice(start, start + pageSize),
      start: words.length ? start + 1 : 0,
      end: Math.min(start + pageSize, words.length),
    };
  }

  function pickRandomWord(words, currentId, random) {
    if (!Array.isArray(words) || words.length === 0) return null;
    const candidates = words.length > 1 ? words.filter(function (word) { return word.id !== currentId; }) : words;
    const randomValue = typeof random === "function" ? random() : Math.random();
    const index = Math.min(candidates.length - 1, Math.floor(Math.max(0, randomValue) * candidates.length));
    return candidates[index] || candidates[0] || null;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  return {
    PARTS_OF_SPEECH: PARTS_OF_SPEECH,
    normalizeWord: normalizeWord,
    normalizePartOfSpeech: normalizePartOfSpeech,
    normalizePartsOfSpeech: normalizePartsOfSpeech,
    formatPartsOfSpeech: formatPartsOfSpeech,
    sanitizeImportedWord: sanitizeImportedWord,
    prepareImportedWords: prepareImportedWords,
    validateWordDraft: validateWordDraft,
    filterAndSortWords: filterAndSortWords,
    paginateWords: paginateWords,
    pickRandomWord: pickRandomWord,
    escapeHtml: escapeHtml,
  };
});
