"use strict";

/* Altersrechner — Alter in Jahren, Monaten und Tagen.
   Alles wird im Browser gerechnet; nichts geht an einen Server.
   Eingaben bleiben auf dem Gerät (localStorage), wie beim Maßstabsrechner. */

const STORAGE_KEY = "massklar_alter_v1";
const form = document.querySelector("#age-form");
const birthInput = document.querySelector("#birth-date");
const refInput = document.querySelector("#ref-date");
const birthField = document.querySelector("#birth-field");
const refField = document.querySelector("#ref-field");
const errorMessage = document.querySelector("#form-error");
const resultPanel = document.querySelector("#result-panel");
const resultValue = document.querySelector("#result-value");
const resultContext = document.querySelector("#result-context");
const resultAlso = document.querySelector("#result-also");
const resultExtra = document.querySelector("#result-extra");
const copyButton = document.querySelector("#copy-button");
const resetButton = document.querySelector("#reset-button");

const fmtInt = new Intl.NumberFormat("de-DE");
const fmtDate = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" });

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
  return `${d.getFullYear()}-${m}-${day}`;
}

function utcMs(d) {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a, b) {
  return Math.round((utcMs(b) - utcMs(a)) / 86400000);
}

/* Ganze Jahre, Monate und Tage zwischen zwei Daten.
   Monate werden mit echten Monatslängen gezählt, nicht mit 30 Tagen. */
function calcAge(birth, ref) {
  let years = ref.getFullYear() - birth.getFullYear();
  let months = ref.getMonth() - birth.getMonth();
  let days = ref.getDate() - birth.getDate();
  if (days < 0) {
    months -= 1;
    const prevMonthLastDay = new Date(ref.getFullYear(), ref.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

function nextBirthday(birth, ref) {
  // Am 29. Februar geboren: in Nicht-Schaltjahren fällt der Geburtstag
  // auf den 1. März (so rollt es auch das Date-Objekt).
  let next = new Date(ref.getFullYear(), birth.getMonth(), birth.getDate());
  if (utcMs(next) < utcMs(ref)) next = new Date(ref.getFullYear() + 1, birth.getMonth(), birth.getDate());
  return next;
}

const ZODIAC = [
  ["Steinbock", 12, 22, 1, 19], ["Wassermann", 1, 20, 2, 18],
  ["Fische", 2, 19, 3, 20], ["Widder", 3, 21, 4, 19],
  ["Stier", 4, 20, 5, 20], ["Zwillinge", 5, 21, 6, 20],
  ["Krebs", 6, 21, 7, 22], ["Löwe", 7, 23, 8, 22],
  ["Jungfrau", 8, 23, 9, 22], ["Waage", 9, 23, 10, 22],
  ["Skorpion", 10, 23, 11, 21], ["Schütze", 11, 22, 12, 21],
];

function zodiacSign(birth) {
  const m = birth.getMonth() + 1;
  const d = birth.getDate();
  for (const [name, m1, d1, m2, d2] of ZODIAC) {
    if ((m === m1 && d >= d1) || (m === m2 && d <= d2)) return name;
  }
  return "";
}

function fail(message, field) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
  resultPanel.hidden = true;
  if (field) field.classList.add("is-invalid");
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ birth: birthInput.value, ref: refInput.value }));
  } catch { /* ignore */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (saved.birth) birthInput.value = saved.birth;
    if (saved.ref) refInput.value = saved.ref;
    return true;
  } catch { return false; }
}

function calculate(event, silent = false) {
  if (event) event.preventDefault();
  errorMessage.hidden = true;
  birthField.classList.remove("is-invalid");
  refField.classList.remove("is-invalid");
  try {
    const birth = parseDate(birthInput.value);
    const ref = parseDate(refInput.value);
    if (!birth) throw { message: "Geburtsdatum: Bitte ein Datum wählen.", field: birthField };
    if (!ref) throw { message: "Stichtag: Bitte ein Datum wählen.", field: refField };
    if (utcMs(birth) > utcMs(ref)) {
      throw { message: "Das Geburtsdatum liegt nach dem Stichtag. Bitte ein früheres Geburtsdatum wählen.", field: birthField };
    }
    const age = calcAge(birth, ref);
    const totalDays = daysBetween(birth, ref);
    const totalWeeks = Math.floor(totalDays / 7);
    const next = nextBirthday(birth, ref);
    const daysTo = daysBetween(ref, next);
    const sign = zodiacSign(birth);

    const ageText = `${age.years} ${age.years === 1 ? "Jahr" : "Jahre"}, ${age.months} ${age.months === 1 ? "Monat" : "Monate"}, ${age.days} ${age.days === 1 ? "Tag" : "Tage"}`;
    resultValue.textContent = ageText;
    resultContext.textContent = `Du bist am ${fmtDate.format(birth)} geboren und bist am ${fmtDate.format(ref)} ${age.years} ${age.years === 1 ? "Jahr" : "Jahre"} alt.`;
    resultAlso.textContent = `Insgesamt: ${fmtInt.format(totalDays)} Tage · ${fmtInt.format(totalWeeks)} Wochen`;
    const birthdayText = daysTo === 0
      ? `Heute ist dein Geburtstag — alles Gute!`
      : `Nächster Geburtstag in ${daysTo} ${daysTo === 1 ? "Tag" : "Tagen"}, am ${fmtDate.format(next)}`;
    resultExtra.textContent = `${birthdayText} · Sternzeichen: ${sign}`;
    resultPanel.hidden = false;
    resultPanel.classList.remove("flash");
    void resultPanel.offsetWidth;
    resultPanel.classList.add("flash");
    saveState();
  } catch (error) {
    // Leise beim Tippen: kein Fehler-Blinken, solange ein Datum noch
    // halb eingetippt ist. Der Fehler kommt erst beim Abschicken.
    if (silent) { errorMessage.hidden = true; return; }
    fail(error.message, error.field);
  }
}

form.addEventListener("submit", (event) => {
  const now = Date.now();
  if (now - (form._lastSubmit || 0) < 250) { event.preventDefault(); return; }
  form._lastSubmit = now;
  calculate(event);
});
for (const el of [birthInput, refInput]) {
  el.addEventListener("input", () => calculate(null, true));
  el.addEventListener("change", () => calculate(null, true));
}

resetButton.addEventListener("click", () => {
  birthInput.value = "2000-01-01";
  refInput.value = toISODate(new Date());
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  calculate();
});

copyButton.addEventListener("click", async () => {
  const text = `${resultValue.textContent} — ${resultContext.textContent} ${resultAlso.textContent}. ${resultExtra.textContent}`;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  copyButton.textContent = "Kopiert ✓";
  copyButton.classList.add("copied");
  setTimeout(() => {
    copyButton.innerHTML = `Ergebnis kopieren <span aria-hidden="true">⧉</span>`;
    copyButton.classList.remove("copied");
  }, 1600);
});

if (!loadState()) {
  if (!birthInput.value) birthInput.value = "2000-01-01";
  if (!refInput.value) refInput.value = toISODate(new Date());
}
calculate();
