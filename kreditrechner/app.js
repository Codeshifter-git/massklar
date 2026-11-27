// Kreditrechner — Monatsrate, Zinsen und Gesamtkosten für einen Ratenkredit.
// Der Rechner nimmt den EFFEKTIVEN Jahreszins und rechnet ihn in den
// Monatszins um: Monatszins = (1 + Jahreszins)^(1/12) - 1 (PAngV-konform).
// Den Jahreszins einfach durch 12 zu teilen, rechnet zu viel — bei
// 10.000 €, 5,99 %, 48 Monate wären das 234,80 € statt 234,08 €.
// Geprüft gegen talerbox.com (5 Fälle, alle Raten auf den Cent) und
// verivox.de (10.000 €, 5 %, 48 Monate: 1.029,93 € Zinsen ≈ 1.030 €).
// Das Ergebnis ist nur ein Richtwert — der Zins im Angebot zählt.

const STORAGE_KEY = "massklar_kredit_v1";

const form = document.getElementById("kredit-form");
const modusGrid = document.getElementById("modus-grid");
const modusButtons = Array.prototype.slice.call(modusGrid.querySelectorAll("[data-modus]"));
const errorEl = document.getElementById("kredit-error");
const resultPanel = document.getElementById("kredit-result");
const resultLabel = document.getElementById("result-label");
const resultValue = document.getElementById("result-value");
const resultContext = document.getElementById("result-context");
const resultAlso = document.getElementById("result-also");
const resultExtra = document.getElementById("result-extra");
const resultFormula = document.getElementById("result-formula");
const copyButton = document.getElementById("kredit-copy");
const resetButton = document.getElementById("kredit-reset");

const betragInput = document.getElementById("kredit-betrag");
const nettoInput = document.getElementById("kredit-netto");
const ausgabenInput = document.getElementById("kredit-ausgaben");
const zinsInput = document.getElementById("kredit-zins");
const laufzeitInput = document.getElementById("kredit-laufzeit");
const sonderInput = document.getElementById("kredit-sonder");
const fieldBetrag = document.getElementById("field-betrag");
const fieldsLeisten = document.getElementById("fields-leisten");
const fieldSonder = document.getElementById("field-sonder");
const tilgungCaption = document.getElementById("tilgung-caption");
const tilgungTbody = document.getElementById("tilgung-tbody");
const tilgungTfoot = document.getElementById("tilgung-tfoot");
const tilgungToggle = document.getElementById("tilgung-toggle");

const DEFAULTS = {
  modus: "rate",
  betrag: "10.000",
  netto: "2.500",
  ausgaben: "1.900",
  zins: "5,99",
  laufzeit: "48",
  sonder: "0"
};

/* Drei Beispiele aus dem Leben (alle Zahlen von Hand nachgerechnet). */
const EXAMPLES = {
  auto: { modus: "rate", betrag: "10.000", zins: "5,99", laufzeit: "48", sonder: "0" },
  renovierung: { modus: "rate", betrag: "20.000", zins: "4,5", laufzeit: "60", sonder: "0" },
  sonder: { modus: "rate", betrag: "20.000", zins: "4,5", laufzeit: "60", sonder: "1.000" }
};

const fmtGeld = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const fmtGeld2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat("de-DE");
const fmtPct4 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmtPct2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* Sechs Nachkommastellen für die Formel: Mit vier Stellen würde der
   angezeigte Rechenweg nicht aufgehen (234,10 € statt 234,08 €). */
const fmt6 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

function euro(n, cents) {
  return (cents ? fmtGeld2 : fmtGeld).format(n) + " €";
}

/* Deutsche Zahl lesen: "10.000", "10000" und "10.000,50" sind alle
   der gleiche Wert. Punkte sind Tausendertrennzeichen, Komma ist das
   Dezimalzeichen. */
function parseDeutsch(text) {
  const raw = (text || "").trim().replace(/[\s\u00A0]/g, "").replace(/\./g, "").replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

/* Konformer Monatszins aus dem effektiven Jahreszins (PAngV). */
function monatszins(jahreszins) {
  return Math.pow(1 + jahreszins / 100, 1 / 12) - 1;
}

/* Monatsrate nach der Annuitätenformel. */
function monatsrate(betrag, jahreszins, monate) {
  const i = monatszins(jahreszins);
  if (i === 0) return betrag / monate;
  const f = Math.pow(1 + i, monate);
  return betrag * i * f / (f - 1);
}

/* Max. Kreditbetrag aus einer Monatsrate (Umkehrung der Formel). */
function maxBetrag(rate, jahreszins, monate) {
  const i = monatszins(jahreszins);
  if (i === 0) return rate * monate;
  const f = Math.pow(1 + i, monate);
  return rate * (f - 1) / (i * f);
}

/* Tilgungsplan: Monat für Monat Zinsen, Tilgung und Restschuld.
   Sondertilgung (Euro je Jahr) wird am Ende jedes 12. Monats gezahlt.
   Der letzte Monat zahlt nur noch, was übrig ist. */
function tilgungsplan(betrag, jahreszins, monate, sonder) {
  const i = monatszins(jahreszins);
  const rate = monatsrate(betrag, jahreszins, monate);
  const rows = [];
  let rest = betrag;
  let gesamtZinsen = 0;
  let m = 0;
  while (rest > 0.005 && m < 600) {
    m += 1;
    const zinsen = rest * i;
    let tilgung = rate - zinsen;
    if (tilgung > rest) tilgung = rest;
    rest -= tilgung;
    gesamtZinsen += zinsen;
    let extra = 0;
    if (sonder > 0 && m % 12 === 0 && rest > 0) {
      extra = Math.min(sonder, rest);
      rest -= extra;
    }
    rows.push({ monat: m, rate: zinsen + tilgung, zinsen: zinsen, tilgung: tilgung + extra, rest: rest });
  }
  return { rate: rate, rows: rows, monate: m, gesamtZinsen: gesamtZinsen, gesamt: betrag + gesamtZinsen };
}

let modus = DEFAULTS.modus;
let plan = null; /* letzter Tilgungsplan, für die Tabelle unten */
let planBeschreibung = "";
let planAlleZeigen = false;

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

function showResult(label, value, context, also, extraLines, formula) {
  resultLabel.textContent = label;
  resultValue.textContent = value;
  resultContext.textContent = context;
  resultAlso.textContent = also;
  resultExtra.innerHTML = extraLines.map(function (line) {
    return "<div><span>" + line[0] + "</span><span>" + line[1] + "</span></div>";
  }).join("");
  resultFormula.textContent = formula;
}

/* Tilgungsplan-Tabelle: erst 12 Monate, auf Wunsch alle. */
function renderTilgung() {
  if (!plan) return;
  tilgungCaption.textContent = "Tilgungsplan · " + planBeschreibung;
  const rows = planAlleZeigen ? plan.rows : plan.rows.slice(0, 12);
  tilgungTbody.innerHTML = rows.map(function (r) {
    return "<tr><th scope=\"row\">" + r.monat + "</th><td>" + euro(r.rate, true) +
      "</td><td>" + euro(r.zinsen, true) + "</td><td>" + euro(r.tilgung, true) +
      "</td><td>" + euro(r.rest, true) + "</td></tr>";
  }).join("");
  const gesamtRate = plan.rows.reduce(function (s, r) { return s + r.rate; }, 0);
  tilgungTfoot.innerHTML = "<tr><th scope=\"row\">Gesamt (" + plan.monate + " Monate)</th><td>" +
    euro(gesamtRate, true) + "</td><td>" + euro(plan.gesamtZinsen, true) +
    "</td><td>" + euro(plan.rows.reduce(function (s, r) { return s + r.tilgung; }, 0), true) +
    "</td><td>0,00 €</td></tr>";
  if (plan.rows.length > 12) {
    tilgungToggle.hidden = false;
    tilgungToggle.textContent = planAlleZeigen
      ? "Nur die ersten 12 Monate zeigen"
      : "Alle " + plan.rows.length + " Monate zeigen";
  } else {
    tilgungToggle.hidden = true;
  }
}

tilgungToggle.addEventListener("click", function () {
  planAlleZeigen = !planAlleZeigen;
  renderTilgung();
});

function compute(options) {
  const zins = parseDeutsch(zinsInput.value);
  if (zins === null || zins <= 0) {
    if (options && options.announceError) markError(zinsInput, "Gib bitte den effektiven Jahreszins ein — z. B. 5,99. Er steht im Angebot der Bank.");
    return;
  }
  if (zins > 30) {
    if (options && options.announceError) markError(zinsInput, "Der Zins ist zu hoch für einen Ratenkredit — prüfe bitte deine Eingabe.");
    return;
  }
  const laufzeitRaw = parseDeutsch(laufzeitInput.value);
  if (laufzeitRaw === null || laufzeitRaw < 6 || laufzeitRaw > 120 || Math.floor(laufzeitRaw) !== laufzeitRaw) {
    if (options && options.announceError) markError(laufzeitInput, "Gib bitte die Laufzeit in Monaten ein — zwischen 6 und 120 Monaten.");
    return;
  }
  const laufzeit = laufzeitRaw;
  const i = monatszins(zins);
  const f = Math.pow(1 + i, laufzeit);

  if (modus === "rate") {
    const betrag = parseDeutsch(betragInput.value);
    if (betrag === null || betrag <= 0) {
      if (options && options.announceError) markError(betragInput, "Gib bitte deinen Kreditbetrag ein — z. B. 10.000.");
      return;
    }
    if (betrag > 10000000) {
      if (options && options.announceError) markError(betragInput, "Der Betrag ist zu groß — prüfe bitte deine Eingabe.");
      return;
    }
    const sonder = parseDeutsch(sonderInput.value);
    if (sonder === null || sonder < 0) {
      if (options && options.announceError) markError(sonderInput, "Gib bitte die Sondertilgung im Jahr ein — oder 0 für keine.");
      return;
    }
    if (sonder > betrag) {
      if (options && options.announceError) markError(sonderInput, "Die Sondertilgung ist größer als der Kreditbetrag — prüfe bitte deine Eingabe.");
      return;
    }
    clearError();
    const ohne = tilgungsplan(betrag, zins, laufzeit, 0);
    plan = tilgungsplan(betrag, zins, laufzeit, sonder);
    planBeschreibung = fmtInt.format(betrag) + " €, " + fmtPct2.format(zins) + " %, " + laufzeit + " Monate" +
      (sonder > 0 ? ", " + euro(sonder, false) + " € Sondertilgung im Jahr" : "");
    const zinsAnteil = plan.gesamtZinsen / betrag * 100;
    const extra = [
      ["Monatsrate", euro(plan.rate, true)],
      ["Gesamtzinsen", euro(plan.gesamtZinsen, true)],
      ["Gesamtkosten", euro(plan.gesamt, true)],
      ["Abbezahlt nach", plan.monate + " Monaten"]
    ];
    let context = fmtInt.format(betrag) + " € Kredit, " + fmtPct2.format(zins) +
      " % effektiver Jahreszins, " + laufzeit + " Monate: " + euro(plan.rate, true) +
      " im Monat — insgesamt " + euro(plan.gesamt, true) + ", davon " +
      euro(plan.gesamtZinsen, true) + " Zinsen.";
    let also = "Das sind " + euro(plan.gesamtZinsen, true) + " Zinsen — " +
      fmtGeld.format(zinsAnteil) + " % vom Kreditbetrag.";
    if (sonder > 0 && plan.monate < laufzeit) {
      const gespart = ohne.gesamtZinsen - plan.gesamtZinsen;
      context = fmtInt.format(betrag) + " € Kredit, " + fmtPct2.format(zins) +
        " % effektiver Jahreszins, " + laufzeit + " Monate: " + euro(plan.rate, true) +
        " im Monat. Mit " + euro(sonder, false) + " Sondertilgung im Jahr bist du nach " +
        plan.monate + " Monaten fertig und zahlst insgesamt " + euro(plan.gesamt, true) +
        " — davon " + euro(plan.gesamtZinsen, true) + " Zinsen. Ohne Sondertilgung wären es " +
        euro(ohne.gesamt, true) + ", davon " + euro(ohne.gesamtZinsen, true) + " Zinsen.";
      also = "Mit Sondertilgung: " + plan.monate + " statt " + laufzeit + " Monate, " +
        euro(gespart, true) + " Zinsen gespart.";
    }
    showResult(
      "DEINE MONATSRATE (RICHTWERT)",
      euro(plan.rate, true),
      context,
      also,
      extra,
      "Monatszins = (1 + " + fmtPct2.format(zins) + " %)^(1/12) − 1 = " +
        fmt6.format(i * 100) + " % · Rate = " + fmtInt.format(betrag) + " € × " +
        fmt6.format(i * 100) + " % × " + fmt6.format(f) + " ÷ " + fmt6.format(f - 1) +
        " = " + euro(plan.rate, true)
    );
    renderTilgung();
  } else {
    const netto = parseDeutsch(nettoInput.value);
    if (netto === null || netto <= 0) {
      if (options && options.announceError) markError(nettoInput, "Gib bitte dein Nettoeinkommen im Monat ein — z. B. 2.500.");
      return;
    }
    const ausgaben = parseDeutsch(ausgabenInput.value);
    if (ausgaben === null || ausgaben < 0) {
      if (options && options.announceError) markError(ausgabenInput, "Gib bitte deine festen Ausgaben im Monat ein — oder 0.");
      return;
    }
    if (ausgaben >= netto) {
      if (options && options.announceError) markError(ausgabenInput, "Deine Ausgaben sind so hoch wie dein Netto oder höher — da bleibt nichts für eine Rate. Prüfe bitte deine Zahlen.");
      return;
    }
    clearError();
    const frei = netto - ausgaben;
    const max = maxBetrag(frei, zins, laufzeit);
    plan = tilgungsplan(max, zins, laufzeit, 0);
    planBeschreibung = "höchstens " + fmtInt.format(Math.round(max)) + " €, " +
      fmtPct2.format(zins) + " %, " + laufzeit + " Monate";
    showResult(
      "SO VIEL KREDIT KANNST DU DIR LEISTEN (RICHTWERT)",
      euro(max, false),
      fmtInt.format(netto) + " € Netto minus " + fmtInt.format(ausgaben) +
        " € Ausgaben = " + euro(frei, false) + " frei im Monat. Bei " +
        fmtPct2.format(zins) + " % und " + laufzeit + " Monaten sind das höchstens " +
        euro(max, true) + " Kredit.",
      "Die Rate wären " + euro(frei, false) + " im Monat — lass dir einen Puffer: Nimm nicht dein ganzes freies Geld für die Rate.",
      [
        ["Frei im Monat", euro(frei, false)],
        ["Rate", euro(frei, false)],
        ["Max. Kreditbetrag", euro(max, true)],
        ["Zinsen dabei", euro(plan.gesamtZinsen, true)]
      ],
      "Max. Betrag = " + euro(frei, false) + " × " + fmt6.format((f - 1) / (i * f)) +
        " = " + euro(max, true)
    );
    renderTilgung();
  }
}

function setModus(next) {
  modus = next;
  modusButtons.forEach(function (btn) {
    btn.setAttribute("aria-pressed", btn.getAttribute("data-modus") === next ? "true" : "false");
  });
  const isRate = next === "rate";
  fieldBetrag.hidden = !isRate;
  fieldsLeisten.hidden = isRate;
  fieldSonder.hidden = !isRate;
  compute();
  save();
}

modusButtons.forEach(function (btn) {
  btn.addEventListener("click", function () { setModus(btn.getAttribute("data-modus")); });
});

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      modus: modus,
      betrag: betragInput.value,
      netto: nettoInput.value,
      ausgaben: ausgabenInput.value,
      zins: zinsInput.value,
      laufzeit: laufzeitInput.value,
      sonder: sonderInput.value
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
    if (typeof saved.betrag === "string" && saved.betrag !== "") betragInput.value = saved.betrag;
    if (typeof saved.netto === "string" && saved.netto !== "") nettoInput.value = saved.netto;
    if (typeof saved.ausgaben === "string" && saved.ausgaben !== "") ausgabenInput.value = saved.ausgaben;
    if (typeof saved.zins === "string" && saved.zins !== "") zinsInput.value = saved.zins;
    if (typeof saved.laufzeit === "string" && saved.laufzeit !== "") laufzeitInput.value = saved.laufzeit;
    if (typeof saved.sonder === "string" && saved.sonder !== "") sonderInput.value = saved.sonder;
    if (typeof saved.modus === "string" && (saved.modus === "rate" || saved.modus === "leisten")) {
      modus = saved.modus;
      modusButtons.forEach(function (btn) {
        btn.setAttribute("aria-pressed", btn.getAttribute("data-modus") === modus ? "true" : "false");
      });
      const isRate = modus === "rate";
      fieldBetrag.hidden = !isRate;
      fieldsLeisten.hidden = isRate;
      fieldSonder.hidden = !isRate;
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

[betragInput, nettoInput, ausgabenInput, zinsInput, laufzeitInput, sonderInput].forEach(function (input) {
  input.addEventListener("input", function () {
    compute();
    save();
  });
  input.addEventListener("change", function () {
    compute({ announceError: true });
  });
});

function loadExample(name) {
  const ex = EXAMPLES[name];
  if (!ex) return;
  if (ex.modus !== modus) setModus(ex.modus);
  betragInput.value = ex.betrag;
  zinsInput.value = ex.zins;
  laufzeitInput.value = ex.laufzeit;
  sonderInput.value = ex.sonder;
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

/* Raten-Tabelle: Eine Zeile antippen lädt Zins und Laufzeit in den Rechner. */
document.querySelectorAll(".raten-row").forEach(function (row) {
  function load() {
    if (modus !== "rate") setModus("rate");
    zinsInput.value = row.getAttribute("data-zins");
    laufzeitInput.value = row.getAttribute("data-laufzeit");
    compute();
    save();
    scrollToCalculator();
  }
  row.addEventListener("click", load);
  row.setAttribute("tabindex", "0");
  row.addEventListener("keydown", function (event) {
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
  betragInput.value = DEFAULTS.betrag;
  nettoInput.value = DEFAULTS.netto;
  ausgabenInput.value = DEFAULTS.ausgaben;
  zinsInput.value = DEFAULTS.zins;
  laufzeitInput.value = DEFAULTS.laufzeit;
  sonderInput.value = DEFAULTS.sonder;
  if (modus !== DEFAULTS.modus) setModus(DEFAULTS.modus);
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  planAlleZeigen = false;
  compute();
});

restore();
compute();
