// maßklar. v2 — same math as v1 (app-2.js), plus the reel lessons:
// live auto-calc, friendly field states, example autofill, saved inputs.
// Vanilla JS only. No framework, no tracking.
const unitInMeters = { mm: 0.001, cm: 0.01, m: 1, km: 1000 };
const STORAGE_KEY = "massklar_v1";

const form = document.querySelector("#scale-form");
const segmented = document.querySelector("#target-segmented");
const segButtons = [...document.querySelectorAll("#target-segmented button")];
const drawingInput = document.querySelector("#drawing-length");
const drawingUnit = document.querySelector("#drawing-unit");
const realInput = document.querySelector("#real-length");
const realUnit = document.querySelector("#real-unit");
const scaleInput = document.querySelector("#scale-denominator");
const errorMessage = document.querySelector("#form-error");
const resultValue = document.querySelector("#result-value");
const resultContext = document.querySelector("#result-context");
const resultAlso = document.querySelector("#result-also");
const resultFormula = document.querySelector("#result-formula");
const resultPanel = document.querySelector("#result-panel");
const calculateButton = document.querySelector(".calculate-button");
const copyButton = document.querySelector("#copy-button");
const formatNumber = new Intl.NumberFormat("de-DE", { maximumSignificantDigits: 8 });

let target = "real";
let lastSubmitAt = 0;
let lastValue = "";

function format(value) { return formatNumber.format(value); }
function formatLength(meters, preferredUnit) {
  return `${format(meters / unitInMeters[preferredUnit])} ${preferredUnit}`;
}
function formatScale(drawingMeters, realMeters) {
  const ratio = drawingMeters / realMeters;
  return ratio <= 1 ? `1 : ${format(1 / ratio)}` : `${format(ratio)} : 1`;
}
// Result in every unit at once (like the big competitor sites do):
// "Das sind auch: 1.000.000 mm · 100.000 cm · 1.000 m".
function alsoInOtherUnits(meters, shownUnit) {
  return ["mm", "cm", "m", "km"]
    .filter((unit) => unit !== shownUnit)
    .map((unit) => formatLength(meters, unit))
    .join(" · ");
}

// Friendly errors (Lincoln tell #13: no raw error text) + per-field state (#6).
const FIELD_LABELS = {
  drawing: "Die Länge auf dem Plan",
  real: "Die Länge in echt",
  scale: "Der Maßstab",
};
function friendlyError(key) {
  return `${FIELD_LABELS[key]}: Bitte eine Zahl größer als 0 eintippen.`;
}
function markField(fieldId, state) {
  const field = document.querySelector(`#${fieldId}`);
  if (!field) return;
  field.classList.toggle("is-valid", state === "valid");
  field.classList.toggle("is-invalid", state === "invalid");
}
function clearFieldStates() {
  for (const id of ["drawing-field", "real-field", "scale-field"]) markField(id, "");
}
function fail(message, badKey) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
  resultPanel.hidden = true;
  clearFieldStates();
  if (badKey === "drawing") markField("drawing-field", "invalid");
  if (badKey === "real") markField("real-field", "invalid");
  if (badKey === "scale") markField("scale-field", "invalid");
}
function readPositive(input, key) {
  const value = Number(input.value);
  if (!input.value.trim() || !Number.isFinite(value) || value <= 0) {
    const err = new Error(friendlyError(key));
    err.fieldKey = key;
    throw err;
  }
  return value;
}

function setTarget(next, { save = true } = {}) {
  target = next;
  const index = ["real", "drawing", "scale"].indexOf(next);
  segmented.dataset.active = String(index);
  segButtons.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.target === next)));
  const disabledField = next === "real" ? "real-field" : next === "drawing" ? "drawing-field" : "scale-field";
  for (const id of ["drawing-field", "real-field", "scale-field"]) {
    const field = document.querySelector(`#${id}`);
    const disabled = id === disabledField;
    field.querySelectorAll("input").forEach((input) => {
      input.disabled = disabled;
      input.required = !disabled;
    });
  }
  calculateButton.textContent = ` ${next === "scale" ? "Maßstab" : next === "drawing" ? "Länge auf dem Plan" : "Echte Länge"} berechnen `;
  const arrow = document.createElement("span");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";
  calculateButton.append(arrow);
  errorMessage.hidden = true;
  if (save) saveState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      target,
      drawing: drawingInput.value, drawingUnit: drawingUnit.value,
      real: realInput.value, realUnit: realUnit.value,
      scale: scaleInput.value,
    }));
  } catch { /* private mode — the calculator still works, it just forgets */ }
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || !["real", "drawing", "scale"].includes(s.target)) return false;
    drawingInput.value = s.drawing ?? "4";
    drawingUnit.value = s.drawingUnit ?? "cm";
    realInput.value = s.real ?? "";
    realUnit.value = s.realUnit ?? "km";
    scaleInput.value = s.scale ?? "25000";
    setTarget(s.target, { save: false });
    return true;
  } catch { return false; }
}

function calculate(event) {
  if (event) event.preventDefault();
  errorMessage.hidden = true;
  try {
    const drawingMeters = target === "drawing" ? null : readPositive(drawingInput, "drawing");
    const realMeters = target === "real" ? null : readPositive(realInput, "real");
    const scaleDenominator = target === "scale" ? null : readPositive(scaleInput, "scale");
    let value, context, formula, alsoMeters, alsoUnit;

    if (target === "real") {
      const drawing = drawingMeters * unitInMeters[drawingUnit.value];
      const real = drawing * scaleDenominator;
      if (!Number.isFinite(real)) throw new Error("Das Ergebnis ist zu groß. Schau dir deine Zahlen noch einmal an.");
      value = formatLength(real, realUnit.value);
      context = `${format(drawingMeters)} ${drawingUnit.value} auf der Karte sind bei 1:${format(scaleDenominator)} in echt ${value} lang.`;
      // v1 app-2.js fix: formula result in the drawing unit, not metres.
      formula = `${format(drawingMeters)} ${drawingUnit.value} × ${format(scaleDenominator)} = ${formatLength(real, drawingUnit.value)}`;
      alsoMeters = real; alsoUnit = realUnit.value;
      realInput.value = String(real / unitInMeters[realUnit.value]);
    } else if (target === "drawing") {
      const real = realMeters * unitInMeters[realUnit.value];
      const drawing = real / scaleDenominator;
      if (!Number.isFinite(drawing)) throw new Error("Das Ergebnis ist zu groß. Schau dir deine Zahlen noch einmal an.");
      value = formatLength(drawing, drawingUnit.value);
      context = `${format(realMeters)} ${realUnit.value} in echt sind bei 1:${format(scaleDenominator)} auf dem Plan ${value} lang.`;
      formula = `${format(realMeters)} ${realUnit.value} ÷ ${format(scaleDenominator)} = ${formatLength(drawing, drawingUnit.value)}`;
      alsoMeters = drawing; alsoUnit = drawingUnit.value;
      drawingInput.value = String(drawing / unitInMeters[drawingUnit.value]);
    } else {
      const drawing = drawingMeters * unitInMeters[drawingUnit.value];
      const real = realMeters * unitInMeters[realUnit.value];
      if (!Number.isFinite(real / drawing)) throw new Error("Das Ergebnis ist zu groß. Schau dir deine Zahlen noch einmal an.");
      const ratio = formatScale(drawing, real);
      value = ratio;
      context = `${format(drawingMeters)} ${drawingUnit.value} auf dem Plan sind in echt ${format(realMeters)} ${realUnit.value} lang.`;
      formula = `${formatLength(drawing, "m")} : ${formatLength(real, "m")} = ${ratio}`;
      scaleInput.value = String(real / drawing);
    }

    resultValue.textContent = value;
    resultContext.textContent = context;
    resultFormula.textContent = formula;
    if (alsoMeters !== undefined) {
      resultAlso.textContent = `Das sind auch: ${alsoInOtherUnits(alsoMeters, alsoUnit)}`;
      resultAlso.hidden = false;
    } else {
      resultAlso.hidden = true;
    }
    resultPanel.hidden = false;
    clearFieldStates();
    if (target !== "real") markField("real-field", "valid");
    if (target !== "drawing") markField("drawing-field", "valid");
    if (target !== "scale") markField("scale-field", "valid");
    // Subtle flash on change so a live update is visible, not silent.
    if (value !== lastValue) {
      resultPanel.classList.remove("flash");
      void resultPanel.offsetWidth;
      resultPanel.classList.add("flash");
      lastValue = value;
    }
    saveState();
  } catch (error) {
    fail(error.message, error.fieldKey);
  }
}

function resetCalculator() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  drawingInput.value = "4";
  drawingUnit.value = "cm";
  realInput.value = "";
  realUnit.value = "km";
  scaleInput.value = "25000";
  setTarget("real", { save: false });
  calculate();
}

// Live auto-calc (Charles Liu: auto-submit, no verify step). The button stays
// as an explicit confirmation for keyboard / screen-reader users.
form.addEventListener("submit", (event) => {
  // Lincoln tell #9: a double tap must not submit twice.
  const now = Date.now();
  if (now - lastSubmitAt < 250) { event.preventDefault(); return; }
  lastSubmitAt = now;
  calculate(event);
});
for (const el of [drawingInput, drawingUnit, realInput, realUnit, scaleInput]) {
  el.addEventListener("input", () => calculate());
  el.addEventListener("change", () => calculate());
}
// Lincoln tell #3: keep the focused field visible above the mobile keyboard.
for (const el of [drawingInput, realInput, scaleInput]) {
  el.addEventListener("focus", () => el.scrollIntoView({ block: "nearest", behavior: "smooth" }));
}
segButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setTarget(button.dataset.target);
    calculate();
  });
});
// Example cards autofill the calculator (Charles Liu: autofill, applied to
// examples instead of SMS) and jump to it.
document.querySelectorAll(".example-card").forEach((card) => {
  card.addEventListener("click", () => {
    setTarget("real", { save: false });
    drawingInput.value = card.dataset.drawing;
    drawingUnit.value = card.dataset.drawingUnit;
    scaleInput.value = card.dataset.scale;
    realUnit.value = card.dataset.realUnit;
    realInput.value = "";
    calculate();
    document.querySelector("#rechner").scrollIntoView({ behavior: "smooth" });
  });
});
// Table rows fill the calculator with that scale (1 cm, real unit per row).
document.querySelectorAll(".scale-row").forEach((row) => {
  row.addEventListener("click", () => {
    setTarget("real", { save: false });
    drawingInput.value = "1";
    drawingUnit.value = "cm";
    scaleInput.value = row.dataset.scale;
    realUnit.value = row.dataset.realUnit;
    realInput.value = "";
    calculate();
    document.querySelector("#rechner").scrollIntoView({ behavior: "smooth" });
  });
});
document.querySelector("#reset-button").addEventListener("click", resetCalculator);
copyButton.addEventListener("click", async (event) => {
  try {
    await navigator.clipboard.writeText(`${resultValue.textContent} — ${resultContext.textContent}`);
    // Fill-then-confirm (ui_motion): button fills green, then restores.
    copyButton.classList.add("copied");
    copyButton.textContent = "Kopiert ✓";
    window.setTimeout(() => {
      copyButton.classList.remove("copied");
      copyButton.innerHTML = 'Ergebnis kopieren <span aria-hidden="true">⧉</span>';
    }, 1600);
  } catch {
    errorMessage.textContent = "Kopieren geht in diesem Browser leider nicht. Markiere das Ergebnis und kopiere es selbst.";
    errorMessage.hidden = false;
  }
});
document.querySelector("#current-year").textContent = new Date().getFullYear();
if (!loadState()) setTarget("real", { save: false });
calculate();
