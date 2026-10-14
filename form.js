// Injected only after an explicit popup action. Never submits the form.
(() => {
  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
  function labelFor(el) {
    const labels = Array.from(el.labels || [])
      .map((label) => label.textContent.trim())
      .filter(Boolean);
    if (labels.length)
      return labels.join(" ").replace(/\s+/g, " ").slice(0, 180);
    const labelled = (el.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent || "")
      .join(" ")
      .trim();
    return (
      labelled ||
      el.getAttribute("aria-label") ||
      el.placeholder ||
      el.name ||
      el.id ||
      ""
    );
  }
  function guess(el, label) {
    const text = normalize(`${label} ${el.name || ""} ${el.id || ""}`);
    // Property identifiers and consent are never eligible for contact autofill.
    if (
      /\b(plate|brand|model|sales contact|salescontact|property|vehicle|captcha|consent|privacy|terms|password)\b/.test(
        text,
      )
    )
      return null;
    const autocomplete = el.getAttribute("autocomplete");
    const autocompleteMap = {
      "given-name": "firstName",
      "family-name": "lastName",
      "additional-name": "middleName",
      name: "fullName",
      email: "email",
      tel: "mobile",
      "street-address": "address",
      "address-level2": "city",
      "address-level1": "province",
      "postal-code": "postalCode",
      "country-name": "country",
    };
    if (autocompleteMap[autocomplete]) return autocompleteMap[autocomplete];
    if (/first.?name|given.?name|firstname/.test(text)) return "firstName";
    if (/last.?name|family.?name|surname|lastname/.test(text))
      return "lastName";
    if (/middle.?name|middlename/.test(text)) return "middleName";
    if (/e.?mail/.test(text) || el.type === "email") return "email";
    if (/mobile|cell.?phone|contact.?number/.test(text)) return "mobile";
    if (/telephone|landline|phone.?number/.test(text)) return "telephone";
    if (/postal|zip.?code/.test(text)) return "postalCode";
    if (/province|state/.test(text)) return "province";
    if (/\bcity\b|municipality/.test(text)) return "city";
    if (/country/.test(text)) return "country";
    if (/street|address/.test(text)) return "address";
    if (/message|remarks|comments|inquiry details/.test(text)) return "message";
    if (
      /full.?name|complete.?name|customer.?name|buyer.?name|^name$/.test(text)
    )
      return "fullName";
    return "";
  }
  function collect(doc, frame = "top", result = []) {
    // Include same-origin embedded forms; third-party frames are inaccessible.
    for (const el of doc.querySelectorAll("input, textarea, select")) {
      const type = (el.type || el.tagName).toLowerCase();
      if (
        el.disabled ||
        el.readOnly ||
        ![
          "text",
          "email",
          "tel",
          "number",
          "textarea",
          "select-one",
          "search",
          "url",
        ].includes(type)
      )
        continue;
      if (el.getClientRects().length === 0) continue;
      const label = labelFor(el);
      const suggested = guess(el, label);
      if (suggested === null) continue;
      const key = [
        frame,
        el.tagName,
        type,
        el.id || "",
        el.name || "",
        label,
      ].join("|");
      result.push({
        el,
        key,
        label: label || "Unlabelled field",
        type,
        suggested,
        hasValue: !!el.value,
      });
    }
    for (const [index, iframe] of Array.from(
      doc.querySelectorAll("iframe"),
    ).entries()) {
      try {
        if (iframe.contentDocument)
          collect(iframe.contentDocument, `${frame}/frame${index}`, result);
      } catch {
        /* Cross-origin iframe: do not request broader bank access. */
      }
    }
    return result;
  }
  function setValue(el, value) {
    if (el.tagName === "SELECT") {
      const option = Array.from(el.options).find(
        (o) =>
          !o.disabled &&
          (normalize(o.value) === normalize(value) ||
            normalize(o.text) === normalize(value)),
      );
      if (!option) return false;
      value = option.value;
    }
    const win = el.ownerDocument.defaultView;
    const prototype =
      el.tagName === "TEXTAREA"
        ? win.HTMLTextAreaElement.prototype
        : el.tagName === "SELECT"
          ? win.HTMLSelectElement.prototype
          : win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(el, value);
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
    el.dispatchEvent(new win.Event("change", { bubbles: true }));
    return true;
  }

  const DEFAULTS = [
    { label: "Request Type", value: "Buy Now", kind: "radio" },
    { label: "Preferred Sales Officer", value: "None", kind: "choice" },
    { label: "Source/Channel", value: "BDO Website", kind: "choice" },
    {
      label: "Would you like to finance your purchase with a BDO Loan?",
      value: "No",
      kind: "radio",
    },
  ];

  function queryDeep(root, selector) {
    const found = Array.from(root.querySelectorAll(selector));
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) found.push(...queryDeep(el.shadowRoot, selector));
    }
    return found;
  }
  function visible(el) {
    const win = el.ownerDocument.defaultView;
    return (
      !!el.getClientRects().length &&
      win.getComputedStyle(el).visibility !== "hidden"
    );
  }
  function parentOf(el) {
    return el.parentElement || el.getRootNode()?.host || null;
  }
  function groupFor(doc, label) {
    const title = queryDeep(doc, "label, legend, span, p, h2, h3, div")
      .filter(
        (el) => normalize(el.textContent) === normalize(label) && visible(el),
      )
      .sort(
        (a, b) =>
          a.querySelectorAll("*").length - b.querySelectorAll("*").length,
      )[0];
    let anchor = title;
    if (!anchor) {
      const hint =
        label === "Preferred Sales Officer"
          ? /officer/
          : label === "Source/Channel"
            ? /source|channel/
            : null;
      if (hint)
        anchor = queryDeep(doc, 'input, [role="combobox"], select').find(
          (el) =>
            hint.test(
              normalize(
                `${el.placeholder || ""} ${el.name || ""} ${el.id || ""} ${el.getAttribute("aria-label") || ""}`,
              ),
            ) && visible(el),
        );
    }
    if (!anchor) return null;
    for (
      let group = parentOf(anchor), depth = 0;
      group && depth < 8;
      group = parentOf(group), depth++
    ) {
      if (group.matches("form,body,html")) break;
      if (
        queryDeep(
          group,
          'input, select, [role="combobox"], [role="radio"], button[aria-haspopup="listbox"]',
        ).length
      )
        return group;
    }
    return null;
  }
  function optionText(el) {
    return normalize(labelFor(el) || el.textContent || el.value);
  }
  async function chooseDefault(doc, setting) {
    const group = groupFor(doc, setting.label);
    if (!group) return false;
    const targetText = normalize(setting.value);
    if (setting.kind === "radio") {
      const radio = queryDeep(
        group,
        'input[type="radio"], [role="radio"]',
      ).find(
        (el) =>
          optionText(el) === targetText ||
          normalize(el.value) === targetText ||
          normalize(el.closest("label")?.textContent) === targetText,
      );
      if (
        !radio ||
        radio.disabled ||
        radio.getAttribute("aria-disabled") === "true"
      )
        return false;
      if (radio.checked || radio.getAttribute("aria-checked") === "true")
        return true;
      const label = Array.from(radio.labels || [])[0] || radio.closest("label");
      (label || radio).click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return radio.type === "radio"
        ? radio.checked
        : radio.getAttribute("aria-checked") === "true";
    }
    const select = queryDeep(group, "select")[0];
    if (select && !select.disabled && setValue(select, setting.value))
      return true;
    const controls = queryDeep(
      group,
      '[role="combobox"], input:not([type="hidden"]), button[aria-haspopup="listbox"]',
    );
    const control = controls.find(
      (el) =>
        visible(el) &&
        !el.disabled &&
        el.getAttribute("aria-disabled") !== "true",
    );
    if (!control) return false;
    const chosen = () =>
      normalize(control.value || control.textContent) === targetText ||
      queryDeep(
        group,
        '.vs__selected, .select2-selection__rendered, .slds-pill__label, [class*="single-value"], [class*="singleValue"]',
      ).some((el) => normalize(el.textContent) === targetText && visible(el));
    if (chosen()) return true;
    const findOption = () => {
      const listId =
        control.getAttribute("aria-controls") ||
        control.getAttribute("aria-owns");
      const scope = listId ? doc.getElementById(listId) || doc : doc;
      // Some BDO lookup menus use plain div/span items without option roles.
      return queryDeep(scope, '[role="option"], li, button, div, span, a')
        .filter(
          (el) =>
            normalize(el.textContent) === targetText &&
            visible(el) &&
            el.getAttribute("aria-disabled") !== "true" &&
            !el.matches("label,input,select"),
        )
        .sort(
          (a, b) =>
            a.querySelectorAll("*").length - b.querySelectorAll("*").length,
        )[0];
    };
    const win = doc.defaultView;
    const open = (el) => {
      el.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true }));
      el.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true }));
      el.click();
    };
    control.focus();
    open(control);
    for (let attempt = 0; attempt < 40; attempt++) {
      // Click the actual option so the site's backing selection is committed.
      const option = findOption();
      if (option) {
        open(option);
        for (let verify = 0; verify < 10; verify++) {
          if (chosen() || option.getAttribute("aria-selected") === "true")
            return true;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return false;
      }
      // Lookup wrappers and chevrons sometimes own the menu event.
      if (attempt === 10) {
        const toggle = queryDeep(
          group,
          'button:not([type="submit"]), [aria-haspopup="listbox"], [class*="dropdown-toggle"], [class*="dropdown__toggle"], [class*="open-indicator"], [class*="chevron"]',
        ).find((el) => visible(el) && !el.disabled && el !== control);
        const wrapper = toggle || parentOf(control);
        if (wrapper && wrapper !== group) open(wrapper);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    control.dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    return false;
  }
  async function acceptPrivacy(doc) {
    const result = { scrolled: false, checked: false };
    const phrase = /i have read.*understood.*agree.*data privacy.*consent/i;
    const checkbox = queryDeep(
      doc,
      'input[type="checkbox"], [role="checkbox"]',
    ).find((el) =>
      phrase.test(labelFor(el) || el.closest("label")?.textContent || ""),
    );
    if (!checkbox) {
      for (const frame of doc.querySelectorAll("iframe")) {
        try {
          if (frame.contentDocument) {
            const nested = await acceptPrivacy(frame.contentDocument);
            if (nested.checked) return nested;
          }
        } catch {}
      }
      return result;
    }
    const box = queryDeep(doc, "div, section, textarea")
      .filter(
        (el) =>
          el.scrollHeight > el.clientHeight + 10 &&
          el.clientHeight > 50 &&
          /data privacy|privacy statement/i.test(
            el.textContent || el.value || "",
          ),
      )
      .sort((a, b) => a.clientHeight - b.clientHeight)[0];
    if (box) {
      box.scrollTop = box.scrollHeight;
      box.dispatchEvent(new doc.defaultView.Event("scroll", { bubbles: true }));
      result.scrolled = true;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    checkbox.scrollIntoView({ block: "center", behavior: "instant" });
    if (checkbox.checked || checkbox.getAttribute("aria-checked") === "true") {
      result.checked = true;
      return result;
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      if (
        !checkbox.disabled &&
        checkbox.getAttribute("aria-disabled") !== "true"
      ) {
        (
          Array.from(checkbox.labels || [])[0] ||
          checkbox.closest("label") ||
          checkbox
        ).click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        result.checked =
          checkbox.type === "checkbox"
            ? checkbox.checked
            : checkbox.getAttribute("aria-checked") === "true";
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return result;
  }
  async function applyDefaults(doc) {
    const results = { selected: [], unavailable: [] };
    for (const setting of DEFAULTS) {
      let selected = await chooseDefault(doc, setting);
      if (!selected) {
        for (const iframe of doc.querySelectorAll("iframe")) {
          try {
            if (
              iframe.contentDocument &&
              (await chooseDefault(iframe.contentDocument, setting))
            ) {
              selected = true;
              break;
            }
          } catch {}
        }
      }
      (selected ? results.selected : results.unavailable).push(
        `${setting.label}: ${setting.value}`,
      );
    }
    return results;
  }
  globalThis.bdoInquiryForm = function (
    mode,
    profile = {},
    mapping = {},
    overwrite = false,
  ) {
    if (
      location.protocol !== "https:" ||
      !/(^|\.)bdo\.com\.ph$/.test(location.hostname) ||
      !/^\/personal\/assets-for-sale\/vehicles\/inquire-now(?:\.html)?\/?$/.test(
        location.pathname,
      )
    ) {
      throw new Error("Open the BDO vehicles-for-sale inquiry form first.");
    }
    if (mode === "defaults") return applyDefaults(document);
    if (mode === "privacy") return acceptPrivacy(document);
    const fields = collect(document);
    // Ambiguous duplicate fields are excluded rather than filled by position.
    const unique = fields.filter(
      (f) => fields.filter((other) => other.key === f.key).length === 1,
    );
    if (mode === "scan")
      return {
        fields: unique.map(({ el, ...metadata }) => metadata),
        blockedFrames: Array.from(document.querySelectorAll("iframe")).filter(
          (frame) => {
            try {
              return !frame.contentDocument;
            } catch {
              return true;
            }
          },
        ).length,
      };
    if (mode !== "fill") throw new Error("Unknown action");
    const values = {
      ...profile,
      fullName: [profile.firstName, profile.middleName, profile.lastName]
        .filter(Boolean)
        .join(" "),
    };
    const outcome = { filled: [], kept: [], skipped: [], missing: [] };
    for (const [key, source] of Object.entries(mapping)) {
      if (!source || !Object.hasOwn(values, source)) continue;
      const field = unique.find((f) => f.key === key);
      if (!field) {
        outcome.missing.push(key);
        continue;
      }
      const value = String(values[source] || "").trim();
      if (!value) {
        outcome.skipped.push(field.label);
        continue;
      }
      if (field.hasValue && !overwrite) {
        outcome.kept.push(field.label);
        continue;
      }
      if (setValue(field.el, value)) outcome.filled.push(field.label);
      else outcome.skipped.push(field.label);
    }
    return outcome;
  };
})();
