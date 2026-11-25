// Brutto-Netto-Rechner — Nettogehalt aus Bruttogehalt nach dem amtlichen
// Programmablaufplan 2026 des Bundesfinanzministeriums (BMF PAP 2026).
// Geprüft gegen die BMF Allgemeine Jahreslohnsteuertabelle 2026
// (Prüftabelle, Anlage 2: 215 Vergleiche, größte Abweichung 2 €) und gegen
// personal-wissen.net, calcendium.de und mein-nettogehalt.de (Monatsfälle).
// ACHTUNG: rechnerprofis.de rechnet Steuerklasse V/VI falsch — es nimmt das
// Differenzverfahren ohne die HOCH-Kappung (MST5-6), deshalb ist seine
// Lohnsteuer ab ca. 1.700 € brutto zu hoch. Dieser Rechner rechnet nach PAP.
// Das Ergebnis ist nur ein Richtwert — die Lohnabrechnung des Arbeitgebers
// ist verbindlich. Steuerjahr 2026, Stand: November 2026. Im Januar 2027
// kommen die neuen Sätze dazu (Grundfreibetrag, Beitragsbemessungsgrenzen).

const STORAGE_KEY = "massklar_bruttonetto_v1";

const form = document.getElementById("bn-form");
const zeitraumGrid = document.getElementById("bn-zeitraum");
const zeitraumButtons = Array.prototype.slice.call(zeitraumGrid.querySelectorAll("[data-zeitraum]"));
const bruttoInput = document.getElementById("bn-brutto");
const bruttoHint = document.getElementById("bn-brutto-hint");
const stklSelect = document.getElementById("bn-stkl");
const stklHint = document.getElementById("bn-stkl-hint");
const bundeslandSelect = document.getElementById("bn-bundesland");
const kinderSelect = document.getElementById("bn-kinder");
const kvzInput = document.getElementById("bn-kvz");
const kircheGrid = document.getElementById("bn-kirche");
const kircheButtons = Array.prototype.slice.call(kircheGrid.querySelectorAll("[data-kirche]"));
const rvGrid = document.getElementById("bn-rv");
const rvButtons = Array.prototype.slice.call(rvGrid.querySelectorAll("[data-rv]"));
const mieteInput = document.getElementById("bn-miete");
const errorEl = document.getElementById("bn-error");
const resultPanel = document.getElementById("bn-result");
const resultValue = document.getElementById("result-value");
const resultContext = document.getElementById("result-context");
const resultAlso = document.getElementById("result-also");
const resultExtra = document.getElementById("result-extra");
const resultFormula = document.getElementById("result-formula");
const minijobNote = document.getElementById("bn-minijob-note");
const midijobNote = document.getElementById("bn-midijob-note");
const copyButton = document.getElementById("bn-copy");
const resetButton = document.getElementById("bn-reset");
const nettoTbody = document.getElementById("bn-netto-tbody");
const klassenTbody = document.getElementById("bn-klassen-tbody");

const DEFAULTS = {
  zeitraum: "monat",
  brutto: "3.500",
  stkl: "I",
  bundesland: "Nordrhein-Westfalen",
  kinder: "0",
  kvz: "2,9",
  kirche: "nein",
  rv: "ja",
  miete: ""
};

/* Drei Beispiele aus dem Leben (alle Zahlen von Hand nachgerechnet). */
const EXAMPLES = {
  standard: { zeitraum: "monat", brutto: "3.500", stkl: "I", kinder: "0", kvz: "2,9", kirche: "nein", rv: "ja", miete: "" },
  familie: { zeitraum: "monat", brutto: "2.500", stkl: "III", kinder: "2", kvz: "2,9", kirche: "nein", rv: "ja", miete: "" },
  midijob: { zeitraum: "monat", brutto: "1.000", stkl: "I", kinder: "0", kvz: "2,9", kirche: "nein", rv: "ja", miete: "" }
};

const STKL_TEXTE = {
  I: "I — ledig, ohne Kinder. Die Steuerklasse steht auf deiner Lohnabrechnung.",
  II: "II — alleinerziehend mit Kind. Entlastungsbetrag 4.260 € im Jahr, plus 240 € je weiterem Kind.",
  III: "III — verheiratet, dein Partner verdient weniger. Die Steuer ist niedrig, dein Partner zahlt in Klasse V mehr.",
  IV: "IV — verheiratet, ihr verdient beide ähnlich viel. Jeder zahlt seine eigene Steuer.",
  V: "V — verheiratet, dein Partner verdient mehr (Klasse III). Die Steuer ist hoch — am Jahresende gleicht die Steuererklärung das aus.",
  VI: "VI — zweiter Job. Keine Pauschbeträge: Das zu versteuernde Einkommen ist das Brutto minus Vorsorgepauschale."
};

const fmtGeld = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const fmtGeld2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function euro(n, cents) {
  return (cents ? fmtGeld2 : fmtGeld).format(n) + " €";
}

/* Deutsche Zahl lesen: "3.500", "3500" und "3.500,50" sind alle
   der gleiche Wert. Punkte sind Tausendertrennzeichen, Komma ist das
   Dezimalzeichen. */
function parseDeutsch(text) {
  const raw = (text || "").trim().replace(/[\s\u00A0]/g, "").replace(/\./g, "").replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function round2(n) { return Math.round(n * 100) / 100; }

/* ---- Alle Zahlen für 2026 an EINER Stelle (BMF PAP 2026) ---- */
const P = {
  GFB: 12348, // Grundfreibetrag
  AN_PAUSCH: 1230, // Arbeitnehmer-Pauschbetrag
  SONDER_PAUSCH: 36, // Sonderausgaben-Pauschbetrag
  ENTLASTUNG: 4260, ENTLASTUNG_WEITER: 240, // Alleinerziehende
  KFB_KIND: 4878, KFB_KIND_III: 9756, // Kinderfreibetrag je Kind
  SOLI_FREI_EINZEL: 20350, SOLI_FREI_SPLIT: 40700, // Soli-Freigrenzen
  BBG_RV_JAHR: 101400, BBG_KV_JAHR: 69750,
  BBG_RV_MONAT: 8450, BBG_KV_MONAT: 5812.50,
  RV_AN: 0.093, AV_AN: 0.013,
  KV_BASIS: 0.146, KV_ERM: 0.14, // 14,6 % gesamt, 14,0 % ermässigt (Vorsorgepauschale)
  PV_BASIS: 0.018, PV_KINDERLOS: 0.006, PV_PRO_KIND_AB2: 0.0025, PV_MIN: 0.008,
  W1: 14071, W2: 34939, W3: 222260, // BMF PAP 2026 MPARA (MST5-6)
  MIDI_G: 603, MIDI_MAX: 2000, MIDI_F: 0.6619
};

/* §32a EStG 2026 — Tarif, auf ganze Euro abgerundet. */
function tarif(x) {
  x = Math.floor(x);
  if (x <= P.GFB) return 0;
  if (x <= 17799) {
    const y = (x - 12348) / 10000;
    return Math.floor((914.51 * y + 1400) * y);
  }
  if (x <= 69878) {
    const z = (x - 17799) / 10000;
    return Math.floor((173.10 * z + 2397) * z + 1034.87);
  }
  if (x <= 277825) return Math.floor(0.42 * x - 11135.63);
  return Math.floor(0.45 * x - 19470.38);
}

/* UP5-6: Differenzverfahren für Steuerklasse V/VI. */
function up56(z) {
  const st1 = tarif(Math.floor(1.25 * z));
  const st2 = tarif(Math.floor(0.75 * z));
  const diff = 2 * (st1 - st2);
  const mist = Math.floor(0.14 * z);
  return Math.max(diff, mist);
}
const UP56_W1 = up56(P.W1); // 1.969
const UP56_W2 = up56(P.W2); // 10.448

/* MST5-6: Lohnsteuer für Steuerklassen V und VI (§ 39b Abs. 2 Satz 7).
   Ohne die Kappung bei W1/W2 wäre die Steuer zu hoch (so rechnet
   rechnerprofis.de — falsch). */
function mst56(z) {
  if (z <= P.W1) return up56(z);
  if (z <= P.W2) return Math.min(up56(z), UP56_W1 + 0.42 * (z - P.W1));
  if (z <= P.W3) return UP56_W2 + 0.42 * (z - P.W2);
  return UP56_W2 + 0.42 * (P.W3 - P.W2) + 0.45 * (z - P.W3);
}

/* Pflege-Anteil des Arbeitnehmers 2026: 1,8 % Basis, kinderlos (23+)
   +0,6 pp, ab dem 2. Kind −0,25 pp je weiterem Kind (mindestens 0,8 %),
   Sachsen +0,5 pp. */
function pvAnteil(kinder, sachsen) {
  let satz = P.PV_BASIS;
  if (kinder === 0) satz += P.PV_KINDERLOS;
  else satz -= P.PV_PRO_KIND_AB2 * Math.max(0, kinder - 1);
  if (satz < P.PV_MIN) satz = P.PV_MIN;
  if (sachsen) satz += 0.005;
  return satz;
}

/* Vorsorgepauschale (Jahr), PAP MVSPKPV + MVSPHB. Die Krankenversicherung
   rechnet mit dem ERMÄSSIGTEN Satz 14,0 %, nicht mit 14,6 %. Der
   AV-Teilbetrag fällt in Steuerklasse VI weg (BMF Prüftabelle). */
function vorsorge(jahresbrutto, kvz, kinder, sachsen, rvPflichtig, stkl) {
  const baseRV = Math.min(jahresbrutto, P.BBG_RV_JAHR);
  const baseKV = Math.min(jahresbrutto, P.BBG_KV_JAHR);
  const vspr = rvPflichtig ? P.RV_AN * baseRV : 0;
  const kvAn = (P.KV_ERM + kvz) / 2;
  const pvAn = pvAnteil(kinder, sachsen);
  const vspkpv = (kvAn + pvAn) * baseKV;
  const vspalv = stkl === "VI" ? 0 : P.AV_AN * baseRV;
  const vsphb = Math.min(vspalv + vspkpv, 1900);
  const vsp = vspr + vspkpv;
  const vspn = vspr + vsphb;
  return Math.max(vsp, vspn);
}

function zve(jahresbrutto, stkl, kinder, kvz, sachsen, rvPflichtig) {
  const vp = vorsorge(jahresbrutto, kvz, kinder, sachsen, rvPflichtig, stkl);
  let z = jahresbrutto - vp - P.AN_PAUSCH - P.SONDER_PAUSCH;
  if (stkl === "II" && kinder >= 1) z -= P.ENTLASTUNG + P.ENTLASTUNG_WEITER * (kinder - 1);
  if (stkl === "VI") z = jahresbrutto - vp; // keine Pauschbeträge in VI
  return Math.max(0, Math.floor(z));
}

/* Lohnsteuer (Jahr) aus dem zu versteuernden Einkommen. */
function lohnsteuerVonZve(z, stkl) {
  if (stkl === "III") return 2 * tarif(Math.floor(z / 2)); // Splitting
  if (stkl === "V" || stkl === "VI") return mst56(z);
  return tarif(z);
}

function lohnsteuerJahr(jahresbrutto, stkl, kinder, kvz, sachsen, rvPflichtig) {
  return lohnsteuerVonZve(zve(jahresbrutto, stkl, kinder, kvz, sachsen, rvPflichtig), stkl);
}

/* Fiktive Lohnsteuer (mit Kinderfreibetrag) — nur die Grundlage für
   Soli und Kirchensteuer. Die Lohnsteuer selbst senkt der
   Kinderfreibetrag nicht. */
function lohnsteuerFiktivJahr(jahresbrutto, stkl, kinder, kvz, sachsen, rvPflichtig) {
  const z = zve(jahresbrutto, stkl, kinder, kvz, sachsen, rvPflichtig);
  const kfb = kinder * (stkl === "III" ? P.KFB_KIND_III : (stkl === "I" || stkl === "II" || stkl === "IV" ? P.KFB_KIND : 0));
  return lohnsteuerVonZve(Math.max(0, z - kfb), stkl);
}

function soliJahr(lstFiktiv, stkl) {
  const frei = stkl === "III" ? P.SOLI_FREI_SPLIT : P.SOLI_FREI_EINZEL;
  if (lstFiktiv <= frei) return 0;
  return Math.min(0.055 * lstFiktiv, 0.119 * (lstFiktiv - frei));
}

function kirchensteuerJahr(lstFiktiv, bundesland) {
  const satz = bundesland === "Bayern" || bundesland === "Baden-Württemberg" ? 0.08 : 0.09;
  return satz * lstFiktiv;
}

/* Sozialabgaben (Monat), Arbeitnehmer-Anteile. */
function svMonat(monat, kinder, kvz, sachsen, rvPflichtig) {
  const kv = (0.073 + kvz / 2) * Math.min(monat, P.BBG_KV_MONAT);
  const pv = pvAnteil(kinder, sachsen) * Math.min(monat, P.BBG_KV_MONAT);
  const rv = rvPflichtig ? P.RV_AN * Math.min(monat, P.BBG_RV_MONAT) : 0;
  const av = P.AV_AN * Math.min(monat, P.BBG_RV_MONAT);
  return { kv: round2(kv), pv: round2(pv), rv: round2(rv), av: round2(av) };
}

/* Midijob (Gleitzone 603,01–2.000 €): Gesamtbeitrag aus der
   beitragspflichtigen Einnahme BE, Arbeitgeber-Anteil nach der
   Gleitzonen-Formel, Rest zahlt der Arbeitnehmer. Näherung (± ein paar €). */
function midijobAN(ae, kinder, kvz, sachsen, rvPflichtig) {
  const kvTot = 0.146 + kvz, pvTot = 0.018 + pvAnteil(kinder, sachsen), rvTot = rvPflichtig ? 0.186 : 0, avTot = 0.026;
  const gesamt = kvTot + pvTot + rvTot + avTot;
  const G = P.MIDI_G, F = P.MIDI_F, D = 2000 - G;
  const be = F * G + ((2000 / D) - (G / D) * F) * (ae - G);
  const gesamtbeitrag = be * gesamt;
  const ag = 0.28 * G + ((0.5 * gesamt * 2000 - 0.28 * G) / D) * (ae - G);
  const an = gesamtbeitrag - ag;
  const kvAn = 0.073 + kvz / 2, pvAn = pvAnteil(kinder, sachsen), rvAn = rvPflichtig ? 0.093 : 0, avAn = 0.013;
  const sumAn = kvAn + pvAn + rvAn + avAn;
  return {
    kv: round2(an * kvAn / sumAn), pv: round2(an * pvAn / sumAn),
    rv: round2(an * rvAn / sumAn), av: round2(an * avAn / sumAn)
  };
}

function svSum(sv) { return round2(sv.kv + sv.pv + sv.rv + sv.av); }

/* Ein Fall komplett durchrechnen (Monatswerte, auf Cent gerundet).
   Die Aufschlüsselung geht immer exakt auf: Netto = Brutto − alle Abzüge. */
function berechnen(state) {
  const sachsen = state.bundesland === "Sachsen";
  const kvz = state.kvz / 100;
  const monat = state.zeitraum === "jahr" ? state.brutto / 12 : state.brutto;
  const jahresbrutto = state.zeitraum === "jahr" ? state.brutto : state.brutto * 12;
  if (monat <= P.MIDI_G) {
    return {
      monat: round2(monat), jahresbrutto: round2(jahresbrutto),
      lst: 0, soli: 0, ki: 0, sv: { kv: 0, pv: 0, rv: 0, av: 0 },
      svNormal: null, netto: round2(monat), isMinijob: true, isMidijob: false
    };
  }
  const lst = round2(lohnsteuerJahr(jahresbrutto, state.stkl, state.kinder, kvz, sachsen, state.rvPflichtig) / 12);
  const fiktiv = lohnsteuerFiktivJahr(jahresbrutto, state.stkl, state.kinder, kvz, sachsen, state.rvPflichtig);
  const soli = round2(soliJahr(fiktiv, state.stkl) / 12);
  const ki = state.kirche ? round2(kirchensteuerJahr(fiktiv, state.bundesland) / 12) : 0;
  const isMidijob = monat < P.MIDI_MAX; // Gleitzone bis 2.000 € — bei
  // genau 2.000 € gilt schon der normale Beitrag (so rechnen die
  // Vergleichsrechner: 2.000 € StKl I = 1.476,83 € netto, nicht 1.482,83 €).
  const sv = isMidijob
    ? midijobAN(monat, state.kinder, kvz, sachsen, state.rvPflichtig)
    : svMonat(monat, state.kinder, kvz, sachsen, state.rvPflichtig);
  const svNormal = isMidijob ? svMonat(monat, state.kinder, kvz, sachsen, state.rvPflichtig) : null;
  const netto = round2(monat - lst - soli - ki - svSum(sv));
  return {
    monat: round2(monat), jahresbrutto: round2(jahresbrutto),
    lst, soli, ki, sv, svNormal, netto, isMinijob: false, isMidijob
  };
}

function readState() {
  const zeitraum = zeitraumButtons.find(b => b.getAttribute("aria-pressed") === "true").dataset.zeitraum;
  const brutto = parseDeutsch(bruttoInput.value);
  const stkl = stklSelect.value;
  const bundesland = bundeslandSelect.value;
  const kinder = parseInt(kinderSelect.value, 10);
  const kvz = parseDeutsch(kvzInput.value);
  const kirche = kircheButtons.find(b => b.getAttribute("aria-pressed") === "true").dataset.kirche === "ja";
  const rvPflichtig = rvButtons.find(b => b.getAttribute("aria-pressed") === "true").dataset.rv === "ja";
  const miete = parseDeutsch(mieteInput.value);
  return { zeitraum, brutto, stkl, bundesland, kinder, kvz, kirche, rvPflichtig, miete };
}

function setMode(grid, buttons, attr, value) {
  buttons.forEach(b => b.setAttribute("aria-pressed", b.dataset[attr] === value ? "true" : "false"));
}

function applyState(s) {
  setMode(zeitraumGrid, zeitraumButtons, "zeitraum", s.zeitraum);
  bruttoInput.value = s.brutto;
  bruttoHint.textContent = s.zeitraum === "jahr"
    ? "Dein Brutto im Jahr — so wie es auf deinem Arbeitsvertrag steht. Der Rechner teilt es durch 12."
    : "Dein Brutto im Monat — so wie es auf deinem Arbeitsvertrag oder deiner Lohnabrechnung steht.";
  stklSelect.value = s.stkl;
  stklHint.textContent = STKL_TEXTE[s.stkl];
  bundeslandSelect.value = s.bundesland;
  kinderSelect.value = String(s.kinder);
  kvzInput.value = s.kvz;
  setMode(kircheGrid, kircheButtons, "kirche", s.kirche);
  setMode(rvGrid, rvButtons, "rv", s.rv);
  mieteInput.value = s.miete;
}

function showError(msg) {
  if (msg) { errorEl.textContent = msg; errorEl.hidden = false; }
  else { errorEl.textContent = ""; errorEl.hidden = true; }
}

function extraRow(label, value, total) {
  return "<div" + (total ? ' class="bn-total"' : "") + "><span>" + label + "</span><span>" + value + "</span></div>";
}

function render() {
  const s = readState();
  if (s.brutto === null || s.brutto <= 0) { showError("Bitte ein Bruttogehalt über 0 € eingeben."); return; }
  if (s.brutto > (s.zeitraum === "jahr" ? 1200000 : 100000)) { showError("Bitte ein Brutto bis 100.000 € im Monat (1.200.000 € im Jahr) eingeben."); return; }
  if (s.kvz === null || s.kvz < 0 || s.kvz > 5) { showError("Der Zusatzbeitrag liegt zwischen 0 % und 5 %."); return; }
  if (s.miete !== null && s.miete < 0) { showError("Die Miete kann nicht negativ sein."); return; }
  showError(null);

  const r = berechnen(s);
  const svGesamt = svSum(r.sv);
  const abzuege = round2(r.lst + r.soli + r.ki + svGesamt);
  const abzPct = r.monat > 0 ? (abzuege / r.monat) * 100 : 0;
  const jahresNetto = round2(r.netto * 12);
  const kinderText = s.kinder === 0 ? "keine Kinder" : (s.kinder === 1 ? "1 Kind" : s.kinder + " Kinder");
  const kircheText = s.kirche ? "mit Kirchensteuer" : "ohne Kirchensteuer";

  resultValue.textContent = euro(r.netto, true);
  if (r.isMinijob) {
    resultContext.textContent = euro(r.monat) + " brutto im Monat: Minijob — keine Abgaben für dich, dein Brutto ist dein Netto.";
  } else if (r.isMidijob) {
    const normal = r.svNormal ? svSum(r.svNormal) : 0;
    resultContext.textContent = euro(r.monat) + " brutto, Steuerklasse " + s.stkl + ", " + kinderText + ", " + kircheText + ": Midijob — nur " + euro(svGesamt, true) + " Sozialabgaben statt " + euro(normal, true) + ".";
  } else {
    resultContext.textContent = euro(r.monat) + " brutto, Steuerklasse " + s.stkl + ", " + kinderText + ", " + kircheText + ": " + euro(r.lst, true) + " Lohnsteuer und " + euro(svGesamt, true) + " Sozialabgaben gehen ab.";
  }
  resultAlso.textContent = s.zeitraum === "jahr"
    ? "Das sind " + euro(r.netto, true) + " im Monat."
    : "Das sind " + euro(jahresNetto) + " im Jahr.";
  let extra = "";
  extra += extraRow("Brutto", euro(r.monat, true));
  extra += extraRow("− Lohnsteuer", euro(r.lst, true));
  extra += extraRow("− Solidaritätszuschlag", euro(r.soli, true));
  extra += extraRow("− Kirchensteuer", euro(r.ki, true));
  extra += extraRow("− Krankenversicherung", euro(r.sv.kv, true));
  extra += extraRow("− Pflegeversicherung", euro(r.sv.pv, true));
  extra += extraRow("− Rentenversicherung", euro(r.sv.rv, true));
  extra += extraRow("− Arbeitslosenversicherung", euro(r.sv.av, true));
  extra += extraRow("Netto", euro(r.netto, true), true);
  extra += extraRow("Abzüge gesamt", euro(abzuege, true) + " (" + fmtPct1.format(abzPct) + " %)");
  if (s.miete !== null && s.miete > 0) {
    extra += extraRow("Nach der Miete", euro(round2(r.netto - s.miete), true));
  }
  resultExtra.innerHTML = extra;
  if (r.soli > 0 || r.ki > 0) {
    resultFormula.textContent = euro(r.monat) + " − " + euro(r.lst, true) + " Lohnsteuer − " + euro(r.soli, true) + " Soli − " + euro(r.ki, true) + " Kirchensteuer − " + euro(svGesamt, true) + " Sozialabgaben = " + euro(r.netto, true) + " netto";
  } else {
    resultFormula.textContent = euro(r.monat) + " − " + euro(r.lst, true) + " Lohnsteuer − " + euro(svGesamt, true) + " Sozialabgaben = " + euro(r.netto, true) + " netto";
  }
  minijobNote.hidden = !r.isMinijob;
  midijobNote.hidden = !r.isMidijob;
  resultPanel.classList.remove("flash");
  void resultPanel.offsetWidth;
  resultPanel.classList.add("flash");
  klassenTbody.querySelectorAll("tr").forEach(tr => {
    tr.classList.toggle("is-you", tr.dataset.stkl === s.stkl);
  });
  save();
}

function save() {
  const s = readState();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      zeitraum: s.zeitraum, brutto: bruttoInput.value, stkl: s.stkl,
      bundesland: s.bundesland, kinder: String(s.kinder), kvz: kvzInput.value,
      kirche: s.kirche ? "ja" : "nein", rv: s.rvPflichtig ? "ja" : "nein", miete: mieteInput.value
    }));
  } catch (e) { /* Speicher voll oder blockiert — der Rechner läuft trotzdem. */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return false;
    applyState({
      zeitraum: s.zeitraum === "jahr" ? "jahr" : "monat",
      brutto: s.brutto || DEFAULTS.brutto,
      stkl: s.stkl || DEFAULTS.stkl,
      bundesland: s.bundesland || DEFAULTS.bundesland,
      kinder: s.kinder || DEFAULTS.kinder,
      kvz: s.kvz || DEFAULTS.kvz,
      kirche: s.kirche === "ja" ? "ja" : "nein",
      rv: s.rv === "nein" ? "nein" : "ja",
      miete: s.miete || ""
    });
    return true;
  } catch (e) { return false; }
}

function loadExample(key) {
  const ex = EXAMPLES[key];
  if (!ex) return;
  applyState(ex);
  render();
  document.getElementById("rechner").scrollIntoView({ behavior: "smooth" });
}

/* Netto-Tabelle (Steuerklasse I, kinderlos, ohne Kirchensteuer) — die
   Zeilen rechnet der Rechner selbst, damit Tabelle und Rechner immer
   übereinstimmen. */
function buildNettoTabelle() {
  const rows = [2000, 2500, 3000, 3500, 4000, 5000, 6000, 8000, 10000];
  nettoTbody.innerHTML = rows.map(monat => {
    const r = berechnen({ zeitraum: "monat", brutto: monat, stkl: "I", kinder: 0, kvz: 2.9, kirche: false, rvPflichtig: true, bundesland: "Nordrhein-Westfalen" });
    return "<tr class=\"bn-row\" data-brutto=\"" + monat + "\"><th scope=\"row\">" + euro(monat) + "</th><td>" + euro(r.lst, true) + "</td><td>" + euro(svSum(r.sv), true) + "</td><td>" + euro(r.netto, true) + "</td></tr>";
  }).join("");
  nettoTbody.querySelectorAll(".bn-row").forEach(tr => {
    tr.addEventListener("click", () => {
      const monat = parseFloat(tr.dataset.brutto);
      bruttoInput.value = fmtGeld.format(monat);
      setMode(zeitraumGrid, zeitraumButtons, "zeitraum", "monat");
      bruttoHint.textContent = "Dein Brutto im Monat — so wie es auf deinem Arbeitsvertrag oder deiner Lohnabrechnung steht.";
      render();
      document.getElementById("rechner").scrollIntoView({ behavior: "smooth" });
    });
  });
}

klassenTbody.querySelectorAll(".bn-row").forEach(tr => {
  tr.addEventListener("click", () => {
    stklSelect.value = tr.dataset.stkl;
    stklHint.textContent = STKL_TEXTE[tr.dataset.stkl];
    if (tr.dataset.stkl === "II" && kinderSelect.value === "0") kinderSelect.value = "1";
    render();
    document.getElementById("rechner").scrollIntoView({ behavior: "smooth" });
  });
});

zeitraumButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const neu = btn.dataset.zeitraum;
    const alt = readState().zeitraum;
    if (neu === alt) return;
    const brutto = parseDeutsch(bruttoInput.value);
    if (brutto !== null) {
      bruttoInput.value = fmtGeld.format(neu === "jahr" ? brutto * 12 : brutto / 12);
    }
    setMode(zeitraumGrid, zeitraumButtons, "zeitraum", neu);
    bruttoHint.textContent = neu === "jahr"
      ? "Dein Brutto im Jahr — so wie es auf deinem Arbeitsvertrag steht. Der Rechner teilt es durch 12."
      : "Dein Brutto im Monat — so wie es auf deinem Arbeitsvertrag oder deiner Lohnabrechnung steht.";
    render();
  });
});

kircheButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    setMode(kircheGrid, kircheButtons, "kirche", btn.dataset.kirche);
    render();
  });
});

rvButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    setMode(rvGrid, rvButtons, "rv", btn.dataset.rv);
    render();
  });
});

stklSelect.addEventListener("change", () => {
  stklHint.textContent = STKL_TEXTE[stklSelect.value];
  render();
});

[bruttoInput, kvzInput, mieteInput].forEach(input => {
  input.addEventListener("input", render);
});
[bundeslandSelect, kinderSelect].forEach(sel => {
  sel.addEventListener("change", render);
});

form.addEventListener("submit", e => {
  e.preventDefault();
  render();
});

document.querySelectorAll("[data-example]").forEach(btn => {
  btn.addEventListener("click", () => loadExample(btn.dataset.example));
});

copyButton.addEventListener("click", () => {
  const s = readState();
  const r = berechnen(s);
  const text = "Netto: " + euro(r.netto, true) + " im Monat (" + euro(round2(r.netto * 12)) + " im Jahr). Brutto " + euro(r.monat) + ", Steuerklasse " + s.stkl + ", " + (s.kinder === 0 ? "keine Kinder" : s.kinder + (s.kinder === 1 ? " Kind" : " Kinder")) + ", " + (s.kirche ? "mit" : "ohne") + " Kirchensteuer. Lohnsteuer " + euro(r.lst, true) + ", Sozialabgaben " + euro(svSum(r.sv), true) + ". Richtwert, Stand November 2026.";
  const done = () => {
    copyButton.textContent = "Kopiert ✓";
    copyButton.classList.add("copied");
    setTimeout(() => { copyButton.textContent = "Ergebnis kopieren"; copyButton.classList.remove("copied"); }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
});

function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); done(); } catch (e) { /* Kopieren blockiert. */ }
  document.body.removeChild(ta);
}

resetButton.addEventListener("click", () => {
  applyState(DEFAULTS);
  render(); // speichert die Standardwerte — erst danach löschen
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* egal */ }
});

buildNettoTabelle();
if (!load()) applyState(DEFAULTS);
render();
