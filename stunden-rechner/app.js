// Arbeitszeitrechner — Stunden zwischen zwei Uhrzeiten, Zeiten addieren,
// Stunden ↔ Dezimal. Eine Stunde hat 60 Minuten, nicht 100:
// "7,45" als Dezimalzahl sind 7:27 — wer 7:45 meint, muss 7,75 schreiben.
// Der Rechner zeigt den Unterschied an, sobald er ihn sieht.

const STORAGE_KEY = "massklar_stunden_v1";

const form = document.getElementById("stunden-form");
const modeGrid = document.getElementById("mode-grid");
const modeButtons = Array.prototype.slice.call(modeGrid.querySelectorAll("[data-mode]"));
const modeFields = Array.prototype.slice.call(document.querySelectorAll(".mode-fields"));
const calcButton = document.getElementById("stunden-calc-btn");
const errorEl = document.getElementById("stunden-error");
const resultPanel = document.getElementById("stunden-result");
const resultValue = document.getElementById("result-value");
const resultContext = document.getElementById("result-context");
const resultAlso = document.getElementById("result-also");
const resultExtra = document.getElementById("result-extra");
const resultFormula = document.getElementById("result-formula");
const copyButton = document.getElementById("stunden-copy");
const resetButton = document.getElementById("stunden-reset");

const startInput = document.getElementById("stunden-start");
const endInput = document.getElementById("stunden-end");
const pauseInput = document.getElementById("stunden-pause");
const nachtInput = document.getElementById("stunden-nacht");
const listInputs = Array.prototype.slice.call(document.querySelectorAll(".list-input"));
const listRows = Array.prototype.slice.call(document.querySelectorAll(".time-row"));
const addRowButton = document.getElementById("add-row");
const sollInput = document.getElementById("liste-soll");
const satzInput = document.getElementById("liste-satz");
const umHmInput = document.getElementById("um-hm");
const umDezInput = document.getElementById("um-dez");
const umMinInput = document.getElementById("um-min");
const umTrap = document.getElementById("um-trap");
const excelCopy = document.getElementById("excel-copy");

const DEFAULTS = {
  mode: "vonbis",
  start: "08:30", end: "17:15", pause: "45", nacht: false,
  list: ["8:00", "7:30", "8:30", "8:30", "8:00", "", ""],
  soll: "40", satz: "",
  umHm: "7:45", umDez: "7,75", umMin: "465"
};

const fmtInt = new Intl.NumberFormat("de-DE");
const fmtDez2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoney = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* Minuten als "8:00" / "40:30" / "-2:00" — Stunden ohne führende Null. */
function fmtHM(mins) {
  const sign = mins < 0 ? "−" : "";
  const abs = Math.abs(Math.round(mins));
  return sign + Math.floor(abs / 60) + ":" + String(abs % 60).padStart(2, "0");
}

function fmtDez(mins) {
  return fmtDez2.format(mins / 60);
}

function fmtInd(mins) {
  return fmtInt.format(Math.round(mins / 60 * 100));
}

function plural(n, one, many) {
  return n === 1 ? "1 " + one : fmtInt.format(n) + " " + many;
}

/* "08:30" (type=time) → Minuten seit Mitternacht, sonst null. */
function parseClock(value) {
  const m = (value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function clockShort(mins) {
  return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}

/* Dauer-Eingabe aus der Liste / dem Umrechner:
   "7:45" → 465 Min. (Doppelpunkt)
   "7,75" / "7.75" → 465 Min. (Dezimalzahl)
   "8" → 480 Min. (glatte Stunden)
   Gibt { minutes, trap } zurück — trap ist die sanfte Korrektur, wenn
   "7,45" wahrscheinlicher 7:45 meint (Dezimal- und Doppelpunkt-Lesart
   liegen 10 Minuten oder mehr auseinander). */
function parseDuration(text) {
  const raw = (text || "").trim().replace(/\s/g, "");
  if (raw === "") return null;
  const colon = raw.match(/^(\d{1,3}):(\d{2})$/);
  if (colon) {
    const h = Number(colon[1]);
    const min = Number(colon[2]);
    if (min > 59) return { error: true };
    return { minutes: h * 60 + min, trap: null };
  }
  const dec = raw.match(/^(\d{1,3})[,.](\d{1,2})$/);
  if (dec) {
    const whole = Number(dec[1]);
    const frac = dec[2];
    const fracVal = Number("0." + frac);
    const decMinutes = Math.round((whole + fracVal) * 60);
    let trap = null;
    if (frac.length === 2) {
      const asMin = Number(frac);
      if (asMin >= 1 && asMin <= 59) {
        const colonMinutes = whole * 60 + asMin;
        if (Math.abs(colonMinutes - decMinutes) >= 10) {
          trap = {
            hours: whole, minutes: asMin,
            dez: fmtDez(colonMinutes)
          };
        }
      }
    }
    return { minutes: decMinutes, trap: trap };
  }
  const bare = raw.match(/^(\d{1,3})$/);
  if (bare) return { minutes: Number(bare[1]) * 60, trap: null };
  return { error: true };
}

/* Deutsche Dezimalzahl ("40", "40,5", "25.50") → Zahl, sonst null. */
function parseDecimal(text) {
  const raw = (text || "").trim().replace(/\s/g, "").replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : { error: true };
}

function markError(input, message) {
  if (input) {
    const field = input.closest(".field") || input.closest(".time-row");
    if (field) field.classList.add("has-error");
  }
  errorEl.textContent = message;
  errorEl.hidden = false;
  resultPanel.hidden = true;
}

function clearError() {
  document.querySelectorAll(".field.has-error, .time-row.has-error").forEach(function (el) {
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

let mode = DEFAULTS.mode;
/* Letzter guter Minutenwert des Umrechners (damit ein Tippfehler
   zwischendurch das Ergebnis nicht löscht). */
let umMinutes = 465;

function computeVonbis(options) {
  const announceError = options && options.announceError;
  const start = parseClock(startInput.value);
  const end = parseClock(endInput.value);
  if (start === null) {
    if (announceError) markError(startInput, "Gib bitte eine Startzeit ein — z. B. 08:30.");
    return;
  }
  if (end === null) {
    if (announceError) markError(endInput, "Gib bitte eine Endzeit ein — z. B. 17:15.");
    return;
  }
  const pauseRaw = (pauseInput.value || "").trim().replace(/\s/g, "").replace(",", ".");
  let pause = 0;
  if (pauseRaw !== "") {
    const p = Number(pauseRaw);
    if (!Number.isFinite(p) || p < 0 || !Number.isInteger(p)) {
      if (announceError) markError(pauseInput, "Gib die Pause bitte in ganzen Minuten ein — z. B. 45 oder 0.");
      return;
    }
    if (p > 600) {
      if (announceError) markError(pauseInput, "Mehr als 10 Stunden Pause? Bitte weniger eingeben.");
      return;
    }
    pause = p;
  }
  let diff = end - start;
  const nacht = nachtInput.checked;
  if (diff <= 0) {
    if (nacht) {
      diff += 24 * 60;
    } else {
      if (announceError) {
        markError(endInput, "Die Endzeit liegt vor der Startzeit. Geht die Schicht über Mitternacht? Dann hak „Nachtschicht“ an.");
      }
      return;
    }
  }
  const brutto = diff;
  const netto = brutto - pause;
  if (netto < 0) {
    if (announceError) markError(pauseInput, "Die Pause ist länger als die Arbeitszeit — bitte weniger Pause eingeben.");
    return;
  }
  if (netto === 0) {
    if (announceError) markError(pauseInput, "Mit dieser Pause bleibt keine Arbeitszeit übrig.");
    return;
  }
  clearError();
  const extra = [];
  if (nacht) extra.push("Nachtschicht: über Mitternacht gerechnet.");
  const startS = clockShort(start);
  const endS = clockShort(end);
  showResult(
    fmtHM(netto) + " Std.",
    "Von " + startS + " bis " + endS + " Uhr sind es " + fmtHM(brutto) + " Stunden brutto. Mit " +
      plural(pause, "Minute", "Minuten") + " Pause bleiben " + fmtHM(netto) + " Stunden netto.",
    "Brutto " + fmtHM(brutto) + " · " + fmtDez(netto) + " Dezimalstunden · " +
      fmtInt.format(netto) + " Minuten · " + fmtInd(netto) + " Industrieminuten",
    extra,
    nacht
      ? startS + " bis " + endS + " (+24 h) − " + fmtHM(pause) + " Pause = " + fmtHM(netto)
      : endS + " − " + startS + " − " + fmtHM(pause) + " = " + fmtHM(netto)
  );
}

function trapText(trap) {
  return "Meinst du " + trap.hours + ":" + String(trap.minutes).padStart(2, "0") +
    "? Das sind " + trap.dez + " Stunden.";
}

function computeListe(options) {
  const announceError = options && options.announceError;
  const parts = [];
  let sum = 0;
  let any = false;
  listInputs.forEach(function (input, i) {
    const row = listRows[i];
    const hint = row.querySelector(".trap-hint");
    const parsed = parseDuration(input.value);
    if (parsed && parsed.trap) {
      hint.textContent = trapText(parsed.trap);
      hint.hidden = false;
    } else {
      hint.textContent = "";
      hint.hidden = true;
    }
    if (!parsed) return;
    if (parsed.error) {
      if (announceError) {
        markError(input, "„" + input.value + "“ verstehe ich nicht — schreib z. B. 7:45 oder 7,75.");
      }
      return;
    }
    any = true;
    sum += parsed.minutes;
    parts.push(fmtHM(parsed.minutes));
  });
  if (!any) {
    if (announceError) markError(listInputs[0], "Trag bitte mindestens eine Zeit ein — z. B. 7:45.");
    return;
  }
  const sollRaw = sollInput.value;
  let soll = null;
  if (sollRaw.trim() !== "") {
    const s = parseDecimal(sollRaw);
    if (!s || s.error || s < 0 || s > 168) {
      if (announceError) markError(sollInput, "Gib das Soll bitte in Stunden ein — z. B. 40 oder 38,5.");
      return;
    }
    soll = Math.round(s * 60);
  }
  const satzRaw = satzInput.value;
  let satz = null;
  if (satzRaw.trim() !== "") {
    const s = parseDecimal(satzRaw);
    if (!s || s.error || s < 0 || s > 1000) {
      if (announceError) markError(satzInput, "Gib den Stundensatz bitte als Zahl ein — z. B. 25 oder 18,50.");
      return;
    }
    satz = s;
  }
  clearError();
  const extra = [];
  let context = "Zusammen sind das " + fmtHM(sum) + " Stunden — das sind " + fmtDez(sum) + " Dezimalstunden.";
  if (soll !== null) {
    const diff = sum - soll;
    if (diff > 0) {
      context += " Bei " + fmtHM(soll) + " Stunden Soll sind das +" + fmtHM(diff) + " Überstunden.";
      extra.push("+" + fmtHM(diff) + " Überstunden bei " + fmtHM(soll) + " Stunden Soll.");
    } else if (diff < 0) {
      context += " Bei " + fmtHM(soll) + " Stunden Soll fehlen " + fmtHM(-diff) + " — du bist " + fmtHM(-diff) + " unter Soll.";
      extra.push(fmtHM(-diff) + " unter Soll (" + fmtHM(soll) + " Stunden Soll).");
    } else {
      context += " Das Soll von " + fmtHM(soll) + " Stunden ist genau erreicht.";
      extra.push("Genau im Soll (" + fmtHM(soll) + " Stunden).");
    }
  }
  if (satz !== null) {
    const betrag = sum / 60 * satz;
    extra.push("Betrag: " + fmtMoney.format(betrag) + " € bei " + fmtMoney.format(satz) +
      " € pro Stunde — aus den genauen Minuten gerechnet.");
  }
  showResult(
    fmtHM(sum) + " Std.",
    context,
    fmtDez(sum) + " Dezimalstunden · " + fmtInt.format(sum) + " Minuten · " +
      fmtInd(sum) + " Industrieminuten",
    extra,
    parts.join(" + ") + " = " + fmtHM(sum)
  );
}

function computeUmrechnen(options) {
  const announceError = options && options.announceError;
  const mins = umMinutes;
  showResult(
    fmtDez(mins) + " Stunden",
    fmtHM(mins) + " sind " + fmtDez(mins) + " Stunden — das sind " + fmtInt.format(mins) + " Minuten.",
    fmtInd(mins) + " Industrieminuten · " + fmtHM(mins) + " = " + fmtDez(mins) + " Dezimalstunden",
    [],
    fmtHM(mins) + " = " + fmtDez(mins) + " Stunden = " + fmtInt.format(mins) + " Minuten"
  );
  if (announceError) clearError();
}

function compute(options) {
  if (mode === "vonbis") computeVonbis(options);
  else if (mode === "liste") computeListe(options);
  else computeUmrechnen(options);
}

const CALC_BUTTON_TEXT = {
  vonbis: "Arbeitszeit berechnen ↗",
  liste: "Zeiten addieren ↗",
  umrechnen: "Umrechnen ↗"
};

function setMode(next) {
  mode = next;
  modeButtons.forEach(function (btn) {
    btn.setAttribute("aria-pressed", btn.getAttribute("data-mode") === next ? "true" : "false");
  });
  modeFields.forEach(function (group) {
    group.classList.toggle("is-active", group.getAttribute("data-mode") === next);
  });
  calcButton.textContent = CALC_BUTTON_TEXT[next];
  clearError();
  compute();
  save();
}

modeButtons.forEach(function (btn) {
  btn.addEventListener("click", function () { setMode(btn.getAttribute("data-mode")); });
});

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: mode,
      start: startInput.value, end: endInput.value,
      pause: pauseInput.value, nacht: nachtInput.checked,
      list: listInputs.map(function (input) { return input.value; }),
      soll: sollInput.value, satz: satzInput.value,
      umHm: umHmInput.value, umDez: umDezInput.value, umMin: umMinInput.value,
      umMinutes: umMinutes
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
    if (typeof saved.start === "string" && saved.start !== "") startInput.value = saved.start;
    if (typeof saved.end === "string" && saved.end !== "") endInput.value = saved.end;
    if (typeof saved.pause === "string") pauseInput.value = saved.pause;
    if (typeof saved.nacht === "boolean") nachtInput.checked = saved.nacht;
    if (Array.isArray(saved.list)) {
      saved.list.forEach(function (v, i) {
        if (typeof v === "string" && listInputs[i]) listInputs[i].value = v;
      });
    }
    if (typeof saved.soll === "string") sollInput.value = saved.soll;
    if (typeof saved.satz === "string") satzInput.value = saved.satz;
    if (typeof saved.umHm === "string" && saved.umHm !== "") umHmInput.value = saved.umHm;
    if (typeof saved.umDez === "string" && saved.umDez !== "") umDezInput.value = saved.umDez;
    if (typeof saved.umMin === "string" && saved.umMin !== "") umMinInput.value = saved.umMin;
    if (typeof saved.umMinutes === "number" && saved.umMinutes >= 0) umMinutes = saved.umMinutes;
    if (typeof saved.mode === "string" && CALC_BUTTON_TEXT[saved.mode]) {
      mode = saved.mode;
      modeButtons.forEach(function (btn) {
        btn.setAttribute("aria-pressed", btn.getAttribute("data-mode") === mode ? "true" : "false");
      });
      modeFields.forEach(function (group) {
        group.classList.toggle("is-active", group.getAttribute("data-mode") === mode);
      });
      calcButton.textContent = CALC_BUTTON_TEXT[mode];
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

[startInput, endInput, pauseInput].forEach(function (input) {
  input.addEventListener("input", function () {
    compute();
    save();
  });
  input.addEventListener("change", function () {
    compute({ announceError: true });
  });
});

nachtInput.addEventListener("change", function () {
  compute();
  save();
});

listInputs.forEach(function (input) {
  input.addEventListener("input", function () {
    compute();
    save();
  });
  input.addEventListener("change", function () {
    compute({ announceError: true });
  });
});

[sollInput, satzInput].forEach(function (input) {
  input.addEventListener("input", function () {
    compute();
    save();
  });
  input.addEventListener("change", function () {
    compute({ announceError: true });
  });
});

document.querySelectorAll(".time-clear").forEach(function (btn) {
  btn.addEventListener("click", function () {
    const input = btn.closest(".time-row").querySelector(".list-input");
    if (input) {
      input.value = "";
      compute();
      save();
      input.focus();
    }
  });
});

addRowButton.addEventListener("click", function () {
  const hidden = listRows.filter(function (row) { return row.hidden; });
  if (hidden.length > 0) {
    hidden[0].hidden = false;
    if (listRows.filter(function (row) { return row.hidden; }).length === 0) {
      addRowButton.hidden = true;
    }
    compute();
    save();
  }
});

/* Umrechner: drei Felder, ein Wert — wer eins ändert, sieht die anderen
   beiden sofort. Dezimal- und Minuten-Felder zeigen die 60er-Falle an. */
function syncUmFromMinutes() {
  umHmInput.value = fmtHM(umMinutes);
  umDezInput.value = fmtDez(umMinutes);
  umMinInput.value = String(umMinutes);
  umTrap.textContent = "";
  umTrap.hidden = true;
}

umHmInput.addEventListener("input", function () {
  const raw = umHmInput.value.trim().replace(/\s/g, "");
  if (raw === "") return;
  let parsed = parseDuration(raw);
  if (!parsed || parsed.error) {
    // Im Uhren-Feld heißt "7,45" auch 7:45 — Komma wie Doppelpunkt lesen.
    const clocky = raw.match(/^(\d{1,3})[,.](\d{2})$/);
    if (clocky && Number(clocky[2]) <= 59) {
      parsed = { minutes: Number(clocky[1]) * 60 + Number(clocky[2]), trap: null };
    } else {
      return;
    }
  }
  umMinutes = parsed.minutes;
  umDezInput.value = fmtDez(umMinutes);
  umMinInput.value = String(umMinutes);
  umTrap.textContent = "";
  umTrap.hidden = true;
  compute();
  save();
});

umDezInput.addEventListener("input", function () {
  const raw = umDezInput.value.trim().replace(/\s/g, "");
  if (raw === "") return;
  const parsed = parseDuration(raw);
  if (!parsed || parsed.error) return;
  umMinutes = parsed.minutes;
  umHmInput.value = fmtHM(umMinutes);
  umMinInput.value = String(umMinutes);
  if (parsed.trap) {
    umTrap.textContent = trapText(parsed.trap);
    umTrap.hidden = false;
  } else {
    umTrap.textContent = "";
    umTrap.hidden = true;
  }
  compute();
  save();
});

umMinInput.addEventListener("input", function () {
  const raw = umMinInput.value.trim().replace(/\s/g, "");
  if (raw === "") return;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n) || n > 100000) return;
  umMinutes = n;
  umHmInput.value = fmtHM(umMinutes);
  umDezInput.value = fmtDez(umMinutes);
  umTrap.textContent = "";
  umTrap.hidden = true;
  compute();
  save();
});

[umHmInput, umDezInput, umMinInput].forEach(function (input) {
  input.addEventListener("change", function () {
    if (mode === "umrechnen") compute({ announceError: true });
  });
});

function loadVonbis(start, end, pause, nacht) {
  setMode("vonbis");
  startInput.value = start;
  endInput.value = end;
  pauseInput.value = String(pause);
  nachtInput.checked = !!nacht;
  compute();
  save();
  scrollToCalculator();
}

function loadListe() {
  setMode("liste");
  DEFAULTS.list.forEach(function (v, i) {
    if (listInputs[i]) listInputs[i].value = v;
  });
  listRows.forEach(function (row, i) {
    row.hidden = i >= 5;
  });
  addRowButton.hidden = false;
  compute();
  save();
  scrollToCalculator();
}

document.querySelectorAll(".preset-chip[data-mode]").forEach(function (chip) {
  chip.addEventListener("click", function () {
    const m = chip.getAttribute("data-mode");
    if (m === "vonbis") {
      loadVonbis(
        chip.getAttribute("data-start"),
        chip.getAttribute("data-end"),
        chip.getAttribute("data-pause"),
        chip.getAttribute("data-nacht") === "1"
      );
    } else if (m === "liste") {
      loadListe();
    }
  });
});

document.querySelectorAll(".example-card").forEach(function (card) {
  function load() {
    const m = card.getAttribute("data-mode");
    if (m === "vonbis") {
      loadVonbis(
        card.getAttribute("data-start"),
        card.getAttribute("data-end"),
        card.getAttribute("data-pause"),
        card.getAttribute("data-nacht") === "1"
      );
    } else if (m === "liste") {
      loadListe();
    }
  }
  card.addEventListener("click", load);
  card.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      load();
    }
  });
});

/* Tabellenzeilen füllen den Umrechner. */
document.querySelectorAll(".conv-row, .min-row").forEach(function (row) {
  row.addEventListener("click", function () {
    setMode("umrechnen");
    umMinutes = Number(row.getAttribute("data-minutes"));
    syncUmFromMinutes();
    compute();
    save();
    scrollToCalculator();
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

excelCopy.addEventListener("click", function () {
  copyText("=(Ende - Anfang) * 24", excelCopy, "Kopiert ✓");
});

resetButton.addEventListener("click", function () {
  startInput.value = DEFAULTS.start;
  endInput.value = DEFAULTS.end;
  pauseInput.value = DEFAULTS.pause;
  nachtInput.checked = DEFAULTS.nacht;
  DEFAULTS.list.forEach(function (v, i) {
    if (listInputs[i]) listInputs[i].value = v;
  });
  listRows.forEach(function (row, i) {
    row.hidden = i >= 5;
  });
  addRowButton.hidden = false;
  sollInput.value = DEFAULTS.soll;
  satzInput.value = DEFAULTS.satz;
  umHmInput.value = DEFAULTS.umHm;
  umDezInput.value = DEFAULTS.umDez;
  umMinInput.value = DEFAULTS.umMin;
  umMinutes = 465;
  umTrap.textContent = "";
  umTrap.hidden = true;
  setMode(DEFAULTS.mode);
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  compute();
});

restore();
compute();
