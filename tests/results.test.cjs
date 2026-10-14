const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(
  require("node:path").join(__dirname, "../results.js"),
  "utf8",
);
function checkbox(text, checked = false) {
  return {
    labels: [{ textContent: text }],
    value: text,
    checked,
    disabled: false,
    clicks: 0,
    click() {
      this.checked = !this.checked;
      this.clicks++;
    },
    getAttribute() {
      return null;
    },
    closest() {
      return null;
    },
    parentElement: null,
  };
}
function setup(
  inputs,
  pathname = "/personal/assets-for-sale/vehicles/results-page",
  storage = undefined,
) {
  let mutation,
    disconnected = false;
  const timers = [];
  const applyButton = {
    textContent: "Apply Filters",
    disabled: false,
    clicks: 0,
    getAttribute() {
      return null;
    },
    getClientRects() {
      return [{}];
    },
    click() {
      this.clicks++;
    },
  };
  const document = {
    documentElement: {},
    querySelectorAll(selector) {
      return selector === 'input[type="checkbox"]' ? inputs : [applyButton];
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const context = vm.createContext({
    document,
    sessionStorage: storage,
    location: { protocol: "https:", hostname: "www.bdo.com.ph", pathname },
    MutationObserver: class {
      constructor(fn) {
        mutation = fn;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
    setTimeout(fn) {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout() {},
  });
  vm.runInContext(source, context);
  return {
    context,
    applyButton,
    mutation: () => mutation(),
    runLatest: () => timers[timers.length - 1](),
    stopped: () => disconnected,
  };
}
test("automatically checks Hilux/Fortuner and preserves unrelated filters", () => {
  const h = checkbox("Hilux"),
    f = checkbox("Fortuner"),
    t = checkbox("Toyota", true),
    v = checkbox("Vios");
  const env = setup([h, f, t, v]);
  assert.equal(h.checked, true);
  assert.equal(f.checked, true);
  assert.equal(t.checked, true);
  assert.equal(v.checked, false);
  assert.equal(env.stopped(), true);
});
test("never toggles an already selected favorite off", () => {
  const h = checkbox("Hilux", true),
    f = checkbox("Fortuner", true);
  const env = setup([h, f]);
  env.context.bdoResultsPreset();
  assert.equal(h.clicks, 0);
  assert.equal(f.clicks, 0);
});
test("restores filters that arrive after the page loads", () => {
  const list = [];
  const env = setup(list);
  assert.equal(env.stopped(), false);
  const h = checkbox("Hilux"),
    f = checkbox("Fortuner");
  list.push(h, f);
  env.mutation();
  env.runLatest();
  assert.equal(h.checked, true);
  assert.equal(f.checked, true);
  assert.equal(env.stopped(), true);
});
test("refuses inquiry and banking pages", () => {
  const h = checkbox("Hilux");
  const env = setup([h], "/personal/assets-for-sale/vehicles/inquire-now");
  assert.equal(h.checked, false);
  assert.equal(env.context.bdoResultsPreset, undefined);
});
test("supports duplicated desktop/mobile filter lists without toggling either off", () => {
  const inputs = [
    checkbox("Hilux"),
    checkbox("Fortuner"),
    checkbox("Hilux"),
    checkbox("Fortuner"),
  ];
  setup(inputs);
  assert.ok(inputs.every((input) => input.checked));
  assert.ok(inputs.every((input) => input.clicks === 1));
});

test("clicks Apply Filters once after both models are selected", () => {
  const env = setup([checkbox("Hilux"), checkbox("Fortuner")]);
  assert.equal(env.applyButton.clicks, 1);
  env.context.bdoResultsPreset();
  env.context.bdoResultsPreset();
  assert.equal(env.applyButton.clicks, 1);
});
test("does not submit filters when either requested model is missing", () => {
  const env = setup([checkbox("Hilux")]);
  assert.equal(env.applyButton.clicks, 0);
});

test("prevents repeated submission after a same-URL page reload", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const first = setup(
    [checkbox("Hilux"), checkbox("Fortuner")],
    undefined,
    storage,
  );
  const second = setup(
    [checkbox("Hilux"), checkbox("Fortuner")],
    undefined,
    storage,
  );
  assert.equal(first.applyButton.clicks, 1);
  assert.equal(second.applyButton.clicks, 0);
  assert.equal(second.stopped(), true);
});
