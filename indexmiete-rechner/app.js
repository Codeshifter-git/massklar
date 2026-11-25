// Indexmiete-Rechner — neue Nettokaltmiete aus dem Verbraucherpreisindex.
// Neue Miete = alte Miete × neuer Index ÷ alter Index. Die Miete wird auf
// den Cent gerundet — die Erhöhung im Jahr ist 12 × die gerundete
// Monatserhöhung, so wie sie wirklich gezahlt wird.

const STORAGE_KEY = "massklar_indexmiete_v1";

// Verbraucherpreisindex für Deutschland, Basis 2020 = 100.
// Quelle: Destatis, Stand 17. November 2026 (Pressemitteilung Nr. 392,
// korrigiert). Neuester endgültiger Wert: Oktober 2026 = 126,5.
const VPI = {
  "2021-01": 101.0, "2021-02": 101.6, "2021-03": 102.1, "2021-04": 102.4,
  "2021-05": 102.6, "2021-06": 102.9, "2021-07": 103.4, "2021-08": 103.5,
  "2021-09": 103.8, "2021-10": 104.3, "2021-11": 104.5, "2021-12": 104.7,
  "2022-01": 105.2, "2022-02": 106.0, "2022-03": 108.1, "2022-04": 108.8,
  "2022-05": 109.8, "2022-06": 109.8, "2022-07": 110.3, "2022-08": 110.7,
  "2022-09": 112.7, "2022-10": 113.5, "2022-11": 113.7, "2022-12": 113.2,
  "2023-01": 114.3, "2023-02": 115.2, "2023-03": 116.1, "2023-04": 116.6,
  "2023-05": 116.5, "2023-06": 116.8, "2023-07": 117.1, "2023-08": 117.5,
  "2023-09": 117.8, "2023-10": 117.8, "2023-11": 117.3, "2023-12": 117.4,
  "2024-01": 117.6, "2024-02": 118.1, "2024-03": 118.6, "2024-04": 119.2,
  "2024-05": 119.3, "2024-06": 119.4, "2024-07": 119.8, "2024-08": 119.7,
  "2024-09": 119.7, "2024-10": 120.2, "2024-11": 119.9, "2024-12": 120.5,
  "2025-01": 120.3, "2025-02": 120.8, "2025-03": 121.2, "2025-04": 121.7,
  "2025-05": 121.8, "2025-06": 121.8, "2025-07": 122.2, "2025-08": 122.3,
  "2025-09": 122.6, "2025-10": 123.0, "2025-11": 122.7, "2025-12": 122.7,
  "2026-01": 122.8, "2026-02": 123.1, "2026-03": 124.5, "2026-04": 125.2,
  "2026-05": 125.0, "2026-06": 124.6, "2026-07": 125.6, "2026-08": 125.8,
  "2026-09": 126.6, "2026-10": 126.5
};
const MONTHS_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const form = document.getElementById("indexmiete-form");
const mieteInput = document.getElementById("indexmiete-miete");
const altSelect = document.getElementById("indexmiete-alt");
const neuSelect = document.getElementById("indexmiete-neu");
const eigenBox = document.getElementById("indexmiete-eigen");
const eigenFelder = document.getElementById("eigen-felder");
const altWertInput = document.getElementById("indexmiete-alt-wert");
const neuWertInput = document.getElementById("indexmiete-neu-wert");
const seitInput = document.getElementById("indexmiete-seit");
const zugangInput = document.getElementById("indexmiete-zugang");
const errorEl = document.getElementById("indexmiete-error");
const resultPanel = document.getElementById("indexmiete-result");
const resultValue = document.getElementById("result-value");
const resultContext = document.getElementById("result-context");
const resultAlso = document.getElementById("result-also");
const resultExtra = document.getElementById("result-extra");
const resultFormula = document.getElementById("result-formula");
const copyButton = document.getElementById("indexmiete-copy");
const resetButton = document.getElementById("indexmiete-reset");

const DEFAULTS = {
  miete: "800", alt: "2025-09", neu: "2026-10",
  eigen: false, altWert: "", neuWert: "", seit: "", zugang: ""
};

const fmtMoney = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtIdx1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPct2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

function round2(v) {
  return Math.round((v + 1e-9) * 100) / 100;
}

/* Deutsche Zahl: "800", "800,50", "1.200", "1.200,50" → Zahl, sonst null.
   Ein einzelner Punkt mit genau 3 Stellen dahinter ist ein Tausenderpunkt. */
function parseGerman(text) {
  var raw = (text || "").trim().replace(/\s/g, "").replace(/€/g, "");
  if (raw === "") return null;
  var hasComma = raw.indexOf(",") !== -1;
  var hasDot = raw.indexOf(".") !== -1;
  if (hasComma && hasDot) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    raw = raw.replace(",", ".");
  } else if (hasDot) {
    var parts = raw.split(".");
    if (parts.length === 2 && parts[1].length === 3) raw = parts[0] + parts[1];
  }
  var n = Number(raw);
  return Number.isFinite(n) ? n : { error: true };
}

/* "2026-11-20" (type=date) → Date um 12 Uhr mittags, sonst null. */
function parseDateInput(value) {
  var m = (value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

/* Monate dazu — klemmt auf den letzten Tag des Zielmonats (29.02. + 12
   Monate wird der 28.02., nicht der 01.03.). */
function addMonths(date, n) {
  var d = new Date(date.getTime());
  var day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}

/* Wirksam ab Beginn des übernächsten Monats nach dem Zugang. */
function wirksamAb(zugang) {
  var d = new Date(zugang.getTime());
  d.setDate(1);
  d.setMonth(d.getMonth() + 2);
  return d;
}

function monthLabel(key) {
  var y = Number(key.slice(0, 4));
  var m = Number(key.slice(5, 7));
  return MONTHS_DE[m - 1] + " " + y + " · " + fmtIdx1.format(VPI[key]);
}

function fillSelects() {
  var keys = Object.keys(VPI).sort();
  [altSelect, neuSelect].forEach(function (sel) {
    keys.forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = monthLabel(key);
      sel.appendChild(opt);
    });
  });
  altSelect.value = DEFAULTS.alt;
  neuSelect.value = DEFAULTS.neu;
}

function markError(input, message) {
  if (input) {
    var field = input.closest(".field");
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

function indexWert(selectEl, wertInput) {
  if (eigenBox.checked) {
    var raw = (wertInput.value || "").trim();
    if (raw !== "") {
      var n = parseGerman(raw);
      if (!n || n.error || n <= 0) return { error: true, input: wertInput };
      return { value: n, eigen: true };
    }
  }
  return { value: VPI[selectEl.value], eigen: false };
}

function compute(options) {
  var announceError = options && options.announceError;
  var miete = parseGerman(mieteInput.value);
  if (!miete || miete.error || miete <= 0) {
    if (announceError) markError(mieteInput, "Gib bitte die Nettokaltmiete als Zahl ein — z. B. 800 oder 1.200,50.");
    return;
  }
  var alt = indexWert(altSelect, altWertInput);
  if (alt.error) {
    if (announceError) markError(alt.input, "Gib bitte einen Index über 0 ein — z. B. 122,6.");
    return;
  }
  var neu = indexWert(neuSelect, neuWertInput);
  if (neu.error) {
    if (announceError) markError(neu.input, "Gib bitte einen Index über 0 ein — z. B. 126,5.");
    return;
  }
  var altIdx = alt.value;
  var neuIdx = neu.value;
  var neuMiete = round2(miete * neuIdx / altIdx);
  var deltaM = round2(neuMiete - miete);
  var deltaY = round2(deltaM * 12);
  var punkte = neuIdx - altIdx;
  var pct = (neuIdx / altIdx - 1) * 100;
  var punkteStr = (punkte >= 0 ? "+" : "−") + fmtIdx1.format(Math.abs(punkte));
  var pctStr = (pct >= 0 ? "+" : "−") + fmtPct2.format(Math.abs(pct)) + " %";

  var context;
  if (deltaM > 0) {
    context = "Von " + fmtMoney.format(miete) + " € auf " + fmtMoney.format(neuMiete) +
      " €: Die Miete steigt um " + fmtMoney.format(deltaM) + " € im Monat — das sind " +
      fmtMoney.format(deltaY) + " € im Jahr.";
  } else if (deltaM < 0) {
    context = "Von " + fmtMoney.format(miete) + " € auf " + fmtMoney.format(neuMiete) +
      " €: Die Miete sinkt um " + fmtMoney.format(-deltaM) + " € im Monat — das sind " +
      fmtMoney.format(-deltaY) + " € im Jahr. Als Mieter kannst du die Senkung verlangen.";
  } else {
    context = "Die Miete bleibt gleich: Der Index ist unverändert — " +
      fmtMoney.format(miete) + " € bleiben " + fmtMoney.format(miete) + " €.";
  }

  var extra = [];
  if (alt.eigen || neu.eigen) {
    extra.push("Gerechnet mit eigenen Indexwerten (alter Index " +
      fmtIdx1.format(altIdx) + ", neuer Index " + fmtIdx1.format(neuIdx) + ").");
  }
  var seit = parseDateInput(seitInput.value);
  var zugang = parseDateInput(zugangInput.value);
  if (seit) {
    var sperrEnde = addMonths(seit, 12);
    var heute = new Date();
    heute.setHours(12, 0, 0, 0);
    if (zugang) {
      if (zugang < sperrEnde) {
        extra.push("Achtung: Die Erklärung kam am " + fmtDate.format(zugang) +
          " an — aber die Miete muss bis zum " + fmtDate.format(sperrEnde) +
          " unverändert bleiben. Schick die Erklärung erst danach neu.");
      } else {
        extra.push("Sperrjahr eingehalten: Die Miete gilt seit " + fmtDate.format(seit) +
          ", das Jahr war am " + fmtDate.format(sperrEnde) + " um.");
        extra.push("Wirksam ab " + fmtDate.format(wirksamAb(zugang)) +
          ": Beginn des übernächsten Monats nach Zugang (" + fmtDate.format(zugang) + ").");
      }
    } else if (sperrEnde > heute) {
      extra.push("Sperrjahr: Die Miete darf erst ab " + fmtDate.format(sperrEnde) +
        " erhöht werden — sie gilt erst seit " + fmtDate.format(seit) + ".");
    } else {
      extra.push("Das Sperrjahr ist um (Miete gilt seit " + fmtDate.format(seit) +
        ") — die Erhöhung kann erklärt werden.");
    }
  } else if (zugang) {
    extra.push("Wirksam ab " + fmtDate.format(wirksamAb(zugang)) +
      ": Beginn des übernächsten Monats nach Zugang (" + fmtDate.format(zugang) + ").");
  } else {
    extra.push("Trag oben ein, seit wann die Miete gilt und wann die Erklärung ankam — dann prüft der Rechner Frist und Wirksamkeit.");
  }

  clearError();
  showResult(
    fmtMoney.format(neuMiete) + " €",
    context,
    "Index: " + fmtIdx1.format(altIdx) + " → " + fmtIdx1.format(neuIdx) +
      " · " + punkteStr + " Punkte · " + pctStr,
    extra,
    fmtMoney.format(miete) + " € × " + fmtIdx1.format(neuIdx) + " ÷ " +
      fmtIdx1.format(altIdx) + " = " + fmtMoney.format(neuMiete) + " €"
  );
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      miete: mieteInput.value, alt: altSelect.value, neu: neuSelect.value,
      eigen: eigenBox.checked, altWert: altWertInput.value,
      neuWert: neuWertInput.value, seit: seitInput.value, zugang: zugangInput.value
    }));
  } catch (e) {
    // Privater Modus o. ä. — der Rechner läuft auch ohne Speichern.
  }
}

function restore() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var saved = JSON.parse(raw);
    if (typeof saved.miete === "string" && saved.miete !== "") mieteInput.value = saved.miete;
    if (typeof saved.alt === "string" && VPI[saved.alt]) altSelect.value = saved.alt;
    if (typeof saved.neu === "string" && VPI[saved.neu]) neuSelect.value = saved.neu;
    if (typeof saved.eigen === "boolean") {
      eigenBox.checked = saved.eigen;
      eigenFelder.hidden = !saved.eigen;
    }
    if (typeof saved.altWert === "string") altWertInput.value = saved.altWert;
    if (typeof saved.neuWert === "string") neuWertInput.value = saved.neuWert;
    if (typeof saved.seit === "string") seitInput.value = saved.seit;
    if (typeof saved.zugang === "string") zugangInput.value = saved.zugang;
  } catch (e) {
    // Kaputte Daten ignorieren — Standardwerte bleiben.
  }
}

function scrollToCalculator() {
  var target = document.getElementById("rechner");
  if (target) window.scrollTo({ top: target.offsetTop - 80, behavior: "smooth" });
}

form.addEventListener("submit", function (event) {
  event.preventDefault();
  compute({ announceError: true });
  save();
});

[mieteInput, altWertInput, neuWertInput].forEach(function (input) {
  input.addEventListener("input", function () {
    compute();
    save();
  });
  input.addEventListener("change", function () {
    compute({ announceError: true });
  });
});

[altSelect, neuSelect].forEach(function (sel) {
  sel.addEventListener("change", function () {
    compute();
    save();
  });
});

eigenBox.addEventListener("change", function () {
  eigenFelder.hidden = !eigenBox.checked;
  compute();
  save();
});

[seitInput, zugangInput].forEach(function (input) {
  input.addEventListener("input", function () {
    compute();
    save();
  });
  input.addEventListener("change", function () {
    compute({ announceError: true });
  });
});

function loadExample(miete, alt, neu) {
  mieteInput.value = miete;
  altSelect.value = alt;
  neuSelect.value = neu;
  eigenBox.checked = false;
  eigenFelder.hidden = true;
  altWertInput.value = "";
  neuWertInput.value = "";
  compute();
  save();
  scrollToCalculator();
}

document.querySelectorAll(".preset-chip[data-miete]").forEach(function (chip) {
  chip.addEventListener("click", function () {
    loadExample(
      chip.getAttribute("data-miete"),
      chip.getAttribute("data-alt"),
      chip.getAttribute("data-neu")
    );
  });
});

document.querySelectorAll(".example-card").forEach(function (card) {
  function load() {
    loadExample(
      card.getAttribute("data-miete"),
      card.getAttribute("data-alt"),
      card.getAttribute("data-neu")
    );
  }
  card.addEventListener("click", load);
  card.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      load();
    }
  });
});

/* Tabellenmonat antippen: Der Rechner nimmt ihn als neuen Indexmonat. */
document.querySelectorAll(".vpi-cell").forEach(function (cell) {
  cell.addEventListener("click", function () {
    var key = cell.getAttribute("data-month");
    neuSelect.value = key;
    document.querySelectorAll(".vpi-cell.is-you").forEach(function (el) {
      el.classList.remove("is-you");
    });
    cell.classList.add("is-you");
    compute();
    save();
    scrollToCalculator();
  });
});

function copyText(text, button, doneLabel) {
  function done() {
    var old = button.textContent;
    button.textContent = doneLabel;
    setTimeout(function () { button.textContent = old; }, 2000);
  }
  function fallbackCopy(t) {
    var area = document.createElement("textarea");
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
  var text = resultValue.textContent + " — " + resultContext.textContent + " " +
    resultAlso.textContent + " " + resultFormula.textContent;
  copyText(text, copyButton, "Kopiert ✓");
});

resetButton.addEventListener("click", function () {
  mieteInput.value = DEFAULTS.miete;
  altSelect.value = DEFAULTS.alt;
  neuSelect.value = DEFAULTS.neu;
  eigenBox.checked = DEFAULTS.eigen;
  eigenFelder.hidden = true;
  altWertInput.value = DEFAULTS.altWert;
  neuWertInput.value = DEFAULTS.neuWert;
  seitInput.value = DEFAULTS.seit;
  zugangInput.value = DEFAULTS.zugang;
  document.querySelectorAll(".vpi-cell.is-you").forEach(function (el) {
    el.classList.remove("is-you");
  });
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  compute();
});

fillSelects();
restore();
compute();
