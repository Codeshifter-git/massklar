// maßklar. v2 — same math as v1 (app-2.js), plus the reel lessons:
// live auto-calc, friendly field states, example autofill, saved inputs.
// Vanilla JS only. No framework, no tracking.
const unitInMeters = { mm: 0.001, cm: 0.01, m: 1, km: 1000 };
const STORAGE_KEY = "massklar_v1_250";

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
    scaleInput.value = s.scale ?? "250";
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
    renderLengthTable();
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
  drawingInput.value = "4";
  drawingUnit.value = "cm";
  realInput.value = "";
  realUnit.value = "km";
  scaleInput.value = "250";
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
// Length table: for the current scale, the common map lengths in real life.
// Re-renders whenever the scale changes (live, like the calculator itself).
const LENGTH_CM = [0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 16, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100];
const lengthTableScale = document.querySelector("#length-table-scale");
const lengthBodies = [...document.querySelectorAll(".length-table tbody")];
function formatRealLength(realCm) {
  if (realCm >= 100000) return `${format(realCm / 100000)} km`;
  if (realCm >= 100) return `${format(realCm / 100)} m`;
  return `${format(realCm)} cm`;
}
function renderLengthTable() {
  const scale = Number(scaleInput.value);
  if (!Number.isFinite(scale) || scale <= 0) return; // keep the last good table
  lengthTableScale.textContent = `1:${format(scale)}`;
  lengthBodies.forEach((tbody, i) => {
    const rows = LENGTH_CM.slice(i * 12, i * 12 + 12);
    tbody.innerHTML = rows.map((cm) =>
      `<tr class="length-row" data-cm="${cm}"><th scope="row">${format(cm)} cm</th><td>${formatRealLength(cm * scale)}</td></tr>`
    ).join("");
  });
  // Click a row: that map length, in reality, at the current scale.
  document.querySelectorAll(".length-row").forEach((row) => {
    row.addEventListener("click", () => {
      setTarget("real", { save: false });
      drawingInput.value = row.dataset.cm;
      drawingUnit.value = "cm";
      realInput.value = "";
      calculate();
      document.querySelector("#rechner").scrollIntoView({ behavior: "smooth" });
    });
  });
}
// Two-scale compare: same real length, different map.
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
  const resultText = `${format(result)} ${unit}`;
  compareValue.textContent = resultText;
  compareContext.textContent = `${format(length)} ${unit} auf der Karte mit 1:${format(scaleA)} sind auf der Karte mit 1:${format(scaleB)} ${resultText} lang.`;
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
if (!loadState()) setTarget("real", { save: false });
calculate();
