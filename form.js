// Injected only after an explicit popup action. Never submits or changes consent.
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
