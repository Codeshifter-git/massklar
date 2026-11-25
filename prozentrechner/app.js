'use strict';
(function () {
  var STORAGE_KEY = 'massklar_prozent_v1';

  var form = document.getElementById('percent-form');
  var modeGrid = document.getElementById('mode-grid');
  var modeButtons = Array.prototype.slice.call(modeGrid.querySelectorAll('[data-mode]'));
  var modeFields = Array.prototype.slice.call(document.querySelectorAll('.mode-fields'));
  var calcButton = document.getElementById('calculate-button');
  var resetButton = document.getElementById('reset-button');
  var errorBox = document.getElementById('form-error');
  var resultValue = document.getElementById('result-value');
  var resultContext = document.getElementById('result-context');
  var resultAlso = document.getElementById('result-also');
  var resultFormula = document.getElementById('result-formula');
  var copyButton = document.getElementById('copy-button');

  /* Eingabefelder je Modus. value = Standardwert nach dem Laden. */
  var FIELD_IDS = {
    wert:      { pct: 'wert-pct',   base: 'wert-base' },
    satz:      { teil: 'satz-teil', ganz: 'satz-ganz' },
    grund:     { wert: 'grund-wert', satz: 'grund-satz' },
    aenderung: { alt: 'aend-alt',   pct: 'aend-pct' },
    vergleich: { alt: 'vergl-alt',  neu: 'vergl-neu' },
    rabatt:    { preis: 'rabatt-preis', pct: 'rabatt-pct' },
    vorrabatt: { nach: 'vor-nach',  pct: 'vor-pct' },
    punkte:    { alt: 'punkte-alt', neu: 'punkte-neu' }
  };
  var DEFAULTS = {
    wert:      { pct: '20',    base: '250' },
    satz:      { teil: '34',   ganz: '40' },
    grund:     { wert: '30',   satz: '15' },
    aenderung: { alt: '3.200', pct: '5' },
    vergleich: { alt: '3.200', neu: '3.360' },
    rabatt:    { preis: '79,99', pct: '20' },
    vorrabatt: { nach: '80',   pct: '20' },
    punkte:    { alt: '2,5',   neu: '2,9' }
  };
  var BUTTON_TEXT = {
    wert: 'Prozentwert berechnen',
    satz: 'Prozentsatz berechnen',
    grund: 'Grundwert berechnen',
    aenderung: 'Erhöhung / Minderung berechnen',
    vergleich: 'Veränderung berechnen',
    rabatt: 'Rabatt berechnen',
    vorrabatt: 'Preis vor Rabatt berechnen',
    punkte: 'Prozentpunkte berechnen'
  };

  var mode = 'wert';

  /* Deutsche Zahlen einlesen: Komma = Dezimalzeichen, Punkt = Tausender.
     "79,99" -> 79.99, "3.200" -> 3200, "2,5" -> 2.5, "20" -> 20. */
  function parseDE(raw) {
    if (raw == null) return NaN;
    var s = String(raw).trim().replace(/\s/g, '').replace(/−/g, '-');
    if (s === '') return NaN;
    if (s.indexOf(',') !== -1) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      var dots = (s.match(/\./g) || []).length;
      if (dots === 1) {
        var parts = s.split('.');
        if (parts[1].length === 3 && parts[0].length >= 1 && parts[0].length <= 3) {
          s = parts[0] + parts[1]; /* Tausenderpunkt, z. B. 3.200 */
        }
      } else if (dots > 1) {
        s = s.replace(/\./g, '');
      }
    }
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  function fmt(n) {
    if (!isFinite(n)) return '–';
    return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function fmtMoney(n) {
    if (!isFinite(n)) return '–';
    return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }
  function $(id) { return document.getElementById(id); }
  function read(modeKey, fieldKey) {
    return parseDE($(FIELD_IDS[modeKey][fieldKey]).value);
  }
  function markError(fieldId, message) {
    var input = $(fieldId);
    var field = input.closest('.field');
    if (field) field.classList.add('has-error');
    errorBox.textContent = message;
    errorBox.hidden = false;
    resultValue.textContent = '–';
    resultContext.textContent = '';
    resultAlso.hidden = true;
    resultFormula.textContent = '';
    return { ok: false };
  }
  function clearErrors() {
    Array.prototype.forEach.call(document.querySelectorAll('.field.has-error'), function (f) {
      f.classList.remove('has-error');
    });
    errorBox.hidden = true;
    errorBox.textContent = '';
  }
  function show(value, context, formula, also) {
    resultValue.textContent = value;
    resultContext.textContent = context;
    resultFormula.textContent = formula;
    if (also) {
      resultAlso.textContent = also;
      resultAlso.hidden = false;
    } else {
      resultAlso.hidden = true;
      resultAlso.textContent = '';
    }
  }

  /* Die acht Rechenwege. Jeder liefert { ok, value, context, formula, also? }
     oder meldet einen Fehler über markError(). */
  function compute() {
    clearErrors();
    var p, b, t, g, w, a, n, r, v, diff, pct, factor, pp, rel;
    if (mode === 'wert') {
      p = read('wert', 'pct'); b = read('wert', 'base');
      if (isNaN(p)) return markError('wert-pct', 'Bitte gib den Prozentsatz als Zahl ein — zum Beispiel 20.');
      if (isNaN(b)) return markError('wert-base', 'Bitte gib den Grundwert als Zahl ein — zum Beispiel 250.');
      v = b * p / 100;
      return show(fmt(v), fmt(p) + ' % von ' + fmt(b) + ' sind ' + fmt(v) + '.',
        fmt(b) + ' × ' + fmt(p) + ' ÷ 100 = ' + fmt(v));
    }
    if (mode === 'satz') {
      t = read('satz', 'teil'); g = read('satz', 'ganz');
      if (isNaN(t)) return markError('satz-teil', 'Bitte gib den Teilwert als Zahl ein — zum Beispiel 34.');
      if (isNaN(g)) return markError('satz-ganz', 'Bitte gib den Grundwert als Zahl ein — zum Beispiel 40.');
      if (g === 0) return markError('satz-ganz', 'Der Grundwert darf nicht 0 sein.');
      pct = t / g * 100;
      return show(fmt(pct) + ' %', fmt(t) + ' von ' + fmt(g) + ' sind ' + fmt(pct) + ' %.',
        fmt(t) + ' ÷ ' + fmt(g) + ' × 100 = ' + fmt(pct) + ' %');
    }
    if (mode === 'grund') {
      w = read('grund', 'wert'); p = read('grund', 'satz');
      if (isNaN(w)) return markError('grund-wert', 'Bitte gib den Prozentwert als Zahl ein — zum Beispiel 30.');
      if (isNaN(p)) return markError('grund-satz', 'Bitte gib den Prozentsatz als Zahl ein — zum Beispiel 15.');
      if (p === 0) return markError('grund-satz', 'Der Prozentsatz darf nicht 0 sein.');
      v = w / p * 100;
      return show(fmt(v), fmt(w) + ' sind ' + fmt(p) + ' % von ' + fmt(v) + '.',
        fmt(w) + ' ÷ ' + fmt(p) + ' × 100 = ' + fmt(v));
    }
    if (mode === 'aenderung') {
      a = read('aenderung', 'alt'); p = read('aenderung', 'pct');
      if (isNaN(a)) return markError('aend-alt', 'Bitte gib den alten Wert als Zahl ein — zum Beispiel 3.200.');
      if (isNaN(p)) return markError('aend-pct', 'Bitte gib die Veränderung als Zahl ein — zum Beispiel 5.');
      var dir = $('aend-dir').value;
      factor = dir === 'minus' ? 1 - p / 100 : 1 + p / 100;
      v = a * factor;
      var sign = dir === 'minus' ? '−' : '+';
      return show(fmt(v), fmt(a) + ' ' + sign + ' ' + fmt(p) + ' % = ' + fmt(v) + '.',
        fmt(a) + ' × ' + fmt(factor) + ' = ' + fmt(v));
    }
    if (mode === 'vergleich') {
      a = read('vergleich', 'alt'); n = read('vergleich', 'neu');
      if (isNaN(a)) return markError('vergl-alt', 'Bitte gib den alten Wert als Zahl ein — zum Beispiel 3.200.');
      if (isNaN(n)) return markError('vergl-neu', 'Bitte gib den neuen Wert als Zahl ein — zum Beispiel 3.360.');
      if (a === 0) return markError('vergl-alt', 'Der alte Wert darf nicht 0 sein.');
      diff = n - a;
      pct = diff / a * 100;
      var word = pct >= 0 ? 'mehr' : 'weniger';
      var signPct = pct >= 0 ? '+' : '−';
      return show(signPct + fmt(Math.abs(pct)) + ' %',
        fmt(n) + ' sind ' + fmt(Math.abs(pct)) + ' % ' + word + ' als ' + fmt(a) + '.',
        '(' + fmt(n) + ' − ' + fmt(a) + ') ÷ ' + fmt(a) + ' × 100 = ' + fmt(pct) + ' %',
        'Das sind ' + fmt(Math.abs(diff)) + ' ' + word + ' als vorher.');
    }
    if (mode === 'rabatt') {
      p = read('rabatt', 'preis'); r = read('rabatt', 'pct');
      if (isNaN(p)) return markError('rabatt-preis', 'Bitte gib den alten Preis als Zahl ein — zum Beispiel 79,99.');
      if (isNaN(r)) return markError('rabatt-pct', 'Bitte gib den Rabatt als Zahl ein — zum Beispiel 20.');
      if (r < 0 || r > 100) return markError('rabatt-pct', 'Der Rabatt liegt zwischen 0 % und 100 %.');
      v = p * (1 - r / 100);
      return show(fmtMoney(v), fmtMoney(p) + ' minus ' + fmt(r) + ' % = ' + fmtMoney(v) + '.',
        fmtMoney(p) + ' × ' + fmt(1 - r / 100) + ' = ' + fmtMoney(v),
        'Du sparst ' + fmtMoney(p - v) + '.');
    }
    if (mode === 'vorrabatt') {
      n = read('vorrabatt', 'nach'); p = read('vorrabatt', 'pct');
      if (isNaN(n)) return markError('vor-nach', 'Bitte gib den Preis nachher als Zahl ein — zum Beispiel 80.');
      if (isNaN(p)) return markError('vor-pct', 'Bitte gib den Rabatt oder Aufschlag als Zahl ein — zum Beispiel 20.');
      var dir2 = $('vor-dir').value;
      if (dir2 === 'rabatt') {
        if (p >= 100) return markError('vor-pct', 'Der Rabatt muss unter 100 % liegen.');
        v = n / (1 - p / 100);
        return show(fmtMoney(v), fmtMoney(n) + ' nach ' + fmt(p) + ' % Rabatt — vorher waren es ' + fmtMoney(v) + '.',
          fmtMoney(n) + ' ÷ ' + fmt(1 - p / 100) + ' = ' + fmtMoney(v),
          'Der Rabatt sind ' + fmtMoney(v - n) + '.');
      }
      v = n / (1 + p / 100);
      return show(fmtMoney(v), fmtMoney(n) + ' nach ' + fmt(p) + ' % Aufschlag — vorher waren es ' + fmtMoney(v) + '.',
        fmtMoney(n) + ' ÷ ' + fmt(1 + p / 100) + ' = ' + fmtMoney(v),
        'Der Aufschlag sind ' + fmtMoney(n - v) + '.');
    }
    if (mode === 'punkte') {
      a = read('punkte', 'alt'); n = read('punkte', 'neu');
      if (isNaN(a)) return markError('punkte-alt', 'Bitte gib den alten Prozentsatz als Zahl ein — zum Beispiel 2,5.');
      if (isNaN(n)) return markError('punkte-neu', 'Bitte gib den neuen Prozentsatz als Zahl ein — zum Beispiel 2,9.');
      if (a === 0) return markError('punkte-alt', 'Der alte Prozentsatz darf nicht 0 sein.');
      pp = n - a;
      rel = pp / a * 100;
      var relWord = rel >= 0 ? 'Plus' : 'Minus';
      return show(fmt(pp) + ' Prozentpunkte',
        'Von ' + fmt(a) + ' % auf ' + fmt(n) + ' % sind ' + fmt(pp) + ' Prozentpunkte.',
        fmt(n) + ' % − ' + fmt(a) + ' % = ' + fmt(pp) + ' Prozentpunkte',
        'Das ist ein ' + relWord + ' von ' + fmt(Math.abs(rel)) + ' %.');
    }
  }

  function setMode(next) {
    mode = next;
    modeButtons.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-mode') === next ? 'true' : 'false');
    });
    modeFields.forEach(function (group) {
      group.classList.toggle('is-active', group.getAttribute('data-mode') === next);
    });
    calcButton.firstChild.textContent = BUTTON_TEXT[next] + ' ';
    compute();
    save();
  }
  function setValues(modeKey, values) {
    Object.keys(values).forEach(function (key) {
      var id = FIELD_IDS[modeKey][key];
      if (id && $(id)) $(id).value = values[key];
    });
  }
  function save() {
    try {
      var state = { mode: mode, values: {} };
      Object.keys(FIELD_IDS).forEach(function (m) {
        state.values[m] = {};
        Object.keys(FIELD_IDS[m]).forEach(function (k) {
          state.values[m][k] = $(FIELD_IDS[m][k]).value;
        });
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* privater Modus o. ä. — rechnen geht trotzdem */ }
  }
  function restore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var state = JSON.parse(raw);
      if (!state || !FIELD_IDS[state.mode]) return false;
      Object.keys(state.values || {}).forEach(function (m) {
        if (FIELD_IDS[m]) setValues(m, state.values[m]);
      });
      return state.mode;
    } catch (e) { return false; }
  }
  function scrollToCalc() {
    var el = document.getElementById('rechner');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  modeButtons.forEach(function (btn) {
    btn.addEventListener('click', function () { setMode(btn.getAttribute('data-mode')); });
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    compute();
  });
  form.addEventListener('input', function () { compute(); save(); });
  form.addEventListener('change', function () { compute(); save(); });

  /* Beispiel-Chips unter dem Ergebnis und Beispiel-Karten weiter unten:
     füllen den Rechner aus und rechnen sofort. */
  Array.prototype.forEach.call(document.querySelectorAll('.preset-chip, .example-card'), function (el) {
    el.addEventListener('click', function () {
      var m = el.getAttribute('data-mode');
      if (!m || !FIELD_IDS[m]) return;
      var values = {};
      Object.keys(FIELD_IDS[m]).forEach(function (key) {
        var v = el.getAttribute('data-' + key);
        if (v != null) values[key] = v;
      });
      setValues(m, values);
      setMode(m);
      if (el.classList.contains('example-card')) scrollToCalc();
    });
  });
  /* Tabellenzeilen: Prozentsatz übernehmen, Basis 240 €. */
  Array.prototype.forEach.call(document.querySelectorAll('.pct-row'), function (row) {
    row.addEventListener('click', function () {
      setValues('wert', { pct: row.getAttribute('data-pct'), base: '240' });
      setMode('wert');
      scrollToCalc();
    });
  });

  resetButton.addEventListener('click', function () {
    Object.keys(DEFAULTS).forEach(function (m) { setValues(m, DEFAULTS[m]); });
    $('aend-dir').value = 'plus';
    $('vor-dir').value = 'rabatt';
    setMode('wert');
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  });

  copyButton.addEventListener('click', function () {
    var text = resultContext.textContent + ' ' + resultFormula.textContent;
    function done() {
      copyButton.textContent = 'Kopiert ✓';
      setTimeout(function () { copyButton.textContent = 'Ergebnis kopieren ⧉'; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  });
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* Start: gespeicherte Eingaben laden, sonst Standardwerte (20 % von 250). */
  var savedMode = restore();
  if (savedMode) {
    mode = savedMode;
    modeButtons.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-mode') === mode ? 'true' : 'false');
    });
    modeFields.forEach(function (group) {
      group.classList.toggle('is-active', group.getAttribute('data-mode') === mode);
    });
    calcButton.firstChild.textContent = BUTTON_TEXT[mode] + ' ';
  }
  compute();
})();
