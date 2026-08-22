// @ts-nocheck
(function (root) {
  "use strict";

  function createReviewController(options) {
    var elements = options.elements;
    var state = options.state;
    var logic = options.logic;
    var showToast = options.showToast;
    var speakWord = options.speakWord;
    var icon = options.icon;
    var onGrade = options.onGrade;

    // Session-local queue and stats.
    var queue = [];
    var queueIndex = -1;
    var sessionTotal = 0;
    var sessionGraded = 0;
    var isGrading = false;

    function setGradeButtonsDisabled(disabled) {
      elements.gradeButtons.querySelectorAll(".grade-button").forEach(function (button) {
        button.disabled = disabled;
      });
      elements.gradeButtons.setAttribute("aria-busy", String(disabled));
    }

    function render(animate) {
      var word = state.reviewWord;
      if (!word) return;
      var englishFirst = state.reviewMode === "eng-vie";
      var prompt = englishFirst ? word.vocabulary : word.meaning;
      var answer = englishFirst ? word.meaning : word.vocabulary;
      var promptRow = elements.reviewQuestion.querySelector(".review-prompt-row");

      elements.reviewView.setAttribute("aria-labelledby", "reviewPrompt");
      elements.reviewContent.setAttribute("aria-labelledby", "reviewPrompt");
      elements.reviewToolbar.hidden = false;
      elements.shortcutGuide.hidden = false;
      elements.reviewWordCount.textContent = state.words.length + (state.words.length === 1 ? " word" : " words");
      elements.reviewDirectionLabel.textContent = englishFirst ? "English → Vietnamese" : "Vietnamese → English";
      var partsOfSpeech = logic.formatPartsOfSpeech(word.partsOfSpeech || word.partOfSpeech);
      elements.reviewPart.textContent = partsOfSpeech;
      elements.reviewInstruction.textContent = englishFirst ? "What does this word mean?" : "What is the English word?";
      elements.reviewPrompt.textContent = prompt;
      promptRow.classList.toggle("long-prompt", prompt.length > 28);
      elements.reviewSpeakButton.hidden = !englishFirst;
      elements.reviewPronunciation.hidden = !englishFirst || !word.pronunciation;
      elements.reviewPronunciation.textContent = word.pronunciation || "";
      elements.reviewAnswerText.textContent = answer;
      elements.reviewAnswerMeta.textContent = englishFirst
        ? partsOfSpeech
        : (word.pronunciation ? partsOfSpeech + " · " + word.pronunciation : partsOfSpeech);
      elements.reviewExample.hidden = !word.example;
      elements.reviewExample.textContent = word.example ? "\u201C" + word.example + "\u201D" : "";
      elements.reviewAnswer.hidden = !state.answerShown;
      elements.showAnswerButton.hidden = state.answerShown;
      elements.showAnswerButton.innerHTML = icon("eye") + "Show Answer";
      elements.gradeButtons.hidden = !state.answerShown;

      // Preview intervals on grade buttons.
      if (state.answerShown) {
        var now = new Date().toISOString();
        var previews = logic.previewGradeIntervals(word, now);
        elements.gradeAgainInterval.textContent = logic.formatInterval(previews.again);
        elements.gradeHardInterval.textContent = logic.formatInterval(previews.hard);
        elements.gradeGoodInterval.textContent = logic.formatInterval(previews.good);
        elements.gradeEasyInterval.textContent = logic.formatInterval(previews.easy);
      }

      // Progress bar.
      var reviewed = sessionGraded;
      var total = sessionTotal;
      elements.reviewProgress.hidden = false;
      elements.reviewProgressLabel.textContent = reviewed + " / " + total;
      var pct = total > 0 ? Math.round((reviewed / total) * 100) : 0;
      elements.reviewProgressFill.style.width = pct + "%";
      elements.reviewProgress.setAttribute("aria-valuemax", String(total));
      elements.reviewProgress.setAttribute("aria-valuenow", String(reviewed));

      // Hide complete screen, show card.
      elements.reviewCard.hidden = false;
      elements.reviewComplete.hidden = true;

      if (animate) {
        elements.reviewCard.classList.remove("card-enter");
        void elements.reviewCard.offsetWidth;
        elements.reviewCard.classList.add("card-enter");
      }
    }

    function renderComplete(message) {
      elements.reviewView.setAttribute("aria-labelledby", "reviewCompleteTitle");
      elements.reviewContent.setAttribute("aria-labelledby", "reviewCompleteTitle");
      elements.reviewWordCount.textContent = state.words.length + (state.words.length === 1 ? " word" : " words");
      elements.reviewToolbar.hidden = true;
      elements.shortcutGuide.hidden = true;
      elements.reviewCard.hidden = true;
      elements.reviewComplete.hidden = false;
      elements.reviewProgress.hidden = true;
      elements.reviewSummaryText.textContent = message || ("You reviewed " + sessionGraded + (sessionGraded === 1 ? " word" : " words") + ".");

      var stats = logic.getSrsStats(state.words, new Date().toISOString());
      elements.reviewSummaryStats.innerHTML =
        "<span><strong>" + stats.masterCount + "</strong><small>Mastered</small></span>" +
        "<span><strong>" + stats.reviewingCount + "</strong><small>Reviewing</small></span>" +
        "<span><strong>" + stats.learningCount + "</strong><small>Learning</small></span>" +
        "<span><strong>" + stats.newCount + "</strong><small>New</small></span>";
    }

    function enter() {
      if (!state.words.length) {
        showToast("Add a word first", "Your review session needs at least one saved word.", "error");
        return;
      }

      var now = new Date().toISOString();
      queue = logic.buildReviewQueue(state.words, now);
      queueIndex = 0;
      sessionTotal = queue.length;
      sessionGraded = 0;
      isGrading = false;

      if (!queue.length) {
        // No due words — show the complete screen directly.
        state.reviewWord = null;
        state.answerShown = false;
        elements.dictionaryView.hidden = true;
        elements.reviewView.hidden = false;
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        elements.reviewCard.hidden = true;
        renderComplete("All caught up! No words are due for review.");
        return;
      }

      state.reviewWord = queue[0];
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
      queue = [];
      queueIndex = -1;
      isGrading = false;
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    }

    function showAnswer() {
      if (state.answerShown || !state.reviewWord) return;
      state.answerShown = true;
      render(false);
    }

    async function grade(level) {
      if (isGrading || !state.reviewWord || !state.answerShown) return;

      var word = state.reviewWord;
      var now = new Date().toISOString();
      var newSrs;
      try {
        newSrs = logic.gradeSrs(word, level, now);
      } catch (error) {
        showToast("Review not saved", "Choose Again, Hard, Good, or Easy.", "error");
        return;
      }
      var changes = Object.assign({}, newSrs, { updatedAt: now });

      isGrading = true;
      setGradeButtonsDisabled(true);
      try {
        if (typeof onGrade === "function") await onGrade(word.id, changes);
      } catch (error) {
        isGrading = false;
        setGradeButtonsDisabled(false);
        showToast("Review progress not saved", "Try that rating again.", "error");
        return;
      }

      // Update the word in the in-memory state.
      var index = state.words.findIndex(function (w) { return w.id === word.id; });
      if (index >= 0) {
        state.words[index] = Object.assign({}, state.words[index], changes);
      }

      sessionGraded += 1;

      // If "Again", put the word back at the end of the queue.
      if (level === "again") {
        queue.push(Object.assign({}, word, changes));
        sessionTotal += 1;
      }

      isGrading = false;
      setGradeButtonsDisabled(false);

      // Move to next word in queue.
      queueIndex += 1;
      if (queueIndex < queue.length) {
        state.reviewWord = queue[queueIndex];
        state.answerShown = false;
        render(true);
      } else {
        // Session complete.
        state.reviewWord = null;
        renderComplete();
      }
    }

    function setMode(mode) {
      if (mode !== "eng-vie" && mode !== "vie-eng") return;
      state.reviewMode = mode;
      document.querySelectorAll(".mode-button").forEach(function (button) {
        var active = button.dataset.mode === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      state.answerShown = false;
      if (state.reviewWord) render(false);
    }

    function speak() {
      if (state.reviewWord) speakWord(state.reviewWord.vocabulary, elements.reviewSpeakButton);
    }

    return { enter: enter, exit: exit, showAnswer: showAnswer, grade: grade, setMode: setMode, speak: speak };
  }

  root.createLexiloReview = createReviewController;
})(window);
