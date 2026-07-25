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
  };
  const elements = {};
  let renderer;
  let review;

  function cacheElements() {
    const ids = [
      "dictionaryView", "reviewView", "storageStatus", "importButton", "exportButton", "reviewButton", "importInput",
      "totalCount", "toggleAddButton", "addPanel", "closeAddButton", "cancelAddButton", "addForm", "newVocabulary",
      "searchInput", "clearSearchButton", "partFilter", "vocabularySortButton", "pageSizeSelect", "bulkBar", "selectedCount",
      "clearSelectionButton", "deleteSelectedButton", "tableWrap", "wordsTableBody", "selectAllCheckbox", "emptyState",
      "emptyTitle", "emptyMessage", "emptyAddButton", "pagination", "rangeLabel", "previousPageButton", "nextPageButton",
      "pageButtons", "exitReviewButton", "reviewWordCount", "reviewCard", "reviewDirectionLabel", "reviewPart",
      "reviewInstruction", "reviewPrompt", "reviewQuestion", "reviewSpeakButton", "reviewPronunciation", "reviewAnswer",
      "reviewAnswerText", "reviewAnswerMeta", "reviewExample", "showAnswerButton", "nextWordButton", "confirmDialog",
      "confirmTitle", "confirmMessage", "confirmCancelButton", "confirmDeleteButton", "toastRegion",
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

  function clearFormErrors() {
    elements.addForm.querySelectorAll(".field").forEach(function (field) { field.classList.remove("invalid"); });
    elements.addForm.querySelectorAll(".field-error").forEach(function (error) { error.textContent = ""; });
  }

  function closeAddPanel(reset) {
    elements.addPanel.hidden = true;
    elements.toggleAddButton.setAttribute("aria-expanded", "false");
    if (reset) {
      elements.addForm.reset();
      clearFormErrors();
    }
  }

  function showFormErrors(errors) {
    clearFormErrors();
    Object.keys(errors).forEach(function (fieldName) {
      const input = elements.addForm.elements[fieldName];
      const error = elements.addForm.querySelector('[data-error-for="' + fieldName + '"]');
      if (input) input.closest(".field").classList.add("invalid");
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
    const draft = {
      vocabulary: String(data.get("vocabulary") || "").trim(),
      partOfSpeech: logic.normalizePartOfSpeech(String(data.get("partOfSpeech") || "other")),
      meaning: String(data.get("meaning") || "").trim(),
      pronunciation: String(data.get("pronunciation") || "").trim(),
      example: String(data.get("example") || "").trim(),
    };
    const errors = logic.validateWordDraft(draft);
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

  async function saveInlineEdit(control) {
    const id = control.dataset.id;
    const field = control.dataset.field;
    const index = state.words.findIndex(function (word) { return word.id === id; });
    if (index < 0 || !field) return;
    const previous = state.words[index];
    let value = control.value.trim();
    if (field === "partOfSpeech") value = logic.normalizePartOfSpeech(value);
    if ((field === "vocabulary" || field === "meaning") && !value) {
      control.value = previous[field];
      showToast("A required field is empty", field === "vocabulary" ? "Vocabulary cannot be blank." : "Meaning cannot be blank.", "error");
      return;
    }

    const changes = { updatedAt: new Date().toISOString() };
    changes[field] = value;
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
    if (button.dataset.action === "copy") copyText(word.vocabulary);
    if (button.dataset.action === "speak") speakWord(word.vocabulary, button);
    if (button.dataset.action === "delete") openDeleteDialog([word.id]);
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
    } else if (target.matches("[data-field]")) {
      saveInlineEdit(target);
    }
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
  }

  function bindEvents() {
    elements.toggleAddButton.addEventListener("click", function () {
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
    elements.emptyAddButton.addEventListener("click", function () {
      if (state.emptyAction === "add") return openAddPanel();
      state.query = "";
      state.partOfSpeech = "all";
      state.page = 1;
      elements.searchInput.value = "";
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
      backupModule.exportBackup(state.words, storageModule.version);
      showToast("Backup exported", state.words.length + (state.words.length === 1 ? " word was" : " words were") + " included.", "success");
    });
    elements.reviewButton.addEventListener("click", review.enter);
    elements.exitReviewButton.addEventListener("click", review.exit);
    elements.showAnswerButton.addEventListener("click", review.showAnswer);
    elements.nextWordButton.addEventListener("click", review.next);
    elements.reviewSpeakButton.addEventListener("click", review.speak);
    document.querySelectorAll(".mode-button").forEach(function (button) {
      button.addEventListener("click", function () { review.setMode(button.dataset.mode); });
    });
    document.addEventListener("keydown", function (event) {
      if (elements.reviewView.hidden) return;
      if (event.key === "Escape") review.exit();
      if (event.key === " " && !event.repeat) { event.preventDefault(); review.showAnswer(); }
      if (event.key === "ArrowRight" && !event.repeat) { event.preventDefault(); review.next(); }
    });
  }

  async function initialize() {
    cacheElements();
    renderer = viewModule.createRenderer(elements, state);
    review = window.createLexiloReview({
      elements: elements,
      state: state,
      logic: logic,
      showToast: showToast,
      speakWord: speakWord,
      icon: viewModule.icon,
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
    } catch (error) {
      renderer.renderApp();
      setStatus("error", "Storage unavailable");
      showToast("Browser storage unavailable", "Try a current browser window with local data access enabled.", "error");
    }
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
