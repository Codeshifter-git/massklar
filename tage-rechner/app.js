// Tage-Rechner — Tage zwischen zwei Daten, Datum plus Tage, Tage bis ...
// Zählregel: "Tage dazwischen" = Enddatum minus Startdatum (Enddatum zählt
// nicht mit). "Mit beiden Tagen" = ein Tag mehr. Arbeitstage = Mo–Fr,
// Feiertage nur, wenn der Nutzer sie einträgt (oder per Knopfdruck die
// bundesweiten Feiertage). Monate zählen wir als Kalendermonate.

const STORAGE_KEY = "massklar_tage_v1";

const form = document.getElementById("tage-form");
const modeGrid = document.getElementById("mode-grid");
const modeButtons = Array.prototype.slice.call(modeGrid.querySelectorAll("[data-mode]"));
const modeFields = Array.prototype.slice.call(document.querySelectorAll(".mode-fields"));
const calcButton = document.getElementById("tage-calc-btn");
const errorEl = document.getElementById("tage-error");
const resultPanel = document.getElementById("tage-result");
const resultValue = document.getElementById("result-value");
const resultContext = document.getElementById("result-context");
const resultAlso = document.getElementById("result-also");
const resultExtra = document.getElementById("result-extra");
const resultFormula = document.getElementById("result-formula");
const copyButton = document.getElementById("tage-copy");
const resetButton = document.getElementById("tage-reset");

const startInput = document.getElementById("tage-start");
const endInput = document.getElementById("tage-end");
const inclusiveInput = document.getElementById("tage-inclusive");
const workdaysInput = document.getElementById("tage-workdays");
const holidayBox = document.getElementById("holiday-box");
const holidaysInput = document.getElementById("tage-holidays");
const holidayPreset = document.getElementById("holiday-preset");
const holidayCount = document.getElementById("holiday-count");
const plusStartInput = document.getElementById("tage-plus-start");
const plusDaysInput = document.getElementById("tage-plus-days");
const targetInput = document.getElementById("tage-target");

const DEFAULTS = {
  mode: "zwischen",
  start: "2027-07-12", end: "2027-07-30",
  inclusive: false, workdays: false, holidays: "",
  plusStart: "2027-02-01", plusDays: "90",
  target: "2026-12-24"
};

// Die 9 Feiertage, die es in ganz Deutschland gibt — 2026 und 2027.
// Regionale Feiertage je nach Bundesland kommen dazu (Nutzer trägt sie ein).
const HOLIDAYS = {
  "2026-01-01": "Neujahr", "2026-04-03": "Karfreitag", "2026-04-06": "Ostermontag",
  "2026-05-01": "Tag der Arbeit", "2026-05-14": "Christi Himmelfahrt",
  "2026-05-25": "Pfingstmontag", "2026-10-03": "Tag der Deutschen Einheit",
  "2026-12-25": "1. Weihnachtstag", "2026-12-26": "2. Weihnachtstag",
  "2027-01-01": "Neujahr", "2027-03-26": "Karfreitag", "2027-03-29": "Ostermontag",
  "2027-05-01": "Tag der Arbeit", "2027-05-06": "Christi Himmelfahrt",
  "2027-05-17": "Pfingstmontag", "2027-10-03": "Tag der Deutschen Einheit",
  "2027-12-25": "1. Weihnachtstag", "2027-12-26": "2. Weihnachtstag"
};

const fmtInt = new Intl.NumberFormat("de-DE");
const fmtWeekday = new Intl.DateTimeFormat("de-DE", { weekday: "long" });
const fmtLong = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" });

function parseDate(value) {
  if (!value) return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISODate(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

function fmtShort(d) {
  return String(d.getDate()).padStart(2, "0") + "." +
    String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
}

function utcMs(d) {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a, b) {
  return Math.round((utcMs(b) - utcMs(a)) / 86400000);
}

function addDays(d, n) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

function addMonthsClamped(d, m) {
  const y = d.getFullYear() + Math.floor((d.getMonth() + m) / 12);
  const mo = (d.getMonth() + m) % 12;
  const last = new Date(y, mo + 1, 0).getDate();
  return new Date(y, mo, Math.min(d.getDate(), last));
}

/* Ganze Jahre, Monate und Tage zwischen zwei Daten — so, dass
   Start + Jahre + Monate + Tage wieder genau das Enddatum ergibt.
   (31.01. → 01.03. ist 0 Jahre, 1 Monat, 1 Tag.) */
function calendarDiff(a, b) {
  let years = 0;
  let cur = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  while (utcMs(addMonthsClamped(cur, 12)) <= utcMs(b)) { cur = addMonthsClamped(cur, 12); years += 1; }
  let months = 0;
  while (utcMs(addMonthsClamped(cur, 1)) <= utcMs(b)) { cur = addMonthsClamped(cur, 1); months += 1; }
  return { years: years, months: months, days: daysBetween(cur, b) };
}

function plural(n, one, many) {
  return n === 1 ? "1 " + one : fmtInt.format(n) + " " + many;
}

function weeksText(days) {
  const w = Math.floor(days / 7);
  const r = days % 7;
  if (w === 0) return plural(r, "Tag", "Tage");
  if (r === 0) return plural(w, "Woche", "Wochen");
  return plural(w, "Woche", "Wochen") + " und " + plural(r, "Tag", "Tage");
}

function calText(c) {
  const parts = [];
  if (c.years > 0) parts.push(plural(c.years, "Jahr", "Jahre"));
  if (c.months > 0) parts.push(plural(c.months, "Monat", "Monate"));
  parts.push(plural(c.days, "Tag", "Tage"));
  return parts.join(", ");
}

/* Feiertage aus dem Textfeld: eine Zeile = ein Datum (TT.MM.JJJJ oder JJJJ-MM-TT). */
function parseHolidays(text) {
  const set = {};
  let count = 0;
  text.split(/\n/).forEach(function (line) {
    const t = line.trim();
    if (!t) return;
    let d = null;
    const de = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (de) d = new Date(Number(de[3]), Number(de[2]) - 1, Number(de[1]));
    else if (iso) d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (d && !Number.isNaN(d.getTime())) {
      set[toISODate(d)] = true;
      count += 1;
    }
  });
  return { set: set, count: count };
}

/* Arbeitstage (Mo–Fr) im Zeitraum — Feiertage aus dem Set abgezogen.
   Von "von" (inklusive) bis "bis" — exklusiv, außer "inclusive" ist gesetzt. */
function countWorkdays(from, to, inclusive, holidaySet) {
  const end = inclusive ? addDays(to, 1) : to;
  let n = 0;
  let holidaysHit = 0;
  let d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (utcMs(d) < utcMs(end)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) {
      if (holidaySet[toISODate(d)]) holidaysHit += 1;
      else n += 1;
    }
    d = addDays(d, 1);
  }
  return { workdays: n, holidaysHit: holidaysHit };
}

function markError(input, message) {
  if (input) input.closest(".field").classList.add("has-error");
  errorEl.textContent = message;
  errorEl.hidden = false;
  resultPanel.hidden = true;
}

function clearError() {
  [startInput, endInput, plusStartInput, plusDaysInput, targetInput].forEach(function (input) {
    const field = input.closest(".field");
    if (field) field.classList.remove("has-error");
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

function computeZwischen(options) {
  const announceError = options && options.announceError;
  const start = parseDate(startInput.value);
  const end = parseDate(endInput.value);
  if (!start) {
    if (announceError) markError(startInput, "Gib bitte ein Startdatum ein — tippe es ein oder nimm den Kalender.");
    return;
  }
  if (!end) {
    if (announceError) markError(endInput, "Gib bitte ein Enddatum ein — tippe es ein oder nimm den Kalender.");
    return;
  }
  clearError();

  const reversed = utcMs(end) < utcMs(start);
  const a = reversed ? end : start;
  const b = reversed ? start : end;
  const days = daysBetween(a, b);
  const inclusive = inclusiveInput.checked;
  const workdaysOn = workdaysInput.checked;
  const holidays = parseHolidays(holidaysInput.value);
  const cal = calendarDiff(a, b);
  const hours = days * 24;
  const sign = reversed ? "−" : "";

  if (workdaysOn) {
    const wd = countWorkdays(a, b, inclusive, holidays.set);
    const extra = [];
    extra.push(fmtWeekday.format(a).charAt(0).toUpperCase() + fmtWeekday.format(a).slice(1) +
      ", " + fmtLong.format(a) + " bis " +
      fmtWeekday.format(b).charAt(0).toUpperCase() + fmtWeekday.format(b).slice(1) +
      ", " + fmtLong.format(b) + ".");
    if (wd.holidaysHit > 0) {
      extra.push(plural(wd.holidaysHit, "Feiertag", "Feiertage") + " im Zeitraum abgezogen.");
    }
    const value = sign + plural(wd.workdays, "Arbeitstag", "Arbeitstage");
    let context;
    if (reversed) {
      context = "Das Enddatum (" + fmtShort(end) + ") liegt vor dem Startdatum (" + fmtShort(start) +
        ") — vom " + fmtShort(a) + " bis zum " + fmtShort(b) + " sind es " +
        wd.workdays + " Arbeitstage (Mo–Fr).";
    } else {
      context = "Vom " + fmtShort(a) + " bis zum " + fmtShort(b) + " sind es " +
        wd.workdays + " Arbeitstage (Mo–Fr)" + (inclusive ? " — das Enddatum ist mitgezählt." : ".");
    }
    showResult(
      value,
      context,
      plural(days, "Kalendertag", "Kalendertage") + " (" + plural(days + 1, "Tag", "Tage") +
        " mit Enddatum) · " + weeksText(days) +
        (cal.years > 0 || cal.months > 0 ? " · " + calText(cal) : "") +
        " · " + fmtInt.format(hours) + " Stunden",
      extra,
      fmtShort(b) + " − " + fmtShort(a) + " = " + days + " Tage"
    );
    return;
  }

  const total = inclusive ? days + 1 : days;
  const extra = [];
  extra.push(fmtWeekday.format(a).charAt(0).toUpperCase() + fmtWeekday.format(a).slice(1) +
    ", " + fmtLong.format(a) + " bis " +
    fmtWeekday.format(b).charAt(0).toUpperCase() + fmtWeekday.format(b).slice(1) +
    ", " + fmtLong.format(b) + ".");
  let context;
  if (reversed) {
    context = "Das Enddatum (" + fmtShort(end) + ") liegt " + plural(days, "Tag", "Tage") +
      " vor dem Startdatum (" + fmtShort(start) + ").";
  } else if (days === 0) {
    context = "Start und Ende sind derselbe Tag — 0 Tage dazwischen, 1 Tag mit beiden Tagen.";
  } else if (inclusive) {
    context = "Vom " + fmtShort(a) + " bis zum " + fmtShort(b) + " sind es " + total +
      " Tage — das Enddatum ist mitgezählt (" + days + " Tage dazwischen).";
  } else {
    context = "Vom " + fmtShort(a) + " bis zum " + fmtShort(b) + " sind es " + days +
      " Tage — " + (days + 1) + " Tage, wenn du beide Tage mitzählst.";
  }
  showResult(
    sign + plural(total, "Tag", "Tage"),
    context,
    weeksText(days) +
      (cal.years > 0 || cal.months > 0 ? " · " + calText(cal) : "") +
      " · " + fmtInt.format(hours) + " Stunden (" + fmtInt.format(hours * 60) + " Minuten)",
    extra,
    inclusive
      ? fmtShort(b) + " − " + fmtShort(a) + " + 1 = " + total + " Tage"
      : fmtShort(b) + " − " + fmtShort(a) + " = " + days + " Tage"
  );
}

function computePlus(options) {
  const announceError = options && options.announceError;
  const start = parseDate(plusStartInput.value);
  if (!start) {
    if (announceError) markError(plusStartInput, "Gib bitte ein Startdatum ein — tippe es ein oder nimm den Kalender.");
    return;
  }
  const raw = plusDaysInput.value.trim().replace(/\s/g, "").replace(",", ".");
  const days = Number(raw);
  if (raw === "" || Number.isNaN(days) || !Number.isInteger(days)) {
    if (announceError) markError(plusDaysInput, "Gib bitte ganze Tage ein — z. B. 90 oder −14.");
    return;
  }
  if (Math.abs(days) > 36500) {
    if (announceError) markError(plusDaysInput, "Bis zu 100 Jahre sind möglich — bitte weniger Tage eingeben.");
    return;
  }
  clearError();

  const target = addDays(start, days);
  const weekday = fmtWeekday.format(target);
  const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const iso = toISODate(target);
  const holidayName = HOLIDAYS[iso];
  const isWeekend = target.getDay() === 0 || target.getDay() === 6;
  const extra = [];
  if (holidayName) extra.push("Achtung: Das Zieldatum ist ein Feiertag (bundesweit): " + holidayName + ".");
  else if (isWeekend) extra.push("Achtung: Das Zieldatum fällt auf ein Wochenende (" + weekday + ").");
  const verb = days >= 0 ? "plus" : "minus";
  showResult(
    fmtShort(target),
    fmtShort(start) + " " + verb + " " + fmtInt.format(Math.abs(days)) + " " +
      (Math.abs(days) === 1 ? "Tag" : "Tage") + " ist der " + fmtShort(target) +
      ", ein " + weekday + ".",
    weeksText(Math.abs(days)) + " · " + weekdayCap + ", " + fmtLong.format(target),
    extra,
    fmtShort(start) + " " + (days >= 0 ? "+" : "−") + " " + fmtInt.format(Math.abs(days)) +
      " Tage = " + fmtShort(target)
  );
}

function computeBis(options) {
  const announceError = options && options.announceError;
  const target = parseDate(targetInput.value);
  if (!target) {
    if (announceError) markError(targetInput, "Gib bitte ein Zieldatum ein — tippe es ein oder nimm den Kalender.");
    return;
  }
  clearError();

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = daysBetween(todayStart, target);
  const weekday = fmtWeekday.format(target);
  const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const iso = toISODate(target);
  const holidayName = HOLIDAYS[iso];
  const extra = [];
  if (holidayName) extra.push("Das Zieldatum ist ein Feiertag (bundesweit): " + holidayName + ".");
  else if (target.getDay() === 0 || target.getDay() === 6) {
    extra.push("Das Zieldatum fällt auf ein Wochenende (" + weekday + ").");
  }
  if (diff === 0) {
    showResult(
      "Heute!",
      "Das Zieldatum ist heute — 0 Tage bis zum " + fmtShort(target) + ".",
      weekdayCap + ", " + fmtLong.format(target),
      extra,
      fmtShort(target) + " − heute = 0 Tage"
    );
  } else if (diff < 0) {
    showResult(
      "−" + plural(Math.abs(diff), "Tag", "Tage"),
      "Das Zieldatum (" + fmtShort(target) + ") liegt " + plural(Math.abs(diff), "Tag", "Tage") +
        " in der Vergangenheit.",
      weeksText(Math.abs(diff)) + " · " + weekdayCap + ", " + fmtLong.format(target),
      extra,
      fmtShort(target) + " − " + fmtShort(todayStart) + " = −" + fmtInt.format(Math.abs(diff)) + " Tage"
    );
  } else {
    showResult(
      plural(diff, "Tag", "Tage"),
      "Bis zum " + fmtShort(target) + " sind es noch " + plural(diff, "Tag", "Tage") + ".",
      weeksText(diff) + " · " + weekdayCap + ", " + fmtLong.format(target),
      extra,
      fmtShort(target) + " − " + fmtShort(todayStart) + " = " + fmtInt.format(diff) + " Tage"
    );
  }
}

function compute(options) {
  if (mode === "zwischen") computeZwischen(options);
  else if (mode === "plus") computePlus(options);
  else computeBis(options);
}

const CALC_BUTTON_TEXT = {
  zwischen: "Tage zählen ↗",
  plus: "Zieldatum berechnen ↗",
  bis: "Tage bis … zählen ↗"
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
      inclusive: inclusiveInput.checked, workdays: workdaysInput.checked,
      holidays: holidaysInput.value,
      plusStart: plusStartInput.value, plusDays: plusDaysInput.value,
      target: targetInput.value
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
    if (typeof saved.inclusive === "boolean") inclusiveInput.checked = saved.inclusive;
    if (typeof saved.workdays === "boolean") workdaysInput.checked = saved.workdays;
    if (typeof saved.holidays === "string") holidaysInput.value = saved.holidays;
    if (typeof saved.plusStart === "string" && saved.plusStart !== "") plusStartInput.value = saved.plusStart;
    if (typeof saved.plusDays === "string" && saved.plusDays !== "") plusDaysInput.value = saved.plusDays;
    if (typeof saved.target === "string" && saved.target !== "") targetInput.value = saved.target;
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

function updateHolidayBox() {
  holidayBox.hidden = !workdaysInput.checked;
  if (workdaysInput.checked) {
    const parsed = parseHolidays(holidaysInput.value);
    holidayCount.textContent = parsed.count > 0
      ? parsed.count + " Feiertage eingetragen — sie werden bei den Arbeitstagen abgezogen."
      : "Feiertage werden nur bei „Nur Arbeitstage“ abgezogen.";
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

[startInput, endInput, plusStartInput, plusDaysInput, targetInput].forEach(function (input) {
  input.addEventListener("input", function () {
    compute();
    save();
  });
  input.addEventListener("change", function () {
    compute({ announceError: true });
  });
});

[inclusiveInput, workdaysInput].forEach(function (input) {
  input.addEventListener("change", function () {
    updateHolidayBox();
    compute();
    save();
  });
});

holidaysInput.addEventListener("input", function () {
  updateHolidayBox();
  compute();
  save();
});

document.querySelectorAll(".today-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    const input = document.getElementById(btn.getAttribute("data-target"));
    if (input) {
      input.value = toISODate(new Date());
      compute({ announceError: true });
      save();
    }
  });
});

holidayPreset.addEventListener("click", function () {
  const lines = Object.keys(HOLIDAYS).sort().map(function (iso) {
    const d = parseDate(iso);
    return fmtShort(d);
  });
  holidaysInput.value = lines.join("\n");
  updateHolidayBox();
  compute();
  save();
});

/* "Tage bis …"-Chips: das nächste Mal, an dem der Tag kommt. */
document.querySelectorAll("[data-target-date]").forEach(function (chip) {
  chip.addEventListener("click", function () {
    const parts = chip.getAttribute("data-target-date").split("-");
    const month = Number(parts[0]) - 1;
    const day = Number(parts[1]);
    const today = new Date();
    let target = new Date(today.getFullYear(), month, day);
    if (utcMs(target) < utcMs(new Date(today.getFullYear(), today.getMonth(), today.getDate()))) {
      target = new Date(today.getFullYear() + 1, month, day);
    }
    targetInput.value = toISODate(target);
    compute({ announceError: true });
    save();
    scrollToCalculator();
  });
});

function loadZwischen(start, end) {
  setMode("zwischen");
  startInput.value = start;
  endInput.value = end;
  compute();
  save();
  scrollToCalculator();
}

function loadPlus(start, days) {
  setMode("plus");
  plusStartInput.value = start;
  plusDaysInput.value = String(days);
  compute();
  save();
  scrollToCalculator();
}

document.querySelectorAll(".preset-chip[data-mode]").forEach(function (chip) {
  chip.addEventListener("click", function () {
    if (chip.getAttribute("data-mode") === "zwischen") {
      loadZwischen(chip.getAttribute("data-start"), chip.getAttribute("data-end"));
    } else {
      loadPlus(chip.getAttribute("data-start"), chip.getAttribute("data-days"));
    }
  });
});

document.querySelectorAll(".example-card").forEach(function (card) {
  function load() {
    if (card.getAttribute("data-mode") === "zwischen") {
      loadZwischen(card.getAttribute("data-start"), card.getAttribute("data-end"));
    } else {
      loadPlus(card.getAttribute("data-start"), card.getAttribute("data-days"));
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

document.querySelectorAll(".span-row").forEach(function (row) {
  row.addEventListener("click", function () {
    loadZwischen(row.getAttribute("data-start"), row.getAttribute("data-end"));
  });
});

copyButton.addEventListener("click", function () {
  const text = resultValue.textContent + " — " + resultContext.textContent + " " +
    resultAlso.textContent + " " + resultFormula.textContent;
  function done() {
    copyButton.textContent = "Kopiert ✓";
    setTimeout(function () { copyButton.textContent = "Ergebnis kopieren"; }, 2000);
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
});

resetButton.addEventListener("click", function () {
  startInput.value = DEFAULTS.start;
  endInput.value = DEFAULTS.end;
  inclusiveInput.checked = DEFAULTS.inclusive;
  workdaysInput.checked = DEFAULTS.workdays;
  holidaysInput.value = DEFAULTS.holidays;
  plusStartInput.value = DEFAULTS.plusStart;
  plusDaysInput.value = DEFAULTS.plusDays;
  targetInput.value = DEFAULTS.target;
  updateHolidayBox();
  setMode(DEFAULTS.mode);
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  compute();
});

restore();
updateHolidayBox();
compute();
