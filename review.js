// @ts-nocheck
(function (root) {
  "use strict";

  function createReviewController(options) {
    const elements = options.elements;
    const state = options.state;
    const logic = options.logic;
    const showToast = options.showToast;
    const speakWord = options.speakWord;
    const icon = options.icon;

    function render(animate) {
      const word = state.reviewWord;
      if (!word) return;
      const englishFirst = state.reviewMode === "eng-vie";
      const prompt = englishFirst ? word.vocabulary : word.meaning;
      const answer = englishFirst ? word.meaning : word.vocabulary;
      const promptRow = elements.reviewQuestion.querySelector(".review-prompt-row");

      elements.reviewWordCount.textContent = state.words.length + (state.words.length === 1 ? " word" : " words");
      elements.reviewDirectionLabel.textContent = englishFirst ? "English → Vietnamese" : "Vietnamese → English";
      elements.reviewPart.textContent = word.partOfSpeech;
      elements.reviewInstruction.textContent = englishFirst ? "What does this word mean?" : "What is the English word?";
      elements.reviewPrompt.textContent = prompt;
      promptRow.classList.toggle("long-prompt", prompt.length > 28);
      elements.reviewSpeakButton.hidden = !englishFirst;
      elements.reviewPronunciation.hidden = !englishFirst || !word.pronunciation;
      elements.reviewPronunciation.textContent = word.pronunciation || "";
      elements.reviewAnswerText.textContent = answer;
      elements.reviewAnswerMeta.textContent = englishFirst
        ? word.partOfSpeech.charAt(0).toUpperCase() + word.partOfSpeech.slice(1)
        : (word.pronunciation ? word.partOfSpeech + " · " + word.pronunciation : word.partOfSpeech);
      elements.reviewExample.hidden = !word.example;
      elements.reviewExample.textContent = word.example ? "“" + word.example + "”" : "";
      elements.reviewAnswer.hidden = !state.answerShown;
      elements.showAnswerButton.disabled = state.answerShown;
      elements.showAnswerButton.innerHTML = state.answerShown
        ? icon("check") + "Answer shown"
        : icon("eye") + "Show Answer";

      if (animate) {
        elements.reviewCard.classList.remove("card-enter");
        void elements.reviewCard.offsetWidth;
        elements.reviewCard.classList.add("card-enter");
      }
    }

    function enter() {
      if (!state.words.length) {
        showToast("Add a word first", "Your review session needs at least one saved word.", "error");
        return;
      }
      state.reviewWord = logic.pickRandomWord(state.words, null);
      state.answerShown = false;
      elements.dictionaryView.hidden = true;
      elements.reviewView.hidden = false;
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      render(true);
    }

    function exit() {
      if (root.speechSynthesis) root.speechSynthesis.cancel();
      elements.reviewView.hidden = true;
      elements.dictionaryView.hidden = false;
      state.reviewWord = null;
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    }

    function showAnswer() {
      if (state.answerShown || !state.reviewWord) return;
      state.answerShown = true;
      elements.reviewAnswer.hidden = false;
      elements.showAnswerButton.disabled = true;
      elements.showAnswerButton.innerHTML = icon("check") + "Answer shown";
    }

    function next() {
      if (!state.words.length) return;
      const currentId = state.reviewWord ? state.reviewWord.id : null;
      state.reviewWord = logic.pickRandomWord(state.words, currentId);
      state.answerShown = false;
      render(true);
    }

    function setMode(mode) {
      if (mode !== "eng-vie" && mode !== "vie-eng") return;
      state.reviewMode = mode;
      document.querySelectorAll(".mode-button").forEach(function (button) {
        const active = button.dataset.mode === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      state.answerShown = false;
      render(false);
    }

    function speak() {
      if (state.reviewWord) speakWord(state.reviewWord.vocabulary, elements.reviewSpeakButton);
    }

    return { enter: enter, exit: exit, showAnswer: showAnswer, next: next, setMode: setMode, speak: speak };
  }

  root.createLexiloReview = createReviewController;
})(window);
