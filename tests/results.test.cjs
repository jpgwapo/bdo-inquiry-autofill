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
) {
  let mutation,
    disconnected = false;
  const timers = [];
  const document = {
    documentElement: {},
    querySelectorAll() {
      return inputs;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const context = vm.createContext({
    document,
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
