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
    var sessionLesson = "";
    var sessionScope = "all";
    var sessionPackCardCount = 0;

    function setGradeButtonsDisabled(disabled) {
      elements.gradeButtons.querySelectorAll(".grade-button").forEach(function (button) {
        button.disabled = disabled;
      });
      elements.gradeButtons.setAttribute("aria-busy", String(disabled));
    }

    function renderPackContext(location) {
      var showPackContext = sessionScope === "pack" && Boolean(sessionLesson);
      elements.reviewPackContext.hidden = !showPackContext || location !== "review";
      elements.reviewCompletePackContext.hidden = !showPackContext || location !== "complete";
      if (!showPackContext) return;
      elements.reviewPackName.textContent = sessionLesson;
      elements.reviewCompletePackName.textContent = sessionLesson;
    }

    function render(animate) {
      var word = state.reviewWord;
      if (!word) return;
      var englishFirst = state.reviewMode === "eng-vie";
      var production = state.reviewMode === "production";
      var prompt = production ? (word.situation || word.meaning) : (englishFirst ? word.vocabulary : word.meaning);
      var answer = production ? word.vocabulary : (englishFirst ? word.meaning : word.vocabulary);
      var promptRow = elements.reviewQuestion.querySelector(".review-prompt-row");

      elements.reviewView.setAttribute("aria-labelledby", "reviewPrompt");
      elements.reviewContent.setAttribute("aria-labelledby", "reviewPrompt");
      renderPackContext("review");
      elements.reviewToolbar.hidden = false;
      elements.shortcutGuide.hidden = false;
      elements.reviewDirectionLabel.textContent = production ? "Production · Speak first" : (englishFirst ? "English → Vietnamese" : "Vietnamese → English");
      var partsOfSpeech = logic.formatPartsOfSpeech(word.partsOfSpeech || word.partOfSpeech);
      elements.reviewPart.textContent = word.cardType === "pattern" ? "Speaking pattern" : partsOfSpeech;
      elements.reviewInstruction.textContent = production
        ? "Say the English phrase aloud before revealing it."
        : (englishFirst ? "What does this word mean?" : "What is the English word?");
      elements.reviewPrompt.textContent = prompt;
      promptRow.classList.toggle("long-prompt", prompt.length > 28);
      elements.reviewSpeakButton.hidden = !englishFirst || production;
      elements.reviewPronunciation.hidden = !englishFirst || production || !word.pronunciation;
      elements.reviewPronunciation.textContent = word.pronunciation || "";
      elements.reviewAnswerText.textContent = answer;
      elements.reviewAnswerMeta.textContent = production
        ? word.meaning
        : (englishFirst ? partsOfSpeech : (word.pronunciation ? partsOfSpeech + " · " + word.pronunciation : partsOfSpeech));
      elements.reviewExample.hidden = !word.example;
      elements.reviewExample.textContent = word.example ? "\u201C" + word.example + "\u201D" : "";
      elements.reviewAnswer.hidden = !state.answerShown;
      elements.showAnswerButton.hidden = state.answerShown;
      elements.showAnswerButton.innerHTML = icon("eye") + (production ? "Reveal phrase" : "Show Answer");
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
      renderPackContext("complete");
      elements.reviewToolbar.hidden = true;
      elements.shortcutGuide.hidden = true;
      elements.reviewCard.hidden = true;
      elements.reviewComplete.hidden = false;
      elements.reviewProgress.hidden = true;
      var pack = sessionLesson && logic.getPracticePacks(state.words, new Date()).find(function (item) { return item.title === sessionLesson; });
      var packProduction = sessionScope === "pack" && state.reviewMode === "production";
      elements.reviewCompleteTitle.textContent = packProduction && pack && pack.completedToday
        ? "Complete for today!"
        : "Session complete!";
      elements.reviewSummaryText.textContent = message || (packProduction && pack
        ? "You spoke " + pack.spokenTodayCount + "/" + pack.total + " phrases in this pack today."
        : (state.reviewMode === "production"
        ? "You practised speaking " + sessionGraded + (sessionGraded === 1 ? " card" : " cards") + "."
        : "You reviewed " + sessionGraded + (sessionGraded === 1 ? " word" : " words") + "."));

      elements.reviewCompleteBack.innerHTML = icon("arrow-left") + (sessionScope === "pack" ? "Back to Practice review" : "Back to Dictionary");
      if (sessionScope === "pack" && pack) {
        elements.reviewSummaryStats.innerHTML =
          "<span><strong>" + pack.spokenTodayCount + "/" + pack.total + "</strong><small>Spoken today</small></span>" +
          "<span><strong>" + pack.speakReadyCount + "</strong><small>Spoken in total</small></span>";
        return;
      }

      var stats = logic.getSrsStats(state.words, new Date().toISOString());
      elements.reviewSummaryStats.innerHTML =
        "<span><strong>" + stats.masterCount + "</strong><small>Mastered</small></span>" +
        "<span><strong>" + stats.reviewingCount + "</strong><small>Reviewing</small></span>" +
        "<span><strong>" + stats.learningCount + "</strong><small>Learning</small></span>" +
        "<span><strong>" + stats.newCount + "</strong><small>New</small></span>";
    }

    function enter(options) {
      var settings = options && typeof options === "object" ? options : {};
      if (settings.mode) setMode(settings.mode, true);
      if (!state.words.length) {
        showToast("Add a word first", "Your review session needs at least one saved word.", "error");
        return;
      }

      sessionLesson = settings.lesson || "";
      sessionScope = settings.scope || (sessionLesson ? "pack" : "all");
      if (sessionScope === "vocabulary" && state.reviewMode === "production") setMode("eng-vie", true);
      var productionMode = document.querySelector('.mode-button[data-mode="production"]');
      if (productionMode) productionMode.hidden = sessionScope === "vocabulary";
      var eligibleWords = state.words.filter(function (word) {
        if (sessionLesson && word.lesson !== sessionLesson) return false;
        if (sessionScope === "vocabulary" && word.lesson) return false;
        // Production review is exclusively for configured phrase cards.
        if (state.reviewMode === "production") {
          var phrase = logic.normalizePartsOfSpeech(word.partsOfSpeech || word.partOfSpeech).includes("phrase");
          return phrase && Boolean(word.situation || word.cardType === "phrase" || word.cardType === "pattern");
        }
        return true;
      });
      if (!eligibleWords.length) {
        var vocabularyOnly = sessionScope === "vocabulary";
        showToast(vocabularyOnly ? "No vocabulary cards yet" : "No phrase practice cards yet", vocabularyOnly ? "Add a vocabulary card outside a Practice pack first." : "Mark an entry as Phrase, then add its practice details first.", "error");
        return;
      }

      var now = new Date().toISOString();
      sessionPackCardCount = sessionLesson ? eligibleWords.length : 0;
      var dailyPackSpeak = sessionScope === "pack" && state.reviewMode === "production";
      // A pack is deliberate study material: recognition review should always
      // include every card. Due-only queues remain for the main dictionary.
      var fullPackRecognition = sessionScope === "pack" && state.reviewMode !== "production";
      queue = dailyPackSpeak
        ? eligibleWords.filter(function (word) { return !logic.wasReviewedToday(word.productionLastReviewedAt, now); })
        : (fullPackRecognition ? eligibleWords.slice() : logic.buildReviewQueue(eligibleWords, now));
      queueIndex = 0;
      sessionTotal = queue.length;
      sessionGraded = 0;
      isGrading = false;

      if (!queue.length) {
        // No due words — show the complete screen directly.
        state.reviewWord = null;
        state.answerShown = false;
        elements.dictionaryView.hidden = true;
        if (elements.practicePacksView) elements.practicePacksView.hidden = true;
        elements.reviewView.hidden = false;
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        elements.reviewCard.hidden = true;
        renderComplete(dailyPackSpeak
          ? "This practice pack is complete for today."
          : (sessionScope === "pack" ? "No cards are due for this pack review right now." : "All caught up! No cards are due for this review."));
        return;
      }

      state.reviewWord = queue[0];
      state.answerShown = false;
      elements.dictionaryView.hidden = true;
      if (elements.practicePacksView) elements.practicePacksView.hidden = true;
      elements.reviewView.hidden = false;
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      render(true);
    }

    function exit() {
      if (root.speechSynthesis) root.speechSynthesis.cancel();
      elements.reviewView.hidden = true;
      var returnToPracticeReview = sessionScope === "pack";
      elements.dictionaryView.hidden = returnToPracticeReview;
      if (elements.practicePacksView) elements.practicePacksView.hidden = !returnToPracticeReview;
      elements.reviewPackContext.hidden = true;
      elements.reviewCompletePackContext.hidden = true;
      state.reviewWord = null;
      queue = [];
      queueIndex = -1;
      sessionLesson = "";
      sessionScope = "all";
      sessionPackCardCount = 0;
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
      var production = state.reviewMode === "production";
      var changes = Object.assign({}, newSrs, { updatedAt: now });
      if (production) {
        changes.productionReviewCount = (word.productionReviewCount || 0) + 1;
        changes.productionLastReviewedAt = now;
      } else {
        changes.recognitionReviewCount = (word.recognitionReviewCount || 0) + 1;
        changes.recognitionLastReviewedAt = now;
      }

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

    function setMode(mode, skipRestart) {
      if (mode !== "eng-vie" && mode !== "vie-eng" && mode !== "production") return;
      var changed = state.reviewMode !== mode;
      state.reviewMode = mode;
      document.querySelectorAll(".mode-button").forEach(function (button) {
        var active = button.dataset.mode === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      state.answerShown = false;
      if (state.reviewWord && changed && !skipRestart) {
        enter({ lesson: sessionLesson, mode: mode, scope: sessionScope });
      } else if (state.reviewWord) {
        render(false);
      }
    }

    function speak() {
      if (state.reviewWord && (state.reviewMode !== "production" || state.answerShown)) {
        speakWord(state.reviewWord.vocabulary, elements.reviewSpeakButton);
      }
    }

    return { enter: enter, exit: exit, showAnswer: showAnswer, grade: grade, setMode: setMode, speak: speak };
  }

  root.createLexiloReview = createReviewController;
})(window);
