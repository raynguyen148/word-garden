# Word Garden

Word Garden is a private, offline-first personal English dictionary for capturing, organizing, and reviewing vocabulary.

It is a deliberately small browser app built with plain HTML, CSS, and JavaScript. Your dictionary and review progress stay in the browser through IndexedDB. There is no backend, account system, analytics, cloud sync, framework, package manager, or external runtime dependency required for normal use.

## Highlights

- Add English vocabulary with a Vietnamese meaning, one or more parts of speech, pronunciation, and an example sentence.
- Edit vocabulary directly in the table.
- Search by vocabulary or meaning.
- Filter by part of speech and sort vocabulary from A–Z or Z–A.
- Choose 10, 25, 50, or 100 rows per page.
- Select and delete multiple words with confirmation.
- Copy a word or hear its pronunciation through the browser Speech Synthesis API.
- Review due words with a lightweight spaced-repetition system (SRS).
- Practice in English → Vietnamese or Vietnamese → English mode.
- Export a JSON backup and import it later, including review progress.
- Switch between light and dark themes.
- Install as a standalone PWA when served from a compatible origin.
- Continue using the app offline after its static assets have been cached.

## Quick start

Word Garden has no build step and no dependency installation step.

### Option 1: Open the app directly

Open `index.html` in a modern browser. The dictionary can work without a server, although service-worker-based offline caching and PWA installation generally require a secure origin such as `localhost` or HTTPS.

### Option 2: Serve it locally

From the project directory, run any static file server. For example:

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

For development, a static server is the recommended workflow because it also allows the service worker to register.

## Using the dictionary

### Add a word

1. Select **Add word**.
2. Enter the required **Vocabulary** and **Meaning** fields.
3. Select at least one part of speech.
4. Optionally add pronunciation and an example sentence.
5. Select **Add to dictionary**.

Vocabulary is normalized for duplicate detection. Leading and trailing whitespace, Unicode normalization, letter case, and repeated internal whitespace do not create separate entries. For example, `Resilient` and ` resilient ` resolve to the same word key.

Use `Cmd/Ctrl + Enter` in the add form to save the current word and keep adding another word.

### Edit and manage words

Saved words appear in an editable table. Changes to vocabulary, meaning, parts of speech, pronunciation, and examples are persisted locally.

Available table actions include:

- Search vocabulary or meaning.
- Filter by one part of speech.
- Toggle alphabetical order between A–Z and Z–A.
- Change the number of rows per page.
- Select the current page or individual rows.
- Copy a vocabulary item.
- Play its English pronunciation.
- Delete one or more words after confirmation.

Each word must keep a vocabulary, a meaning, and at least one part of speech. Deleting a word also deletes its associated SRS review progress.

## Review mode

Select **Review** to start a session. The queue prioritizes due words, shuffles them, and includes up to 10 new words. If a word is graded **Again**, it is placed back at the end of the current session queue.

The review flow is:

1. Read the prompt.
2. Select **Show Answer** or press `Space`.
3. Compare the answer, part of speech, pronunciation, and example.
4. Grade the word with **Again**, **Hard**, **Good**, or **Easy**.

You can switch the prompt direction at any time:

- **ENG → VIE**: show the English word and recall its Vietnamese meaning.
- **VIE → ENG**: show the Vietnamese meaning and recall the English word.

### Review keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Show the answer |
| `1` | Grade Again |
| `2` | Grade Hard |
| `3` | Grade Good |
| `4` | Grade Easy |
| `↑` | Play pronunciation |
| `Esc` | Exit review mode |

### SRS behavior

Word Garden uses a simplified SM-2-style scheduler with whole-day intervals. It is intentionally lightweight and is not an Anki-compatible scheduler.

New words start with:

```text
srsInterval: 0
srsEase: 2.5
srsDueAt: null
srsReviewCount: 0
```

For a new word, the first grade produces these intervals:

| Grade | Next interval | Ease change |
| --- | ---: | ---: |
| Again | 1 day | -0.20 |
| Hard | 1 day | -0.15 |
| Good | 1 day | unchanged |
| Easy | 4 days | +0.15 |

For a word that is already being reviewed:

| Grade | Next interval | Ease change |
| --- | --- | ---: |
| Again | 1 day | -0.20 |
| Hard | `max(1, round(current × 1.2))` | -0.15 |
| Good | `max(1, round(current × ease))` | unchanged |
| Easy | `max(1, round(current × ease × 1.3))` | +0.15 |

Ease is clamped between `1.3` and `3.0`. The due timestamp is calculated from the review timestamp plus the selected whole-day interval. The interval shown under each grade button is a preview; selecting the grade saves that result to IndexedDB.

The Review button displays the number of due words. A word is due when it is new, has no valid due timestamp, or its due timestamp has passed.

## Backups and portability

The app stores data by browser origin. Data saved under `file://`, `localhost`, another localhost port, or a deployed domain is not automatically shared between those origins.

Use **Export** before changing browsers, origins, or devices:

1. Select **Export**.
2. Keep the downloaded JSON file somewhere safe.
3. Open Word Garden in the target browser or origin.
4. Select **Import** and choose the JSON file.

The current export format is `schemaVersion: 2`. A backup contains the vocabulary fields, timestamps, parts of speech, and SRS fields:

```json
{
  "app": "Word Garden Personal Dictionary",
  "schemaVersion": 2,
  "exportedAt": "2026-08-22T00:00:00.000Z",
  "words": [
    {
      "word": "resilient",
      "partOfSpeech": "adjective",
      "partsOfSpeech": ["adjective"],
      "meaning": "có khả năng phục hồi",
      "pronunciation": "/rɪˈzɪliənt/",
      "example": "She remained resilient after the setback.",
      "createdAt": "2026-08-22T00:00:00.000Z",
      "updatedAt": "2026-08-22T00:00:00.000Z",
      "srsInterval": 0,
      "srsEase": 2.5,
      "srsDueAt": null,
      "srsReviewCount": 0
    }
  ]
}
```

Import behavior:

- Accepts the current backup envelope and older array-style or legacy word shapes.
- Validates and normalizes records before writing them.
- Skips invalid records and reports the number skipped.
- Deduplicates imported records by normalized vocabulary.
- Adds new words and updates matching existing words in a single IndexedDB transaction.
- Preserves existing record identity and creation time when updating a matching word.
- Rejects invalid JSON, missing word lists, and files larger than 10 MB.

Older app builds may not understand newer SRS fields, but those fields are preserved by current Word Garden backups and are ignored safely by older builds.

## Privacy and offline model

Word Garden is local-first:

- Vocabulary is stored in the browser's IndexedDB database.
- Theme preference is stored in local storage under `word-garden:theme`.
- No account or login is required.
- No vocabulary is sent to a server by the application.
- No analytics, advertising, cloud sync, or external API is included.
- Pronunciation uses the browser's local Speech Synthesis API when available.
- A service worker precaches the app's same-origin static assets for offline startup.

Because the data is local, clearing browser site data can remove the dictionary. Export a backup regularly.

## Technical architecture

The app uses dependency-free browser JavaScript loaded directly from `index.html` in this order:

```text
logic.js → storage.js → view.js → backup.js → review.js → app.js
```

| File | Responsibility |
| --- | --- |
| `index.html` | Semantic application markup, dialogs, icons, and script loading order |
| `styles.css` | Responsive layout, light/dark themes, review cards, controls, and accessibility states |
| `logic.js` | Pure validation, normalization, filtering, pagination, escaping, import preparation, and SRS calculations |
| `storage.js` | IndexedDB connection, persistence, compatibility mapping, and legacy migration |
| `view.js` | Dictionary table rendering, part-of-speech controls, toasts, and pagination rendering |
| `backup.js` | JSON export and validated import parsing |
| `review.js` | Review queue, answer reveal, grading flow, progress, and completion summary |
| `app.js` | Application state, event wiring, CRUD orchestration, theme handling, shortcuts, and service-worker registration |
| `sw.js` | Cache-first service-worker strategy for same-origin app assets |
| `manifest.json` | Installable PWA metadata and icons |
| `tests/` | Node's built-in test suite for core logic and compatibility behavior |

### IndexedDB contract

The database contract is intentionally stable:

```text
Database:   word-garden
Version:    1
Store:      words
Key path:   id
Indexes:    wordKey (unique), updatedAt
```

The UI calls the vocabulary field `vocabulary`, while persisted records use `word` for compatibility. `partsOfSpeech` is the canonical multi-value field; the legacy singular `partOfSpeech` field remains in stored records and backups. Missing SRS fields are normalized to the new-word state.

When supported by the browser, the app also checks for the previous `lexilo_personal_dictionary` database and migrates records that are not already present in Word Garden.

## Development and verification

No package installation is needed for the application. Node.js is only needed to run the automated tests.

Run the complete test suite:

```sh
node --test tests/*.test.js
```

Run the compatibility test specified by the project guidance:

```sh
node --test tests/part-of-speech.test.js
```

Useful static checks:

```sh
node --check app.js
node --check backup.js
node --check logic.js
node --check review.js
node --check storage.js
node --check view.js
```

When changing storage, backups, or Review mode, manually verify in a browser:

- Add a word and reload the page.
- Edit every editable field and reload again.
- Search, filter, sort, paginate, and select rows.
- Export a current backup and import it into a clean origin.
- Import a legacy backup.
- Delete one word and multiple words.
- Review a new word, test all four grades, and confirm the next intervals.
- Confirm due-word counts after grading and after a reload.
- Test both review directions and keyboard shortcuts.
- Test pronunciation in a browser that supports Speech Synthesis.
- Test light/dark theme persistence.
- Test offline startup after the service worker has cached the app assets.

## Known boundaries

- There is no cross-device or cross-browser synchronization; JSON export/import is the portability mechanism.
- Review scheduling uses whole days and does not currently implement minute-level learning steps.
- Pronunciation depends on browser support and the voices available on the user's device.
- Service-worker caching is optional. The core app remains usable when the service worker cannot register.
- Browser privacy settings, disabled IndexedDB, private browsing behavior, or storage quotas can prevent persistence.

## License

Word Garden is released into the public domain under the [Unlicense](./LICENSE).
