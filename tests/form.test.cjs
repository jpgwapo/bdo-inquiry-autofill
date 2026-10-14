const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(
  require("node:path").join(__dirname, "../form.js"),
  "utf8",
);
class Input {
  constructor({
    name = "",
    label = "",
    type = "text",
    value = "",
    id = "",
    disabled = false,
    readOnly = false,
    visible = true,
    autocomplete = "",
  }) {
    Object.assign(this, {
      name,
      type,
      id,
      disabled,
      readOnly,
      visible,
      autocomplete,
      _value: value,
      tagName: "INPUT",
      labels: label ? [{ textContent: label }] : [],
      events: [],
    });
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this._value = value;
  }
  getClientRects() {
    return this.visible ? [{}] : [];
  }
  getAttribute(key) {
    return key === "autocomplete" ? this.autocomplete : null;
  }
  dispatchEvent(event) {
    this.events.push(event.type);
  }
}
class Textarea extends Input {
  constructor(options) {
    super({ ...options, type: "textarea" });
    this.tagName = "TEXTAREA";
  }
  get value() {
    return this._value;
  }
  set value(v) {
    this._value = v;
  }
}
class Select extends Input {
  constructor(options) {
    super({ ...options, type: "select-one" });
    this.tagName = "SELECT";
    this.options = options.options || [];
  }
  get value() {
    return this._value;
  }
  set value(v) {
    this._value = v;
  }
}
function setup(fields, extra = {}) {
  const doc = {
    querySelectorAll(selector) {
      return selector === "iframe" ? extra.frames || [] : fields;
    },
    getElementById() {
      return null;
    },
    defaultView: {
      HTMLInputElement: Input,
      HTMLTextAreaElement: Textarea,
      HTMLSelectElement: Select,
      Event: class {
        constructor(type, options) {
          this.type = type;
          this.bubbles = options.bubbles;
        }
      },
    },
  };
  fields.forEach((el) => (el.ownerDocument = doc));
  const context = vm.createContext({
    document: doc,
    location: {
      protocol: "https:",
      hostname: "www.bdo.com.ph",
      pathname: "/personal/assets-for-sale/vehicles/inquire-now",
      ...extra.location,
    },
  });
  vm.runInContext(source, context);
  return { act: context.bdoInquiryForm, doc };
}
function mapping(act) {
  return Object.fromEntries(
    act("scan").fields.map((f) => [f.key, f.suggested]),
  );
}
test("maps common buyer fields and dispatches native form events", () => {
  const fields = [
    new Input({ name: "firstName", label: "First name" }),
    new Input({ name: "surname", label: "Last name" }),
    new Input({ type: "email", label: "Email", name: "email" }),
    new Input({ type: "tel", label: "Mobile number", name: "mobile" }),
  ];
  const { act } = setup(fields);
  const result = act(
    "fill",
    {
      firstName: "Alex",
      lastName: "Santos",
      email: "alex@example.test",
      mobile: "09171234567",
    },
    mapping(act),
  );
  assert.equal(result.filled.length, 4);
  assert.equal(fields[0].value, "Alex");
  assert.deepEqual(fields[0].events, ["input", "change"]);
});
test("never touches vehicle, CAPTCHA, consent, passwords or hidden fields", () => {
  const fields = [
    new Input({ label: "Plate number", value: "DAU 8078" }),
    new Input({ label: "Brand", value: "Toyota" }),
    new Input({ label: "Model", value: "Fortuner" }),
    new Input({ label: "Salescontact", value: "1094000" }),
    new Input({ label: "CAPTCHA" }),
    new Input({ label: "Privacy consent", type: "checkbox" }),
    new Input({ label: "Password", type: "password" }),
    new Input({ label: "Email", type: "hidden" }),
    new Input({ label: "Email", readOnly: true }),
    new Input({ label: "Email", visible: false }),
  ];
  const { act } = setup(fields);
  assert.equal(act("scan").fields.length, 0);
  act("fill", { email: "alex@example.test" }, {});
  assert.equal(fields[0].value, "DAU 8078");
  assert.equal(fields[2].value, "Fortuner");
});
test("keeps existing values unless explicitly replaced", () => {
  const field = new Input({
    name: "email",
    type: "email",
    value: "old@example.test",
  });
  const { act } = setup([field]);
  const map = mapping(act);
  assert.equal(act("fill", { email: "new@example.test" }, map).kept.length, 1);
  assert.equal(field.value, "old@example.test");
  assert.equal(
    act("fill", { email: "new@example.test" }, map, true).filled.length,
    1,
  );
  assert.equal(field.value, "new@example.test");
});
test("combines names and matches dropdown option labels", () => {
  const full = new Input({ name: "name", label: "Full name" }),
    province = new Select({
      name: "province",
      label: "Province",
      options: [{ value: "MNL", text: "Metro Manila" }],
    }),
    message = new Textarea({ name: "message", label: "Message" });
  const { act } = setup([full, province, message]);
  assert.equal(
    act(
      "fill",
      {
        firstName: "Alex",
        middleName: "Reyes",
        lastName: "Santos",
        province: "Metro Manila",
        message: "Please send inspection details.",
      },
      mapping(act),
    ).filled.length,
    3,
  );
  assert.equal(full.value, "Alex Reyes Santos");
  assert.equal(province.value, "MNL");
  assert.equal(message.value, "Please send inspection details.");
});
test("skips blank profiles and unavailable dropdown options", () => {
  const email = new Input({ name: "email" }),
    country = new Select({
      name: "country",
      options: [{ value: "PH", text: "Philippines" }],
    });
  const { act } = setup([email, country]);
  const result = act("fill", { email: "", country: "Australia" }, mapping(act));
  assert.equal(result.filled.length, 0);
  assert.equal(result.skipped.length, 2);
  assert.equal(country.value, "");
});
test("refuses banking pages and lookalike domains", () => {
  for (const location of [
    { hostname: "bdo.com.ph.attacker.test" },
    { pathname: "/personal/online-banking" },
    { protocol: "http:" },
  ]) {
    const { act } = setup([], { location });
    assert.throws(() => act("scan"), /Open the BDO/);
  }
});
test("reports stale matches instead of filling another field", () => {
  const field = new Input({ name: "email" });
  const { act } = setup([field]);
  const map = mapping(act);
  field.name = "address";
  assert.equal(
    act("fill", { email: "alex@example.test" }, map).missing.length,
    1,
  );
  assert.equal(field.value, "");
});
test("skips indistinguishable duplicate fields", () => {
  const { act } = setup([
    new Input({ name: "email" }),
    new Input({ name: "email" }),
  ]);
  assert.equal(act("scan").fields.length, 0);
});
test("finds a same-origin embedded form and reports blocked frames", () => {
  const nested = setup([new Input({ name: "email", label: "Email" })]);
  const { act } = setup([], {
    frames: [{ contentDocument: nested.doc }, { contentDocument: null }],
  });
  const scan = act("scan");
  assert.equal(scan.fields.length, 1);
  assert.equal(scan.blockedFrames, 1);
  assert.equal(
    act("fill", { email: "alex@example.test" }, mapping(act)).filled.length,
    1,
  );
});
