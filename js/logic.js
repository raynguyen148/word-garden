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

  const CARD_TYPES = ["vocabulary", "phrase", "pattern"];

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

  function normalizeCardType(value) {
    const normalized = cleanText(value).toLowerCase();
    return CARD_TYPES.includes(normalized) ? normalized : "vocabulary";
  }

  function normalizeTags(value) {
    const values = Array.isArray(value)
      ? value
      : (typeof value === "string" ? value.split(/[\n,]/) : []);
    const seen = new Set();
    const tags = [];
    values.forEach(function (item) {
      const tag = cleanText(item).replace(/\s+/g, " ").slice(0, 48);
      const key = tag.toLocaleLowerCase("en-US");
      if (tag && !seen.has(key) && tags.length < 12) {
        seen.add(key);
        tags.push(tag);
      }
    });
    return tags;
  }

  function normalizeReviewSignal(value) {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
  }

  function sanitizePracticeDetails(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
      // Optional fields: older records remain ordinary vocabulary cards.
      cardType: normalizeCardType(source.cardType),
      lesson: cleanText(source.lesson || source.lessonTitle || source.practicePack).slice(0, 120),
      tags: normalizeTags(source.tags),
      situation: cleanText(source.situation || source.practicePrompt).slice(0, 420),
      recognitionReviewCount: normalizeReviewSignal(source.recognitionReviewCount),
      productionReviewCount: normalizeReviewSignal(source.productionReviewCount),
      recognitionLastReviewedAt: safeIsoDate(source.recognitionLastReviewedAt, null),
      productionLastReviewedAt: safeIsoDate(source.productionLastReviewedAt, null),
    };
  }

  function isPracticePackCard(word) {
    const source = word && typeof word === "object" ? word : {};
    return Boolean(cleanText(source.lesson)) &&
      normalizePartsOfSpeech(source.partsOfSpeech || source.partOfSpeech).includes("phrase");
  }

  function localDayKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [date.getFullYear(), date.getMonth(), date.getDate()].join("-");
  }

  function wasReviewedToday(value, now) {
    return Boolean(value) && localDayKey(value) === localDayKey(now || new Date());
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
      // SRS fields — preserved from backup when present and normalized so a
      // malformed backup cannot make a word disappear from the queue.
      ...normalizeSrs(raw),
      ...sanitizePracticeDetails(raw),
    };
  }

  function cleanLessonLine(line) {
    return cleanText(line)
      .replace(/^(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/^[“"]|[”"]$/g, "")
      .trim();
  }

  // Parse a copied lesson without depending on OCR or a remote service. The
  // preview remains editable in the UI before any card is saved.
  function preparePracticeLesson(text, options) {
    const settings = options && typeof options === "object" ? options : {};
    const lesson = cleanText(settings.lesson).slice(0, 120);
    const tags = normalizeTags(settings.tags);
    const lines = typeof text === "string" ? text.split(/\r?\n/) : [];
    const cards = [];
    let section = "phrases";

    lines.forEach(function (rawLine) {
      const line = cleanLessonLine(rawLine);
      if (!line) return;
      if (/^(?:key phrases|speaking pattern|practice this structure)/i.test(line)) {
        section = /speaking pattern|practice this structure/i.test(line) ? "pattern" : "phrases";
        return;
      }
      if (/^(?:for example|examples?)\s*:?$/i.test(line)) {
        section = "examples";
        return;
      }
      if (/^(?:this pattern|for the second practice|the goal is)/i.test(line)) return;

      const pair = line.match(/^(.+?)\s*(?:→|->|=>)\s*(.+)$/);
      if (pair) {
        const vocabulary = cleanLessonLine(pair[1]);
        const meaning = cleanText(pair[2]);
        if (!vocabulary || !meaning) return;
        cards.push({
          vocabulary: vocabulary,
          meaning: meaning,
          partOfSpeech: "phrase",
          partsOfSpeech: ["phrase"],
          cardType: "phrase",
          lesson: lesson,
          tags: tags,
          situation: "Trong work discussion, dùng khi: " + meaning,
          pronunciation: "",
          example: "",
        });
        return;
      }

      // Standalone English lines in a pattern/example section become useful
      // production cards. Headings and Vietnamese prose above are ignored.
      if (section !== "phrases" && /[A-Za-z]{3}/.test(line) && /[.!?]$/.test(line)) {
        const isPattern = section === "pattern";
        cards.push({
          vocabulary: line,
          meaning: isPattern ? "Speaking pattern for a technical plan." : "Example of a technical speaking pattern.",
          partOfSpeech: "phrase",
          partsOfSpeech: ["phrase"],
          cardType: isPattern ? "pattern" : "phrase",
          lesson: lesson,
          tags: tags,
          situation: isPattern
            ? "Nói cấu trúc này thành tiếng, rồi thay X, Y, Z và A bằng kế hoạch thực tế."
            : "Dùng ví dụ này làm model, rồi diễn đạt lại theo tình huống công việc của bạn.",
          pronunciation: "",
          example: "",
        });
      }
    });

    const prepared = prepareImportedWords(cards, new Date().toISOString());
    return Object.assign({}, prepared, { lesson: lesson });
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

  function filterAndSortWords(words, query, partOfSpeech, sortOrder, lesson, contentType) {
    const normalizedQuery = normalizeWord(query);
    const selectedPart = cleanText(partOfSpeech).toLowerCase();
    const selectedLesson = cleanText(lesson);
    const selectedContentType = ["vocabulary", "practice"].includes(contentType) ? contentType : "all";

    const filtered = words.filter(function (word) {
      const wordParts = normalizePartsOfSpeech(word.partsOfSpeech || word.partOfSpeech);
      const practiceCard = isPracticePackCard(word);
      if (selectedContentType === "vocabulary" && practiceCard) return false;
      if (selectedContentType === "practice" && !practiceCard) return false;
      const matchesPart = selectedContentType === "practice" || !selectedPart || selectedPart === "all" || wordParts.includes(selectedPart);
      if (!matchesPart) return false;
      if (selectedLesson && (word.lesson !== selectedLesson || !practiceCard)) return false;
      if (!normalizedQuery) return true;
      return (
        normalizeWord(word.vocabulary).includes(normalizedQuery) ||
        normalizeWord(word.meaning).includes(normalizedQuery) ||
        normalizeWord(word.lesson).includes(normalizedQuery) ||
        normalizeWord(word.situation).includes(normalizedQuery) ||
        (Array.isArray(word.tags) && word.tags.some(function (tag) { return normalizeWord(tag).includes(normalizedQuery); }))
      );
    });

    return filtered.sort(function (a, b) {
      if (sortOrder === "z-a") {
        return b.vocabulary.localeCompare(a.vocabulary, "en", { sensitivity: "base", numeric: true });
      }
      return a.vocabulary.localeCompare(b.vocabulary, "en", { sensitivity: "base", numeric: true });
    });
  }

  function getPracticePacks(words, now) {
    const referenceDate = now || new Date();
    const packs = new Map();
    (Array.isArray(words) ? words : []).forEach(function (word) {
      const wordParts = normalizePartsOfSpeech(word.partsOfSpeech || word.partOfSpeech);
      if (!wordParts.includes("phrase")) return;
      const details = sanitizePracticeDetails(word);
      if (!details.lesson) return;
      if (!packs.has(details.lesson)) {
        packs.set(details.lesson, {
          title: details.lesson,
          total: 0,
          phraseCount: 0,
          patternCount: 0,
          speakReadyCount: 0,
          spokenTodayCount: 0,
        });
      }
      const pack = packs.get(details.lesson);
      pack.total += 1;
      if (details.cardType === "pattern") pack.patternCount += 1;
      else if (details.cardType === "phrase") pack.phraseCount += 1;
      if (details.productionReviewCount > 0) pack.speakReadyCount += 1;
      if (wasReviewedToday(details.productionLastReviewedAt, referenceDate)) pack.spokenTodayCount += 1;
    });
    return Array.from(packs.values()).map(function (pack) {
      pack.spokenTodayRemaining = Math.max(0, pack.total - pack.spokenTodayCount);
      pack.completedToday = pack.total > 0 && pack.spokenTodayRemaining === 0;
      return pack;
    }).sort(function (a, b) {
      return a.title.localeCompare(b.title, "en", { sensitivity: "base" });
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

  // ── Spaced Repetition System (SM-2 simplified) ──────────────────────

  var DEFAULT_EASE = 2.5;
  var MIN_EASE = 1.3;
  var MAX_EASE = 3.0;
  var MAX_NEW_PER_SESSION = 10;
  var SRS_GRADES = ["again", "hard", "good", "easy"];

  function getDefaultSrs() {
    return { srsInterval: 0, srsEase: DEFAULT_EASE, srsDueAt: null, srsReviewCount: 0 };
  }

  function normalizeSrs(word) {
    var source = word && typeof word === "object" ? word : {};
    var interval = typeof source.srsInterval === "number" ? source.srsInterval : NaN;
    var ease = typeof source.srsEase === "number" ? source.srsEase : NaN;
    var reviewCount = typeof source.srsReviewCount === "number" ? source.srsReviewCount : NaN;
    var dueDate = typeof source.srsDueAt === "string" ? new Date(source.srsDueAt) : null;
    return {
      srsInterval: Number.isFinite(interval) ? Math.max(0, Math.floor(interval)) : 0,
      srsEase: Number.isFinite(ease) ? Math.min(MAX_EASE, Math.max(MIN_EASE, ease)) : DEFAULT_EASE,
      srsDueAt: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toISOString() : null,
      srsReviewCount: Number.isFinite(reviewCount) ? Math.max(0, Math.floor(reviewCount)) : 0,
    };
  }

  function addDays(isoString, days) {
    var date = new Date(isoString);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  }

  function normalizeNow(now) {
    var date = new Date(now || new Date().toISOString());
    if (Number.isNaN(date.getTime())) throw new RangeError("A valid review timestamp is required.");
    return date.toISOString();
  }

  function isDue(srs, nowTime) {
    if (srs.srsReviewCount === 0 || !srs.srsDueAt) return true;
    return new Date(srs.srsDueAt).getTime() <= nowTime;
  }

  /**
   * Compute the next SRS state after grading a word.
   * grade: "again" | "hard" | "good" | "easy"
   * now: ISO timestamp string
   */
  function gradeSrs(currentSrs, grade, now) {
    var srs = normalizeSrs(currentSrs);
    if (!SRS_GRADES.includes(grade)) throw new RangeError("Unknown review grade.");
    var reviewTime = normalizeNow(now);
    var interval = srs.srsInterval;
    var ease = srs.srsEase;
    var isNew = srs.srsReviewCount === 0;

    if (isNew || interval < 1) {
      // First review or re-learning
      switch (grade) {
        case "again": interval = 1; ease = Math.max(MIN_EASE, ease - 0.2); break;
        case "hard":  interval = 1; ease = Math.max(MIN_EASE, ease - 0.15); break;
        case "good":  interval = 1; break;
        case "easy":  interval = 4; ease = Math.min(MAX_EASE, ease + 0.15); break;
      }
    } else {
      // Reviewing (interval >= 1)
      switch (grade) {
        case "again": interval = 1; ease = Math.max(MIN_EASE, ease - 0.2); break;
        case "hard":  interval = Math.max(1, Math.round(interval * 1.2)); ease = Math.max(MIN_EASE, ease - 0.15); break;
        case "good":  interval = Math.max(1, Math.round(interval * ease)); break;
        case "easy":  interval = Math.max(1, Math.round(interval * ease * 1.3)); ease = Math.min(MAX_EASE, ease + 0.15); break;
      }
    }

    return {
      srsInterval: interval,
      srsEase: Math.round(ease * 100) / 100,
      srsDueAt: addDays(reviewTime, interval),
      srsReviewCount: srs.srsReviewCount + 1,
    };
  }

  /**
   * Preview what the next interval would be for each grade,
   * without actually modifying the SRS state.
   */
  function previewGradeIntervals(currentSrs, now) {
    var grades = ["again", "hard", "good", "easy"];
    var result = {};
    grades.forEach(function (grade) {
      result[grade] = gradeSrs(currentSrs, grade, now).srsInterval;
    });
    return result;
  }

  function getSrsLevel(word) {
    var srs = normalizeSrs(word);
    if (srs.srsReviewCount === 0) return "new";
    if (srs.srsInterval <= 3) return "learning";
    if (srs.srsInterval <= 20) return "reviewing";
    return "mastered";
  }

  function getDueWords(words, now) {
    if (!Array.isArray(words)) return [];
    var nowTime = new Date(normalizeNow(now)).getTime();
    return words.filter(function (word) {
      var srs = normalizeSrs(word);
      return isDue(srs, nowTime);
    });
  }

  function getSrsStats(words, now) {
    var nowTime = new Date(normalizeNow(now)).getTime();
    var stats = { newCount: 0, dueCount: 0, learningCount: 0, reviewingCount: 0, masterCount: 0 };
    (Array.isArray(words) ? words : []).forEach(function (word) {
      var srs = normalizeSrs(word);
      var level = getSrsLevel(word);
      if (level === "new") { stats.newCount += 1; stats.dueCount += 1; return; }
      if (level === "mastered") stats.masterCount += 1;
      else if (level === "learning") stats.learningCount += 1;
      else stats.reviewingCount += 1;
      if (isDue(srs, nowTime)) stats.dueCount += 1;
    });
    return stats;
  }

  function formatInterval(days) {
    if (!Number.isFinite(days) || days <= 0) return "< 1 day";
    if (days === 1) return "1 day";
    if (days < 7) return days + " days";
    if (days < 14) return "1 week";
    if (days < 30) return Math.round(days / 7) + " weeks";
    if (days < 60) return "1 month";
    if (days < 365) return Math.round(days / 30) + " months";
    return Math.round(days / 365) + " year" + (Math.round(days / 365) > 1 ? "s" : "");
  }

  /**
   * Build a review queue: due words first (shuffled), then new words
   * (shuffled, capped at maxNew). Returns an array of word objects.
   */
  function buildReviewQueue(words, now, maxNew, random) {
    if (!Array.isArray(words)) return [];
    var nowTime = new Date(normalizeNow(now)).getTime();
    var dueWords = [];
    var newWords = [];

    words.forEach(function (word) {
      var srs = normalizeSrs(word);
      if (srs.srsReviewCount === 0) {
        newWords.push(word);
      } else if (isDue(srs, nowTime)) {
        dueWords.push(word);
      }
    });

    var maxNewCount = typeof maxNew === "number" ? Math.max(0, Math.floor(maxNew)) : MAX_NEW_PER_SESSION;
    shuffle(dueWords, random);
    shuffle(newWords, random);
    var selectedNew = newWords.slice(0, maxNewCount);

    return dueWords.concat(selectedNew);
  }

  function shuffle(array, random) {
    var randomFn = typeof random === "function" ? random : Math.random;
    for (var i = array.length - 1; i > 0; i--) {
      var j = Math.floor(randomFn() * (i + 1));
      var temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
    return array;
  }

  return {
    PARTS_OF_SPEECH: PARTS_OF_SPEECH,
    CARD_TYPES: CARD_TYPES,
    normalizeWord: normalizeWord,
    normalizePartOfSpeech: normalizePartOfSpeech,
    normalizePartsOfSpeech: normalizePartsOfSpeech,
    formatPartsOfSpeech: formatPartsOfSpeech,
    sanitizeImportedWord: sanitizeImportedWord,
    sanitizePracticeDetails: sanitizePracticeDetails,
    isPracticePackCard: isPracticePackCard,
    wasReviewedToday: wasReviewedToday,
    normalizeCardType: normalizeCardType,
    normalizeTags: normalizeTags,
    prepareImportedWords: prepareImportedWords,
    preparePracticeLesson: preparePracticeLesson,
    validateWordDraft: validateWordDraft,
    filterAndSortWords: filterAndSortWords,
    getPracticePacks: getPracticePacks,
    paginateWords: paginateWords,
    pickRandomWord: pickRandomWord,
    escapeHtml: escapeHtml,
    getDefaultSrs: getDefaultSrs,
    normalizeSrs: normalizeSrs,
    gradeSrs: gradeSrs,
    previewGradeIntervals: previewGradeIntervals,
    getSrsLevel: getSrsLevel,
    getDueWords: getDueWords,
    getSrsStats: getSrsStats,
    formatInterval: formatInterval,
    buildReviewQueue: buildReviewQueue,
  };
});
