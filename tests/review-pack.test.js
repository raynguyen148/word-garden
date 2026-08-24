const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function element() {
  return {
    ariaBusy: "false",
    classList: { add() {}, remove() {}, toggle() {} },
    hidden: false,
    innerHTML: "",
    offsetWidth: 0,
    setAttribute() {},
    style: {},
    textContent: "",
    querySelector() { return element(); },
    querySelectorAll() { return []; },
  };
}

function reviewElements() {
  const names = [
    "dictionaryView", "practicePacksView", "reviewView", "reviewContent",
    "reviewPackContext", "reviewCompletePackContext", "reviewPackName", "reviewCompletePackName",
    "reviewToolbar", "reviewModeSwitch", "reviewSessionHint", "shortcutGuide",
    "reviewDirectionLabel", "reviewPart", "reviewInstruction", "reviewPrompt", "reviewQuestion",
    "reviewSpeakButton", "reviewPronunciation", "reviewAnswerText", "reviewAnswerMeta",
    "reviewExample", "reviewAnswer", "showAnswerButton", "gradeButtons",
    "gradeAgainInterval", "gradeHardInterval", "gradeGoodInterval", "gradeEasyInterval",
    "reviewProgress", "reviewProgressLabel", "reviewProgressFill", "reviewCard",
    "reviewComplete", "reviewCompleteTitle", "reviewSummaryText", "reviewSummaryStats",
    "reviewCompleteBack", "reviewCompleteNextAction",
  ];
  return Object.fromEntries(names.map((name) => [name, element()]));
}

function createController(words) {
  const elements = reviewElements();
  const root = {};
  const context = {
    document: {
      body: {},
      documentElement: {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    window: root,
  };
  vm.runInNewContext(fs.readFileSync("review.js", "utf8"), context);

  const state = { answerShown: false, reviewMode: "eng-vie", reviewWord: null, words };
  const logic = {
    buildReviewQueue() { throw new Error("Pack review must not use the due-only queue"); },
    formatPartsOfSpeech() { return "Phrase"; },
    getPracticePacks() {
      return [{ title: "Direct push vs PR", total: 3, completedToday: false, spokenTodayRemaining: 3, spokenTodayCount: 0, speakReadyCount: 0 }];
    },
    gradeSrs(word) { return { srsReviewCount: (word.srsReviewCount || 0) + 1, srsDueAt: "2099-01-01T00:00:00.000Z" }; },
    normalizePartsOfSpeech() { return ["phrase"]; },
    previewGradeIntervals() { return { again: 1, hard: 1, good: 2, easy: 4 }; },
    formatInterval(days) { return `${days} day`; },
    wasReviewedToday() { return false; },
  };

  return {
    controller: root.createLexiloReview({
      elements,
      state,
      logic,
      icon(name) { return `<${name}>`; },
      speakWord() {},
      showToast() {},
      onGrade: async () => {},
    }),
    elements,
    state,
  };
}

test("a Practice Pack review includes every card and remains a fixed-size session", async () => {
  const words = ["direct push", "open a PR", "request a review"].map((vocabulary, index) => ({
    id: String(index),
    vocabulary,
    meaning: vocabulary,
    lesson: "Direct push vs PR",
    cardType: "phrase",
    partsOfSpeech: ["phrase"],
    srsReviewCount: 4,
    srsDueAt: "2099-01-01T00:00:00.000Z",
  }));
  const { controller, elements, state } = createController(words);

  controller.enter({ lesson: "Direct push vs PR", mode: "eng-vie", scope: "pack" });
  assert.equal(state.reviewWord.vocabulary, "direct push");
  assert.equal(elements.reviewProgressLabel.textContent, "0 / 3");
  assert.equal(elements.reviewModeSwitch.hidden, true);
  assert.match(elements.reviewSessionHint.innerHTML, /Review every card in this pack/);

  for (let index = 0; index < 3; index += 1) {
    controller.showAnswer();
    await controller.grade("again");
  }

  assert.equal(elements.reviewComplete.hidden, false);
  assert.equal(elements.reviewCompleteTitle.textContent, "Review complete!");
  assert.match(elements.reviewSummaryStats.innerHTML, /3\/3/);
  assert.match(elements.reviewSummaryStats.innerHTML, /Cards reviewed/);
  assert.equal(elements.reviewCompleteNextAction.hidden, false);
  assert.match(elements.reviewCompleteNextAction.innerHTML, /Start speaking · 3 left/);
});
