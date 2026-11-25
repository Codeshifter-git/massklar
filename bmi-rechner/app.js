// BMI-Rechner — berechnet den Body-Mass-Index aus Größe und Gewicht.
// Grenzen: WHO-Tabelle für Erwachsene ab 20 Jahren (18,5 / 25,0 / 30,0 / 35,0 / 40,0).
// Die Kategorie wird erst NACH dem Runden auf eine Nachkommastelle bestimmt,
// damit ein angezeigter Wert von 25,0 nie als Normalgewicht dasteht.

const STORAGE_KEY = "massklar_bmi_v1";

const form = document.getElementById("bmi-form");
const heightInput = document.getElementById("bmi-height");
const weightInput = document.getElementById("bmi-weight");
const ageInput = document.getElementById("bmi-age");
const waistInput = document.getElementById("bmi-waist");
const errorEl = document.getElementById("bmi-error");
const resultValue = document.getElementById("result-value");
const resultContext = document.getElementById("result-context");
const resultAlso = document.getElementById("result-also");
const resultExtra = document.getElementById("result-extra");
const resultFormula = document.getElementById("result-formula");
const scaleMarker = document.getElementById("scale-marker");
const whoTable = document.getElementById("who-table");
const copyButton = document.getElementById("bmi-copy");
const resetButton = document.getElementById("bmi-reset");

const DEFAULTS = { height: "175", weight: "70", age: "", waist: "" };

function parseDE(raw) {
  if (typeof raw !== "string") return NaN;
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return NaN;
  return Number(cleaned);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function fmt1(n) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmt2(n) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtM(n) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : fmt1(n);
}

function categoryOf(bmiRounded) {
  if (bmiRounded < 18.5) return { key: "unter", name: "Untergewicht" };
  if (bmiRounded < 25.0) return { key: "normal", name: "Normalgewicht" };
  if (bmiRounded < 30.0) return { key: "ueber", name: "Übergewicht" };
  if (bmiRounded < 35.0) return { key: "adi1", name: "Adipositas Grad I" };
  if (bmiRounded < 40.0) return { key: "adi2", name: "Adipositas Grad II" };
  return { key: "adi3", name: "Adipositas Grad III" };
}

function markError(input, message) {
  if (input) input.closest(".field").classList.add("has-error");
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  [heightInput, weightInput, ageInput, waistInput].forEach(function (input) {
    input.closest(".field").classList.remove("has-error");
  });
  errorEl.textContent = "";
  errorEl.hidden = true;
}

function compute(options) {
  const announceError = options && options.announceError;
  const height = parseDE(heightInput.value);
  const weight = parseDE(weightInput.value);
  const age = parseDE(ageInput.value);
  const waist = parseDE(waistInput.value);

  if (Number.isNaN(height)) {
    if (announceError) markError(heightInput, "Gib bitte deine Größe ein — in Zentimetern, z. B. 175.");
    return;
  }
  if (height < 100 || height > 250) {
    if (announceError) markError(heightInput, "Die Größe liegt zwischen 100 und 250 cm — hast du Zentimeter eingegeben? (z. B. 175, nicht 1,75)");
    return;
  }
  if (Number.isNaN(weight)) {
    if (announceError) markError(weightInput, "Gib bitte dein Gewicht ein — in Kilo, z. B. 70.");
    return;
  }
  if (weight < 20 || weight > 500) {
    if (announceError) markError(weightInput, "Das Gewicht liegt zwischen 20 und 500 kg — hast du Kilo eingegeben?");
    return;
  }
  if (!Number.isNaN(age) && (age < 1 || age > 120)) {
    if (announceError) markError(ageInput, "Das Alter liegt zwischen 1 und 120 Jahren.");
    return;
  }
  if (!Number.isNaN(waist) && (waist < 30 || waist > 250)) {
    if (announceError) markError(waistInput, "Der Taillenumfang liegt zwischen 30 und 250 cm.");
    return;
  }

  clearError();

  const meters = height / 100;
  const bmi = round1(weight / (meters * meters));
  const cat = categoryOf(bmi);
  const lo = round1(18.5 * meters * meters);
  const hi = round1(24.9 * meters * meters);
  const ideal = round1(21.7 * meters * meters);

  resultValue.textContent = fmt1(bmi);
  resultContext.textContent =
    "Bei " + fmtNum(height) + " cm und " + fmtNum(weight) + " kg ist dein BMI " + fmt1(bmi) + " — " + cat.name + ".";
  resultAlso.textContent =
    "Normalgewicht: " + fmt1(lo) + " – " + fmt1(hi) + " kg · Idealgewicht: " + fmt1(ideal) + " kg";

  const extraLines = [];
  if (weight < lo) {
    extraLines.push(fmt1(lo - weight) + " kg unter dem Normalgewicht.");
  } else if (weight > hi) {
    extraLines.push(fmt1(weight - hi) + " kg über dem Normalgewicht.");
  } else {
    extraLines.push("Du bist im Normalbereich.");
  }
  if (!Number.isNaN(waist)) {
    const whtr = waist / height;
    const whtrText = "Taille ÷ Größe = " + fmt2(whtr) + " — " +
      (whtr < 0.5 ? "kleiner als die halbe Größe." : "größer als die halbe Größe.");
    extraLines.push(whtrText);
  }
  if (!Number.isNaN(age) && age < 18) {
    extraLines.push("Achtung: Unter 18 Jahren gilt diese Tabelle nicht — Kinder und Jugendliche brauchen Perzentilkurven.");
  }
  if (!Number.isNaN(age) && age >= 65) {
    extraLines.push("Hinweis ab 65: Ein BMI von etwa 25 bis 30 gilt in diesem Alter oft als günstig (Stiftung Gesundheitswissen).");
  }
  resultExtra.innerHTML = extraLines.map(function (line) {
    return "<div>" + line + "</div>";
  }).join("");

  resultFormula.textContent =
    fmtNum(weight) + " ÷ (" + fmtM(meters) + " × " + fmtM(meters) + ") = " + fmt1(bmi);

  const pct = Math.min(100, Math.max(0, ((bmi - 14) / 28) * 100));
  scaleMarker.style.left = pct.toFixed(1) + "%";

  whoTable.querySelectorAll("tbody tr").forEach(function (row) {
    row.classList.toggle("is-you", row.getAttribute("data-cat") === cat.key);
  });
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      height: heightInput.value,
      weight: weightInput.value,
      age: ageInput.value,
      waist: waistInput.value
    }));
  } catch (e) {
    // Privater Modus o. ä. — der Rechner läuft auch ohne Speichern.
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (typeof saved.height === "string" && saved.height !== "") heightInput.value = saved.height;
    if (typeof saved.weight === "string" && saved.weight !== "") weightInput.value = saved.weight;
    if (typeof saved.age === "string") ageInput.value = saved.age;
    if (typeof saved.waist === "string") waistInput.value = saved.waist;
  } catch (e) {
    // Kaputte Daten ignorieren — Standardwerte bleiben.
  }
}

function setValues(height, weight) {
  heightInput.value = String(height);
  weightInput.value = String(weight);
  compute();
  save();
}

function scrollToCalculator() {
  const target = document.getElementById("rechner");
  if (target) window.scrollTo({ top: target.offsetTop - 80, behavior: "smooth" });
}

form.addEventListener("submit", function (event) {
  event.preventDefault();
  compute({ announceError: true });
  save();
});

[heightInput, weightInput, ageInput, waistInput].forEach(function (input) {
  input.addEventListener("input", function () {
    compute();
    save();
  });
  input.addEventListener("change", function () {
    compute({ announceError: true });
  });
});

document.querySelectorAll(".preset-chip").forEach(function (chip) {
  chip.addEventListener("click", function () {
    setValues(chip.getAttribute("data-height"), chip.getAttribute("data-weight"));
  });
});

document.querySelectorAll(".example-card").forEach(function (card) {
  function load() {
    setValues(card.getAttribute("data-height"), card.getAttribute("data-weight"));
    scrollToCalculator();
  }
  card.addEventListener("click", load);
  card.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      load();
    }
  });
});

document.querySelectorAll(".nw-row").forEach(function (row) {
  row.addEventListener("click", function () {
    heightInput.value = row.getAttribute("data-height");
    compute();
    save();
    scrollToCalculator();
  });
});

copyButton.addEventListener("click", function () {
  const text = resultContext.textContent + " " + resultAlso.textContent + " " + resultFormula.textContent;
  function done() {
    copyButton.textContent = "Kopiert ✓";
    setTimeout(function () { copyButton.textContent = "Ergebnis kopieren"; }, 2000);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
  } else {
    fallbackCopy(text);
    done();
  }
});

function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try { document.execCommand("copy"); } catch (e) {}
  document.body.removeChild(area);
}

resetButton.addEventListener("click", function () {
  heightInput.value = DEFAULTS.height;
  weightInput.value = DEFAULTS.weight;
  ageInput.value = DEFAULTS.age;
  waistInput.value = DEFAULTS.waist;
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  compute();
});

restore();
compute();
