/* Cookie-Einstellungen für maßklar (2026-11-27).
 *
 * Was das hier tut: Es zeigt den Cookie-Banner, bis der Besucher
 * "Alle akzeptieren" oder "Ablehnen" tippt, und merkt sich die Auswahl
 * im localStorage (Schlüssel "massklar-cookie-consent").
 *
 * Ehrlich ist das so: Die Seite setzt im Moment KEINE Cookies für
 * Werbung oder Statistik und lädt KEINE Tracker. Was sie nutzt, ist
 * lokaler Speicher, damit die Rechner Eingaben merken — und diese
 * Auswahl hier. "Ablehnen" heißt: keine optionalen Cookies. Es gibt
 * im Moment keine optionalen Cookies, also ändert "Ablehnen" heute
 * nichts am Rechner — die Auswahl ist trotzdem gespeichert, damit
 * der Banner nicht bei jedem Besuch wieder auftaucht.
 *
 * Hook für später (Werbung / AdSense):
 *   window.massklarConsent ist "accepted", "rejected" oder null
 *   (null = noch keine Auswahl getroffen).
 *   window.massklarCookieConsent hat get(), accept(), reject() und
 *   reset() — reset() löscht die Auswahl und zeigt den Banner wieder.
 *   Bei jeder Änderung feuert ein "massklar:consent"-Event auf dem
 *   document (detail.consent = "accepted" | "rejected" | null).
 *   Wenn Werbung live geht, ist der richtige Weg Googles kostenloses
 *   CMP (Funding Choices) — das ersetzt diesen Banner, liest aber
 *   dieselbe Frage ("akzeptieren oder ablehnen"). Dann muss auch die
 *   Datenschutzerklärung für Google/Cookies neu geschrieben werden.
 *   Bis dahin wird hier KEIN Werbe- oder Analyse-Code geladen.
 */
(function () {
  'use strict';

  var KEY = 'massklar-cookie-consent';
  var banner = document.getElementById('cookie-banner');
  if (!banner) return; // Seite ohne Banner — nichts zu tun.

  var memory = null; // Falls localStorage nicht geht (z. B. Privatmodus).

  function storeGet() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function storeSet(value) {
    try { window.localStorage.setItem(KEY, value); } catch (e) { /* nur Sitzung */ }
  }
  function storeRemove() {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* egal */ }
  }

  function read() {
    var stored = storeGet();
    if (stored === 'accepted' || stored === 'rejected') return stored;
    return memory;
  }

  function announce(value) {
    window.massklarConsent = value;
    try {
      document.dispatchEvent(new CustomEvent('massklar:consent', {
        detail: { consent: value }
      }));
    } catch (e) { /* alte Browser ohne CustomEvent — die Auswahl gilt trotzdem */ }
  }

  function syncPadding() {
    // Solange der Banner sichtbar ist, bekommt der Seitenfuß unten
    // so viel Luft, wie der Banner hoch ist — damit er nichts verdeckt.
    if (!banner.hidden) {
      document.body.style.paddingBottom = banner.offsetHeight + 'px';
    }
  }

  function show() {
    banner.hidden = false;
    document.body.classList.add('has-cookie-banner');
    syncPadding();
  }

  function hide() {
    banner.hidden = true;
    document.body.classList.remove('has-cookie-banner');
    document.body.style.paddingBottom = '';
  }

  function choose(value) {
    memory = value;
    storeSet(value);
    announce(value);
    hide();
  }

  function reset() {
    memory = null;
    storeRemove();
    announce(null);
    show();
  }

  // Buttons im Banner.
  var acceptBtn = banner.querySelector('[data-cookie-accept]');
  var rejectBtn = banner.querySelector('[data-cookie-reject]');
  if (acceptBtn) acceptBtn.addEventListener('click', function () { choose('accepted'); });
  if (rejectBtn) rejectBtn.addEventListener('click', function () { choose('rejected'); });

  // "Cookie-Einstellungen" im Fuß der Seite (und überall sonst mit
  // data-cookie-settings): Auswahl löschen, Banner wieder zeigen.
  var settingsLinks = document.querySelectorAll('[data-cookie-settings]');
  for (var i = 0; i < settingsLinks.length; i++) {
    settingsLinks[i].addEventListener('click', function (event) {
      event.preventDefault();
      reset();
    });
  }

  // Wenn das Fenster kleiner oder größer wird, passt sich der Abstand an.
  window.addEventListener('resize', syncPadding);

  // Start: Auswahl schon getroffen? Dann bleibt der Banner versteckt.
  // Sonst zeigen wir ihn — einmal, bis der Besucher sich entscheidet.
  window.massklarConsent = read();
  window.massklarCookieConsent = {
    get: read,
    accept: function () { choose('accepted'); },
    reject: function () { choose('rejected'); },
    reset: reset
  };
  if (window.massklarConsent === null) show();
})();
