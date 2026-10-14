// Restore model choices once per results-page visit. No buyer data is accessed.
(() => {
  const validPage = () =>
    location.protocol === "https:" &&
    /(^|\.)bdo\.com\.ph$/.test(location.hostname) &&
    /^\/personal\/assets-for-sale\/vehicles\/results-page(?:\.html)?\/?$/.test(
      location.pathname,
    );
  if (!validPage()) return;
  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const models = ["Hilux", "Fortuner"];
  function matches(input, model) {
    const target = normalize(model);
    const labels = Array.from(input.labels || []).map((label) =>
      normalize(label.textContent),
    );
    return (
      labels.includes(target) ||
      normalize(input.getAttribute("aria-label")) === target ||
      normalize(input.value) === target ||
      normalize(input.closest("label")?.textContent) === target ||
      normalize(input.parentElement?.textContent) === target
    );
  }
  function applyFilters() {
    if (globalThis.bdoResultsFiltersApplied) return true;
    const button = Array.from(
      document.querySelectorAll(
        'button, input[type="submit"], input[type="button"], [role="button"]',
      ),
    ).find(
      (el) =>
        /^apply filters?$/.test(
          normalize(
            el.textContent || el.value || el.getAttribute("aria-label"),
          ),
        ) &&
        !el.disabled &&
        el.getAttribute("aria-disabled") !== "true" &&
        el.getClientRects().length,
    );
    if (!button) return false;
    // Guard against a full-page form reload repeatedly submitting the same URL.
    const guardKey =
      "bdo-model-preset-applied:" + location.pathname + (location.search || "");
    try {
      const last = Number(sessionStorage.getItem(guardKey) || 0);
      if (last && Date.now() - last < 15000) {
        globalThis.bdoResultsFiltersApplied = true;
        return true;
      }
      sessionStorage.setItem(guardKey, String(Date.now()));
    } catch {
      /* Storage may be restricted; the per-document guard still applies. */
    }
    globalThis.bdoResultsFiltersApplied = true;
    button.click();
    return true;
  }
  function apply() {
    const selected = [],
      missing = [];
    for (const model of models) {
      // Re-query between clicks: applying the first filter may re-render the list.
      const inputs = Array.from(
        document.querySelectorAll('input[type="checkbox"]'),
      ).filter((input) => matches(input, model) && !input.disabled);
      if (!inputs.length) {
        missing.push(model);
        continue;
      }
      for (const input of inputs) if (!input.checked) input.click();
      if (inputs.some((input) => input.checked)) selected.push(model);
      else missing.push(model);
    }
    const applied = !missing.length && applyFilters();
    return { selected, missing, applied };
  }
  globalThis.bdoResultsPreset = apply;
  if (globalThis.bdoResultsPresetStarted) return;
  globalThis.bdoResultsPresetStarted = true;
  let observer, timer, deadline;
  const stop = () => {
    observer?.disconnect();
    clearTimeout(timer);
    clearTimeout(deadline);
    document.removeEventListener("change", manualChange, true);
  };
  const manualChange = (event) => {
    if (event.isTrusted && event.target.matches('input[type="checkbox"]'))
      stop();
  };
  const attempt = () => {
    const result = apply();
    if (!result.missing.length && result.applied) stop();
  };
  document.addEventListener("change", manualChange, true);
  observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(attempt, 100);
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["disabled", "aria-disabled"],
    childList: true,
    subtree: true,
  });
  deadline = setTimeout(stop, 20000);
  attempt();
})();
