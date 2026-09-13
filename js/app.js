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
    savingWord: false,
    savingLesson: false,
    practiceWordId: null,
  };
  const elements = {};
  let renderer;
  let review;
  let inlineTextTooltip;
  let inlineTextTooltipTimer;
  let inlineTextTooltipTarget;
  let searchRenderFrame = 0;
  let floatingFilterFrame = 0;
  let listMotionFrame = 0;
  let themeSwitchFrame = 0;
  let pendingSearchQuery = "";

  const INLINE_TEXT_TOOLTIP_DELAY = 800;
  const THEME_STORAGE_KEY = "word-garden:theme";
  const LAST_EXPORT_KEY = "word-garden:lastExportAt";
  const BACKUP_WARNING_DAYS = 10;

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function revealView(view) {
    if (!view) return;
    view.hidden = false;
    if (prefersReducedMotion()) return;
    view.classList.remove("view-enter");
    window.requestAnimationFrame(function () { view.classList.add("view-enter"); });
  }

  function closeDialogWithMotion(dialog) {
    if (!dialog || !dialog.open || prefersReducedMotion()) {
      if (dialog && dialog.open) dialog.close();
      return;
    }
    dialog.classList.remove("is-closing");
    window.requestAnimationFrame(function () { dialog.classList.add("is-closing"); });
    let finished = false;
    let fallbackTimer;
    const finish = function () {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallbackTimer);
      dialog.classList.remove("is-closing");
      if (dialog.open) dialog.close();
    };
    dialog.addEventListener("animationend", function (event) {
      if (event.target === dialog && event.animationName === "dialog-exit") finish();
    }, { once: true });
    fallbackTimer = window.setTimeout(finish, 220);
  }

  function animateListUpdate() {
    const tableWrap = elements.tableWrap;
    if (!tableWrap || tableWrap.hidden || prefersReducedMotion()) return;
    tableWrap.classList.remove("is-list-updating");
    if (listMotionFrame) window.cancelAnimationFrame(listMotionFrame);
    listMotionFrame = window.requestAnimationFrame(function () {
      tableWrap.classList.add("is-list-updating");
      listMotionFrame = 0;
    });
  }

  function renderListChange() {
    renderer.renderApp();
    animateListUpdate();
  }

  function scheduleSearchUpdate(value) {
    pendingSearchQuery = value;
    if (searchRenderFrame) return;
    searchRenderFrame = window.requestAnimationFrame(function () {
      searchRenderFrame = 0;
      state.query = pendingSearchQuery;
      state.page = 1;
      renderListChange();
    });
  }

  function cancelScheduledSearch() {
    if (searchRenderFrame) window.cancelAnimationFrame(searchRenderFrame);
    searchRenderFrame = 0;
  }

  function getTheme() {
    try {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      return THEMES.includes(storedTheme) ? storedTheme : "light";
    } catch (error) {
      return "light";
    }
  }

  const THEMES = ["light", "warm", "dark"];

  function applyTheme(theme, shouldPersist) {
    if (!THEMES.includes(theme)) theme = "light";
    const root = document.documentElement;
    const currentTheme = root.dataset.theme || "light";
    const isThemeChange = currentTheme !== theme;

    if (isThemeChange && !prefersReducedMotion()) {
      if (themeSwitchFrame) window.cancelAnimationFrame(themeSwitchFrame);
      root.classList.add("is-switching-theme");
      // Ensure component transitions are disabled before palette variables change.
      void root.offsetWidth;
    }

    if (theme === "light") {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = theme;
    }

    const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    
    let label = "Light";
    let icon = "#icon-sun";
    let nextLabel = "Warm";
    
    if (theme === "warm") {
      label = "Warm";
      icon = "#icon-coffee";
      nextLabel = "Dark";
    } else if (theme === "dark") {
      label = "Dark";
      icon = "#icon-moon";
      nextLabel = "Light";
    }
    
    // The user wants label to show current theme
    elements.themeToggleLabel.textContent = label;
    elements.themeToggleIcon.setAttribute("href", icon);
    
    const ariaLabel = "Switch to " + nextLabel + " theme";
    elements.themeToggle.setAttribute("aria-label", ariaLabel);
    
    // Tooltip format requested: Theme: Light (switch to Warm) [T]
    const tooltip = "Theme: " + label + " (switch to " + nextLabel + ") [T]";
    elements.themeToggle.title = tooltip;
    
    let metaColor = "#ffffff";
    if (theme === "warm") metaColor = "#f6f1e7"; // hsl(35, 33%, 96%) approx
    else if (theme === "dark") metaColor = "#18181b";
    else if (theme === "light") metaColor = "#f9fafb";
    document.getElementById("themeColor").content = metaColor;

    if (isThemeChange && !prefersReducedMotion()) {
      themeSwitchFrame = window.requestAnimationFrame(function () {
        themeSwitchFrame = window.requestAnimationFrame(function () {
          root.classList.remove("is-switching-theme");
          themeSwitchFrame = 0;
        });
      });
    }

    if (!shouldPersist) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
    }
  }

  function usesCommandKey() {
    const platform = navigator.userAgentData && navigator.userAgentData.platform
      ? navigator.userAgentData.platform
      : (navigator.platform || navigator.userAgent || "");
    return /mac|iphone|ipad|ipod/i.test(platform);
  }

  function saveLastExportTime() {
    try { window.localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString()); } catch (e) { /* ignore */ }
  }

  function updateBackupStatus() {
    if (!elements.lastExportStatus) return;
    var raw;
    try { raw = window.localStorage.getItem(LAST_EXPORT_KEY); } catch (e) { /* ignore */ }
    if (!raw) {
      elements.lastExportStatus.textContent = "Never backed up";
      elements.lastExportStatus.classList.add("overdue");
      elements.storageStatus.classList.add("overdue");
      elements.lastExportStatus.title = "Export a backup to keep your data safe";
      return;
    }
    var exportDate = new Date(raw);
    var now = new Date();
    var diffDays = Math.floor((now - exportDate) / (1000 * 60 * 60 * 24));
    var overdue = diffDays >= BACKUP_WARNING_DAYS;
    var label;
    if (diffDays === 0) label = "Backed up today";
    else if (diffDays === 1) label = "Backed up yesterday";
    else label = "Backed up " + diffDays + "d ago";
    elements.lastExportStatus.textContent = label;
    elements.lastExportStatus.classList.toggle("overdue", overdue);
    elements.storageStatus.classList.toggle("overdue", overdue);
    elements.lastExportStatus.title = overdue
      ? "It\u2019s been " + diffDays + " days since your last export. Back up now to keep your data safe."
      : "Last export: " + exportDate.toLocaleDateString();
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
      "dictionaryView", "practicePacksView", "reviewView", "storageStatus", "lastExportStatus", "importButton", "exportButton", "reviewButton", "practicePacksButton", "backToDictionaryButton", "practicePacksHomeButton", "reviewHomeButton", "practicePacksEmptyAddButton", "importInput",
      "themeToggle", "themeToggleLabel", "themeToggleIcon", "openLessonFromHeroButton",
      "totalCount", "toggleAddButton", "addPanel", "closeAddButton", "cancelAddButton", "addForm", "newVocabulary",
      "lessonPanel", "closeLessonButton", "cancelLessonButton", "lessonForm", "lessonTitle", "lessonText", "previewLessonButton", "lessonPreview", "lessonPreviewSummary", "lessonSaveActions", "saveLessonButton",
      "practicePacks", "practicePackList", "practicePacksEmpty", "packFilter", "practicePacksCount", "practicePacksCountLabel", "practicePacksAddLessonButton", "practicePacksIntroActions",
      "dictionaryToolbar", "toolbarFiltersToggle", "toolbarFiltersToggleBadge", "toolbarFilterDetails", "filteredResultsCount", "clearAllFiltersButton", "activeFiltersCountBadge", "floatingFilterBar", "floatingFiltersToggle", "floatingFiltersToggleBadge", "floatingFilterDetails", "floatingSearchInput", "floatingClearSearchButton", "floatingFilteredResultsCount", "floatingClearAllFiltersButton", "floatingActiveFiltersCountBadge", "floatingContentTypeFilter", "floatingPartFilter", "floatingPackFilter", "floatingPageSizeSelect",
      "searchInput", "searchShortcutDescription", "clearSearchButton", "contentTypeFilter", "partFilter", "vocabularySortButton", "pageSizeSelect", "bulkBar", "selectedCount",
      "clearSelectionButton", "deleteSelectedButton", "tableWrap", "wordsTableBody", "selectAllCheckbox", "emptyState",
      "emptyTitle", "emptyMessage", "emptyAddSearchButton", "emptyAddSearchLabel", "emptyAddButton", "pagination", "rangeLabel", "previousPageButton", "nextPageButton",
      "pageButtons", "exitReviewButton", "reviewCard", "reviewDirectionLabel", "reviewPart",
      "reviewInstruction", "reviewPrompt", "reviewQuestion", "reviewSpeakButton", "reviewPronunciation", "reviewAnswer",
      "reviewAnswerText", "reviewAnswerMeta", "reviewExample", "showAnswerButton", "confirmDialog",
      "confirmTitle", "confirmMessage", "confirmCancelButton", "confirmDeleteButton", "toastRegion",
      "reviewDueBadge", "practicePackBadge", "gradeButtons", "gradeAgainInterval", "gradeHardInterval", "gradeGoodInterval", "gradeEasyInterval",
      "reviewProgress", "reviewProgressFill", "reviewProgressLabel",
      "reviewComplete", "confettiContainer", "reviewCompleteTitle", "reviewSummaryText", "reviewSummaryStats", "reviewCompleteBack",
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

  function openAddPanel(vocabulary) {
    elements.addPanel.hidden = false;
    elements.toggleAddButton.setAttribute("aria-expanded", "true");
    if (typeof vocabulary === "string") {
      elements.newVocabulary.value = vocabulary;
      elements.newVocabulary.removeAttribute("aria-invalid");
      const vocabularyError = document.getElementById("error-vocabulary");
      if (vocabularyError) vocabularyError.textContent = "";
    }
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
    revealView(elements.practicePacksView);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    renderer.renderApp();
  }

  function closePracticePacks() {
    elements.practicePacksView.hidden = true;
    revealView(elements.dictionaryView);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }

  function goDictionaryHome() {
    if (!elements.reviewView.hidden) review.exit();
    elements.practicePacksView.hidden = true;
    revealView(elements.dictionaryView);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    renderer.renderApp();
  }

  function closeLessonPanel(reset) {
    const hadFocus = elements.lessonPanel.contains(document.activeElement);
    elements.lessonPanel.hidden = true;
    if (hadFocus) elements.openLessonFromHeroButton.focus({ preventScroll: true });
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
      elements.practiceDialog.open ||
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
      const floatingBarVisible = elements.floatingFilterBar
        && elements.floatingFilterBar.classList.contains("is-visible")
        && elements.floatingFilterBar.getAttribute("aria-hidden") !== "true";
      const targetSearchInput = floatingBarVisible
        ? elements.floatingSearchInput
        : elements.searchInput;
      targetSearchInput.focus({ preventScroll: true });
      targetSearchInput.select();
    }
  }

  function clearFormErrors() {
    elements.addForm.querySelectorAll(".field").forEach(function (field) { field.classList.remove("invalid"); });
    elements.addForm.querySelectorAll(".field-error").forEach(function (error) { error.textContent = ""; });
    elements.addForm.querySelectorAll('[aria-invalid]').forEach(function (input) { input.removeAttribute("aria-invalid"); });
  }

  function closeAddPanel(reset) {
    const hadFocus = elements.addPanel.contains(document.activeElement);
    elements.addPanel.hidden = true;
    if (hadFocus) elements.toggleAddButton.focus({ preventScroll: true });
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
      if (inputElement) {
        inputElement.closest(".field").classList.add("invalid");
        inputElement.setAttribute("aria-invalid", "true");
        const picker = inputElement.closest("[data-part-picker]");
        if (picker) picker.open = true;
      }
      if (error) error.textContent = errors[fieldName];
    });
    const firstInvalid = elements.addForm.querySelector(".field.invalid input");
    if (firstInvalid) firstInvalid.focus();
  }

  async function addWord(event) {
    event.preventDefault();
    if (state.savingWord) return;
    if (!state.ready) {
      showToast("Storage is unavailable", "The dictionary could not connect to browser storage.", "error");
      return;
    }
    const data = new FormData(elements.addForm);
    const selectedParts = data.getAll("partsOfSpeech");
    const partsOfSpeech = logic.normalizePartsOfSpeech(selectedParts);
    const lesson = String(data.get("lesson") || "").trim();
    const draft = {
      vocabulary: String(data.get("vocabulary") || "").trim(),
      // Store both fields during the transition: the array is canonical and
      // the primary value keeps legacy backups compatible.
      partOfSpeech: partsOfSpeech[0],
      partsOfSpeech: partsOfSpeech,
      meaning: String(data.get("meaning") || "").trim(),
      pronunciation: String(data.get("pronunciation") || "").trim(),
      example: String(data.get("example") || "").trim(),
      // A phrase is still an ordinary dictionary record until it is assigned
      // to a named practice pack. Keep practice-only metadata out of it.
      cardType: lesson ? logic.normalizeCardType(data.get("cardType")) : "vocabulary",
      lesson: lesson,
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
    state.savingWord = true;
    const submit = elements.addForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    elements.addForm.setAttribute("aria-busy", "true");
    setStatus("saving", "Saving…");
    try {
      const id = await state.storage.insertWord(record);
      state.words.push(Object.assign({}, record, { id: id }));
      state.page = 1;
      renderer.renderApp();
      showToast("Word added", draft.vocabulary + " is now in your dictionary.", "success");
      elements.addForm.reset();
      viewModule.syncPartPicker(elements.addForm.querySelector("[data-part-picker]"), ["noun"], "new word");
      syncAddPracticeDetails();
      if (state.keepAdding) elements.newVocabulary.focus();
      else closeAddPanel(false);
      setStatus("saved", "Saved locally");
    } catch (error) {
      setStatus("error", "Save failed");
      const duplicate = error && error.name === "ConstraintError";
      showToast("Could not add word", duplicate ? "That vocabulary already exists." : "Please try again.", "error");
    } finally {
      state.savingWord = false;
      submit.disabled = false;
      elements.addForm.setAttribute("aria-busy", "false");
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

    const previousParts = logic.normalizePartsOfSpeech(previous.partsOfSpeech || previous.partOfSpeech);
    const isUnchanged = field === "partsOfSpeech"
      ? previousParts.length === value.length && previousParts.every(function (part, i) { return part === value[i]; })
      : previous[field] === value;
    if (isUnchanged) return;

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
      showToast("Word updated", "Your changes have been saved.", "success");

      const targetSelector = field === "partsOfSpeech"
        ? '.inline-part-picker[data-id="' + id + '"] .part-picker-trigger'
        : '[data-id="' + id + '"][data-field="' + field + '"]';
      const updatedControl = elements.wordsTableBody ? elements.wordsTableBody.querySelector(targetSelector) : null;
      if (updatedControl) {
        updatedControl.classList.remove("save-pulse");
        void updatedControl.offsetWidth;
        updatedControl.classList.add("save-pulse");
        window.setTimeout(function () {
          if (updatedControl) updatedControl.classList.remove("save-pulse");
        }, 650);
      }
    } catch (error) {
      const currentIndex = state.words.findIndex(function (word) { return word.id === id; });
      if (currentIndex >= 0) state.words[currentIndex] = previous;
      renderer.renderApp();
      setStatus("error", "Save failed");
      showToast("Change not saved", "Your previous value has been restored.", "error");
    }
  }

  async function copyText(text, button) {
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
      if (button && viewModule && typeof viewModule.showCopyFeedback === "function") {
        viewModule.showCopyFeedback(button);
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
    closeDialogWithMotion(elements.confirmDialog);
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
    if (button.dataset.action === "copy") copyText(word.vocabulary, button);
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
      closeDialogWithMotion(elements.practiceDialog);
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
      closeDialogWithMotion(elements.practiceDialog);
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
    if (state.savingLesson) return;
    if (!state.lessonDrafts.length) return previewLesson();
    const rawCards = collectLessonCards();
    const prepared = logic.prepareImportedWords(rawCards, new Date().toISOString());
    if (prepared.invalidCount) {
      const cards = elements.lessonPreview.querySelectorAll(".lesson-preview-card");
      rawCards.forEach(function (card, index) {
        Object.keys(logic.validateWordDraft(card)).forEach(function (field) {
          const control = cards[index].querySelector('[data-lesson-field="' + field + '"]');
          control.setAttribute("aria-invalid", "true");
        });
      });
      elements.lessonPreviewSummary.textContent = "Nothing saved. Fill in English and meaning for every card, or remove incomplete cards.";
      const invalid = elements.lessonPreview.querySelector('[aria-invalid="true"]');
      if (invalid) invalid.focus();
      return;
    }
    if (!prepared.words.length) {
      showToast("No valid cards", "Each card needs English text and a meaning.", "error");
      return;
    }
    setStatus("saving", "Saving lesson…");
    state.savingLesson = true;
    elements.saveLessonButton.disabled = true;
    elements.lessonForm.setAttribute("aria-busy", "true");
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
    } finally {
      state.savingLesson = false;
      elements.saveLessonButton.disabled = false;
      elements.lessonForm.setAttribute("aria-busy", "false");
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
    if (inlineTextTooltipTarget) {
      const descriptions = (inlineTextTooltipTarget.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (id) { return id && id !== "inlineTextTooltip"; });
      if (descriptions.length) inlineTextTooltipTarget.setAttribute("aria-describedby", descriptions.join(" "));
      else inlineTextTooltipTarget.removeAttribute("aria-describedby");
    }
    inlineTextTooltipTarget = null;
    if (inlineTextTooltip) inlineTextTooltip.hidden = true;
  }

  function showInlineTextTooltip(target) {
    if (!target.isConnected || target.closest("[hidden], [inert]")) return;
    const text = target.getAttribute("data-tooltip") || (target.value || "").trim();
    if (!text) return;
    inlineTextTooltipTarget = target;
    // Parse [Shortcut] to <kbd>Shortcut</kbd>
    const formattedText = text.replace(/\[(.*?)\]/g, '<kbd>$1</kbd>');
    inlineTextTooltip.innerHTML = formattedText;
    inlineTextTooltip.hidden = false;
    // A dialog's tooltip must be inside its top layer and focus boundary.
    const host = target.closest("dialog") || document.body;
    if (inlineTextTooltip.parentNode !== host) host.appendChild(inlineTextTooltip);
    const descriptions = (target.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    if (!descriptions.includes(inlineTextTooltip.id)) descriptions.push(inlineTextTooltip.id);
    target.setAttribute("aria-describedby", descriptions.join(" "));
    const rect = target.getBoundingClientRect();
    const gap = 12;
    inlineTextTooltip.style.left = Math.max(gap, Math.min(rect.left, innerWidth - inlineTextTooltip.offsetWidth - gap)) + "px";
    inlineTextTooltip.style.top = Math.max(gap, rect.bottom + inlineTextTooltip.offsetHeight + gap < innerHeight ? rect.bottom + 8 : rect.top - inlineTextTooltip.offsetHeight - 8) + "px";
  }

  function tooltipTarget(target) {
    return target && target.closest && target.closest('[data-tooltip], input.word-input, textarea.meaning-input, textarea[data-field="example"]');
  }

  function scheduleInlineTextTooltip(event) {
    const target = tooltipTarget(event.target);
    if (!target || target === inlineTextTooltipTarget || event.pointerType === "touch") return;
    hideInlineTextTooltip();
    inlineTextTooltipTarget = target;
    inlineTextTooltipTimer = window.setTimeout(function () {
      if (target === inlineTextTooltipTarget && target.matches(":hover")) showInlineTextTooltip(target);
    }, INLINE_TEXT_TOOLTIP_DELAY);
  }

  function handleInlineTextTooltipLeave(event) {
    if (inlineTextTooltipTarget && inlineTextTooltipTarget.contains(event.relatedTarget)) return;
    if (event.relatedTarget && inlineTextTooltip.contains(event.relatedTarget)) return;
    if (tooltipTarget(event.target)) hideInlineTextTooltip();
  }

  function setupInlineTextTooltip() {
    inlineTextTooltip = document.createElement("div");
    inlineTextTooltip.id = "inlineTextTooltip";
    inlineTextTooltip.className = "inline-text-tooltip";
    inlineTextTooltip.setAttribute("role", "tooltip");
    inlineTextTooltip.hidden = true;
    document.body.appendChild(inlineTextTooltip);
    function syncTitles() {
      document.querySelectorAll("[title]").forEach(function (target) {
        if (!target.title) return;
        if (target === inlineTextTooltipTarget && inlineTextTooltip) {
          const formattedText = target.title.replace(/\[(.*?)\]/g, '<kbd>$1</kbd>');
          inlineTextTooltip.innerHTML = formattedText;
        }
        target.setAttribute("data-tooltip", target.title);
        target.removeAttribute("title");
      });
    }
    syncTitles();
    new MutationObserver(syncTitles).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["title"] });
    document.addEventListener("pointerover", scheduleInlineTextTooltip);
    document.addEventListener("pointerout", handleInlineTextTooltipLeave);
    document.addEventListener("focusin", function (event) {
      hideInlineTextTooltip();
      const target = tooltipTarget(event.target);
      if (target) showInlineTextTooltip(target);
    });
    document.addEventListener("focusout", hideInlineTextTooltip);
    document.addEventListener("input", hideInlineTextTooltip);
    document.addEventListener("pointerdown", hideInlineTextTooltip);
    document.addEventListener("keydown", function (event) { if (event.key === "Escape") hideInlineTextTooltip(); });
    inlineTextTooltip.addEventListener("pointerleave", hideInlineTextTooltip);
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

  function summarizeImportedWords(words) {
    var total = Array.isArray(words) ? words.length : 0;
    var standalonePractice = 0;
    var inPackPractice = 0;
    var packSet = new Set();

    (Array.isArray(words) ? words : []).forEach(function (word) {
      var cardType = logic.normalizeCardType(word && word.cardType);
      if (cardType !== "phrase" && cardType !== "pattern") return;
      var parts = logic.normalizePartsOfSpeech(word && (word.partsOfSpeech || word.partOfSpeech));
      if (!parts.includes("phrase")) return;
      var lesson = String((word && word.lesson) || "").trim();
      if (lesson) {
        inPackPractice += 1;
        packSet.add(lesson);
      } else {
        standalonePractice += 1;
      }
    });

    return {
      total: total,
      standalonePractice: standalonePractice,
      inPackPractice: inPackPractice,
      packCount: packSet.size,
    };
  }

  function buildImportSummaryMessage(result, summary, invalidCount) {
    var added = result.addedCount;
    var updated = result.updatedCount;
    var skipped = invalidCount ? invalidCount : 0;
    var practiceInPackText = summary.inPackPractice ? (", " + summary.inPackPractice + " practice card" + (summary.inPackPractice === 1 ? "" : "s") + " in pack") : "";
    var standaloneText = summary.standalonePractice ? ", " + summary.standalonePractice + " standalone phrase" + (summary.standalonePractice === 1 ? "" : "s") : "";
    var packText = summary.packCount ? ", " + summary.packCount + " pack" + (summary.packCount === 1 ? "" : "s") : "";
    var skippedText = skipped ? ", " + skipped + " skipped" : "";
    var plural = summary.total === 1 ? "" : "s";
    return summary.total + " record" + plural + " processed. " +
      added + " added, " + updated + " updated" + skippedText +
      practiceInPackText + packText + standaloneText + ".";
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
      const summary = summarizeImportedWords(prepared.words);
      setStatus("saving", "Importing…");
      const result = await state.storage.importWords(prepared.words, state.words);
      state.words = await state.storage.getAllWords();
      state.selectedIds.clear();
      state.page = 1;
      renderer.renderApp();
      setStatus("saved", "Saved locally");
      showToast("Backup imported", buildImportSummaryMessage(result, summary, prepared.invalidCount), "success");
    } catch (error) {
      setStatus("error", "Import failed");
      showToast("Could not import backup", error && error.message ? error.message : "Choose a valid Word Garden JSON backup.", "error");
    }
  }

  function bindListEvents() {
    function updateQuery(value) {
      state.query = value;
      state.page = 1;
      renderListChange();
    }

    function clearQuery(input) {
      cancelScheduledSearch();
      updateQuery("");
      input.focus();
    }

    function updatePartOfSpeech(value) {
      state.partOfSpeech = value;
      state.page = 1;
      renderListChange();
    }

    function updateContentType(value) {
      state.contentType = value;
      if (state.contentType === "practice") {
        state.partOfSpeech = "all";
      } else {
        state.lesson = "";
      }
      state.page = 1;
      renderListChange();
    }

    function updatePack(value) {
      state.lesson = value;
      state.page = 1;
      renderListChange();
    }

    function updatePageSize(value) {
      state.pageSize = Math.min(100, Number(value) || 25);
      state.page = 1;
      renderListChange();
    }

    [elements.searchInput, elements.floatingSearchInput].forEach(function (input) {
      input.addEventListener("input", function () { scheduleSearchUpdate(input.value); });
    });
    [[elements.clearSearchButton, elements.searchInput], [elements.floatingClearSearchButton, elements.floatingSearchInput]].forEach(function (pair) {
      pair[0].addEventListener("click", function () { clearQuery(pair[1]); });
    });
    [elements.partFilter, elements.floatingPartFilter].forEach(function (select) {
      select.addEventListener("change", function () { updatePartOfSpeech(select.value); });
    });
    [elements.contentTypeFilter, elements.floatingContentTypeFilter].forEach(function (select) {
      select.addEventListener("change", function () { updateContentType(select.value); });
    });
    [elements.packFilter, elements.floatingPackFilter].forEach(function (select) {
      select.addEventListener("change", function () { updatePack(select.value); });
    });
    elements.vocabularySortButton.addEventListener("click", function () {
      state.sortOrder = state.sortOrder === "a-z" ? "z-a" : "a-z";
      state.page = 1;
      renderListChange();
    });
    [elements.pageSizeSelect, elements.floatingPageSizeSelect].forEach(function (select) {
      select.addEventListener("change", function () { updatePageSize(select.value); });
    });
    elements.wordsTableBody.addEventListener("click", handleTableClick);
    elements.wordsTableBody.addEventListener("change", handleTableChange);
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
      if (state.page > 1) { state.page -= 1; renderListChange(); }
    });
    elements.nextPageButton.addEventListener("click", function () { state.page += 1; renderListChange(); });
    elements.pageButtons.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-page]");
      if (button) { state.page = Number(button.dataset.page); renderListChange(); }
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
      const currentTheme = document.documentElement.dataset.theme || "light";
      const nextTheme = THEMES[(THEMES.indexOf(currentTheme) + 1) % THEMES.length];
      applyTheme(nextTheme, true);
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
      event.target.removeAttribute("aria-invalid");
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
    if (elements.practicePacksAddLessonButton) {
      elements.practicePacksAddLessonButton.addEventListener("click", function () {
        closePracticePacks();
        openLessonPanel();
      });
    }
    elements.closeLessonButton.addEventListener("click", function () { closeLessonPanel(false); });
    elements.cancelLessonButton.addEventListener("click", function () { closeLessonPanel(true); });
    elements.previewLessonButton.addEventListener("click", previewLesson);
    elements.lessonForm.addEventListener("submit", saveLesson);
    elements.lessonForm.addEventListener("input", function (event) {
      event.target.removeAttribute("aria-invalid");
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
      closeDialogWithMotion(elements.practiceDialog);
    });
    elements.practiceForm.addEventListener("submit", savePracticeDetails);
    elements.practiceForm.addEventListener("input", updatePracticePreview);
    elements.practiceForm.addEventListener("change", updatePracticePreview);
    document.addEventListener("pointerdown", closePartPickersOutside);
    window.addEventListener("resize", hideInlineTextTooltip);
    window.addEventListener("scroll", hideInlineTextTooltip, true);
    window.addEventListener("scroll", scheduleFloatingFilterVisibility, { passive: true });
    window.addEventListener("resize", scheduleFloatingFilterVisibility);
    elements.toolbarFiltersToggle.addEventListener("click", function () {
      setCompactFiltersExpanded(elements.dictionaryToolbar, elements.toolbarFiltersToggle, !elements.dictionaryToolbar.classList.contains("is-filters-open"));
    });
    elements.floatingFiltersToggle.addEventListener("click", function () {
      setCompactFiltersExpanded(elements.floatingFilterBar, elements.floatingFiltersToggle, !elements.floatingFilterBar.classList.contains("is-filters-open"));
    });
    function clearAllFilters() {
      cancelScheduledSearch();
      state.query = "";
      state.partOfSpeech = "all";
      state.contentType = "all";
      state.lesson = "";
      state.page = 1;
      elements.searchInput.value = "";
      if (elements.floatingSearchInput) elements.floatingSearchInput.value = "";
      elements.contentTypeFilter.value = "all";
      elements.partFilter.value = "all";
      if (elements.packFilter) elements.packFilter.value = "";
      elements.clearSearchButton.hidden = true;
      if (elements.floatingClearSearchButton) elements.floatingClearSearchButton.hidden = true;
      renderListChange();
    }

    if (elements.clearAllFiltersButton) {
      elements.clearAllFiltersButton.addEventListener("click", clearAllFilters);
    }
    if (elements.floatingClearAllFiltersButton) {
      elements.floatingClearAllFiltersButton.addEventListener("click", clearAllFilters);
    }
    elements.emptyAddButton.addEventListener("click", function () {
      if (state.emptyAction === "add") return openAddPanel();
      clearAllFilters();
    });
    elements.emptyAddSearchButton.addEventListener("click", function () {
      const searchTerm = logic.getAddableSearchTerm(state.words, state.query);
      if (searchTerm) openAddPanel(searchTerm);
    });
    bindListEvents();

    elements.confirmCancelButton.addEventListener("click", function () {
      state.pendingDeleteIds = [];
      closeDialogWithMotion(elements.confirmDialog);
    });
    elements.confirmDeleteButton.addEventListener("click", confirmDelete);
    elements.confirmDialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      state.pendingDeleteIds = [];
      closeDialogWithMotion(elements.confirmDialog);
    });
    elements.confirmDialog.addEventListener("click", function (event) {
      const rect = elements.confirmDialog.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) { state.pendingDeleteIds = []; closeDialogWithMotion(elements.confirmDialog); }
    });
    elements.practiceDialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      state.practiceWordId = null;
      closeDialogWithMotion(elements.practiceDialog);
    });

    elements.importButton.addEventListener("click", function () { elements.importInput.click(); });
    elements.importInput.addEventListener("change", importBackup);
    elements.exportButton.addEventListener("click", function () {
      backupModule.exportBackup(state.words);
      saveLastExportTime();
      updateBackupStatus();
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
      if (
        event.repeat ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        event.isComposing ||
        elements.dictionaryView.hidden ||
        elements.confirmDialog.open ||
        elements.practiceDialog.open ||
        (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/i.test(document.activeElement.tagName)) ||
        (document.activeElement && document.activeElement.isContentEditable)
      ) return;

      if (event.key === "c") {
        event.preventDefault();
        closeLessonPanel(false);
        if (elements.addPanel.hidden) openAddPanel();
        else closeAddPanel(false);
      } else if (event.key === "l") {
        event.preventDefault();
        closeAddPanel(false);
        if (elements.lessonPanel.hidden) openLessonPanel();
        else closeLessonPanel(false);
      } else if (event.key === "t") {
        event.preventDefault();
        elements.themeToggle.click();
      }
    });
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
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
      if (event.key === " " && event.target && /^(BUTTON|A|SUMMARY)$/.test(event.target.tagName)) return;
      if (event.key === " " && !event.repeat) { event.preventDefault(); review.showAnswer(); }
      if (event.key === "ArrowUp" && !event.repeat) { event.preventDefault(); review.speak(); }
      // Number keys 1-4 for grading.
      var gradeMap = { "1": "again", "2": "hard", "3": "good", "4": "easy" };
      if (gradeMap[event.key] && !event.repeat) { event.preventDefault(); void review.grade(gradeMap[event.key]); }
    });
  }

  function setCompactFiltersExpanded(container, toggle, shouldExpand) {
    container.classList.toggle("is-filters-open", shouldExpand);
    toggle.setAttribute("aria-expanded", shouldExpand ? "true" : "false");
  }

  function updateFloatingFilterVisibility() {
    if (!elements.dictionaryToolbar || !elements.floatingFilterBar) return;
    const toolbarBottom = elements.dictionaryToolbar.getBoundingClientRect().bottom;
    const shouldShow = !elements.dictionaryView.hidden && toolbarBottom <= 0;
    const isVisible = elements.floatingFilterBar.classList.contains("is-visible");
    if (shouldShow === isVisible) return;
    if (!shouldShow) setCompactFiltersExpanded(elements.floatingFilterBar, elements.floatingFiltersToggle, false);
    elements.floatingFilterBar.classList.toggle("is-visible", shouldShow);
    elements.floatingFilterBar.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    elements.floatingFilterBar.inert = !shouldShow;
  }

  function scheduleFloatingFilterVisibility() {
    if (floatingFilterFrame) return;
    floatingFilterFrame = window.requestAnimationFrame(function () {
      floatingFilterFrame = 0;
      updateFloatingFilterVisibility();
    });
  }

  async function initialize() {
    cacheElements();
    syncAddPracticeDetails();
    applyTheme(getTheme(), false);
    setupInlineTextTooltip();
    updateShortcutHints();
    updateBackupStatus();
    renderer = viewModule.createRenderer(elements, state);
    review = window.createLexiloReview({
      elements: elements,
      state: state,
      logic: logic,
      showToast: showToast,
      speakWord: speakWord,
      icon: viewModule.icon,
      revealView: revealView,
      onWordsChanged: function () { renderer.renderApp(); },
      onGrade: async function (wordId, srsUpdate) {
        setStatus("saving", "Saving review…");
        try {
          await state.storage.updateWord(wordId, srsUpdate);
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
      updateFloatingFilterVisibility();
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
