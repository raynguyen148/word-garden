// @ts-nocheck
(function (root) {
  "use strict";

  const logic = root.DictionaryLogic;

  function icon(name) {
    return '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  }

  function setStorageStatus(elements, status, label) {
    elements.storageStatus.classList.toggle("saving", status === "saving");
    elements.storageStatus.classList.toggle("error", status === "error");
    elements.storageStatus.innerHTML = icon(status === "error" ? "x" : "database") +
      "<span>" + logic.escapeHtml(label) + "</span>";
  }

  function showToast(elements, title, message, type) {
    const toast = document.createElement("div");
    toast.className = "toast" + (type === "error" ? " error" : "");
    toast.innerHTML = '<span class="toast-icon">' + icon(type === "error" ? "x" : "check") + "</span>" +
      "<div><strong>" + logic.escapeHtml(title) + "</strong>" +
      (message ? "<p>" + logic.escapeHtml(message) + "</p>" : "") + "</div>";
    elements.toastRegion.appendChild(toast);
    root.setTimeout(function () {
      toast.classList.add("removing");
      root.setTimeout(function () { toast.remove(); }, 220);
    }, 3400);
  }

  const PART_ABBREVIATIONS = {
    noun: "n",
    verb: "v",
    adjective: "adj",
    adverb: "adv",
    pronoun: "pron",
    preposition: "prep",
    conjunction: "conj",
    interjection: "interj",
    phrase: "phr",
    other: "other",
  };

  function partLabel(part) {
    return part.charAt(0).toUpperCase() + part.slice(1);
  }

  function partTags(selectedParts) {
    const selected = Array.isArray(selectedParts) && selectedParts.length === 0
      ? []
      : logic.normalizePartsOfSpeech(selectedParts);
    if (!selected.length) return '<span class="part-picker-placeholder">Choose type</span>';
    return selected.map(function (part) {
      const label = partLabel(part);
      return '<span class="part-tag" title="' + label + '" aria-label="' + label + '">(' + PART_ABBREVIATIONS[part] + ")</span>";
    }).join("");
  }

  function partPickerOptions(selectedParts, attributes) {
    const selected = logic.normalizePartsOfSpeech(selectedParts);
    return logic.PARTS_OF_SPEECH.map(function (part) {
      return '<label class="part-picker-option"><input type="checkbox" ' + attributes + ' value="' + part + '"' +
        (selected.includes(part) ? " checked" : "") + '><span>' + partLabel(part) + '</span><small>(' + PART_ABBREVIATIONS[part] + ")</small></label>";
    }).join("");
  }

  function partPickerLabel(selectedParts, vocabulary) {
    const selected = Array.isArray(selectedParts) && selectedParts.length === 0
      ? []
      : logic.normalizePartsOfSpeech(selectedParts);
    const names = selected.length ? selected.map(partLabel).join(", ") : "no type selected";
    return "Parts of speech for " + vocabulary + ": " + names + ". Click to edit.";
  }

  function inlinePartPicker(selectedParts, id, vocabulary) {
    const selected = logic.normalizePartsOfSpeech(selectedParts);
    return '<details class="part-picker inline-part-picker" data-part-picker data-id="' + id + '">' +
      '<summary class="part-picker-trigger" aria-label="' + logic.escapeHtml(partPickerLabel(selected, vocabulary)) + '">' +
        '<span class="part-picker-tags" data-part-picker-tags>' + partTags(selected) + '</span>' +
      '</summary>' +
      '<div class="part-picker-menu">' +
        '<p>Select one or more types</p>' +
        '<div class="part-picker-options">' + partPickerOptions(selected, 'data-field="partsOfSpeech" data-id="' + id + '"') + '</div>' +
        '<div class="part-picker-actions">' +
          '<button class="part-picker-cancel" type="button" data-action="cancel-parts">Cancel</button>' +
          '<button class="part-picker-save" type="button" data-action="apply-parts" data-field="partsOfSpeech" data-id="' + id + '">Done</button>' +
        '</div>' +
      '</div>' +
    '</details>';
  }

  function syncPartPicker(picker, selectedParts, vocabulary) {
    if (!picker) return;
    const selected = selectedParts === undefined
      ? Array.from(picker.querySelectorAll('input[type="checkbox"]:checked')).map(function (input) { return input.value; })
      : selectedParts;
    const normalized = Array.isArray(selected) && selected.length === 0
      ? []
      : logic.normalizePartsOfSpeech(selected);
    picker.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
      input.checked = normalized.includes(input.value);
    });
    const tags = picker.querySelector("[data-part-picker-tags]");
    if (tags) tags.innerHTML = partTags(normalized);
    const summary = picker.querySelector("summary");
    if (summary) {
      const word = vocabulary || picker.closest("tr") && picker.closest("tr").querySelector(".word-input").value || "new word";
      summary.setAttribute("aria-label", partPickerLabel(normalized, word));
    }
  }

  function createRenderer(elements, state) {
    function currentView() {
      const filtered = logic.filterAndSortWords(state.words, state.query, state.partOfSpeech, state.sortOrder);
      const paginated = logic.paginateWords(filtered, state.page, state.pageSize);
      state.page = paginated.page;
      state.currentPageIds = paginated.items.map(function (word) { return word.id; });
      return { filtered: filtered, paginated: paginated };
    }

    function renderRows(items) {
      const e = logic.escapeHtml;
      elements.wordsTableBody.innerHTML = items.map(function (word) {
        const id = e(word.id);
        const vocabulary = e(word.vocabulary);
        const selected = state.selectedIds.has(word.id);
        return `<tr data-row-id="${id}" class="${selected ? "selected" : ""}">
          <td class="select-column"><input class="checkbox row-checkbox" type="checkbox" data-id="${id}" aria-label="Select ${vocabulary}" ${selected ? "checked" : ""}></td>
          <td><input class="inline-control word-input" data-field="vocabulary" data-id="${id}" value="${vocabulary}" aria-label="Vocabulary: ${vocabulary}"></td>
          <td>${inlinePartPicker(word.partsOfSpeech || word.partOfSpeech, id, word.vocabulary)}</td>
          <td><input class="inline-control meaning-input" data-field="meaning" data-id="${id}" value="${e(word.meaning)}" aria-label="Meaning for ${vocabulary}"></td>
          <td><input class="inline-control" data-field="pronunciation" data-id="${id}" value="${e(word.pronunciation || "")}" placeholder="Add pronunciation" aria-label="Pronunciation for ${vocabulary}"></td>
          <td><textarea class="inline-control" data-field="example" data-id="${id}" placeholder="Add an example" aria-label="Example for ${vocabulary}">${e(word.example || "")}</textarea></td>
          <td class="actions-cell"><div class="row-actions">
            <button class="table-action" type="button" data-action="speak" data-id="${id}" title="Hear pronunciation" aria-label="Hear ${vocabulary}">${icon("volume")}</button>
            <button class="table-action" type="button" data-action="copy" data-id="${id}" title="Copy vocabulary" aria-label="Copy ${vocabulary}">${icon("copy")}</button>
            <button class="table-action danger" type="button" data-action="delete" data-id="${id}" title="Delete word" aria-label="Delete ${vocabulary}">${icon("trash")}</button>
          </div></td>
        </tr>`;
      }).join("");
    }

    function pageItems(totalPages, currentPage) {
      if (totalPages <= 7) return Array.from({ length: totalPages }, function (_, index) { return index + 1; });
      const values = [1];
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      if (start > 2) values.push("ellipsis-start");
      for (let page = start; page <= end; page += 1) values.push(page);
      if (end < totalPages - 1) values.push("ellipsis-end");
      values.push(totalPages);
      return values;
    }

    function renderPagination(paginated, total) {
      elements.pagination.hidden = total === 0;
      if (!total) return;
      elements.rangeLabel.textContent = "Showing " + paginated.start + "–" + paginated.end + " of " + total + " words";
      elements.previousPageButton.disabled = paginated.page <= 1;
      elements.nextPageButton.disabled = paginated.page >= paginated.totalPages;
      elements.pageButtons.innerHTML = pageItems(paginated.totalPages, paginated.page).map(function (item) {
        if (typeof item === "string") return '<span class="page-ellipsis" aria-hidden="true">…</span>';
        return '<button class="page-button' + (item === paginated.page ? " active" : "") +
          '" type="button" data-page="' + item + '" aria-label="Page ' + item + '"' +
          (item === paginated.page ? ' aria-current="page"' : "") + ">" + item + "</button>";
      }).join("");
    }

    function renderSelection() {
      const selectedCount = state.selectedIds.size;
      elements.bulkBar.hidden = selectedCount === 0;
      elements.selectedCount.textContent = selectedCount + " selected";
      const selectedOnPage = state.currentPageIds.filter(function (id) { return state.selectedIds.has(id); }).length;
      elements.selectAllCheckbox.checked = state.currentPageIds.length > 0 && selectedOnPage === state.currentPageIds.length;
      elements.selectAllCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < state.currentPageIds.length;
      elements.selectAllCheckbox.disabled = state.currentPageIds.length === 0;
    }

    function renderSortButton() {
      const isAscending = state.sortOrder !== "z-a";
      const currentOrder = isAscending ? "A–Z" : "Z–A";
      const nextOrder = isAscending ? "Z–A" : "A–Z";
      const label = "Sorted " + currentOrder + ". Click to sort " + nextOrder + ".";
      elements.vocabularySortButton.dataset.order = isAscending ? "a-z" : "z-a";
      elements.vocabularySortButton.title = label;
      elements.vocabularySortButton.setAttribute("aria-label", label);
    }

    function renderEmptyState(filteredCount) {
      const noWords = state.words.length === 0;
      const noMatches = !noWords && filteredCount === 0;
      elements.emptyState.hidden = !(noWords || noMatches);
      elements.tableWrap.hidden = noWords || noMatches;
      if (noWords) {
        state.emptyAction = "add";
        elements.emptyTitle.textContent = "Your dictionary is ready";
        elements.emptyMessage.textContent = "Add your first unfamiliar word and start building a vocabulary you can revisit.";
        elements.emptyAddButton.innerHTML = icon("plus") + "Add your first word";
      } else if (noMatches) {
        state.emptyAction = "clear";
        elements.emptyTitle.textContent = "No matching words";
        elements.emptyMessage.textContent = "Try a different search or clear the current part-of-speech filter.";
        elements.emptyAddButton.innerHTML = icon("x") + "Clear search and filters";
      }
    }

    function renderApp() {
      const view = currentView();
      elements.totalCount.textContent = String(state.words.length);
      elements.reviewButton.disabled = state.words.length === 0;
      elements.reviewButton.title = state.words.length ? "Start a review session" : "Add a word before starting a review";
      renderSortButton();
      renderRows(view.paginated.items);
      renderPagination(view.paginated, view.filtered.length);
      renderEmptyState(view.filtered.length);
      renderSelection();
    }

    return { renderApp: renderApp, renderSelection: renderSelection };
  }

  root.LexiloView = {
    icon: icon,
    setStorageStatus: setStorageStatus,
    showToast: showToast,
    createRenderer: createRenderer,
    syncPartPicker: syncPartPicker,
  };
})(window);
