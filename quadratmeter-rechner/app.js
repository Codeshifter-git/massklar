// Quadratmeter-Rechner — Fläche aus Länge × Breite, für Zimmer, L-Räume
// und Grundstücke. Mit mehreren Räumen, Verschnitt + Kosten für den
// Bodenbelag und einer groben Wohnfläche nach WoFlV.

const STORAGE_KEY = "massklar_qm_v1";
const MAX_ROOMS = 8;

// Formen: Felder (Schlüssel + Name) und ob es eine Radius/Durchmesser-Wahl gibt.
const SHAPES = {
  rechteck: {
    label: "Rechteck",
    fields: [
      { key: "laenge", label: "Länge" },
      { key: "breite", label: "Breite" }
    ]
  },
  quadrat: {
    label: "Quadrat",
    fields: [ { key: "seite", label: "Seitenlänge" } ]
  },
  kreis: {
    label: "Kreis",
    art: true,
    fields: [ { key: "wert", label: "Radius oder Durchmesser" } ]
  },
  dreieck: {
    label: "Dreieck",
    fields: [
      { key: "grund", label: "Grundseite" },
      { key: "hoehe", label: "Höhe" }
    ]
  },
  trapez: {
    label: "Trapez",
    fields: [
      { key: "a", label: "Seite a" },
      { key: "b", label: "Seite b" },
      { key: "hoehe", label: "Höhe" }
    ]
  },
  lform: {
    label: "L-Form",
    fields: [
      { key: "aLaenge", label: "Teil A: Länge" },
      { key: "aBreite", label: "Teil A: Breite" },
      { key: "bLaenge", label: "Teil B: Länge" },
      { key: "bBreite", label: "Teil B: Breite" }
    ]
  }
};

// IDs der Hauptfelder (das Hauptformular ist statisches HTML).
const MAIN_IDS = {
  rechteck: { laenge: "qm-laenge", breite: "qm-breite" },
  quadrat: { seite: "qm-seite" },
  kreis: { wert: "qm-kreis-wert" },
  dreieck: { grund: "qm-grund", hoehe: "qm-hoehe" },
  trapez: { a: "qm-a", b: "qm-b", hoehe: "qm-thoehe" },
  lform: { aLaenge: "qm-a-laenge", aBreite: "qm-a-breite", bLaenge: "qm-b-laenge", bBreite: "qm-b-breite" }
};

const DEFAULTS = {
  shape: "rechteck",
  main: {
    rechteck: { laenge: { v: "4,5", u: "m" }, breite: { v: "3,2", u: "m" } },
    quadrat: { seite: { v: "3,5", u: "m" } },
    kreis: { wert: { v: "3", u: "m" }, art: "durchmesser" },
    dreieck: { grund: { v: "4", u: "m" }, hoehe: { v: "3", u: "m" } },
    trapez: { a: { v: "4", u: "m" }, b: { v: "6", u: "m" }, hoehe: { v: "3", u: "m" } },
    lform: { aLaenge: { v: "4", u: "m" }, aBreite: { v: "5", u: "m" }, bLaenge: { v: "2", u: "m" }, bBreite: { v: "3", u: "m" } }
  }
};

const EXAMPLES = {
  zimmer: { shape: "rechteck", values: { rechteck: { laenge: { v: "4,5", u: "m" }, breite: { v: "3,2", u: "m" } } } },
  lform: { shape: "lform", values: { lform: { aLaenge: { v: "4", u: "m" }, aBreite: { v: "5", u: "m" }, bLaenge: { v: "2", u: "m" }, bBreite: { v: "3", u: "m" } } } },
  beet: { shape: "kreis", values: { kreis: { wert: { v: "3", u: "m" }, art: "durchmesser" } } }
};

const form = document.getElementById("quadratmeter-form");
const modeGrid = document.getElementById("mode-grid");
const roomList = document.getElementById("room-list");
const addRoomButton = document.getElementById("add-room");
const woflvBox = document.getElementById("qm-woflv");
const gewichtFeld = document.getElementById("qm-gewicht-feld");
const gewichtSelect = document.getElementById("qm-gewicht");
const bodenBox = document.getElementById("qm-boden");
const bodenFelder = document.getElementById("boden-felder");
const verschnittSelect = document.getElementById("qm-verschnitt");
const verschnittEigenFeld = document.getElementById("verschnitt-eigen-feld");
const verschnittEigenInput = document.getElementById("qm-verschnitt-eigen");
const preisInput = document.getElementById("qm-preis");
const paketInput = document.getElementById("qm-paket");
const errorEl = document.getElementById("quadratmeter-error");
const resultPanel = document.getElementById("quadratmeter-result");
const resultValue = document.getElementById("result-value");
const resultContext = document.getElementById("result-context");
const resultAlso = document.getElementById("result-also");
const resultExtra = document.getElementById("result-extra");
const resultFormula = document.getElementById("result-formula");
const copyButton = document.getElementById("quadratmeter-copy");
const resetButton = document.getElementById("quadratmeter-reset");

let currentShape = "rechteck";
let nextRoomId = 2;

const fmtArea = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtMoney = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCm2 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const fmtHa = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 5 });

function round2(v) {
  return Math.round((v + 1e-9) * 100) / 100;
}

/* Aufrunden auf 2 Stellen (Kaufmenge: lieber ein bisschen zu viel als zu wenig). */
function ceil2(v) {
  return Math.ceil((v - 1e-9) * 100) / 100;
}

/* Deutsche Zahl: "4,5", "1.200", "1.200,50" → Zahl, sonst null. */
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

function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/* Fläche in m² — alle Maße kommen schon in Metern an (cm ÷ 100). */
function shapeArea(shape, v) {
  if (shape === "rechteck") return v.laenge * v.breite;
  if (shape === "quadrat") return v.seite * v.seite;
  if (shape === "kreis") {
    var r = v.art === "durchmesser" ? v.wert / 2 : v.wert;
    return Math.PI * r * r;
  }
  if (shape === "dreieck") return v.grund * v.hoehe / 2;
  if (shape === "trapez") return (v.a + v.b) / 2 * v.hoehe;
  return v.aLaenge * v.aBreite + v.bLaenge * v.bBreite;
}

function shapeFormula(shape, v, area) {
  var a = fmtArea.format(area) + " m²";
  if (shape === "rechteck") return fmtArea.format(v.laenge) + " m × " + fmtArea.format(v.breite) + " m = " + a;
  if (shape === "quadrat") return fmtArea.format(v.seite) + " m × " + fmtArea.format(v.seite) + " m = " + a;
  if (shape === "kreis") {
    var r = v.art === "durchmesser" ? v.wert / 2 : v.wert;
    return "π × " + fmtArea.format(r) + " m × " + fmtArea.format(r) + " m = " + a;
  }
  if (shape === "dreieck") return fmtArea.format(v.grund) + " m × " + fmtArea.format(v.hoehe) + " m ÷ 2 = " + a;
  if (shape === "trapez") return "(" + fmtArea.format(v.a) + " m + " + fmtArea.format(v.b) + " m) ÷ 2 × " + fmtArea.format(v.hoehe) + " m = " + a;
  return fmtArea.format(v.aLaenge) + " m × " + fmtArea.format(v.aBreite) + " m + " +
    fmtArea.format(v.bLaenge) + " m × " + fmtArea.format(v.bBreite) + " m = " + a;
}

function shapeContext(shape, v, area) {
  var a = fmtArea.format(area) + " m²";
  if (shape === "rechteck") return "Ein Zimmer mit " + fmtArea.format(v.laenge) + " m × " + fmtArea.format(v.breite) + " m hat " + a + ".";
  if (shape === "quadrat") return "Ein Quadrat mit " + fmtArea.format(v.seite) + " m Seitenlänge hat " + a + ".";
  if (shape === "kreis") {
    if (v.art === "durchmesser") return "Ein Kreis mit " + fmtArea.format(v.wert) + " m Durchmesser hat " + a + ".";
    return "Ein Kreis mit " + fmtArea.format(v.wert) + " m Radius hat " + a + ".";
  }
  if (shape === "dreieck") return "Ein Dreieck mit " + fmtArea.format(v.grund) + " m Grundseite und " + fmtArea.format(v.hoehe) + " m Höhe hat " + a + ".";
  if (shape === "trapez") return "Ein Trapez mit " + fmtArea.format(v.a) + " m und " + fmtArea.format(v.b) + " m Seiten und " + fmtArea.format(v.hoehe) + " m Höhe hat " + a + ".";
  return "Ein L-förmiger Raum aus " + fmtArea.format(v.aLaenge) + " m × " + fmtArea.format(v.aBreite) + " m und " +
    fmtArea.format(v.bLaenge) + " m × " + fmtArea.format(v.bBreite) + " m hat " + a + ".";
}

/* Eine Form auslesen: getInput(key) → Eingabefeld, getUnit(key) → "m"/"cm",
   getArt() → "radius"/"durchmesser" (nur Kreis). Werte kommen in Metern zurück. */
function readShape(shape, getInput, getUnit, getArt) {
  var spec = SHAPES[shape];
  var vals = {};
  for (var i = 0; i < spec.fields.length; i++) {
    var f = spec.fields[i];
    var input = getInput(f.key);
    var n = parseGerman(input.value);
    if (!n || n.error || n <= 0) return { error: true, input: input, label: f.label };
    vals[f.key] = n * (getUnit(f.key) === "cm" ? 0.01 : 1);
  }
  if (spec.art) vals.art = getArt();
  return { values: vals };
}

function mainInput(key) {
  return document.getElementById(MAIN_IDS[currentShape][key]);
}

function mainUnit(key) {
  var sel = document.getElementById(MAIN_IDS[currentShape][key] + "-einheit");
  return sel ? sel.value : "m";
}

function mainArt() {
  var sel = document.getElementById("qm-kreis-art");
  return sel ? sel.value : "durchmesser";
}

function readRow(rowEl) {
  var id = rowEl.getAttribute("data-room");
  var shapeSel = document.getElementById("room-" + id + "-shape");
  var shape = shapeSel.value;
  var nameInput = document.getElementById("room-" + id + "-name");
  var weightSel = document.getElementById("room-" + id + "-weight");
  var res = readShape(shape,
    function (key) { return document.getElementById("room-" + id + "-" + shape + "-" + key); },
    function (key) {
      var sel = document.getElementById("room-" + id + "-" + shape + "-" + key + "-einheit");
      return sel ? sel.value : "m";
    },
    function () {
      var sel = document.getElementById("room-" + id + "-kreis-art");
      return sel ? sel.value : "durchmesser";
    });
  if (res.error) return res;
  return {
    id: id,
    name: (nameInput.value || "").trim() || ("Raum " + id),
    shape: shape,
    values: res.values,
    weight: weightSel ? Number(weightSel.value) : 1
  };
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

function roomCount() {
  return 1 + roomList.querySelectorAll(".room-row").length;
}

function syncAddButton() {
  var full = roomCount() >= MAX_ROOMS;
  addRoomButton.disabled = full;
  addRoomButton.textContent = full ? "8 Räume — mehr geht nicht" : "+ Weiterer Raum (bis zu 8 Räume)";
}

function compute(options) {
  var announceError = options && options.announceError;
  var main = readShape(currentShape, mainInput, mainUnit, mainArt);
  if (main.error) {
    if (announceError) markError(main.input, "Gib bitte die " + main.label + " als Zahl ein — z. B. 4,5.");
    return;
  }
  var rooms = [{
    name: "Raum 1",
    shape: currentShape,
    values: main.values,
    area: shapeArea(currentShape, main.values),
    weight: Number(gewichtSelect.value)
  }];
  var rowEls = roomList.querySelectorAll(".room-row");
  for (var i = 0; i < rowEls.length; i++) {
    var row = readRow(rowEls[i]);
    if (row.error) {
      if (announceError) markError(row.input, "Gib bitte die " + row.label + " als Zahl ein — z. B. 4,5.");
      return;
    }
    row.area = shapeArea(row.shape, row.values);
    rooms.push(row);
  }
  var total = 0;
  rooms.forEach(function (r) { total += r.area; });
  if (!Number.isFinite(total) || total <= 0 || total > 1e12) {
    if (announceError) markError(null, "Das Ergebnis ist zu groß. Prüfe deine Eingaben.");
    return;
  }

  var extra = [];
  if (rooms.length > 1) {
    extra.push(rooms.map(function (r) {
      return r.name + ": " + fmtArea.format(r.area) + " m² (" + Math.round(r.area / total * 100) + " %)";
    }).join(" · "));
  }
  if (woflvBox.checked) {
    var wohn = 0;
    rooms.forEach(function (r) { wohn += r.area * r.weight; });
    extra.push("Wohnfläche (grob): " + fmtArea.format(wohn) +
      " m² — Balkon und Dachschräge nur zum Teil gerechnet. Für Mietvertrag oder Kauf bitte eine Fachstelle fragen.");
  }
  if (bodenBox.checked) {
    var verschnitt;
    if (verschnittSelect.value === "eigene") {
      var eigen = parseGerman(verschnittEigenInput.value);
      if (!eigen || eigen.error || eigen < 0 || eigen > 100) {
        if (announceError) markError(verschnittEigenInput, "Gib bitte den Verschnitt als Zahl ein — z. B. 12.");
        return;
      }
      verschnitt = eigen;
    } else {
      verschnitt = Number(verschnittSelect.value);
    }
    var kauf = ceil2(total * (1 + verschnitt / 100));
    var bodenLine = "Bodenbelag: " + fmtArea.format(kauf) + " m² kaufen (" +
      fmtArea.format(total) + " m² + " + fmtArea.format(verschnitt) + " % Verschnitt).";
    var preisRaw = (preisInput.value || "").trim();
    if (preisRaw !== "") {
      var preis = parseGerman(preisRaw);
      if (!preis || preis.error || preis <= 0) {
        if (announceError) markError(preisInput, "Gib bitte den Preis je m² als Zahl ein — z. B. 39,90.");
        return;
      }
      bodenLine += " Kosten: " + fmtMoney.format(round2(kauf * preis)) + " €.";
    }
    var paketRaw = (paketInput.value || "").trim();
    if (paketRaw !== "") {
      var paket = parseGerman(paketRaw);
      if (!paket || paket.error || paket <= 0) {
        if (announceError) markError(paketInput, "Gib bitte den Paketinhalt als Zahl ein — z. B. 2.");
        return;
      }
      bodenLine += " Pakete: " + Math.ceil(kauf / paket) + " (à " + fmtArea.format(paket) + " m²).";
    }
    extra.push(bodenLine);
  }

  var context;
  var formula;
  if (rooms.length === 1) {
    context = shapeContext(currentShape, main.values, rooms[0].area);
    formula = shapeFormula(currentShape, main.values, rooms[0].area);
  } else {
    context = rooms.length + " Räume zusammen: " + fmtArea.format(total) + " m² Grundfläche.";
    formula = rooms.map(function (r) { return fmtArea.format(r.area); }).join(" + ") + " = " + fmtArea.format(total) + " m²";
  }

  clearError();
  showResult(
    fmtArea.format(total) + " m²",
    context,
    "Das sind auch: " + fmtCm2.format(total * 10000) + " cm² · " + fmtHa.format(total / 10000) + " ha",
    extra,
    formula
  );

  // Fläche je Raumzeile anzeigen (mit Anteil).
  rowEls.forEach(function (rowEl) {
    var id = rowEl.getAttribute("data-room");
    var areaEl = document.getElementById("room-" + id + "-area");
    if (!areaEl) return;
    var found = null;
    rooms.forEach(function (r) { if (String(r.id) === String(id)) found = r; });
    if (found) areaEl.textContent = fmtArea.format(found.area) + " m² · " + Math.round(found.area / total * 100) + " %";
  });
}

/* Kreis: Beschriftung wechselt mit Radius/Durchmesser — Hauptformular + Zeilen. */
function syncArtLabel(scope) {
  var artSel = scope.querySelector ? scope.querySelector("[data-art-select]") : null;
  if (!artSel) return;
  var isRadius = artSel.value === "radius";
  var label = scope.querySelector("[data-wert-label]");
  if (label) label.textContent = isRadius ? "Radius" : "Durchmesser";
  var unit = scope.querySelector("[data-wert-einheit]");
  if (unit) unit.setAttribute("aria-label", isRadius ? "Einheit für den Radius" : "Einheit für den Durchmesser");
}

function setShape(shape) {
  currentShape = shape;
  modeGrid.querySelectorAll(".mode-btn").forEach(function (btn) {
    btn.setAttribute("aria-pressed", btn.getAttribute("data-shape") === shape ? "true" : "false");
  });
  form.querySelectorAll(".mode-fields[data-shape]").forEach(function (block) {
    block.classList.toggle("is-active", block.getAttribute("data-shape") === shape);
  });
}

modeGrid.querySelectorAll(".mode-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    setShape(btn.getAttribute("data-shape"));
    compute();
    save();
  });
});

/* --- Weitere Räume --- */

function shapeOptions(selected) {
  return Object.keys(SHAPES).map(function (s) {
    return '<option value="' + s + '"' + (s === selected ? " selected" : "") + ">" + SHAPES[s].label + "</option>";
  }).join("");
}

function rowFieldsHTML(id, data) {
  var html = "";
  Object.keys(SHAPES).forEach(function (s) {
    var spec = SHAPES[s];
    html += '<div class="mode-fields' + (data.shape === s ? " is-active" : "") + '" data-shape="' + s + '"><div class="room-measure-grid">';
    if (spec.art) {
      var art = (data.values[s] && data.values[s].art) || "durchmesser";
      html += '<div class="field"><label for="room-' + id + '-kreis-art">Was misst du?</label>' +
        '<select id="room-' + id + '-kreis-art" data-art-select>' +
        '<option value="durchmesser"' + (art === "durchmesser" ? " selected" : "") + '>Durchmesser</option>' +
        '<option value="radius"' + (art === "radius" ? " selected" : "") + '>Radius</option></select></div>';
    }
    spec.fields.forEach(function (f) {
      var val = (data.values[s] && data.values[s][f.key]) || {};
      var isWert = s === "kreis";
      html += '<div class="field"><label for="room-' + id + "-" + s + "-" + f.key + '"' +
        (isWert ? " data-wert-label" : "") + ">" + f.label + "</label>" +
        '<div class="input-with-unit"><input type="text" inputmode="decimal" id="room-' + id + "-" + s + "-" + f.key +
        '" value="' + escAttr(val.v || "") + '" autocomplete="off">' +
        '<select id="room-' + id + "-" + s + "-" + f.key + '-einheit"' +
        (isWert ? " data-wert-einheit" : "") + ' aria-label="Einheit für ' + f.label + '">' +
        '<option value="m"' + (val.u !== "cm" ? " selected" : "") + '>m</option>' +
        '<option value="cm"' + (val.u === "cm" ? " selected" : "") + '>cm</option></select>' +
        "</div></div>";
    });
    html += "</div></div>";
  });
  return html;
}

function buildRow(id, data) {
  var row = document.createElement("div");
  row.className = "room-row";
  row.setAttribute("data-room", id);
  var name = (data && data.name) || ("Raum " + id);
  var shape = (data && data.shape) || "rechteck";
  var weight = (data && data.weight) || "1";
  var values = (data && data.values) || {};
  var html = '<div class="room-row-top">' +
    '<div class="field"><label for="room-' + id + '-name">Name</label>' +
    '<input type="text" id="room-' + id + '-name" value="' + escAttr(name) + '" autocomplete="off"></div>' +
    '<div class="field room-shape-field"><label for="room-' + id + '-shape">Form</label>' +
    '<select id="room-' + id + '-shape">' + shapeOptions(shape) + "</select></div>" +
    '<button type="button" class="time-clear room-delete" aria-label="Raum ' + id + ' löschen">×</button>' +
    "</div>" +
    '<div class="room-measure">' + rowFieldsHTML(id, { shape: shape, values: values }) + "</div>" +
    '<div class="room-foot">' +
    '<div class="field room-weight"' + (woflvBox.checked ? "" : " hidden") + '><label for="room-' + id + '-weight">Zählt zur Wohnfläche</label>' +
    '<select id="room-' + id + '-weight">' +
    '<option value="1"' + (weight === "1" ? " selected" : "") + '>Voll</option>' +
    '<option value="0.5"' + (weight === "0.5" ? " selected" : "") + '>Zur Hälfte</option>' +
    '<option value="0.25"' + (weight === "0.25" ? " selected" : "") + '>Zu einem Viertel</option></select></div>' +
    '<p class="room-area" id="room-' + id + '-area"></p>' +
    "</div>";
  row.innerHTML = html;

  row.querySelectorAll("input, select").forEach(function (el) {
    el.addEventListener("input", function () { compute(); save(); });
    el.addEventListener("change", function () { compute({ announceError: true }); save(); });
  });
  var shapeSel = row.querySelector("#room-" + id + "-shape");
  shapeSel.addEventListener("change", function () {
    row.querySelectorAll(".mode-fields[data-shape]").forEach(function (block) {
      block.classList.toggle("is-active", block.getAttribute("data-shape") === shapeSel.value);
    });
    compute();
    save();
  });
  var artSel = row.querySelector("#room-" + id + "-kreis-art");
  if (artSel) {
    artSel.addEventListener("change", function () { syncArtLabel(row); });
    syncArtLabel(row);
  }
  row.querySelector(".room-delete").addEventListener("click", function () {
    row.remove();
    syncAddButton();
    compute();
    save();
  });
  return row;
}

function addRoom(data) {
  if (roomCount() >= MAX_ROOMS) return;
  var id = nextRoomId++;
  roomList.appendChild(buildRow(id, data || {}));
  syncAddButton();
}

addRoomButton.addEventListener("click", function () {
  addRoom();
  compute();
  save();
});

function clearRooms() {
  roomList.innerHTML = "";
  syncAddButton();
}

/* --- Wohnfläche / Bodenbelag --- */

function syncWoflv() {
  var on = woflvBox.checked;
  gewichtFeld.hidden = !on;
  roomList.querySelectorAll(".room-weight").forEach(function (el) { el.hidden = !on; });
}

function syncVerschnitt() {
  verschnittEigenFeld.hidden = verschnittSelect.value !== "eigene";
}

function syncBoden() {
  bodenFelder.hidden = !bodenBox.checked;
  syncVerschnitt();
}

woflvBox.addEventListener("change", function () { syncWoflv(); compute(); save(); });
bodenBox.addEventListener("change", function () { syncBoden(); compute(); save(); });
verschnittSelect.addEventListener("change", function () { syncVerschnitt(); compute(); save(); });

/* --- Hauptformular: Eingaben, Speichern, Beispiele --- */

function applyMainValues(values) {
  Object.keys(values).forEach(function (shape) {
    var spec = values[shape];
    Object.keys(spec).forEach(function (key) {
      if (key === "art") {
        var artSel = document.getElementById("qm-kreis-art");
        if (artSel) artSel.value = spec.art;
        return;
      }
      var input = document.getElementById(MAIN_IDS[shape][key]);
      var unit = document.getElementById(MAIN_IDS[shape][key] + "-einheit");
      if (input) input.value = spec[key].v;
      if (unit) unit.value = spec[key].u || "m";
    });
  });
}

function readMainValues() {
  var out = {};
  Object.keys(SHAPES).forEach(function (shape) {
    out[shape] = {};
    Object.keys(MAIN_IDS[shape]).forEach(function (key) {
      var input = document.getElementById(MAIN_IDS[shape][key]);
      var unit = document.getElementById(MAIN_IDS[shape][key] + "-einheit");
      out[shape][key] = { v: input ? input.value : "", u: unit ? unit.value : "m" };
    });
    if (SHAPES[shape].art) {
      var artSel = document.getElementById("qm-kreis-art");
      out[shape].art = artSel ? artSel.value : "durchmesser";
    }
  });
  return out;
}

function rowsData() {
  var out = [];
  roomList.querySelectorAll(".room-row").forEach(function (rowEl) {
    var id = rowEl.getAttribute("data-room");
    var shape = document.getElementById("room-" + id + "-shape").value;
    var name = document.getElementById("room-" + id + "-name").value;
    var weight = document.getElementById("room-" + id + "-weight").value;
    var values = {};
    Object.keys(SHAPES).forEach(function (s) {
      values[s] = {};
      SHAPES[s].fields.forEach(function (f) {
        var input = document.getElementById("room-" + id + "-" + s + "-" + f.key);
        var unit = document.getElementById("room-" + id + "-" + s + "-" + f.key + "-einheit");
        values[s][f.key] = { v: input ? input.value : "", u: unit ? unit.value : "m" };
      });
      if (SHAPES[s].art) {
        var artSel = document.getElementById("room-" + id + "-kreis-art");
        values[s].art = artSel ? artSel.value : "durchmesser";
      }
    });
    out.push({ id: id, name: name, shape: shape, values: values, weight: weight });
  });
  return out;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      shape: currentShape,
      main: readMainValues(),
      rooms: rowsData(),
      gewicht: gewichtSelect.value,
      woflv: woflvBox.checked,
      boden: bodenBox.checked,
      verschnitt: verschnittSelect.value,
      verschnittEigen: verschnittEigenInput.value,
      preis: preisInput.value,
      paket: paketInput.value
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
    if (saved.main) applyMainValues(saved.main);
    if (saved.shape && SHAPES[saved.shape]) setShape(saved.shape);
    if (typeof saved.gewicht === "string") gewichtSelect.value = saved.gewicht;
    if (Array.isArray(saved.rooms)) {
      saved.rooms.forEach(function (r) {
        var id = nextRoomId++;
        roomList.appendChild(buildRow(id, r));
      });
      syncAddButton();
    }
    if (typeof saved.woflv === "boolean") woflvBox.checked = saved.woflv;
    if (typeof saved.boden === "boolean") bodenBox.checked = saved.boden;
    if (typeof saved.verschnitt === "string") verschnittSelect.value = saved.verschnitt;
    if (typeof saved.verschnittEigen === "string") verschnittEigenInput.value = saved.verschnittEigen;
    if (typeof saved.preis === "string") preisInput.value = saved.preis;
    if (typeof saved.paket === "string") paketInput.value = saved.paket;
  } catch (e) {
    // Kaputte Daten ignorieren — Standardwerte bleiben.
  }
}

function scrollToCalculator() {
  var target = document.getElementById("rechner");
  if (target) window.scrollTo({ top: target.offsetTop - 80, behavior: "smooth" });
}

function loadExample(key) {
  var ex = EXAMPLES[key];
  if (!ex) return;
  applyMainValues(ex.values);
  setShape(ex.shape);
  clearRooms();
  compute();
  save();
  scrollToCalculator();
}

form.addEventListener("submit", function (event) {
  event.preventDefault();
  compute({ announceError: true });
  save();
});

form.querySelectorAll("input, select").forEach(function (el) {
  el.addEventListener("input", function () { compute(); save(); });
  el.addEventListener("change", function () { compute({ announceError: true }); save(); });
});

document.getElementById("qm-kreis-art").addEventListener("change", function () {
  syncArtLabel(form);
});

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

/* Tabellenzeile antippen: Länge und Breite wandern in den Rechner. */
document.querySelectorAll(".zimmer-row").forEach(function (row) {
  function load() {
    applyMainValues({ rechteck: {
      laenge: { v: row.getAttribute("data-laenge"), u: "m" },
      breite: { v: row.getAttribute("data-breite"), u: "m" }
    } });
    setShape("rechteck");
    clearRooms();
    compute();
    save();
    scrollToCalculator();
  }
  row.addEventListener("click", load);
  row.setAttribute("tabindex", "0");
  row.setAttribute("role", "button");
  row.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      load();
    }
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
  applyMainValues(DEFAULTS.main);
  setShape(DEFAULTS.shape);
  gewichtSelect.value = "1";
  clearRooms();
  woflvBox.checked = false;
  bodenBox.checked = false;
  verschnittSelect.value = "10";
  verschnittEigenInput.value = "12";
  preisInput.value = "";
  paketInput.value = "";
  syncWoflv();
  syncBoden();
  syncArtLabel(form);
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  compute();
});

syncWoflv();
syncBoden();
syncArtLabel(form);
restore();
syncWoflv();
syncBoden();
compute();
