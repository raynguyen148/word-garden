const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function createMockButton(options = {}) {
  const attributes = new Map(Object.entries(options.attributes || {}));
  const classes = new Set(options.classes || []);
  let innerHTML = options.innerHTML || "";
  let useHref = options.useHref || "#icon-copy";

  const useElement = {
    getAttribute(name) {
      if (name === "href") return useHref;
      return null;
    },
    setAttribute(name, value) {
      if (name === "href") useHref = value;
    },
    hasAttribute(name) {
      return name === "href";
    },
  };

  const button = {
    isConnected: options.isConnected !== undefined ? options.isConnected : true,
    classList: {
      add(cls) { classes.add(cls); },
      remove(cls) { classes.delete(cls); },
      has(cls) { return classes.has(cls); },
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    querySelector(selector) {
      if (options.hasUse === false) return null;
      if (selector === "use") return useElement;
      return null;
    },
    get useHref() {
      return useHref;
    },
    get innerHTML() {
      return innerHTML;
    },
    set innerHTML(val) {
      innerHTML = val;
    },
  };

  return button;
}

function loadViewModule() {
  const root = {
    DictionaryLogic: {
      escapeHtml: (s) => s,
      normalizePartsOfSpeech: (p) => [].concat(p || []),
      PARTS_OF_SPEECH: ["noun", "verb"],
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  const context = {
    window: root,
    document: {},
  };
  vm.runInNewContext(fs.readFileSync("view.js", "utf8"), context);
  return root.LexiloView;
}

test("showCopyFeedback switches icon to checked and restores to copy after duration", async function () {
  const view = loadViewModule();
  const button = createMockButton({
    attributes: {
      title: "Copy vocabulary",
      "aria-label": "Copy ephemeral",
    },
  });

  assert.equal(button.useHref, "#icon-copy");
  assert.equal(button.classList.has("copied"), false);

  view.showCopyFeedback(button, 50);

  // Immediately switched to checked
  assert.equal(button.useHref, "#icon-check");
  assert.equal(button.classList.has("copied"), true);
  assert.equal(button.getAttribute("title"), "Copied!");
  assert.equal(button.getAttribute("aria-label"), "Copied");

  // Wait for duration to expire
  await new Promise((resolve) => setTimeout(resolve, 80));

  // Restored back to original
  assert.equal(button.useHref, "#icon-copy");
  assert.equal(button.classList.has("copied"), false);
  assert.equal(button.getAttribute("title"), "Copy vocabulary");
  assert.equal(button.getAttribute("aria-label"), "Copy ephemeral");
});

test("showCopyFeedback resets timeout if clicked again before expiring", async function () {
  const view = loadViewModule();
  const button = createMockButton({
    attributes: {
      title: "Copy vocabulary",
      "aria-label": "Copy serendipity",
    },
  });

  view.showCopyFeedback(button, 60);
  assert.equal(button.useHref, "#icon-check");

  // Re-trigger after 30ms
  await new Promise((resolve) => setTimeout(resolve, 30));
  view.showCopyFeedback(button, 60);

  // At 50ms total (past original 60ms? No, 20ms into second run)
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(button.useHref, "#icon-check", "Still checked because timer was renewed");
  assert.equal(button.classList.has("copied"), true);

  // Wait until second timer finishes
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(button.useHref, "#icon-copy", "Restored after renewed duration");
  assert.equal(button.classList.has("copied"), false);
  assert.equal(button.getAttribute("title"), "Copy vocabulary");
});

test("showCopyFeedback falls back to innerHTML when use element is absent", async function () {
  const view = loadViewModule();
  const button = createMockButton({
    hasUse: false,
    innerHTML: '<svg><path d="copy"></path></svg>',
  });

  view.showCopyFeedback(button, 40);
  assert.match(button.innerHTML, /#icon-check/);
  assert.equal(button.classList.has("copied"), true);

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.match(button.innerHTML, /#icon-copy/);
  assert.equal(button.classList.has("copied"), false);
});
