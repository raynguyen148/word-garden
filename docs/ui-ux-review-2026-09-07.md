# UI/UX refinement — 2026-09-07

## Delivered

The existing app now shares quieter surfaces, consistent control geometry, immediate focus outlines and a single tooltip system. Dictionary entries reflow on mobile/tablet; the header keeps all review and backup actions visible. Practice cards show their full titles. Review and dialogs use the same typography and surface language. Existing functions and offline data formats are preserved.

### Confirmed fixes

- Header controls overflowed at narrow widths and at the tablet breakpoint. The compact layout now applies up to 980px.
- A lesson with an incomplete edited card could save only the valid cards and close the draft. Saving now blocks with a specific message, marks the missing field and retains the entire draft.
- Add-word reset did not synchronize the phrase-specific fields. Reset now restores hidden/disabled practice controls correctly.
- A completed asynchronous Review rating could advance a different session after Exit/re-entry. Session generation guards separate persisted word updates from session UI changes.
- Vocabulary review and badges excluded all records with a lesson, unlike the Dictionary filter. Both now use the canonical practice-card predicate.
- Review badges rendered before the persisted rating reached in-memory state. Rendering now follows the state update.
- Table rerenders after asynchronous saves could discard focus and text being typed in the next field. Focus, selection and the active draft survive the rerender.
- Pack review's exit button said Dictionary although it returned to Practice. The label now matches the destination.
- Review keyboard handlers intercepted modified shortcuts and Space on native buttons. Modified/editor events and native Space activation are respected.
- Native title tooltips, inline text tooltips and copy feedback used separate behavior. One shared tooltip surface now handles delayed hover and immediate focus, including updated labels.
- Save status previously discarded its text label. Status now includes an accessible status message; dialogs and required-field errors have explicit associations.
- Service-worker install could reuse old HTTP-cached unversioned assets. Precache requests now use `cache: reload`; cleanup is limited to Word Garden caches and fetch handling to same-origin requests.

## Evidence

- `node --test tests/*.test.js`: 27/27 pass, including two new pending-review-save regressions.
- Syntax checks for modified JavaScript and `git diff --check`: pass.
- Every HTML script/stylesheet exists and matches a service-worker precache entry.
- Primary button text contrast: light 7.35:1 (hover 9.64:1), dark 6.99:1 (hover 8.40:1). Final browser error log was empty.
- Browser QA used separate localhost origins with five controlled sample records. The user's file-origin dictionary was not modified.
- Add-word required-field validation, add/save, lesson preview and save, incomplete-lesson rejection (count unchanged, draft retained, invalid field focused), corrected save, inline meaning edit, next-field focus and reload persistence were exercised.
- Search/content filters, no-results recovery, Practice list, recognition Review, rating progression, completion totals and start-speaking handoff were exercised.
- Delete dialog naming/cancel and phrase-editor layout were checked. The final permanent delete action was not executed.
- Light and dark surfaces were inspected; measured CSS widths included 320, 375, 414 and 768px, with desktop checked separately. Initial mobile and tablet overflow findings were corrected and rechecked.

## Limits

This is browser/source QA, not a formal WCAG certification or exhaustive device matrix. Legacy color tokens and system fonts are intentionally retained; the complete 58-gate Hallmark greenfield score is not claimed. Import/export compatibility is covered by the existing automated tests; a fresh manual legacy/current backup round trip and real offline speech availability were not part of this pass. Storage and backup modules were not changed.

No commit or push was performed.
