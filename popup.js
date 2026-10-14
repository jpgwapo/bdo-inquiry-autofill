const profileForm = document.querySelector("#profile");
const fieldsBox = document.querySelector("#fields");
const fillButton = document.querySelector("#fill");
const inspectButton = document.querySelector("#inspect");
const statusBox = document.querySelector("#status");
const sources = {
  firstName: "First name",
  middleName: "Middle name",
  lastName: "Last name",
  fullName: "Full name (combined)",
  email: "Email",
  mobile: "Mobile number",
  telephone: "Telephone",
  address: "Street address",
  city: "City",
  province: "Province",
  postalCode: "Postal code",
  country: "Country",
  message: "Inquiry message",
};
let scannedTabId = null;
let scannedUrl = "";
let savedMapping = {};
let busy = false;
function status(text, error = false) {
  statusBox.textContent = text;
  statusBox.classList.toggle("error", error);
}
function readProfile() {
  return Object.fromEntries(new FormData(profileForm).entries());
}
function readMapping() {
  return Object.fromEntries(
    Array.from(fieldsBox.querySelectorAll("select")).map((select) => [
      select.dataset.key,
      select.value,
    ]),
  );
}
function validTab(tab) {
  try {
    const url = new URL(tab?.url);
    return (
      url.protocol === "https:" &&
      /(^|\.)bdo\.com\.ph$/.test(url.hostname) &&
      /^\/personal\/assets-for-sale\/vehicles\/inquire-now(?:\.html)?\/?$/.test(
        url.pathname,
      )
    );
  } catch {
    return false;
  }
}
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!validTab(tab))
    throw new Error(
      "Open the BDO vehicle inquiry form in this tab, then try again.",
    );
  return tab;
}
async function inPage(
  tab,
  mode,
  profile = {},
  mapping = {},
  overwrite = false,
) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["form.js"],
  });
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (...args) => globalThis.bdoInquiryForm(...args),
    args: [mode, profile, mapping, overwrite],
  });
  if (!result?.result)
    throw new Error(
      "The form could not be read. Wait for it to load and inspect again.",
    );
  return result.result;
}
async function perform(fn) {
  if (busy) return;
  busy = true;
  inspectButton.disabled = true;
  fillButton.disabled = true;
  try {
    await fn();
  } catch (error) {
    status(error.message, true);
  } finally {
    busy = false;
    inspectButton.disabled = false;
    fillButton.disabled =
      !fieldsBox.querySelector("select") ||
      !Object.values(readMapping()).some(Boolean);
  }
}
async function initialize() {
  // Restrict access to extension pages; injected page scripts never read storage.
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  const saved = await chrome.storage.local.get(["profile", "mapping"]);
  for (const [key, value] of Object.entries(saved.profile || {})) {
    const input = profileForm.elements.namedItem(key);
    if (input) input.value = value;
  }
  savedMapping = saved.mapping || {};
}
profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  perform(async () => {
    await chrome.storage.local.set({ profile: readProfile() });
    status("Your details are saved in this browser.");
  });
});
inspectButton.addEventListener("click", () =>
  perform(async () => {
    const tab = await activeTab();
    const result = await inPage(tab, "scan");
    scannedTabId = tab.id;
    scannedUrl = tab.url;
    fieldsBox.replaceChildren();
    for (const field of result.fields) {
      const row = document.createElement("div");
      row.className = "field-row";
      const label = document.createElement("label");
      label.textContent = field.label;
      const details = document.createElement("small");
      details.textContent = `${field.type}${field.hasValue ? " · Already has a value" : ""}`;
      const select = document.createElement("select");
      select.dataset.key = field.key;
      for (const [value, text] of [
        ["", "Leave unchanged"],
        ...Object.entries(sources),
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        select.append(option);
      }
      select.value = Object.hasOwn(savedMapping, field.key)
        ? savedMapping[field.key]
        : field.suggested || "";
      select.addEventListener("change", () => {
        fillButton.disabled = !Object.values(readMapping()).some(Boolean);
      });
      label.append(details, select);
      row.append(label);
      fieldsBox.append(row);
    }
    status(
      result.fields.length
        ? `Found ${result.fields.length} editable fields. Confirm the matches, then click Fill.`
        : result.blockedFrames
          ? "The form is inside a third-party frame. Its exact frame URL is needed to support it; no details have been filled."
          : "No editable fields found. Wait for the form to finish loading, then inspect again.",
      !result.fields.length,
    );
  }),
);
fillButton.addEventListener("click", () =>
  perform(async () => {
    if (!profileForm.reportValidity()) return;
    const tab = await activeTab();
    if (tab.id !== scannedTabId || tab.url !== scannedUrl)
      throw new Error(
        "The tab or vehicle changed. Inspect this form again before filling.",
      );
    const mapping = readMapping();
    const profile = readProfile();
    if (!Object.values(profile).some((value) => value.trim()))
      throw new Error("Enter your contact details first.");
    await chrome.storage.local.set({ profile, mapping });
    savedMapping = mapping;
    const result = await inPage(
      tab,
      "fill",
      profile,
      mapping,
      document.querySelector("#overwrite").checked,
    );
    const choices = await inPage(tab, "defaults");
    status(
      `${choices.selected.length}/4 preset choices selected.${choices.unavailable.length ? " Could not select: " + choices.unavailable.join("; ") + "." : ""} ${result.filled.length} field(s) filled. ${result.kept.length} existing value(s) kept. ${result.skipped.length} blank or unmatched value(s) skipped.${result.missing.length ? " Some fields changed; inspect again." : ""} Review and submit the BDO form yourself.`,
      !result.filled.length && !choices.selected.length,
    );
  }),
);
document.querySelector("#clear").addEventListener("click", () =>
  perform(async () => {
    await chrome.storage.local.remove(["profile", "mapping"]);
    profileForm.reset();
    savedMapping = {};
    fieldsBox.replaceChildren();
    scannedTabId = null;
    scannedUrl = "";
    document.querySelector("#overwrite").checked = false;
    status(
      "Saved details and field matches cleared. Values already filled on the website are unchanged.",
    );
  }),
);
initialize().catch((error) => status(error.message, true));
