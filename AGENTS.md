# Word Garden

Word Garden is a private, offline-first personal English dictionary. It stores vocabulary, meanings, pronunciations, examples, and one or more parts of speech. The app runs entirely in the browser: no backend, Node.js runtime, package manager, framework, library, or external service is required for normal use.

## Project layout

- `index.html` loads the app files directly, in dependency order.
- `js/app.js` owns application state, DOM events, CRUD orchestration, import/export actions, and keyboard shortcuts.
- `js/logic.js` contains pure validation, normalization, filtering, pagination, import preparation, and HTML escaping helpers.
- `js/storage.js` is the IndexedDB boundary. Database: `word-garden`; object store: `words`.
- `js/backup.js` exports and reads JSON backups.
- `js/view.js` renders the dictionary UI; `js/review.js` owns Review mode.
- `css/styles.css` contains all styling; `tests/part-of-speech.test.js` covers core compatibility logic.

## Data and compatibility rules

- Treat existing IndexedDB records and exported JSON backups as user data. Do not remove, rename, or change stored fields without a backward-compatible migration path.
- Persisted records use `word`; UI code uses `vocabulary`. Preserve both mappings in `js/storage.js`.
- `partsOfSpeech` is canonical; keep legacy `partOfSpeech` in records and exports so older backups/app versions remain readable.
- Backup format is JSON with `schemaVersion: 2`. Import must accept both legacy and current shapes, validate records before writes, and avoid partial or destructive imports.
- Browser storage is origin-scoped. Never imply that data automatically follows the app between `file://`, localhost ports, or domains; use Export then Import.
- Keep the app fully offline. Do not add analytics, remote APIs, cloud storage, CDNs, or dependencies unless explicitly requested.

## Working conventions

- Keep changes small and use vanilla HTML, CSS, and browser JavaScript.
- Put pure, testable behavior in `js/logic.js`; keep DOM rendering in `js/view.js` and persistence in `js/storage.js`.
- Preserve the script order in `index.html` when adding modules.
- Maintain accessible controls and keyboard behavior, including the add form, dialogs, filters, and Review mode.
- Do not commit, push, delete user data, or modify unrelated working-tree changes without explicit approval.

## Verification

Run the existing automated test with:

```sh
node --test tests/part-of-speech.test.js
```

For changes affecting storage or backups, also manually verify in a browser: add/edit/delete, refresh persistence, export, import of a current backup, and import of a legacy backup.
