// Grundsteuer-Rechner — Jahressteuer im Bundesmodell:
// Grundsteuer = Grundsteuerwert × Messzahl × Hebesatz.
// Messzahlen nach § 15 GrStG (seit 1. Januar 2025):
// Wohngrundstücke 0,31 Promille, unbebaute und andere bebaute
// Grundstücke 0,34 Promille. Der Hebesatz kommt von der Gemeinde.
// Das Ergebnis ist nur ein Richtwert — der Bescheid zählt.

const STORAGE_KEY = "massklar_grund_v1";

const form = document.getElementById("grundsteuer-form");
const artGrid = document.getElementById("art-grid");
const artButtons = Array.prototype.slice.call(artGrid.querySelectorAll("[data-art]"));
const calcButton = document.getElementById("grundsteuer-calc-btn");
const errorEl = document.getElementById("grundsteuer-error");
const resultPanel = document.getElementById("grundsteuer-result");
const resultValue = document.getElementById("result-value");
const resultContext = document.getElementById("result-context");
const resultAlso = document.getElementById("result-also");
const resultExtra = document.getElementById("result-extra");
const resultFormula = document.getElementById("result-formula");
const copyButton = document.getElementById("grundsteuer-copy");
const resetButton = document.getElementById("grundsteuer-reset");

const wertInput = document.getElementById("grundsteuer-wert");
const hebesatzInput = document.getElementById("grundsteuer-hebesatz");
const hebesatzTbody = document.getElementById("hebesatz-tbody");
const hebesatzCaption = document.getElementById("hebesatz-caption");

const DEFAULTS = {
  art: "wohnen",
  wert: "250.000",
  hebesatz: "400"
};

/* Messzahl je Grundstücksart, in Promille (§ 15 GrStG). */
const ART = {
  wohnen: { label: "Wohngrundstück", messzahl: 0.31 },
  gewerbe: { label: "Geschäftsgrundstück", messzahl: 0.34 },
  unbebaut: { label: "Unbebautes Grundstück", messzahl: 0.34 }
};

/* Hebesatz-Zeilen der Tabelle unten. */
const HEBSATZ_ZEILEN = [300, 400, 500, 600, 800, 1000];

const fmtGeld = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const fmtGeld2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat("de-DE");
const fmtMz = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

function euro(n, cents) {
  return (cents ? fmtGeld2 : fmtGeld).format(n) + " €";
}

/* Deutsche Zahl lesen: "250.000", "250000" und "250.000,50" sind alle
   der gleiche Wert. Punkte sind Tausendertrennzeichen, Komma ist das
   Dezimalzeichen. */
function parseDeutsch(text) {
  const raw = (text || "").trim().replace(/[\s\u00A0]/g, "").replace(/\./g, "").replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function markError(input, message) {
  if (input) {
    const field = input.closest(".field");
    if (field) field.classList.add("has-error");
  }
  errorEl.textContent = message;
  errorEl.hidden = false;
  resultPanel.hidden = true;
}

function clearError() {
  document.querySelectorAll(".field.has-error").forEach(function (el) {
    el.classList.remove("has-error");
  });
  errorEl.textContent = "";
  errorEl.hidden = true;
  resultPanel.hidden = false;
}

function showResult(value, context, also, extraLines, formula) {
  resultValue.textContent = value;
  resultContext.textContent = context;
  resultAlso.textContent = also;
  resultExtra.innerHTML = extraLines.map(function (line) {
    return "<div>" + line + "</div>";
  }).join("");
  resultFormula.textContent = formula;
}

let art = DEFAULTS.art;

/* Hebesatz-Tabelle: Jahres- und Monatssteuer je Hebesatz, aus dem
   aktuellen Messbetrag. Die Zeile mit dem eingetragenen Hebesatz ist
   markiert; ein Klick übernimmt den Hebesatz in den Rechner. */
function renderHebesatzTabelle(messbetrag, hebesatz) {
  hebesatzCaption.textContent = "Hebesatz: Was ändert sich? · Messbetrag " + euro(messbetrag, true);
  hebesatzTbody.innerHTML = HEBSATZ_ZEILEN.map(function (h) {
    const jahr = messbetrag * h / 100;
    return "<tr class=\"hebesatz-row" + (h === hebesatz ? " is-pick" : "") +
      "\" data-hebesatz=\"" + h + "\"><th scope=\"row\">" + fmtInt.format(h) +
      " %</th><td>" + euro(jahr, true) + "</td><td>" + euro(jahr / 12, true) + "</td></tr>";
  }).join("");
  hebesatzTbody.querySelectorAll(".hebesatz-row").forEach(function (row) {
    row.addEventListener("click", function () {
      hebesatzInput.value = row.getAttribute("data-hebesatz");
      compute();
      save();
      scrollToCalculator();
    });
  });
}

function compute(options) {
  const wert = parseDeutsch(wertInput.value);
  if (wert === null || wert <= 0) {
    if (options && options.announceError) markError(wertInput, "Gib bitte deinen Grundsteuerwert ein — z. B. 250.000. Er steht auf dem Bescheid über den Grundsteuerwert.");
    return;
  }
  if (wert > 100000000) {
    if (options && options.announceError) markError(wertInput, "Der Wert ist zu groß — prüfe bitte deine Eingabe.");
    return;
  }
  const hebesatz = parseDeutsch(hebesatzInput.value);
  if (hebesatz === null || hebesatz <= 0) {
    if (options && options.announceError) markError(hebesatzInput, "Gib bitte den Hebesatz deiner Gemeinde ein — z. B. 400.");
    return;
  }
  if (hebesatz > 2000) {
    if (options && options.announceError) markError(hebesatzInput, "Der Hebesatz ist zu groß — prüfe bitte deine Eingabe.");
    return;
  }
  clearError();
  const messzahl = ART[art].messzahl;
  const messbetrag = wert * messzahl / 1000;
  const jahr = messbetrag * hebesatz / 100;
  const monat = jahr / 12;
  renderHebesatzTabelle(messbetrag, hebesatz);
  showResult(
    euro(jahr, false),
    ART[art].label + ", " + fmtInt.format(wert) + " € Grundsteuerwert, " +
      fmtGeld.format(hebesatz) + " % Hebesatz: " + euro(messbetrag, true) +
      " Messbetrag mal " + fmtGeld.format(hebesatz) +
      " % — das sind " + euro(jahr, false) + " Grundsteuer im Jahr.",
    "Das sind " + euro(monat, true) + " im Monat.",
    [
      "<span>Messbetrag</span><span>" + euro(messbetrag, true) + "</span>",
      "<span>Hebesatz</span><span>" + fmtGeld.format(hebesatz) + " %</span>"
    ],
    fmtInt.format(wert) + " € × " + fmtMz.format(messzahl) + " ‰ = " +
      euro(messbetrag, true) + " × " + fmtGeld.format(hebesatz) + " % = " + euro(jahr, false)
  );
}

function setArt(next) {
  art = next;
  artButtons.forEach(function (btn) {
    btn.setAttribute("aria-pressed", btn.getAttribute("data-art") === next ? "true" : "false");
  });
  compute();
  save();
}

artButtons.forEach(function (btn) {
  btn.addEventListener("click", function () { setArt(btn.getAttribute("data-art")); });
});

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      art: art,
      wert: wertInput.value,
      hebesatz: hebesatzInput.value
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
    if (typeof saved.wert === "string" && saved.wert !== "") wertInput.value = saved.wert;
    if (typeof saved.hebesatz === "string" && saved.hebesatz !== "") hebesatzInput.value = saved.hebesatz;
    if (typeof saved.art === "string" && ART[saved.art]) {
      art = saved.art;
      artButtons.forEach(function (btn) {
        btn.setAttribute("aria-pressed", btn.getAttribute("data-art") === art ? "true" : "false");
      });
    }
  } catch (e) {
    // Kaputte Daten ignorieren — Standardwerte bleiben.
  }
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

[wertInput, hebesatzInput].forEach(function (input) {
  input.addEventListener("input", function () {
    compute();
    save();
  });
  input.addEventListener("change", function () {
    compute({ announceError: true });
  });
});

function loadExample(name) {
  if (name === "wohnhaus") {
    setArt("wohnen");
    wertInput.value = "250.000";
    hebesatzInput.value = "400";
  } else if (name === "gewerbe") {
    setArt("gewerbe");
    wertInput.value = "300.000";
    hebesatzInput.value = "500";
  } else if (name === "unbebaut") {
    setArt("unbebaut");
    wertInput.value = "100.000";
    hebesatzInput.value = "400";
  }
  compute();
  save();
  scrollToCalculator();
}

document.querySelectorAll(".preset-chip[data-example]").forEach(function (chip) {
  chip.addEventListener("click", function () { loadExample(chip.getAttribute("data-example")); });
});

document.querySelectorAll(".example-card").forEach(function (card) {
  function load() { loadExample(card.getAttribute("data-example")); }
  card.addEventListener("click", load);
  card.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      load();
    }
  });
});

function copyText(text, button, doneLabel) {
  function done() {
    const old = button.textContent;
    button.textContent = doneLabel;
    setTimeout(function () { button.textContent = old; }, 2000);
  }
  function fallbackCopy(t) {
    const area = document.createElement("textarea");
    area.value = t;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(area);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
  } else {
    fallbackCopy(text);
    done();
  }
}

copyButton.addEventListener("click", function () {
  const text = resultValue.textContent + " — " + resultContext.textContent + " " +
    resultAlso.textContent + " " + resultFormula.textContent;
  copyText(text, copyButton, "Kopiert ✓");
});

resetButton.addEventListener("click", function () {
  wertInput.value = DEFAULTS.wert;
  hebesatzInput.value = DEFAULTS.hebesatz;
  setArt(DEFAULTS.art);
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  compute();
});

restore();
compute();
