// @ts-nocheck
(function () {
  "use strict";

  const logic = window.DictionaryLogic;
  const storageModule = window.LexiloStorage;
  const viewModule = window.LexiloView;
  const backupModule = window.LexiloBackup;
  if (!logic || !storageModule || !viewModule || !backupModule || !window.createLexiloReview) {
    throw new Error("Word Garden could not load all required browser files.");
  }

  const state = {
    storage: null,
    ready: false,
    words: [],
    query: "",
    partOfSpeech: "all",
    contentType: "all",
    sortOrder: "a-z",
    page: 1,
    pageSize: 25,
    selectedIds: new Set(),
    currentPageIds: [],
    pendingDeleteIds: [],
    reviewMode: "eng-vie",
    reviewWord: null,
    answerShown: false,
    keepAdding: false,
    emptyAction: "add",
    lesson: "",
    lessonDrafts: [],
    practiceWordId: null,
  };
  const elements = {};
  let renderer;
  let review;
  let inlineTextTooltip;
  let inlineTextTooltipTimer;
  let inlineTextTooltipTarget;

  const INLINE_TEXT_TOOLTIP_DELAY = 1000;
  const THEME_STORAGE_KEY = "word-garden:theme";

  function getTheme() {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch (error) {
      return "light";
    }
  }

  function applyTheme(theme, shouldPersist) {
    const isDark = theme === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    elements.themeToggleLabel.textContent = isDark ? "Light" : "Dark";
    elements.themeToggleIcon.setAttribute("href", isDark ? "#icon-sun" : "#icon-moon");
    const action = isDark ? "light" : "dark";
    elements.themeToggle.setAttribute("aria-label", "Switch to " + action + " theme");
    elements.themeToggle.title = "Switch to " + action + " theme";
    document.getElementById("themeColor").content = isDark ? "#101827" : "#f8f5f2";

    if (!shouldPersist) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? "dark" : "light");
    } catch (error) {
      // The selected theme still applies for this page if browser storage is unavailable.
    }
  }

  function usesCommandKey() {
    const platform = navigator.userAgentData && navigator.userAgentData.platform
      ? navigator.userAgentData.platform
      : (navigator.platform || navigator.userAgent || "");
    return /mac|iphone|ipad|ipod/i.test(platform);
  }

  function updateShortcutHints() {
    const isMac = usesCommandKey();
    const shortcutAttribute = isMac ? "data-shortcut-mac" : "data-shortcut-windows";
    const searchDescription = isMac ? "Press Command F to focus search." : "Press Control F to focus search.";

    document.querySelectorAll("[data-shortcut-mac][data-shortcut-windows]").forEach(function (hint) {
      hint.textContent = hint.getAttribute(shortcutAttribute);
    });
    elements.searchShortcutDescription.textContent = searchDescription;
  }

  function cacheElements() {
    const ids = [
      "dictionaryView", "practicePacksView", "reviewView", "storageStatus", "importButton", "exportButton", "reviewButton", "practicePacksButton", "backToDictionaryButton", "practicePacksHomeButton", "reviewHomeButton", "practicePacksEmptyAddButton", "importInput",
      "themeToggle", "themeToggleLabel", "themeToggleIcon", "openLessonFromHeroButton",
      "totalCount", "toggleAddButton", "addPanel", "closeAddButton", "cancelAddButton", "addForm", "newVocabulary",
      "lessonPanel", "closeLessonButton", "cancelLessonButton", "lessonForm", "lessonTitle", "lessonText", "previewLessonButton", "lessonPreview", "lessonPreviewSummary", "lessonSaveActions", "saveLessonButton",
      "practicePacks", "practicePackList", "practicePacksEmpty", "packFilter",
      "searchInput", "searchShortcutDescription", "clearSearchButton", "contentTypeFilter", "partFilter", "vocabularySortButton", "pageSizeSelect", "bulkBar", "selectedCount",
      "clearSelectionButton", "deleteSelectedButton", "tableWrap", "wordsTableBody", "selectAllCheckbox", "emptyState",
      "emptyTitle", "emptyMessage", "emptyAddButton", "pagination", "rangeLabel", "previousPageButton", "nextPageButton",
      "pageButtons", "exitReviewButton", "reviewCard", "reviewDirectionLabel", "reviewPart",
      "reviewInstruction", "reviewPrompt", "reviewQuestion", "reviewSpeakButton", "reviewPronunciation", "reviewAnswer",
      "reviewAnswerText", "reviewAnswerMeta", "reviewExample", "showAnswerButton", "confirmDialog",
      "confirmTitle", "confirmMessage", "confirmCancelButton", "confirmDeleteButton", "toastRegion",
      "reviewDueBadge", "practicePackBadge", "gradeButtons", "gradeAgainInterval", "gradeHardInterval", "gradeGoodInterval", "gradeEasyInterval",
      "reviewProgress", "reviewProgressFill", "reviewProgressLabel",
      "reviewComplete", "reviewCompleteTitle", "reviewSummaryText", "reviewSummaryStats", "reviewCompleteBack",
      "reviewToolbar", "reviewModeSwitch", "reviewSessionHint", "shortcutGuide", "reviewContent", "reviewPackContext", "reviewPackName", "reviewCompletePackContext", "reviewCompletePackName", "reviewCompleteActions", "reviewCompleteNextAction",
      "practiceDialog", "practiceForm", "practiceDialogTitle", "practiceCardType", "practiceLesson", "practiceTags", "practiceSituation", "practiceCancelButton", "practicePreviewMode", "practicePreviewPrompt", "practicePreviewAnswer", "addPracticeDetails",
    ];
    ids.forEach(function (id) { elements[id] = document.getElementById(id); });
  }

  function showToast(title, message, type) {
    viewModule.showToast(elements, title, message, type);
  }

  function setStatus(status, label) {
    viewModule.setStorageStatus(elements, status, label);
  }

  function openAddPanel() {
    elements.addPanel.hidden = false;
    elements.toggleAddButton.setAttribute("aria-expanded", "true");
    window.requestAnimationFrame(function () { elements.newVocabulary.focus(); });
  }

  function openLessonPanel() {
    elements.lessonPanel.hidden = false;
    elements.addPanel.hidden = true;
    elements.toggleAddButton.setAttribute("aria-expanded", "false");
    window.requestAnimationFrame(function () { elements.lessonTitle.focus(); });
  }

  function openPracticePacks() {
    closeAddPanel(false);
    closeLessonPanel(false);
    elements.dictionaryView.hidden = true;
    elements.practicePacksView.hidden = false;
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    renderer.renderApp();
  }

  function closePracticePacks() {
    elements.practicePacksView.hidden = true;
    elements.dictionaryView.hidden = false;
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }

  function goDictionaryHome() {
    if (!elements.reviewView.hidden) review.exit();
    elements.practicePacksView.hidden = true;
    elements.dictionaryView.hidden = false;
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    renderer.renderApp();
  }

  function closeLessonPanel(reset) {
    elements.lessonPanel.hidden = true;
    if (!reset) return;
    elements.lessonForm.reset();
    state.lessonDrafts = [];
    elements.lessonPreview.hidden = true;
    elements.lessonPreview.innerHTML = "";
    elements.lessonSaveActions.hidden = true;
    elements.lessonPreviewSummary.textContent = "Paste your notes, then review the cards before saving.";
  }

  function handleSearchShortcut(event) {
    if (
      elements.dictionaryView.hidden ||
      elements.confirmDialog.open ||
      event.defaultPrevented ||
      event.isComposing ||
      event.repeat ||
      event.altKey ||
      event.shiftKey
    ) return;

    const isMac = usesCommandKey();
    const usesPrimaryModifier = isMac
      ? event.metaKey && !event.ctrlKey
      : event.ctrlKey && !event.metaKey;
    if (event.key.toLowerCase() === "f" && usesPrimaryModifier) {
      event.preventDefault();
      elements.searchInput.focus();
      elements.searchInput.select();
    }
  }

  function clearFormErrors() {
    elements.addForm.querySelectorAll(".field").forEach(function (field) { field.classList.remove("invalid"); });
    elements.addForm.querySelectorAll(".field-error").forEach(function (error) { error.textContent = ""; });
  }

  function closeAddPanel(reset) {
    elements.addPanel.hidden = true;
    elements.toggleAddButton.setAttribute("aria-expanded", "false");
    if (reset) {
      elements.addForm.reset();
      viewModule.syncPartPicker(elements.addForm.querySelector("[data-part-picker]"), ["noun"], "new word");
      syncAddPracticeDetails();
      clearFormErrors();
    }
  }

  function isPhrase(word) {
    return Boolean(word && logic.normalizePartsOfSpeech(word.partsOfSpeech || word.partOfSpeech).includes("phrase"));
  }

  function syncAddPracticeDetails() {
    const phraseSelected = Array.from(elements.addForm.querySelectorAll('input[name="partsOfSpeech"]:checked'))
      .some(function (input) { return input.value === "phrase"; });
    const fields = elements.addPracticeDetails.querySelectorAll("input, select, textarea");

    elements.addPracticeDetails.hidden = !phraseSelected;
    elements.addPracticeDetails.open = phraseSelected;
    fields.forEach(function (field) { field.disabled = !phraseSelected; });
    if (phraseSelected) elements.addForm.elements.cardType.value = "phrase";
  }

  function showFormErrors(errors) {
    clearFormErrors();
    Object.keys(errors).forEach(function (fieldName) {
      const input = elements.addForm.elements[fieldName];
      const error = elements.addForm.querySelector('[data-error-for="' + fieldName + '"]');
      const inputElement = input && typeof input.closest === "function"
        ? input
        : elements.addForm.querySelector('[name="' + fieldName + '"]');
      if (inputElement) inputElement.closest(".field").classList.add("invalid");
      if (error) error.textContent = errors[fieldName];
    });
    const firstInvalid = elements.addForm.querySelector(".field.invalid input");
    if (firstInvalid) firstInvalid.focus();
  }

  async function addWord(event) {
    event.preventDefault();
    if (!state.ready) {
      showToast("Storage is unavailable", "The dictionary could not connect to browser storage.", "error");
      return;
    }
    const data = new FormData(elements.addForm);
    const selectedParts = data.getAll("partsOfSpeech");
    const partsOfSpeech = logic.normalizePartsOfSpeech(selectedParts);
    const draft = {
      vocabulary: String(data.get("vocabulary") || "").trim(),
      // Store both fields during the transition: the array is canonical and
      // the primary value keeps legacy backups compatible.
      partOfSpeech: partsOfSpeech[0],
      partsOfSpeech: partsOfSpeech,
      meaning: String(data.get("meaning") || "").trim(),
      pronunciation: String(data.get("pronunciation") || "").trim(),
      example: String(data.get("example") || "").trim(),
      cardType: logic.normalizeCardType(data.get("cardType")),
      lesson: String(data.get("lesson") || "").trim(),
      tags: logic.normalizeTags(data.get("tags")),
      situation: String(data.get("situation") || "").trim(),
    };
    const errors = logic.validateWordDraft(draft);
    if (!selectedParts.length) errors.partsOfSpeech = "Choose at least one part of speech.";
    const wordKey = logic.normalizeWord(draft.vocabulary);
    if (state.words.some(function (word) { return word.wordKey === wordKey; })) {
      errors.vocabulary = "This word already exists. Edit it directly in the table instead.";
    }
    if (Object.keys(errors).length) {
      showFormErrors(errors);
      state.keepAdding = false;
      return;
    }

    const now = new Date().toISOString();
    const record = Object.assign({}, draft, { wordKey: wordKey, createdAt: now, updatedAt: now });
    clearFormErrors();
    setStatus("saving", "Saving…");
    try {
      const id = await state.storage.insertWord(record);
      state.words.push(Object.assign({}, record, { id: id }));
      state.page = 1;
      renderer.renderApp();
      showToast("Word added", draft.vocabulary + " is now in your dictionary.", "success");
      elements.addForm.reset();
      viewModule.syncPartPicker(elements.addForm.querySelector("[data-part-picker]"), ["noun"], "new word");
      if (state.keepAdding) elements.newVocabulary.focus();
      else closeAddPanel(false);
      setStatus("saved", "Saved locally");
    } catch (error) {
      setStatus("error", "Save failed");
      const duplicate = error && error.name === "ConstraintError";
      showToast("Could not add word", duplicate ? "That vocabulary already exists." : "Please try again.", "error");
    } finally {
      state.keepAdding = false;
    }
  }

  function findWord(id) {
    return state.words.find(function (word) { return word.id === id; }) || null;
  }

  async function saveInlineEdit(control, valueOverride) {
    const id = control.dataset.id;
    const field = control.dataset.field;
    const index = state.words.findIndex(function (word) { return word.id === id; });
    if (index < 0 || !field) return;
    const previous = state.words[index];
    let value = valueOverride === undefined ? control.value.trim() : valueOverride;
    if (field === "partOfSpeech") value = logic.normalizePartOfSpeech(value);
    if (field === "partsOfSpeech") value = logic.normalizePartsOfSpeech(value);
    if ((field === "vocabulary" || field === "meaning") && !value) {
      control.value = previous[field];
      showToast("A required field is empty", field === "vocabulary" ? "Vocabulary cannot be blank." : "Meaning cannot be blank.", "error");
      return;
    }

    const changes = { updatedAt: new Date().toISOString() };
    changes[field] = value;
    if (field === "partsOfSpeech") changes.partOfSpeech = value[0];
    if (field === "vocabulary") {
      const newKey = logic.normalizeWord(value);
      if (state.words.some(function (word) { return word.id !== id && word.wordKey === newKey; })) {
        control.value = previous.vocabulary;
        showToast("Vocabulary already exists", "Each word must be unique.", "error");
        return;
      }
      changes.wordKey = newKey;
    }

    state.words[index] = Object.assign({}, previous, changes);
    setStatus("saving", "Saving…");
    try {
      await state.storage.updateWord(id, changes);
      renderer.renderApp();
      setStatus("saved", "Saved locally");
    } catch (error) {
      const currentIndex = state.words.findIndex(function (word) { return word.id === id; });
      if (currentIndex >= 0) state.words[currentIndex] = previous;
      renderer.renderApp();
      setStatus("error", "Save failed");
      showToast("Change not saved", "Your previous value has been restored.", "error");
    }
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(textArea);
        textArea.select();
        const copied = document.execCommand("copy");
        textArea.remove();
        if (!copied) throw new Error("Copy failed.");
      }
      showToast("Copied", text + " was copied to your clipboard.", "success");
    } catch (error) {
      showToast("Copy unavailable", "Select the word and copy it manually.", "error");
    }
  }

  function speakWord(word, button) {
    if (!("speechSynthesis" in window)) {
      showToast("Pronunciation unavailable", "Speech is not supported by this browser.", "error");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.88;
    if (button) button.classList.add("speaking");
    utterance.onend = utterance.onerror = function () {
      if (button) button.classList.remove("speaking");
    };
    window.speechSynthesis.speak(utterance);
  }

  function openDeleteDialog(ids) {
    const validIds = ids.filter(function (id) { return Boolean(findWord(id)); });
    if (!validIds.length) return;
    state.pendingDeleteIds = validIds;
    const firstWord = findWord(validIds[0]);
    const count = validIds.length;
    elements.confirmTitle.textContent = count === 1 ? "Delete “" + firstWord.vocabulary + "”?" : "Delete " + count + " words?";
    elements.confirmMessage.textContent = count === 1
      ? "This word and its learning details will be permanently removed."
      : "The selected words and their learning details will be permanently removed.";
    elements.confirmDeleteButton.textContent = count === 1 ? "Delete word" : "Delete " + count + " words";
    elements.confirmDialog.showModal();
  }

  async function confirmDelete() {
    const ids = state.pendingDeleteIds.slice();
    if (!ids.length) return;
    const idSet = new Set(ids);
    const removed = state.words.filter(function (word) { return idSet.has(word.id); });
    elements.confirmDialog.close();
    state.pendingDeleteIds = [];
    state.words = state.words.filter(function (word) { return !idSet.has(word.id); });
    ids.forEach(function (id) { state.selectedIds.delete(id); });
    renderer.renderApp();
    setStatus("saving", "Saving…");
    try {
      await state.storage.removeWords(ids);
      setStatus("saved", "Saved locally");
      showToast(ids.length === 1 ? "Word deleted" : "Words deleted", ids.length === 1 ? "The word was removed." : ids.length + " words were removed.", "success");
    } catch (error) {
      state.words = state.words.concat(removed);
      renderer.renderApp();
      setStatus("error", "Delete failed");
      showToast("Could not delete", "The selected words were restored.", "error");
    }
  }

  function handleTableClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const word = findWord(button.dataset.id);
    if (!word) return;
    if (button.dataset.action === "practice") openPracticeDialog(word.id);
    if (button.dataset.action === "copy") copyText(word.vocabulary);
    if (button.dataset.action === "speak") speakWord(word.vocabulary, button);
    if (button.dataset.action === "delete") openDeleteDialog([word.id]);
  }

  function openPracticeDialog(id) {
    const word = findWord(id);
    if (!word) return;
    if (!isPhrase(word)) {
      showToast("Phrase practice only", "Choose Phrase as the part of speech before adding practice details.", "error");
      return;
    }
    state.practiceWordId = id;
    elements.practiceDialogTitle.textContent = "Practice “" + word.vocabulary + "”";
    elements.practiceCardType.value = word.cardType === "pattern" ? "pattern" : "phrase";
    elements.practiceLesson.value = word.lesson || "";
    elements.practiceTags.value = (word.tags || []).join(", ");
    elements.practiceSituation.value = word.situation || "";
    updatePracticePreview();
    elements.practiceDialog.showModal();
  }

  function updatePracticePreview() {
    const word = findWord(state.practiceWordId);
    if (!word) return;
    const situation = elements.practiceSituation.value.trim();
    const pattern = elements.practiceCardType.value === "pattern";

    elements.practicePreviewMode.textContent = pattern
      ? "Speaking pattern · Speak first"
      : "Production · Speak first";
    elements.practicePreviewPrompt.textContent = situation || "Add a situation prompt to see your production card.";
    elements.practicePreviewPrompt.classList.toggle("is-empty", !situation);
    elements.practicePreviewAnswer.hidden = !situation;
    elements.practicePreviewAnswer.textContent = situation ? word.vocabulary : "";
  }

  async function savePracticeDetails(event) {
    event.preventDefault();
    const id = state.practiceWordId;
    const word = findWord(id);
    if (!word) return;
    if (!isPhrase(word)) {
      elements.practiceDialog.close();
      showToast("Phrase practice only", "This entry is no longer marked as a phrase.", "error");
      return;
    }
    const data = new FormData(elements.practiceForm);
    const details = logic.sanitizePracticeDetails(Object.assign({}, word, {
      cardType: data.get("cardType") === "pattern" ? "pattern" : "phrase",
      lesson: data.get("lesson"),
      tags: data.get("tags"),
      situation: data.get("situation"),
    }));
    const changes = Object.assign({}, details, { updatedAt: new Date().toISOString() });
    setStatus("saving", "Saving…");
    try {
      await state.storage.updateWord(id, changes);
      const index = state.words.findIndex(function (item) { return item.id === id; });
      if (index >= 0) state.words[index] = Object.assign({}, word, changes);
      state.practiceWordId = null;
      elements.practiceDialog.close();
      renderer.renderApp();
      setStatus("saved", "Saved locally");
      showToast("Phrase practice saved", "This phrase is ready for focused review.", "success");
    } catch (error) {
      setStatus("error", "Save failed");
      showToast("Practice details not saved", "Please try again.", "error");
    }
  }

  function renderLessonPreview(cards, duplicateCount, invalidCount) {
    const e = logic.escapeHtml;
    elements.lessonPreview.innerHTML = cards.map(function (card, index) {
      const type = card.cardType === "pattern" ? "pattern" : "phrase";
      return '<article class="lesson-preview-card" data-index="' + index + '">' +
        '<div class="lesson-preview-card-heading"><strong>Card ' + (index + 1) + '</strong><button class="table-action danger" type="button" data-lesson-remove="' + index + '" aria-label="Remove card ' + (index + 1) + '">' + viewModule.icon("trash") + '</button></div>' +
        '<label class="field"><span>English <b aria-hidden="true">*</b></span><input data-lesson-field="vocabulary" value="' + e(card.vocabulary) + '"></label>' +
        '<label class="field"><span>Meaning <b aria-hidden="true">*</b></span><input data-lesson-field="meaning" value="' + e(card.meaning) + '"></label>' +
        '<label class="field"><span>Card type</span><select data-lesson-field="cardType">' +
          '<option value="phrase"' + (type === "phrase" ? " selected" : "") + '>Phrase</option><option value="pattern"' + (type === "pattern" ? " selected" : "") + '>Speaking pattern</option>' +
        '</select></label>' +
        '<label class="field"><span>Situation prompt</span><textarea data-lesson-field="situation" rows="3">' + e(card.situation || "") + '</textarea></label>' +
        '<label class="field"><span>Example</span><input data-lesson-field="example" value="' + e(card.example || "") + '"></label>' +
      '</article>';
    }).join("");
    elements.lessonPreview.hidden = cards.length === 0;
    elements.lessonSaveActions.hidden = cards.length === 0;
    const notes = [];
    notes.push(cards.length + (cards.length === 1 ? " card ready" : " cards ready"));
    if (duplicateCount) notes.push(duplicateCount + " duplicate line" + (duplicateCount === 1 ? "" : "s") + " merged");
    if (invalidCount) notes.push(invalidCount + " line" + (invalidCount === 1 ? " was" : "s were") + " skipped");
    elements.lessonPreviewSummary.textContent = notes.join(" · ") + ". Edit anything below before saving.";
  }

  function previewLesson() {
    const data = new FormData(elements.lessonForm);
    const title = String(data.get("lessonTitle") || "").trim();
    const text = String(data.get("lessonText") || "").trim();
    if (!title || !text) {
      showToast("Add a pack name and lesson text", "Use one English → Vietnamese pair per line.", "error");
      return;
    }
    const prepared = logic.preparePracticeLesson(text, { lesson: title, tags: data.get("lessonTags") });
    state.lessonDrafts = prepared.words;
    if (!state.lessonDrafts.length) {
      renderLessonPreview([], prepared.duplicateCount, prepared.invalidCount);
      showToast("No cards found", "Use an English → Vietnamese pair on each line.", "error");
      return;
    }
    renderLessonPreview(state.lessonDrafts, prepared.duplicateCount, prepared.invalidCount);
  }

  function collectLessonCards() {
    const formData = new FormData(elements.lessonForm);
    const lesson = String(formData.get("lessonTitle") || "").trim();
    const tags = logic.normalizeTags(formData.get("lessonTags"));
    return Array.from(elements.lessonPreview.querySelectorAll(".lesson-preview-card")).map(function (card) {
      const field = function (name) { return card.querySelector('[data-lesson-field="' + name + '"]'); };
      const type = field("cardType").value === "pattern" ? "pattern" : "phrase";
      return {
        vocabulary: field("vocabulary").value.trim(),
        meaning: field("meaning").value.trim(),
        partOfSpeech: "phrase",
        partsOfSpeech: ["phrase"],
        cardType: type,
        lesson: lesson,
        tags: tags,
        situation: field("situation").value.trim(),
        example: field("example").value.trim(),
        pronunciation: "",
      };
    });
  }

  async function saveLesson(event) {
    event.preventDefault();
    if (!state.lessonDrafts.length) return previewLesson();
    const rawCards = collectLessonCards();
    const prepared = logic.prepareImportedWords(rawCards, new Date().toISOString());
    if (!prepared.words.length) {
      showToast("No valid cards", "Each card needs English text and a meaning.", "error");
      return;
    }
    setStatus("saving", "Saving lesson…");
    try {
      const result = await state.storage.insertWords(prepared.words, state.words);
      state.words = await state.storage.getAllWords();
      state.lesson = String(new FormData(elements.lessonForm).get("lessonTitle") || "").trim();
      state.contentType = "practice";
      state.partOfSpeech = "all";
      state.page = 1;
      closeLessonPanel(true);
      renderer.renderApp();
      setStatus("saved", "Saved locally");
      const skipped = result.duplicateCount + prepared.duplicateCount;
      showToast("Practice pack saved", result.addedCount + " cards added" + (skipped ? ", " + skipped + " duplicates skipped" : "") + ".", "success");
    } catch (error) {
      setStatus("error", "Save failed");
      showToast("Practice pack not saved", "No cards were added. Please try again.", "error");
    }
  }

  function handleTableChange(event) {
    const target = event.target;
    if (target.classList.contains("row-checkbox")) {
      const id = target.dataset.id;
      if (target.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      const row = target.closest("tr");
      if (row) row.classList.toggle("selected", target.checked);
      renderer.renderSelection();
    } else if (target.dataset.field === "partsOfSpeech") {
      const picker = target.closest(".inline-part-picker");
      const selectedParts = picker
        ? Array.from(picker.querySelectorAll('input[type="checkbox"]:checked')).map(function (input) { return input.value; })
        : [];
      if (!selectedParts.length) {
        target.checked = true;
        showToast("Choose a part of speech", "Each word needs at least one category.", "error");
      }
      return;
    } else if (target.matches("[data-field]")) {
      saveInlineEdit(target);
    }
  }

  function closePartPickersOutside(event) {
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;

    document.querySelectorAll("[data-part-picker][open]").forEach(function (picker) {
      if (picker.contains(target)) return;

      if (picker.classList.contains("inline-part-picker")) commitInlinePartPicker(picker);
      picker.open = false;
    });
  }

  function hideInlineTextTooltip() {
    window.clearTimeout(inlineTextTooltipTimer);
    inlineTextTooltipTimer = undefined;
    if (inlineTextTooltipTarget) inlineTextTooltipTarget.removeAttribute("aria-describedby");
    inlineTextTooltipTarget = undefined;
    if (!inlineTextTooltip) return;
    inlineTextTooltip.hidden = true;
    inlineTextTooltip.textContent = "";
  }

  function positionInlineTextTooltip(target) {
    const targetRect = target.getBoundingClientRect();
    const edgeGap = 12;
    const offset = 8;
    const tooltipWidth = inlineTextTooltip.offsetWidth;
    const tooltipHeight = inlineTextTooltip.offsetHeight;
    const left = Math.max(edgeGap, Math.min(targetRect.left, window.innerWidth - tooltipWidth - edgeGap));
    const preferredTop = targetRect.bottom + offset;
    const top = preferredTop + tooltipHeight <= window.innerHeight - edgeGap
      ? preferredTop
      : Math.max(edgeGap, targetRect.top - tooltipHeight - offset);

    inlineTextTooltip.style.left = left + "px";
    inlineTextTooltip.style.top = top + "px";
  }

  function showInlineTextTooltip(target) {
    const text = target.value.trim();
    if (!text) return;
    inlineTextTooltipTarget = target;
    inlineTextTooltip.textContent = text;
    inlineTextTooltip.hidden = false;
    target.setAttribute("aria-describedby", inlineTextTooltip.id);
    positionInlineTextTooltip(target);
  }

  function scheduleInlineTextTooltip(event) {
    const target = event.target;
    if (!target.matches || !target.matches('input.word-input[data-field="vocabulary"], input.meaning-input[data-field="meaning"], textarea[data-field="example"]')) return;

    hideInlineTextTooltip();
    inlineTextTooltipTarget = target;
    inlineTextTooltipTimer = window.setTimeout(function () {
      if (inlineTextTooltipTarget === target && target.matches(":hover")) showInlineTextTooltip(target);
    }, INLINE_TEXT_TOOLTIP_DELAY);
  }

  function handleInlineTextTooltipLeave(event) {
    const target = event.target;
    if (target.matches && target.matches('input.word-input[data-field="vocabulary"], input.meaning-input[data-field="meaning"], textarea[data-field="example"]')) hideInlineTextTooltip();
  }

  function setupInlineTextTooltip() {
    inlineTextTooltip = document.createElement("div");
    inlineTextTooltip.id = "inlineTextTooltip";
    inlineTextTooltip.className = "inline-text-tooltip";
    inlineTextTooltip.setAttribute("role", "tooltip");
    inlineTextTooltip.hidden = true;
    document.body.appendChild(inlineTextTooltip);
  }

  function commitInlinePartPicker(picker) {
    const word = findWord(picker.dataset.id);
    if (!word) return;
    const selectedParts = Array.from(picker.querySelectorAll('input[type="checkbox"]:checked')).map(function (input) { return input.value; });
    const previousParts = logic.normalizePartsOfSpeech(word.partsOfSpeech || word.partOfSpeech);
    const nextParts = logic.normalizePartsOfSpeech(selectedParts);
    const unchanged = previousParts.length === nextParts.length && previousParts.every(function (part, index) { return part === nextParts[index]; });
    if (!selectedParts.length || unchanged) return;
    saveInlineEdit(picker, selectedParts);
  }

  async function importBackup(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!state.ready) {
      showToast("Storage is unavailable", "The backup cannot be restored right now.", "error");
      return;
    }
    try {
      const prepared = await backupModule.readBackup(file, logic);
      setStatus("saving", "Importing…");
      const result = await state.storage.importWords(prepared.words, state.words);
      state.words = await state.storage.getAllWords();
      state.selectedIds.clear();
      state.page = 1;
      renderer.renderApp();
      setStatus("saved", "Saved locally");
      const skipped = prepared.invalidCount ? ", " + prepared.invalidCount + " skipped" : "";
      showToast("Backup imported", result.addedCount + " added, " + result.updatedCount + " updated" + skipped + ".", "success");
    } catch (error) {
      setStatus("error", "Import failed");
      showToast("Could not import backup", error && error.message ? error.message : "Choose a valid Word Garden JSON backup.", "error");
    }
  }

  function bindListEvents() {
    elements.searchInput.addEventListener("input", function () {
      state.query = elements.searchInput.value;
      state.page = 1;
      elements.clearSearchButton.hidden = !state.query;
      renderer.renderApp();
    });
    elements.clearSearchButton.addEventListener("click", function () {
      elements.searchInput.value = "";
      state.query = "";
      state.page = 1;
      elements.clearSearchButton.hidden = true;
      renderer.renderApp();
      elements.searchInput.focus();
    });
    elements.partFilter.addEventListener("change", function () {
      state.partOfSpeech = elements.partFilter.value;
      state.page = 1;
      renderer.renderApp();
    });
    elements.contentTypeFilter.addEventListener("change", function () {
      state.contentType = elements.contentTypeFilter.value;
      if (state.contentType === "practice") {
        state.partOfSpeech = "all";
        elements.partFilter.value = "all";
      } else {
        state.lesson = "";
      }
      state.page = 1;
      renderer.renderApp();
    });
    elements.packFilter.addEventListener("change", function () {
      state.lesson = elements.packFilter.value;
      state.page = 1;
      renderer.renderApp();
    });
    elements.vocabularySortButton.addEventListener("click", function () {
      state.sortOrder = state.sortOrder === "a-z" ? "z-a" : "a-z";
      state.page = 1;
      renderer.renderApp();
    });
    elements.pageSizeSelect.addEventListener("change", function () {
      state.pageSize = Math.min(100, Number(elements.pageSizeSelect.value) || 25);
      state.page = 1;
      renderer.renderApp();
    });
    elements.wordsTableBody.addEventListener("click", handleTableClick);
    elements.wordsTableBody.addEventListener("change", handleTableChange);
    elements.wordsTableBody.addEventListener("pointerover", scheduleInlineTextTooltip);
    elements.wordsTableBody.addEventListener("pointerout", handleInlineTextTooltipLeave);
    elements.wordsTableBody.addEventListener("toggle", function (event) {
      const picker = event.target;
      if (!picker.matches || !picker.matches(".inline-part-picker")) return;
      if (!picker.open) commitInlinePartPicker(picker);
    }, true);
    elements.selectAllCheckbox.addEventListener("change", function () {
      state.currentPageIds.forEach(function (id) {
        if (elements.selectAllCheckbox.checked) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
      });
      renderer.renderApp();
    });
    elements.clearSelectionButton.addEventListener("click", function () {
      state.selectedIds.clear();
      renderer.renderApp();
    });
    elements.deleteSelectedButton.addEventListener("click", function () { openDeleteDialog(Array.from(state.selectedIds)); });
    elements.previousPageButton.addEventListener("click", function () {
      if (state.page > 1) { state.page -= 1; renderer.renderApp(); }
    });
    elements.nextPageButton.addEventListener("click", function () { state.page += 1; renderer.renderApp(); });
    elements.pageButtons.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-page]");
      if (button) { state.page = Number(button.dataset.page); renderer.renderApp(); }
    });
    elements.practicePackList.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-pack]");
      if (!button) return;
      const lesson = button.dataset.pack;
      if (button.dataset.action === "review-pack") review.enter({ lesson: lesson, mode: "eng-vie", scope: "pack" });
      if (button.dataset.action === "speak-pack") review.enter({ lesson: lesson, mode: "production", scope: "pack" });
    });
  }

  function bindEvents() {
    elements.themeToggle.addEventListener("click", function () {
      const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      applyTheme(currentTheme === "dark" ? "light" : "dark", true);
    });
    elements.toggleAddButton.addEventListener("click", function () {
      closeLessonPanel(false);
      if (elements.addPanel.hidden) openAddPanel();
      else closeAddPanel(false);
    });
    elements.closeAddButton.addEventListener("click", function () { closeAddPanel(false); });
    elements.cancelAddButton.addEventListener("click", function () { closeAddPanel(true); });
    elements.addForm.addEventListener("submit", addWord);
    elements.addForm.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        state.keepAdding = true;
        elements.addForm.requestSubmit();
      }
    });
    elements.addForm.addEventListener("input", function (event) {
      const field = event.target.closest(".field");
      if (!field) return;
      field.classList.remove("invalid");
      const error = field.querySelector(".field-error");
      if (error) error.textContent = "";
    });
    elements.addForm.addEventListener("change", function (event) {
      if (event.target.name === "partsOfSpeech") {
        viewModule.syncPartPicker(event.target.closest("[data-part-picker]"));
        syncAddPracticeDetails();
      }
    });
    elements.openLessonFromHeroButton.addEventListener("click", openLessonPanel);
    elements.practicePacksButton.addEventListener("click", openPracticePacks);
    elements.backToDictionaryButton.addEventListener("click", closePracticePacks);
    [elements.practicePacksHomeButton, elements.reviewHomeButton].forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        goDictionaryHome();
      });
    });
    elements.practicePacksEmptyAddButton.addEventListener("click", function () {
      closePracticePacks();
      openLessonPanel();
    });
    elements.closeLessonButton.addEventListener("click", function () { closeLessonPanel(false); });
    elements.cancelLessonButton.addEventListener("click", function () { closeLessonPanel(true); });
    elements.previewLessonButton.addEventListener("click", previewLesson);
    elements.lessonForm.addEventListener("submit", saveLesson);
    elements.lessonForm.addEventListener("input", function (event) {
      if (!event.target.matches("#lessonTitle, #lessonText, [name=lessonTags]")) return;
      state.lessonDrafts = [];
      elements.lessonSaveActions.hidden = true;
      elements.lessonPreview.hidden = true;
      elements.lessonPreviewSummary.textContent = "Your source changed. Preview the cards again before saving.";
    });
    elements.lessonPreview.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-lesson-remove]");
      if (!button) return;
      const index = Number(button.dataset.lessonRemove);
      const cards = collectLessonCards();
      cards.splice(index, 1);
      state.lessonDrafts = cards;
      renderLessonPreview(cards, 0, 0);
    });
    elements.practiceCancelButton.addEventListener("click", function () {
      state.practiceWordId = null;
      elements.practiceDialog.close();
    });
    elements.practiceForm.addEventListener("submit", savePracticeDetails);
    elements.practiceForm.addEventListener("input", updatePracticePreview);
    elements.practiceForm.addEventListener("change", updatePracticePreview);
    document.addEventListener("pointerdown", closePartPickersOutside);
    window.addEventListener("resize", hideInlineTextTooltip);
    window.addEventListener("scroll", hideInlineTextTooltip, true);
    elements.emptyAddButton.addEventListener("click", function () {
      if (state.emptyAction === "add") return openAddPanel();
      state.query = "";
      state.partOfSpeech = "all";
      state.contentType = "all";
      state.lesson = "";
      state.page = 1;
      elements.searchInput.value = "";
      elements.contentTypeFilter.value = "all";
      elements.partFilter.value = "all";
      elements.clearSearchButton.hidden = true;
      renderer.renderApp();
    });
    bindListEvents();

    elements.confirmCancelButton.addEventListener("click", function () {
      state.pendingDeleteIds = [];
      elements.confirmDialog.close();
    });
    elements.confirmDeleteButton.addEventListener("click", confirmDelete);
    elements.confirmDialog.addEventListener("cancel", function () { state.pendingDeleteIds = []; });
    elements.confirmDialog.addEventListener("click", function (event) {
      const rect = elements.confirmDialog.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) { state.pendingDeleteIds = []; elements.confirmDialog.close(); }
    });

    elements.importButton.addEventListener("click", function () { elements.importInput.click(); });
    elements.importInput.addEventListener("change", importBackup);
    elements.exportButton.addEventListener("click", function () {
      backupModule.exportBackup(state.words);
      showToast("Backup exported", state.words.length + (state.words.length === 1 ? " word was" : " words were") + " included.", "success");
    });
    elements.reviewButton.addEventListener("click", function () { review.enter({ mode: "eng-vie", scope: "vocabulary" }); });
    elements.exitReviewButton.addEventListener("click", function () { review.exit(); renderer.renderApp(); });
    elements.showAnswerButton.addEventListener("click", review.showAnswer);
    elements.reviewSpeakButton.addEventListener("click", review.speak);
    if (elements.reviewCompleteBack) {
      elements.reviewCompleteBack.addEventListener("click", function () { review.exit(); renderer.renderApp(); });
    }
    if (elements.reviewCompleteNextAction) {
      elements.reviewCompleteNextAction.addEventListener("click", function () { review.startSpeaking(); });
    }
    // Grade buttons (Again / Hard / Good / Easy).
    document.querySelectorAll(".grade-button").forEach(function (button) {
      button.addEventListener("click", function () { void review.grade(button.dataset.grade); });
    });
    document.querySelectorAll(".mode-button").forEach(function (button) {
      button.addEventListener("click", function () { review.setMode(button.dataset.mode); });
    });
    document.addEventListener("keydown", handleSearchShortcut);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        if (!elements.reviewView.hidden) {
          event.preventDefault();
          review.exit();
          renderer.renderApp();
          return;
        }
        if (!elements.practicePacksView.hidden) {
          event.preventDefault();
          closePracticePacks();
          return;
        }
        return;
      }
      if (elements.reviewView.hidden) return;
      if (event.key === " " && !event.repeat) { event.preventDefault(); review.showAnswer(); }
      if (event.key === "ArrowUp" && !event.repeat) { event.preventDefault(); review.speak(); }
      // Number keys 1-4 for grading.
      var gradeMap = { "1": "again", "2": "hard", "3": "good", "4": "easy" };
      if (gradeMap[event.key] && !event.repeat) { event.preventDefault(); void review.grade(gradeMap[event.key]); }
    });
  }

  async function initialize() {
    cacheElements();
    syncAddPracticeDetails();
    applyTheme(getTheme(), false);
    setupInlineTextTooltip();
    updateShortcutHints();
    renderer = viewModule.createRenderer(elements, state);
    review = window.createLexiloReview({
      elements: elements,
      state: state,
      logic: logic,
      showToast: showToast,
      speakWord: speakWord,
      icon: viewModule.icon,
      onGrade: async function (wordId, srsUpdate) {
        setStatus("saving", "Saving review…");
        try {
          await state.storage.updateWord(wordId, srsUpdate);
          renderer.renderApp();
          setStatus("saved", "Saved locally");
        } catch (error) {
          setStatus("error", "Save failed");
          throw error;
        }
      },
    });
    bindEvents();
    setStatus("saving", "Opening storage…");
    try {
      state.storage = await storageModule.open(function () {
        showToast("Dictionary updated elsewhere", "Reopen this page to continue safely.", "error");
      });
      state.words = await state.storage.getAllWords();
      state.ready = true;
      renderer.renderApp();
      setStatus("saved", "Saved locally");
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(function () {
          // Service worker is optional; the app works without it.
        });
      }
    } catch (error) {
      renderer.renderApp();
      setStatus("error", "Storage unavailable");
      showToast("Browser storage unavailable", "Try a current browser window with local data access enabled.", "error");
    }
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
