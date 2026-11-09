// maßklar. Modellbau-Maßstabsrechner — same patterns as the main scale
// calculator (app.js): live auto-calc, friendly field states, example
// autofill, saved inputs. Vanilla JS only. No framework, no tracking.
const unitInMeters = { mm: 0.001, cm: 0.01, m: 1, km: 1000 };
const STORAGE_KEY = "massklar_modellbau_v1";

const form = document.querySelector("#scale-form");
const segmented = document.querySelector("#target-segmented");
const segButtons = [...document.querySelectorAll("#target-segmented button")];
const presetButtons = [...document.querySelectorAll(".preset-button")];
const drawingInput = document.querySelector("#drawing-length");
const drawingUnit = document.querySelector("#drawing-unit");
const realInput = document.querySelector("#real-length");
const realUnit = document.querySelector("#real-unit");
const scaleInput = document.querySelector("#scale-denominator");
const errorMessage = document.querySelector("#form-error");
const resultValue = document.querySelector("#result-value");
const resultContext = document.querySelector("#result-context");
const resultAlso = document.querySelector("#result-also");
const resultScaleNote = document.querySelector("#result-scale-note");
const resultFormula = document.querySelector("#result-formula");
const resultPanel = document.querySelector("#result-panel");
const calculateButton = document.querySelector(".calculate-button");
const copyButton = document.querySelector("#copy-button");
const formatNumber = new Intl.NumberFormat("de-DE", { maximumSignificantDigits: 8 });

let target = "drawing";
let lastSubmitAt = 0;
let lastValue = "";

function format(value) { return formatNumber.format(value); }
function formatLength(meters, preferredUnit) {
  return `${format(meters / unitInMeters[preferredUnit])} ${preferredUnit}`;
}
// Model lengths are measured to a tenth of a millimetre at most —
// "17,241379 cm" helps nobody. Round the display: 1 decimal for mm/cm,
// 2 for m, 3 for km. The math underneath stays exact.
const formatModelNumber = {
  mm: new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }),
  cm: new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }),
  m: new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }),
  km: new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }),
};
function formatModel(meters, preferredUnit) {
  return `${formatModelNumber[preferredUnit].format(meters / unitInMeters[preferredUnit])} ${preferredUnit}`;
}
function formatScale(drawingMeters, realMeters) {
  const ratio = drawingMeters / realMeters;
  return ratio <= 1 ? `1 : ${format(1 / ratio)}` : `${format(ratio)} : 1`;
}
// Result in every unit at once (like the big competitor sites do):
// "Das sind auch: 172,4 mm · 0,17 m".
function alsoInOtherUnits(meters, shownUnit) {
  return ["mm", "cm", "m", "km"]
    .filter((unit) => unit !== shownUnit)
    .map((unit) => formatModel(meters, unit))
    .join(" · ");
}

// Friendly errors (Lincoln tell #13: no raw error text) + per-field state (#6).
const FIELD_LABELS = {
  drawing: "Die Länge im Modell",
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

function markPreset(scaleDenominator) {
  presetButtons.forEach((b) => {
    b.classList.toggle("is-active",
      Number(b.dataset.scale) === scaleDenominator);
  });
}

function setTarget(next, { save = true } = {}) {
  target = next;
  const index = ["real", "drawing", "scale"].indexOf(next);
  segmented.dataset.active = String(index);
  segButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.target === next)));
  const disabledField = next === "real" ? "real-field" : next === "drawing" ? "drawing-field" : "scale-field";
  for (const id of ["drawing-field", "real-field", "scale-field"]) {
    const field = document.querySelector(`#${id}`);
    const disabled = id === disabledField;
    field.querySelectorAll("input").forEach((input) => {
      input.disabled = disabled;
      input.required = !disabled;
    });
  }
  calculateButton.textContent = ` ${next === "scale" ? "Maßstab" : next === "drawing" ? "Modell-Länge" : "Echte Länge"} berechnen `;
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
    drawingInput.value = s.drawing ?? "";
    drawingUnit.value = s.drawingUnit ?? "cm";
    realInput.value = s.real ?? "15";
    realUnit.value = s.realUnit ?? "m";
    scaleInput.value = s.scale ?? "87";
    setTarget(s.target, { save: false });
    return true;
  } catch { return false; }
}

function calculate(event, silent = false) {
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
      value = formatModel(real, realUnit.value);
      context = `${format(drawingMeters)} ${drawingUnit.value} im Modell sind bei 1:${format(scaleDenominator)} in echt ${value} lang.`;
      formula = `${format(drawingMeters)} ${drawingUnit.value} × ${format(scaleDenominator)} = ${formatModel(real, drawingUnit.value)}`;
      alsoMeters = real; alsoUnit = realUnit.value;
      realInput.value = String(real / unitInMeters[realUnit.value]);
    } else if (target === "drawing") {
      const real = realMeters * unitInMeters[realUnit.value];
      const drawing = real / scaleDenominator;
      if (!Number.isFinite(drawing)) throw new Error("Das Ergebnis ist zu groß. Schau dir deine Zahlen noch einmal an.");
      value = formatModel(drawing, drawingUnit.value);
      context = `${format(realMeters)} ${realUnit.value} in echt sind bei 1:${format(scaleDenominator)} im Modell ${value} lang.`;
      formula = `${format(realMeters)} ${realUnit.value} ÷ ${format(scaleDenominator)} = ${formatModel(drawing, drawingUnit.value)}`;
      alsoMeters = drawing; alsoUnit = drawingUnit.value;
      drawingInput.value = String(drawing / unitInMeters[drawingUnit.value]);
    } else {
      const drawing = drawingMeters * unitInMeters[drawingUnit.value];
      const real = realMeters * unitInMeters[realUnit.value];
      if (!Number.isFinite(real / drawing)) throw new Error("Das Ergebnis ist zu groß. Schau dir deine Zahlen noch einmal an.");
      const ratio = formatScale(drawing, real);
      value = ratio;
      context = `${format(drawingMeters)} ${drawingUnit.value} im Modell sind in echt ${format(realMeters)} ${realUnit.value} lang.`;
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
    const shownScale = target === "scale"
      ? Number(scaleInput.value) : scaleDenominator;
    if (Number.isFinite(shownScale) && shownScale > 0) {
      resultScaleNote.textContent =
        `Bei 1:${format(shownScale)}: Flächen ×${format(shownScale)}², Volumen und Gewicht ×${format(shownScale)}³.`;
      resultScaleNote.hidden = false;
      markPreset(shownScale);
    } else {
      resultScaleNote.hidden = true;
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
    // Silent while typing: clearing a field mid-typing (e.g. "4" -> "12")
    // must not flash the error or hide the last good result. The error
    // only shows on submit (button / Enter).
    if (silent) { errorMessage.hidden = true; return; }
    fail(error.message, error.fieldKey);
  }
}

function resetCalculator() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  drawingInput.value = "";
  drawingUnit.value = "cm";
  realInput.value = "15";
  realUnit.value = "m";
  scaleInput.value = "87";
  setTarget("drawing", { save: false });
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
  el.addEventListener("input", () => calculate(null, true));
  el.addEventListener("change", () => calculate(null, true));
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
// Nenngröße presets: one tap sets the scale, the calculator does the rest.
presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    scaleInput.value = button.dataset.scale;
    calculate();
    document.querySelector("#rechner").scrollIntoView({ behavior: "smooth" });
  });
});
// Example cards autofill the calculator and jump to it.
document.querySelectorAll(".example-card").forEach((card) => {
  card.addEventListener("click", () => {
    setTarget("drawing", { save: false });
    realInput.value = card.dataset.real;
    realUnit.value = card.dataset.realUnit;
    scaleInput.value = card.dataset.scale;
    drawingUnit.value = card.dataset.drawingUnit;
    drawingInput.value = "";
    calculate();
    document.querySelector("#rechner").scrollIntoView({ behavior: "smooth" });
  });
});
// Nenngröße table rows fill the calculator with that scale.
document.querySelectorAll(".scale-row").forEach((row) => {
  row.addEventListener("click", () => {
    setTarget("drawing", { save: false });
    scaleInput.value = row.dataset.scale;
    realUnit.value = row.dataset.realUnit;
    drawingInput.value = "";
    calculate();
    document.querySelector("#rechner").scrollIntoView({ behavior: "smooth" });
  });
});
// Ship speed: Froude's law — model speed = real speed ÷ √scale.
const shipSpeed = document.querySelector("#ship-speed");
const shipScale = document.querySelector("#ship-scale");
const shipError = document.querySelector("#ship-error");
const shipPanel = document.querySelector("#ship-result-panel");
const shipValue = document.querySelector("#ship-result-value");
const shipContext = document.querySelector("#ship-result-context");
const shipFormula = document.querySelector("#ship-result-formula");
const formatKn = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
function shipCalc(silent = false) {
  shipError.hidden = true;
  const speed = Number(shipSpeed.value);
  const scale = Number(shipScale.value);
  if (!shipSpeed.value.trim() || !Number.isFinite(speed) || speed <= 0
    || !shipScale.value.trim() || !Number.isFinite(scale) || scale <= 0) {
    if (silent) { shipError.hidden = true; return; }
    shipError.textContent = "Bitte überall eine Zahl größer als 0 eintippen.";
    shipError.hidden = false;
    shipPanel.hidden = true;
    return;
  }
  const result = speed / Math.sqrt(scale);
  const resultText = `${formatKn.format(result)} kn`;
  shipValue.textContent = resultText;
  shipContext.textContent = `${formatKn.format(speed)} Knoten in echt sind bei 1:${format(scale)} im Modell ${resultText}.`;
  shipFormula.textContent = `${formatKn.format(speed)} kn ÷ √${format(scale)} = ${resultText}`;
  shipPanel.hidden = false;
}
for (const el of [shipSpeed, shipScale]) {
  el.addEventListener("input", () => shipCalc(true));
  el.addEventListener("change", () => shipCalc(true));
}
document.querySelector("#ship-form").addEventListener("submit", (event) => {
  event.preventDefault();
  shipCalc();
});
shipCalc();
// Two-scale compare: same real length, different scale.
// Length B = Length A × (scale A ÷ scale B).
const compareLength = document.querySelector("#compare-length");
const compareUnit = document.querySelector("#compare-unit");
const compareScaleA = document.querySelector("#compare-scale-a");
const compareScaleB = document.querySelector("#compare-scale-b");
const compareError = document.querySelector("#compare-error");
const comparePanel = document.querySelector("#compare-result-panel");
const compareValue = document.querySelector("#compare-result-value");
const compareContext = document.querySelector("#compare-result-context");
const compareFormula = document.querySelector("#compare-result-formula");
function compareScales(silent = false) {
  compareError.hidden = true;
  const length = Number(compareLength.value);
  const scaleA = Number(compareScaleA.value);
  const scaleB = Number(compareScaleB.value);
  if (!compareLength.value.trim() || !Number.isFinite(length) || length <= 0
    || !compareScaleA.value.trim() || !Number.isFinite(scaleA) || scaleA <= 0
    || !compareScaleB.value.trim() || !Number.isFinite(scaleB) || scaleB <= 0) {
    // Same as the main calculator: no error flash while typing.
    if (silent) { compareError.hidden = true; return; }
    compareError.textContent = "Bitte überall eine Zahl größer als 0 eintippen.";
    compareError.hidden = false;
    comparePanel.hidden = true;
    return;
  }
  const result = length * (scaleA / scaleB);
  const unit = compareUnit.value;
  const resultText = formatModel(result * unitInMeters[unit], unit);
  compareValue.textContent = resultText;
  compareContext.textContent = `${format(length)} ${unit} auf dem Plan mit 1:${format(scaleA)} sind im Maßstab 1:${format(scaleB)} ${resultText} lang.`;
  compareFormula.textContent = `${format(length)} ${unit} × (${format(scaleA)} ÷ ${format(scaleB)}) = ${resultText}`;
  comparePanel.hidden = false;
}
for (const el of [compareLength, compareUnit, compareScaleA, compareScaleB]) {
  el.addEventListener("input", () => compareScales(true));
  el.addEventListener("change", () => compareScales(true));
}
document.querySelector("#compare-form").addEventListener("submit", (event) => {
  event.preventDefault();
  compareScales();
});
compareScales();
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
if (!loadState()) setTarget("drawing", { save: false });
calculate();
