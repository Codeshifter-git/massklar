// Bürgergeld-Rechner — Anspruch aus Regelbedarf, Miete und Einkommen.
// Regelsätze 2026 (BMAS): allein 563 €, Partner je 506 €, Kinder 357 / 390 /
// 471 €, 18–24: 451 €. Kindergeld 259 € je Kind bis 17, Sofortzuschlag 25 €.
// Freibetrag § 11b SGB II: 100 € frei, dann 20 % bis 520 €, 30 % bis 1.000 €,
// 10 % bis 1.200 € (1.500 € mit minderjährigem Kind), max. 348 € (378 €).
// Mehrbedarf Alleinerziehend § 21 Abs. 3: 36 % bei einem Kind unter 7 oder
// zwei bis drei Kindern unter 16, sonst 12 % je Kind (max. 60 %).
// Alleinstehend, 520 € warm, kein Einkommen → Bedarf 1.083 €, Anspruch 1.083 €.
// Paar + Kind (8), 850 € warm, kein Einkommen → Bedarf 2.277 €, Anspruch 2.018 €.
// Alleinerziehend + Kind (4), 620 € warm → Bedarf 1.767,68 €, Anspruch 1.508,68 €.
// Das Ergebnis ist nur ein Richtwert — der Bescheid kommt vom Jobcenter.

const STORAGE_KEY = "massklar_buerger_v1";

const KINDERGELD = 259;
const SOFORT = 25;
const RBS = { single: 563, partner: 506 };
const KIND = { "0-5": 357, "6-13": 390, "14-17": 471, "18-24": 451 };
const BANDS = ["0-5", "6-13", "14-17", "18-24"];
const ZUVERDIENST = [0, 100, 520, 1000, 1500];

const form = document.getElementById("buergergeld-form");
const householdGrid = document.getElementById("haushalt-grid");
const householdButtons = Array.prototype.slice.call(householdGrid.querySelectorAll("[data-household]"));
const schwangerInput = document.getElementById("bg-schwanger");
const alleinInput = document.getElementById("bg-allein");
const alleinRow = document.getElementById("bg-allein-row");
const kaltInput = document.getElementById("bg-kalt");
const nkInput = document.getElementById("bg-nk");
const heizInput = document.getElementById("bg-heiz");
const bruttoInput = document.getElementById("bg-brutto");
const nettoInput = document.getElementById("bg-netto");
const sonstInput = document.getElementById("bg-sonst");
const kindergeldInput = document.getElementById("bg-kindergeld");
const errorEl = document.getElementById("buergergeld-error");
const resultPanel = document.getElementById("buergergeld-result");
const resultValue = document.getElementById("result-value");
const resultContext = document.getElementById("result-context");
const resultAlso = document.getElementById("result-also");
const resultExtra = document.getElementById("result-extra");
const resultFormula = document.getElementById("result-formula");
const copyButton = document.getElementById("buergergeld-copy");
const resetButton = document.getElementById("buergergeld-reset");
const zvTbody = document.getElementById("zuverdienst-tbody");
const zvCaption = document.getElementById("zv-caption");

const DEFAULTS = {
  household: "single",
  kids: { "0-5": 0, "6-13": 0, "14-17": 0, "18-24": 0 },
  schwanger: false, allein: false,
  kalt: "400", nk: "80", heiz: "40",
  brutto: "0", netto: "", sonst: "0", kindergeld: "0"
};

let household = DEFAULTS.household;
let kids = { "0-5": 0, "6-13": 0, "14-17": 0, "18-24": 0 };
let kindergeldManual = false;

const fmtEuro = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function euro(n) {
  return fmtEuro.format(n) + " €";
}

/* Deutscher Geldbetrag: "1.083,50" → 1083.5, "520" → 520, leer → 0. */
function parseEuro(text) {
  const raw = (text || "").trim().replace(/\s/g, "").replace(/€/g, "");
  if (raw === "") return 0;
  const norm = raw.indexOf(",") >= 0 ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(norm);
  if (!Number.isFinite(n)) return { error: true };
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

/* Freibetrag § 11b Abs. 2–3 SGB II. */
function freibetrag(brutto, hasMinorChild) {
  if (brutto <= 0) return 0;
  let f = Math.min(brutto, 100);
  f += 0.20 * Math.max(0, Math.min(brutto, 520) - 100);
  f += 0.30 * Math.max(0, Math.min(brutto, 1000) - 520);
  const cap = hasMinorChild ? 1500 : 1200;
  f += 0.10 * Math.max(0, Math.min(brutto, cap) - 1000);
  return Math.round(f * 100) / 100;
}

/* Mehrbedarf Alleinerziehend § 21 Abs. 3 SGB II. Annahme aus den Bändern:
   Kinder 0–5 sind unter 7, Kinder bis 17 sind unter 16. */
function mehrbedarfAllein() {
  const u7 = kids["0-5"];
  const u16 = kids["0-5"] + kids["6-13"] + kids["14-17"];
  const u18 = u16 + kids["18-24"];
  if (u18 === 0) return { pct: 0, amount: 0 };
  let pct;
  if (u7 >= 1 || (u16 >= 2 && u16 <= 3)) pct = 36;
  else pct = Math.min(12 * u18, 60);
  return { pct: pct, amount: Math.round(563 * pct) / 100 };
}

function totalKids() {
  return BANDS.reduce(function (sum, b) { return sum + kids[b]; }, 0);
}

function kidsUnder18() {
  return kids["0-5"] + kids["6-13"] + kids["14-17"];
}

function readMoney(input, label, max) {
  const v = parseEuro(input.value);
  if (v === null || v.error || v < 0 || v > max) {
    return { error: input, message: "Gib " + label + " bitte als Zahl ein — z. B. 400 oder 0." };
  }
  return { value: v };
}

function readInputs(options) {
  const announceError = options && options.announceError;
  const kalt = readMoney(kaltInput, "die Kaltmiete", 5000);
  if (kalt.error) { if (announceError) markError(kalt.error, kalt.message); return null; }
  const nk = readMoney(nkInput, "die Nebenkosten", 5000);
  if (nk.error) { if (announceError) markError(nk.error, nk.message); return null; }
  const heiz = readMoney(heizInput, "die Heizkosten", 5000);
  if (heiz.error) { if (announceError) markError(heiz.error, heiz.message); return null; }
  const brutto = readMoney(bruttoInput, "das Brutto", 20000);
  if (brutto.error) { if (announceError) markError(brutto.error, brutto.message); return null; }
  const nettoRaw = parseEuro(nettoInput.value);
  if (nettoRaw === null || nettoRaw.error || nettoRaw < 0 || nettoRaw > 20000) {
    if (announceError) markError(nettoInput, "Gib das Netto bitte als Zahl ein — oder lass das Feld leer.");
    return null;
  }
  const netto = nettoInput.value.trim() === "" ? brutto.value : nettoRaw;
  const sonst = readMoney(sonstInput, "das sonstige Einkommen", 20000);
  if (sonst.error) { if (announceError) markError(sonst.error, sonst.message); return null; }
  const kg = readMoney(kindergeldInput, "das Kindergeld", 20000);
  if (kg.error) { if (announceError) markError(kg.error, kg.message); return null; }
  return {
    kalt: kalt.value, nk: nk.value, heiz: heiz.value,
    brutto: brutto.value, netto: netto, sonst: sonst.value, kindergeld: kg.value
  };
}

function compute(options) {
  const money = readInputs(options);
  if (!money) return;
  clearError();

  const rbAdults = household === "single" ? RBS.single : 2 * RBS.partner;
  const rbKids = BANDS.reduce(function (sum, b) { return sum + kids[b] * KIND[b]; }, 0);
  const rb = rbAdults + rbKids;
  const mbSchwanger = schwangerInput.checked ? Math.round(563 * 0.17 * 100) / 100 : 0;
  const mbAllein = (household === "single" && alleinInput.checked) ? mehrbedarfAllein() : { pct: 0, amount: 0 };
  const mb = Math.round((mbSchwanger + mbAllein.amount) * 100) / 100;
  const sofo = SOFORT * totalKids();
  const kdu = Math.round((money.kalt + money.nk + money.heiz) * 100) / 100;
  const bedarf = Math.round((rb + mb + sofo + kdu) * 100) / 100;

  const hasMinorChild = kidsUnder18() > 0;
  const fb = freibetrag(money.brutto, hasMinorChild);
  const angArbeit = Math.max(0, Math.round((money.netto - fb) * 100) / 100);
  const ang = Math.round((angArbeit + money.sonst) * 100) / 100;
  const anspruch = Math.max(0, Math.round((bedarf - ang - money.kindergeld) * 100) / 100);
  const verfuegbar = Math.round((anspruch + money.netto + money.sonst + money.kindergeld) * 100) / 100;

  const hhLabel = household === "single" ? "Alleinstehend" : "Mit Partner";
  const warm = euro(kdu);
  const einkLabel = money.brutto > 0 ? euro(money.brutto) + " Brutto" : "kein Einkommen";

  resultValue.textContent = euro(anspruch);
  resultContext.textContent = hhLabel + ", " + warm + " Warmmiete, " + einkLabel +
    ": " + euro(rb) + " Regelbedarf" + (mb > 0 ? " + " + euro(mb) + " Mehrbedarf" : "") +
    (sofo > 0 ? " + " + euro(sofo) + " Sofortzuschlag" : "") +
    " + " + warm + " Miete = " + euro(bedarf) + " Bedarf.";
  if (anspruch > 0) {
    resultAlso.textContent = "Zum Leben bleiben: " + euro(verfuegbar) +
      " im Monat (Anspruch + Einkommen + Kindergeld).";
  } else {
    resultAlso.textContent = "Kein Anspruch nach dieser Rechnung — dein Einkommen deckt den Bedarf. Zum Leben bleiben: " +
      euro(verfuegbar) + " im Monat.";
  }
  const lines = [];
  lines.push(["Regelbedarf" + (household === "partner" ? " (2 × 506 €)" : ""), euro(rb)]);
  if (mbSchwanger > 0) lines.push(["Mehrbedarf Schwangerschaft (17 %)", euro(mbSchwanger)]);
  if (mbAllein.amount > 0) lines.push(["Mehrbedarf Alleinerziehend (" + mbAllein.pct + " %)", euro(mbAllein.amount)]);
  if (sofo > 0) lines.push(["Kindersofortzuschlag (" + totalKids() + " × 25 €)", euro(sofo)]);
  lines.push(["Miete (Kalt + Neben + Heizung)", euro(kdu)]);
  lines.push(["Bedarf gesamt", euro(bedarf)]);
  if (fb > 0) lines.push(["− Freibetrag", euro(fb)]);
  if (ang > 0) lines.push(["− angerechnetes Einkommen", euro(ang)]);
  if (money.kindergeld > 0) lines.push(["− Kindergeld", euro(money.kindergeld)]);
  resultExtra.innerHTML = lines.map(function (line) {
    return "<div><span>" + line[0] + "</span><span>" + line[1] + "</span></div>";
  }).join("");
  resultFormula.textContent = euro(bedarf) + " − " + euro(ang) + " − " +
    euro(money.kindergeld) + " = " + euro(anspruch);

  renderZuverdienst(bedarf, hasMinorChild, hhLabel);
}

function renderZuverdienst(bedarf, hasMinorChild, hhLabel) {
  if (zvCaption) {
    zvCaption.textContent = "Zuverdienst: Was bleibt bei Arbeit übrig? · " +
      hhLabel + ", " + euro(bedarf) + " Bedarf";
  }
  zvTbody.innerHTML = ZUVERDIENST.map(function (brutto) {
    const fb = freibetrag(brutto, hasMinorChild);
    const ang = Math.max(0, Math.round((brutto - fb) * 100) / 100);
    const anspruch = Math.max(0, Math.round((bedarf - ang) * 100) / 100);
    const verf = Math.round((anspruch + brutto) * 100) / 100;
    return "<tr><th scope=\"row\">" + euro(brutto) + "</th><td>" + euro(fb) +
      "</td><td>" + euro(ang) + "</td><td>" + euro(anspruch) +
      "</td><td>" + euro(verf) + "</td></tr>";
  }).join("");
}

function setHousehold(next) {
  household = next;
  householdButtons.forEach(function (btn) {
    btn.setAttribute("aria-pressed", btn.getAttribute("data-household") === next ? "true" : "false");
  });
  if (next === "partner") {
    alleinInput.checked = false;
    alleinInput.disabled = true;
    alleinRow.classList.add("is-disabled");
  } else {
    alleinInput.disabled = false;
    alleinRow.classList.remove("is-disabled");
  }
  compute();
  save();
}

householdButtons.forEach(function (btn) {
  btn.addEventListener("click", function () { setHousehold(btn.getAttribute("data-household")); });
});

function syncKindergeldField() {
  if (kindergeldManual) return;
  kindergeldInput.value = String(KINDERGELD * kidsUnder18());
}

function updateSteppers() {
  document.querySelectorAll(".bg-kinder-row").forEach(function (row) {
    const band = row.getAttribute("data-band");
    const countEl = row.querySelector(".bg-step-count");
    countEl.textContent = String(kids[band]);
    row.querySelectorAll(".bg-step-btn").forEach(function (btn) {
      const dir = Number(btn.getAttribute("data-dir"));
      btn.disabled = (dir < 0 && kids[band] <= 0) || (dir > 0 && kids[band] >= 6);
    });
  });
}

document.querySelectorAll(".bg-kinder-row").forEach(function (row) {
  row.querySelectorAll(".bg-step-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const band = row.getAttribute("data-band");
      const next = kids[band] + Number(btn.getAttribute("data-dir"));
      if (next < 0 || next > 6) return;
      kids[band] = next;
      kindergeldManual = false;
      syncKindergeldField();
      updateSteppers();
      compute();
      save();
    });
  });
});

kindergeldInput.addEventListener("input", function () {
  kindergeldManual = true;
  compute();
  save();
});

[schwangerInput, alleinInput].forEach(function (input) {
  input.addEventListener("change", function () {
    compute();
    save();
  });
});

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      household: household,
      kids: kids,
      schwanger: schwangerInput.checked,
      allein: alleinInput.checked,
      kalt: kaltInput.value, nk: nkInput.value, heiz: heizInput.value,
      brutto: bruttoInput.value, netto: nettoInput.value,
      sonst: sonstInput.value, kindergeld: kindergeldInput.value,
      kindergeldManual: kindergeldManual
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
    if (saved.household === "single" || saved.household === "partner") household = saved.household;
    if (saved.kids) BANDS.forEach(function (b) {
      if (typeof saved.kids[b] === "number" && saved.kids[b] >= 0 && saved.kids[b] <= 6) kids[b] = saved.kids[b];
    });
    if (typeof saved.schwanger === "boolean") schwangerInput.checked = saved.schwanger;
    if (typeof saved.allein === "boolean") alleinInput.checked = saved.allein;
    if (typeof saved.kalt === "string" && saved.kalt !== "") kaltInput.value = saved.kalt;
    if (typeof saved.nk === "string" && saved.nk !== "") nkInput.value = saved.nk;
    if (typeof saved.heiz === "string" && saved.heiz !== "") heizInput.value = saved.heiz;
    if (typeof saved.brutto === "string" && saved.brutto !== "") bruttoInput.value = saved.brutto;
    if (typeof saved.netto === "string") nettoInput.value = saved.netto;
    if (typeof saved.sonst === "string" && saved.sonst !== "") sonstInput.value = saved.sonst;
    if (typeof saved.kindergeld === "string" && saved.kindergeld !== "") kindergeldInput.value = saved.kindergeld;
    if (typeof saved.kindergeldManual === "boolean") kindergeldManual = saved.kindergeldManual;
  } catch (e) {
    // Kaputte Daten ignorieren — Standardwerte bleiben.
  }
  householdButtons.forEach(function (btn) {
    btn.setAttribute("aria-pressed", btn.getAttribute("data-household") === household ? "true" : "false");
  });
  if (household === "partner") {
    alleinInput.checked = false;
    alleinInput.disabled = true;
    alleinRow.classList.add("is-disabled");
  }
  updateSteppers();
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

[kaltInput, nkInput, heizInput, bruttoInput, nettoInput, sonstInput].forEach(function (input) {
  input.addEventListener("input", function () {
    compute();
    save();
  });
  input.addEventListener("change", function () {
    compute({ announceError: true });
  });
});

function loadExample(name) {
  if (name === "allein") {
    setHousehold("single");
    kids = { "0-5": 0, "6-13": 0, "14-17": 0, "18-24": 0 };
    schwangerInput.checked = false;
    alleinInput.checked = false;
    kaltInput.value = "400"; nkInput.value = "80"; heizInput.value = "40";
    bruttoInput.value = "0"; nettoInput.value = ""; sonstInput.value = "0";
  } else if (name === "paar") {
    setHousehold("partner");
    kids = { "0-5": 0, "6-13": 1, "14-17": 0, "18-24": 0 };
    schwangerInput.checked = false;
    alleinInput.checked = false;
    kaltInput.value = "600"; nkInput.value = "150"; heizInput.value = "100";
    bruttoInput.value = "0"; nettoInput.value = ""; sonstInput.value = "0";
  } else if (name === "allein-kind") {
    setHousehold("single");
    kids = { "0-5": 1, "6-13": 0, "14-17": 0, "18-24": 0 };
    schwangerInput.checked = false;
    alleinInput.checked = true;
    kaltInput.value = "450"; nkInput.value = "100"; heizInput.value = "70";
    bruttoInput.value = "0"; nettoInput.value = ""; sonstInput.value = "0";
  }
  kindergeldManual = false;
  syncKindergeldField();
  updateSteppers();
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
  household = DEFAULTS.household;
  kids = { "0-5": 0, "6-13": 0, "14-17": 0, "18-24": 0 };
  schwangerInput.checked = false;
  alleinInput.checked = false;
  alleinInput.disabled = false;
  alleinRow.classList.remove("is-disabled");
  kaltInput.value = DEFAULTS.kalt;
  nkInput.value = DEFAULTS.nk;
  heizInput.value = DEFAULTS.heiz;
  bruttoInput.value = DEFAULTS.brutto;
  nettoInput.value = DEFAULTS.netto;
  sonstInput.value = DEFAULTS.sonst;
  kindergeldInput.value = DEFAULTS.kindergeld;
  kindergeldManual = false;
  householdButtons.forEach(function (btn) {
    btn.setAttribute("aria-pressed", btn.getAttribute("data-household") === household ? "true" : "false");
  });
  updateSteppers();
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  compute();
});

restore();
compute();
