// @ts-nocheck
(function (root) {
  "use strict";

  const logic = root.DictionaryLogic;

  function icon(name) {
    return '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  }

  function setStorageStatus(elements, status) {
    elements.storageStatus.classList.toggle("saving", status === "saving");
    elements.storageStatus.classList.toggle("error", status === "error");
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

  function showCopyFeedback(button, duration) {
    if (!button) return;
    const timeoutDuration = typeof duration === "number" ? duration : 2000;
    if (button._copyTimeout) {
      root.clearTimeout(button._copyTimeout);
      button._copyTimeout = null;
    }

    const use = button.querySelector ? button.querySelector("use") : null;
    if (use && typeof use.setAttribute === "function") {
      use.setAttribute("href", "#icon-check");
      if (typeof use.hasAttribute === "function" && use.hasAttribute("xlink:href")) {
        use.setAttribute("xlink:href", "#icon-check");
      }
    } else {
      button.innerHTML = icon("check");
    }

    if (button.classList && typeof button.classList.add === "function") {
      button.classList.add("copied");
    }

    const hasOriginalTitle = typeof button.hasAttribute === "function" && button.hasAttribute("data-original-title");
    if (!hasOriginalTitle && typeof button.getAttribute === "function") {
      const currentTitle = button.getAttribute("title");
      if (currentTitle) button.setAttribute("data-original-title", currentTitle);
    }

    const hasOriginalAriaLabel = typeof button.hasAttribute === "function" && button.hasAttribute("data-original-aria-label");
    if (!hasOriginalAriaLabel && typeof button.getAttribute === "function") {
      const currentAriaLabel = button.getAttribute("aria-label");
      if (currentAriaLabel) button.setAttribute("data-original-aria-label", currentAriaLabel);
    }

    if (typeof button.setAttribute === "function") {
      button.setAttribute("title", "Copied!");
      button.setAttribute("aria-label", "Copied");
    }

    button._copyTimeout = root.setTimeout(function () {
      if (button.isConnected !== false) {
        const resetUse = button.querySelector ? button.querySelector("use") : null;
        if (resetUse && typeof resetUse.setAttribute === "function") {
          resetUse.setAttribute("href", "#icon-copy");
          if (typeof resetUse.hasAttribute === "function" && resetUse.hasAttribute("xlink:href")) {
            resetUse.setAttribute("xlink:href", "#icon-copy");
          }
        } else {
          button.innerHTML = icon("copy");
        }

        if (button.classList && typeof button.classList.remove === "function") {
          button.classList.remove("copied");
        }

        if (typeof button.hasAttribute === "function" && button.hasAttribute("data-original-title")) {
          button.setAttribute("title", button.getAttribute("data-original-title"));
          button.removeAttribute("data-original-title");
        }
        if (typeof button.hasAttribute === "function" && button.hasAttribute("data-original-aria-label")) {
          button.setAttribute("aria-label", button.getAttribute("data-original-aria-label"));
          button.removeAttribute("data-original-aria-label");
        }
      }
      button._copyTimeout = null;
    }, timeoutDuration);
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
    return '<details class="part-picker inline-part-picker" data-part-picker data-field="partsOfSpeech" data-id="' + id + '">' +
      '<summary class="part-picker-trigger" aria-label="' + logic.escapeHtml(partPickerLabel(selected, vocabulary)) + '">' +
        '<span class="part-picker-tags" data-part-picker-tags>' + partTags(selected) + '</span>' +
      '</summary>' +
      '<div class="part-picker-menu">' +
        '<p>Select one or more types</p>' +
        '<div class="part-picker-options">' + partPickerOptions(selected, 'data-field="partsOfSpeech" data-id="' + id + '"') + '</div>' +
      '</div>' +
    '</details>';
  }

  function lockedPracticePart() {
    return '<span class="locked-practice-part" title="Practice-pack cards stay as phrases." aria-label="Part of speech: Phrase. Locked because this card belongs to a practice pack.">' +
      icon("lock") + '<span class="part-tag" title="Phrase">(phr)</span><small>Practice card</small></span>';
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
    function syncFloatingFilters() {
      const pairs = [
        [elements.contentTypeFilter, elements.floatingContentTypeFilter],
        [elements.partFilter, elements.floatingPartFilter],
        [elements.packFilter, elements.floatingPackFilter],
        [elements.pageSizeSelect, elements.floatingPageSizeSelect],
      ];
      elements.searchInput.value = state.query;
      elements.floatingSearchInput.value = state.query;
      elements.contentTypeFilter.value = state.contentType;
      elements.partFilter.value = state.partOfSpeech;
      elements.packFilter.value = state.lesson;
      elements.pageSizeSelect.value = String(state.pageSize);
      pairs.forEach(function (pair) {
        const source = pair[0];
        const target = pair[1];
        if (!source || !target) return;
        if (source.tagName === "SELECT") target.innerHTML = source.innerHTML;
        target.value = source.value;
        target.disabled = source.disabled;
        target.title = source.title;
      });
      const hasQuery = Boolean(state.query);
      elements.clearSearchButton.hidden = !hasQuery;
      elements.floatingClearSearchButton.hidden = !hasQuery;

      var activeFilterCount = 0;
      if (state.query && state.query.trim()) activeFilterCount++;
      if (state.contentType && state.contentType !== "all") activeFilterCount++;
      if (state.partOfSpeech && state.partOfSpeech !== "all") activeFilterCount++;
      if (state.lesson) activeFilterCount++;

      var hasActiveFilters = activeFilterCount > 0;
      if (elements.clearAllFiltersButton) {
        elements.clearAllFiltersButton.hidden = !hasActiveFilters;
        if (elements.activeFiltersCountBadge) {
          elements.activeFiltersCountBadge.textContent = String(activeFilterCount);
        }
      }
      if (elements.floatingClearAllFiltersButton) {
        elements.floatingClearAllFiltersButton.hidden = !hasActiveFilters;
        if (elements.floatingActiveFiltersCountBadge) {
          elements.floatingActiveFiltersCountBadge.textContent = String(activeFilterCount);
        }
      }
      if (elements.toolbarFiltersToggleBadge) {
        elements.toolbarFiltersToggleBadge.textContent = String(activeFilterCount);
        elements.toolbarFiltersToggleBadge.hidden = !hasActiveFilters;
      }
      if (elements.floatingFiltersToggleBadge) {
        elements.floatingFiltersToggleBadge.textContent = String(activeFilterCount);
        elements.floatingFiltersToggleBadge.hidden = !hasActiveFilters;
      }
    }

    function currentView() {
      const filtered = logic.filterAndSortWords(state.words, state.query, state.partOfSpeech, state.sortOrder, state.lesson, state.contentType);
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
        const tags = Array.isArray(word.tags) ? word.tags : [];
        const practicePackCard = logic.isPracticePackCard(word);
        const practiceMeta = word.lesson || word.cardType !== "vocabulary" || tags.length
          ? '<div class="practice-row-meta">' +
              '<span class="card-type-chip">' + e(word.cardType || "vocabulary") + '</span>' +
              (word.lesson ? '<span>' + e(word.lesson) + '</span>' : "") +
              (tags.length ? '<span>' + e(tags.join(" · ")) + '</span>' : "") +
            '</div>'
          : "";
        return `<tr data-row-id="${id}" class="${selected ? "selected" : ""}">
          <td class="select-column"><input class="checkbox row-checkbox" type="checkbox" data-id="${id}" aria-label="Select ${vocabulary}" ${selected ? "checked" : ""}></td>
          <td><input class="inline-control word-input" data-field="vocabulary" data-id="${id}" value="${vocabulary}" aria-label="Vocabulary: ${vocabulary}">${practiceMeta}</td>
          <td>${practicePackCard ? lockedPracticePart() : inlinePartPicker(word.partsOfSpeech || word.partOfSpeech, id, word.vocabulary)}</td>
          <td><input class="inline-control meaning-input" data-field="meaning" data-id="${id}" value="${e(word.meaning)}" aria-label="Meaning for ${vocabulary}"></td>
          <td><input class="inline-control" data-field="pronunciation" data-id="${id}" value="${e(word.pronunciation || "")}" placeholder="Add pronunciation" aria-label="Pronunciation for ${vocabulary}"></td>
          <td><textarea class="inline-control" data-field="example" data-id="${id}" placeholder="Add an example" aria-label="Example for ${vocabulary}">${e(word.example || "")}</textarea></td>
          <td class="actions-cell"><div class="row-actions">
            ${practicePackCard ? '<button class="table-action" type="button" data-action="practice" data-id="' + id + '" title="Edit phrase practice" aria-label="Edit phrase practice for ' + vocabulary + '">' + icon("sparkles") + '</button>' : ""}
            <button class="table-action" type="button" data-action="speak" data-id="${id}" title="Hear pronunciation" aria-label="Hear ${vocabulary}">${icon("volume")}</button>
            <button class="table-action" type="button" data-action="copy" data-id="${id}" title="Copy vocabulary" aria-label="Copy ${vocabulary}">${icon("copy")}</button>
            <button class="table-action danger" type="button" data-action="delete" data-id="${id}" title="Delete word" aria-label="Delete ${vocabulary}">${icon("trash")}</button>
          </div></td>
        </tr>`;
      }).join("");
    }

    function renderContentFilters(packs) {
      const practiceCardCount = state.words.filter(logic.isPracticePackCard).length;
      const vocabularyCount = state.words.length - practiceCardCount;
      if (!["all", "vocabulary", "practice"].includes(state.contentType)) state.contentType = "all";
      if (state.contentType !== "practice") state.lesson = "";

      elements.contentTypeFilter.innerHTML =
        '<option value="all"' + (state.contentType === "all" ? " selected" : "") + ">All content (" + state.words.length + ")</option>" +
        '<option value="vocabulary"' + (state.contentType === "vocabulary" ? " selected" : "") + ">Vocabulary (" + vocabularyCount + ")</option>" +
        '<option value="practice"' + (state.contentType === "practice" ? " selected" : "") + ">Practice cards (" + practiceCardCount + ")</option>";
      elements.partFilter.disabled = state.contentType === "practice";
      elements.partFilter.title = state.contentType === "practice" ? "Practice cards are always phrases" : "Filter by part of speech";
      elements.packFilter.disabled = state.contentType !== "practice" || packs.length === 0;
      elements.packFilter.title = state.contentType === "practice" ? "Filter by practice pack" : "Choose Practice cards to filter by pack";
    }

    function renderPracticePacks(packs) {
      if (!elements.practicePacks || !elements.practicePackList || !elements.packFilter) return;
      elements.practicePacks.hidden = false;
      if (elements.practicePacksEmpty) elements.practicePacksEmpty.hidden = packs.length > 0;
      if (state.lesson && !packs.some(function (pack) { return pack.title === state.lesson; })) state.lesson = "";
      elements.packFilter.innerHTML = '<option value="">All packs</option>' + packs.map(function (pack) {
        return '<option value="' + logic.escapeHtml(pack.title) + '"' + (state.lesson === pack.title ? " selected" : "") + ">" + logic.escapeHtml(pack.title) + "</option>";
      }).join("");
      elements.practicePackList.innerHTML = packs.map(function (pack) {
        const title = logic.escapeHtml(pack.title);
        const cardWord = pack.total === 1 ? "card" : "cards";
        const detail = [
          pack.phraseCount ? pack.phraseCount + " phrase" + (pack.phraseCount === 1 ? "" : "s") : "",
          pack.patternCount ? pack.patternCount + " pattern" + (pack.patternCount === 1 ? "" : "s") : "",
        ].filter(Boolean).join(" · ");
        const pct = pack.total > 0 ? Math.min(100, Math.round((pack.spokenTodayCount / pack.total) * 100)) : 0;
        const progressHtml = '<div class="practice-pack-progress">' +
          '<div class="practice-pack-progress-track" aria-hidden="true">' +
            '<div class="practice-pack-progress-bar" style="width: ' + pct + '%"></div>' +
          '</div>' +
          '<div class="practice-pack-status-line' + (pack.completedToday ? " is-completed" : "") + '">' +
            (pack.completedToday
              ? "<span>" + icon("check") + " Completed today · " + pack.spokenTodayCount + "/" + pack.total + "</span>"
              : "<span>" + pack.spokenTodayCount + "/" + pack.total + " spoken today</span><span class=\"practice-pack-remaining\">" + pack.spokenTodayRemaining + " left</span>"
            ) +
          '</div>' +
        '</div>';

        return '<article class="practice-pack-card' + (pack.completedToday ? " is-completed" : "") + '">' +
          '<div>' +
            '<div class="practice-pack-header">' +
              '<span class="eyebrow">Practice pack</span>' +
              '<span class="practice-pack-count-pill">' + pack.total + " " + cardWord + '</span>' +
            '</div>' +
            '<h3 title="' + title + '">' + title + '</h3>' +
            (detail ? '<p class="practice-pack-detail-text">' + detail + '</p>' : "") +
            progressHtml +
          '</div>' +
          '<div class="practice-pack-actions">' +
            '<button class="button button-ghost button-small" type="button" data-action="review-pack" data-pack="' + title + '" title="Review all ' + pack.total + ' cards in this pack" aria-label="Review all ' + pack.total + ' cards in ' + title + '">' +
              '<svg aria-hidden="true"><use href="#icon-cards"></use></svg><span>Review · ' + pack.total + '</span>' +
            '</button>' +
            '<button class="button button-primary button-small" type="button" data-action="speak-pack" data-pack="' + title + '"' + (pack.completedToday ? " disabled" : "") + ' title="' + (pack.completedToday ? "Completed speaking practice today" : "Speak " + pack.spokenTodayRemaining + " cards") + '">' +
              '<svg aria-hidden="true"><use href="#icon-volume"></use></svg><span>' + (pack.completedToday ? "Completed" : "Speak · " + pack.spokenTodayRemaining) + '</span>' +
            '</button>' +
          '</div>' +
        '</article>';
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
      const itemLabel = state.contentType === "practice" ? "practice cards" : (state.contentType === "vocabulary" ? "vocabulary items" : "items");
      elements.rangeLabel.textContent = "Showing " + paginated.start + "–" + paginated.end + " of " + total + " " + itemLabel;
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
        elements.emptyTitle.textContent = state.contentType === "practice"
          ? "No matching practice cards"
          : (state.contentType === "vocabulary" ? "No matching vocabulary" : "No matching items");
        elements.emptyMessage.textContent = "Try a different search or clear the current filters.";
        elements.emptyAddButton.innerHTML = icon("x") + "Clear search and filters";
      }
    }

    function renderApp() {
      elements.totalCount.textContent = String(state.words.length);
      const vocabularyWords = state.words.filter(function (word) { return !word.lesson; });
      const practicePacks = logic.getPracticePacks(state.words);
      const duePacksCount = practicePacks.filter(function (pack) { return !pack.completedToday; }).length;
      renderContentFilters(practicePacks);
      const view = currentView();
      elements.reviewButton.disabled = vocabularyWords.length === 0;
      if (elements.practicePacksButton) {
        elements.practicePacksButton.disabled = practicePacks.length === 0;
        elements.practicePacksButton.title = duePacksCount > 0
          ? duePacksCount + " practice pack" + (duePacksCount === 1 ? "" : "s") + " left to practise today"
          : (practicePacks.length ? "All practice packs completed today" : "Create a practice pack before starting a practice review");
      }
      if (elements.practicePackBadge) {
        elements.practicePackBadge.textContent = String(duePacksCount);
        elements.practicePackBadge.hidden = duePacksCount === 0;
      }
      if (elements.practicePacksCount) {
        elements.practicePacksCount.textContent = String(practicePacks.length);
      }
      if (elements.practicePacksCountLabel) {
        elements.practicePacksCountLabel.textContent = practicePacks.length === 1 ? "pack" : "packs";
      }
      // SRS badge: show due word count on Review button.
      if (logic.getSrsStats && elements.reviewDueBadge) {
        var srsStats = logic.getSrsStats(vocabularyWords, new Date().toISOString());
        var dueCount = srsStats.dueCount;
        elements.reviewDueBadge.textContent = String(dueCount);
        elements.reviewDueBadge.hidden = dueCount === 0;
        elements.reviewButton.title = dueCount > 0
          ? dueCount + " word" + (dueCount === 1 ? "" : "s") + " due for review"
          : (vocabularyWords.length ? "All caught up — no vocabulary due" : "Add a vocabulary card before starting a review");
      } else {
        elements.reviewButton.title = vocabularyWords.length ? "Review vocabulary" : "Add a vocabulary card before starting a review";
      }
      renderSortButton();
      renderPracticePacks(practicePacks);
      syncFloatingFilters();
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
    showCopyFeedback: showCopyFeedback,
    createRenderer: createRenderer,
    syncPartPicker: syncPartPicker,
  };
})(window);
