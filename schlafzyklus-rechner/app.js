// Schlafzyklus-Rechner — Schlafenszeit und Aufwachzeit aus vollen
// ~90-Minuten-Zyklen. Ein Zyklus dauert bei den meisten Menschen
// 70 bis 110 Minuten — 90 ist der Schnitt, oben änderbar.
// Die Einschlafzeit gehört NICHT zum Schlaf: Sie kommt extra dazu.
// Weckzeit 07:00, 5 Zyklen, 15 Minuten Einschlafen → 23:15 am Vortag.
// Die Altersgruppe ändert nur die Empfehlung, nie die Rechnung.

const STORAGE_KEY = "massklar_schlaf_v1";

const form = document.getElementById("schlafzyklus-form");
const modeGrid = document.getElementById("mode-grid");
const modeButtons = Array.prototype.slice.call(modeGrid.querySelectorAll("[data-mode]"));
const modeFields = Array.prototype.slice.call(document.querySelectorAll(".mode-fields"));
const calcButton = document.getElementById("schlafzyklus-calc-btn");
const errorEl = document.getElementById("schlafzyklus-error");
const resultPanel = document.getElementById("schlafzyklus-result");
const resultValue = document.getElementById("result-value");
const resultContext = document.getElementById("result-context");
const resultAlso = document.getElementById("result-also");
const resultExtra = document.getElementById("result-extra");
const resultFormula = document.getElementById("result-formula");
const copyButton = document.getElementById("schlafzyklus-copy");
const resetButton = document.getElementById("schlafzyklus-reset");

const weckInput = document.getElementById("schlaf-weckzeit");
const bettInput = document.getElementById("schlaf-bettzeit");
const einschlafInput = document.getElementById("schlaf-einschlaf");
const zyklusInput = document.getElementById("schlaf-zyklus");
const alterSelect = document.getElementById("schlaf-alter");
const jetztUhrzeit = document.getElementById("jetzt-uhrzeit");
const zyklusTbody = document.getElementById("zyklus-tbody");
const alterHinweis = document.getElementById("alter-hinweis");

const DEFAULTS = {
  mode: "aufwachen",
  weckzeit: "07:00", bettzeit: "23:00",
  einschlaf: "15", zyklus: "90", alter: "erwachsene",
  pick: 5
};

/* Empfohlener Schlaf je Altersgruppe, in Stunden (National Sleep
   Foundation, Hirshkowitz et al. 2015). Nur für die Empfehlung —
   die Rechnung bleibt für alle gleich. */
const ALTER = {
  kind: { label: "Kinder (6–13 Jahre)", min: 9, max: 11 },
  jugend: { label: "Jugendliche (14–17 Jahre)", min: 8, max: 10 },
  erwachsene: { label: "Erwachsene (18–64 Jahre)", min: 7, max: 9 },
  senior: { label: "Menschen ab 65 Jahren", min: 7, max: 8 }
};

const fmtDez = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat("de-DE");

function fmtStunden(mins) {
  return fmtDez.format(mins / 60);
}

/* Minuten seit Mitternacht → "23:15". */
function clockShort(mins) {
  const m = ((Math.round(mins) % (24 * 60)) + 24 * 60) % (24 * 60);
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

/* "07:00" (type=time) → Minuten seit Mitternacht, sonst null. */
function parseClock(value) {
  const m = (value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/* Deutsche Ganzzahl ("15", "15,5" → Fehler, Minuten sind ganz). */
function parseMinuten(text) {
  const raw = (text || "").trim().replace(/\s/g, "").replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { error: true };
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

let mode = DEFAULTS.mode;
let pick = DEFAULTS.pick;
let jetztTimer = null;

/* Heutiges Datum mit Uhrzeit (Minuten seit Mitternacht). */
function dateAt(mins) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMinutes(mins);
  return d;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* Eine Zeile der Zyklus-Tabelle: Uhrzeit, Schlafdauer, Hinweis.
   Hinweis aus dem Alter: im empfohlenen Bereich → "meist passend",
   darunter → "eher kurz", darüber → "eher lang". */
function rowLabel(cycles, zyklusLen) {
  const hours = cycles * zyklusLen / 60;
  const range = ALTER[alterSelect.value] || ALTER.erwachsene;
  if (hours < range.min) return "eher kurz";
  if (hours > range.max) return "eher lang";
  return "meist passend";
}

function defaultPick(zyklusLen) {
  const range = ALTER[alterSelect.value] || ALTER.erwachsene;
  for (let c = 3; c <= 6; c++) {
    const hours = c * zyklusLen / 60;
    if (hours >= range.min && hours <= range.max) return c;
  }
  return 5;
}

function renderTable(rows) {
  zyklusTbody.innerHTML = rows.map(function (r) {
    return "<tr class=\"zyklus-row" + (r.cycles === pick ? " is-pick" : "") +
      "\" data-cycles=\"" + r.cycles + "\"><th scope=\"row\">" + r.cycles + " Zyklen</th>" +
      "<td>" + r.time + " Uhr" + (r.dayLabel ? " · " + r.dayLabel : "") + "</td>" +
      "<td>" + fmtStunden(r.cycles * r.zyklusLen) + " Stunden</td>" +
      "<td>" + r.label + "</td></tr>";
  }).join("");
  zyklusTbody.querySelectorAll(".zyklus-row").forEach(function (row) {
    row.addEventListener("click", function () {
      pick = Number(row.getAttribute("data-cycles"));
      compute();
      save();
      scrollToCalculator();
    });
  });
}

function alterNote() {
  const range = ALTER[alterSelect.value] || ALTER.erwachsene;
  alterHinweis.textContent = "Für " + range.label + " empfiehlt die National Sleep Foundation " +
    fmtDez.format(range.min) + "–" + fmtDez.format(range.max) +
    " Stunden Schlaf. Die Altersgruppe ändert nur die Empfehlung — die Rechnung bleibt gleich.";
}

function readSettings(options) {
  const announceError = options && options.announceError;
  const einschlaf = parseMinuten(einschlafInput.value);
  if (einschlaf === null || einschlaf.error || einschlaf < 0 || einschlaf > 120) {
    if (announceError) markError(einschlafInput, "Gib die Zeit zum Einschlafen bitte in Minuten ein — z. B. 15 oder 0.");
    return null;
  }
  const zyklusLen = parseMinuten(zyklusInput.value);
  if (zyklusLen === null || zyklusLen.error || zyklusLen < 60 || zyklusLen > 120) {
    if (announceError) markError(zyklusInput, "Gib die Zykluslänge bitte in Minuten ein — zwischen 60 und 120.");
    return null;
  }
  return { einschlaf: einschlaf, zyklusLen: zyklusLen };
}

function computeAufwachen(options) {
  const settings = readSettings(options);
  if (!settings) return;
  const wake = parseClock(weckInput.value);
  if (wake === null) {
    if (options && options.announceError) markError(weckInput, "Gib bitte eine Weckzeit ein — z. B. 07:00.");
    return;
  }
  clearError();
  const wakeDate = dateAt(wake);
  const rows = [];
  for (let c = 3; c <= 6; c++) {
    const bedDate = new Date(wakeDate.getTime() - (c * settings.zyklusLen + settings.einschlaf) * 60000);
    rows.push({
      cycles: c, zyklusLen: settings.zyklusLen,
      time: clockShort(bedDate.getHours() * 60 + bedDate.getMinutes()),
      dayLabel: sameDay(bedDate, wakeDate) ? "am selben Tag" : "am Vortag",
      label: rowLabel(c, settings.zyklusLen)
    });
  }
  renderTable(rows);
  alterNote();
  const chosen = rows.find(function (r) { return r.cycles === pick; }) || rows[2];
  const alsoParts = rows.filter(function (r) { return r.cycles !== pick; })
    .map(function (r) { return r.cycles + " Zyklen: " + r.time + " Uhr"; });
  showResult(
    chosen.time,
    "Wecker " + clockShort(wake) + ", " + pick + " Zyklen à " + settings.zyklusLen +
      " Minuten, " + settings.einschlaf + " Minuten zum Einschlafen: Leg dich um " + chosen.time +
      " hin (" + chosen.dayLabel + ") — das sind " + fmtStunden(pick * settings.zyklusLen) + " Stunden Schlaf.",
    alsoParts.join(" · "),
    [],
    clockShort(wake) + " − " + pick + " × " + settings.zyklusLen + " Min. − " +
      settings.einschlaf + " Min. = " + chosen.time
  );
}

function computeInsbett(options) {
  const settings = readSettings(options);
  if (!settings) return;
  const bed = parseClock(bettInput.value);
  if (bed === null) {
    if (options && options.announceError) markError(bettInput, "Gib bitte eine Schlafenszeit ein — z. B. 23:00.");
    return;
  }
  clearError();
  const bedDate = dateAt(bed);
  const rows = [];
  for (let c = 3; c <= 6; c++) {
    const wakeDate = new Date(bedDate.getTime() + (settings.einschlaf + c * settings.zyklusLen) * 60000);
    rows.push({
      cycles: c, zyklusLen: settings.zyklusLen,
      time: clockShort(wakeDate.getHours() * 60 + wakeDate.getMinutes()),
      dayLabel: sameDay(wakeDate, bedDate) ? "am selben Tag" : "am Folgetag",
      label: rowLabel(c, settings.zyklusLen)
    });
  }
  renderTable(rows);
  alterNote();
  const chosen = rows.find(function (r) { return r.cycles === pick; }) || rows[2];
  const alsoParts = rows.filter(function (r) { return r.cycles !== pick; })
    .map(function (r) { return r.cycles + " Zyklen: " + r.time + " Uhr"; });
  showResult(
    chosen.time,
    "Ins Bett um " + clockShort(bed) + ", " + pick + " Zyklen à " + settings.zyklusLen +
      " Minuten, " + settings.einschlaf + " Minuten zum Einschlafen: Stell den Wecker auf " + chosen.time +
      " (" + chosen.dayLabel + ") — das sind " + fmtStunden(pick * settings.zyklusLen) + " Stunden Schlaf.",
    alsoParts.join(" · "),
    [],
    clockShort(bed) + " + " + settings.einschlaf + " Min. + " + pick + " × " +
      settings.zyklusLen + " Min. = " + chosen.time
  );
}

function computeJetzt(options) {
  const settings = readSettings(options);
  if (!settings) return;
  clearError();
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  jetztUhrzeit.textContent = "Jetzt ist es " + clockShort(nowMins) + " Uhr.";
  const startDate = new Date(now.getTime() + settings.einschlaf * 60000);
  const rows = [];
  for (let c = 3; c <= 6; c++) {
    const wakeDate = new Date(startDate.getTime() + c * settings.zyklusLen * 60000);
    rows.push({
      cycles: c, zyklusLen: settings.zyklusLen,
      time: clockShort(wakeDate.getHours() * 60 + wakeDate.getMinutes()),
      dayLabel: sameDay(wakeDate, now) ? "am selben Tag" : "am Folgetag",
      label: rowLabel(c, settings.zyklusLen)
    });
  }
  renderTable(rows);
  alterNote();
  const chosen = rows.find(function (r) { return r.cycles === pick; }) || rows[2];
  const alsoParts = rows.filter(function (r) { return r.cycles !== pick; })
    .map(function (r) { return r.cycles + " Zyklen: " + r.time + " Uhr"; });
  showResult(
    chosen.time,
    "Jetzt ist es " + clockShort(nowMins) + " Uhr. Gehst du jetzt ins Bett, weckt dich der Wecker um " +
      chosen.time + " (" + chosen.dayLabel + ") — " + pick + " Zyklen à " + settings.zyklusLen +
      " Minuten, " + settings.einschlaf + " Minuten zum Einschlafen, das sind " +
      fmtStunden(pick * settings.zyklusLen) + " Stunden Schlaf.",
    alsoParts.join(" · "),
    [],
    clockShort(nowMins) + " + " + settings.einschlaf + " Min. + " + pick + " × " +
      settings.zyklusLen + " Min. = " + chosen.time
  );
}

function compute(options) {
  if (mode === "aufwachen") computeAufwachen(options);
  else if (mode === "insbett") computeInsbett(options);
  else computeJetzt(options);
}

const CALC_BUTTON_TEXT = {
  aufwachen: "Schlafenszeit finden ↗",
  insbett: "Aufwachzeit finden ↗",
  jetzt: "Zeiten für jetzt ↗"
};

function startJetztTimer() {
  stopJetztTimer();
  jetztTimer = setInterval(function () {
    if (mode === "jetzt") compute();
  }, 15000);
}

function stopJetztTimer() {
  if (jetztTimer !== null) {
    clearInterval(jetztTimer);
    jetztTimer = null;
  }
}

function setMode(next) {
  mode = next;
  modeButtons.forEach(function (btn) {
    btn.setAttribute("aria-pressed", btn.getAttribute("data-mode") === next ? "true" : "false");
  });
  modeFields.forEach(function (group) {
    group.classList.toggle("is-active", group.getAttribute("data-mode") === next);
  });
  calcButton.textContent = CALC_BUTTON_TEXT[next];
  if (next === "jetzt") startJetztTimer();
  else stopJetztTimer();
  clearError();
  compute();
  save();
}

function defaultPickForCurrent() {
  const len = parseMinuten(zyklusInput.value);
  if (len === null || len.error) return 5;
  return defaultPick(len);
}

modeButtons.forEach(function (btn) {
  btn.addEventListener("click", function () { setMode(btn.getAttribute("data-mode")); });
});

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: mode,
      weckzeit: weckInput.value, bettzeit: bettInput.value,
      einschlaf: einschlafInput.value, zyklus: zyklusInput.value,
      alter: alterSelect.value, pick: pick
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
    if (typeof saved.weckzeit === "string" && saved.weckzeit !== "") weckInput.value = saved.weckzeit;
    if (typeof saved.bettzeit === "string" && saved.bettzeit !== "") bettInput.value = saved.bettzeit;
    if (typeof saved.einschlaf === "string" && saved.einschlaf !== "") einschlafInput.value = saved.einschlaf;
    if (typeof saved.zyklus === "string" && saved.zyklus !== "") zyklusInput.value = saved.zyklus;
    if (typeof saved.alter === "string" && ALTER[saved.alter]) alterSelect.value = saved.alter;
    if (typeof saved.pick === "number" && saved.pick >= 3 && saved.pick <= 6) pick = saved.pick;
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

[weckInput, bettInput, einschlafInput, zyklusInput].forEach(function (input) {
  input.addEventListener("input", function () {
    compute();
    save();
  });
  input.addEventListener("change", function () {
    compute({ announceError: true });
  });
});

alterSelect.addEventListener("change", function () {
  pick = defaultPickForCurrent();
  compute();
  save();
});

function loadExample(name) {
  if (name === "pendler") {
    setMode("aufwachen");
    weckInput.value = "06:30";
    einschlafInput.value = "14";
    zyklusInput.value = "90";
    alterSelect.value = "erwachsene";
    pick = 5;
  } else if (name === "nacht") {
    setMode("insbett");
    bettInput.value = "15:00";
    einschlafInput.value = "15";
    zyklusInput.value = "90";
    alterSelect.value = "erwachsene";
    pick = 5;
  } else if (name === "kind") {
    setMode("aufwachen");
    weckInput.value = "07:00";
    einschlafInput.value = "15";
    zyklusInput.value = "90";
    alterSelect.value = "kind";
    pick = 6;
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
  weckInput.value = DEFAULTS.weckzeit;
  bettInput.value = DEFAULTS.bettzeit;
  einschlafInput.value = DEFAULTS.einschlaf;
  zyklusInput.value = DEFAULTS.zyklus;
  alterSelect.value = DEFAULTS.alter;
  pick = DEFAULTS.pick;
  setMode(DEFAULTS.mode);
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  compute();
});

restore();
if (mode === "jetzt") startJetztTimer();
compute();
