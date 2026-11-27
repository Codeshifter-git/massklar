/* WebMCP tool for maßklar (2026-11-27).
 *
 * Registers one in-browser tool, "list-calculators", for AI agents that
 * run inside the browser (WebMCP / navigator.modelContext). The tool
 * lists all 14 free calculators on maßklar with their URLs and a
 * one-line description each — the same list the homepage shows.
 *
 * Feature-detected: if the browser has no navigator.modelContext,
 * this file does nothing and never throws. There is no remote MCP
 * server behind this; the tool only reads the static list below.
 * See also /.well-known/mcp/server-card.json, which describes the
 * same tool honestly as an in-browser capability.
 */
(function () {
  'use strict';

  if (typeof navigator === 'undefined' ||
      !navigator.modelContext ||
      typeof navigator.modelContext.registerTool !== 'function') {
    return;
  }

  var CALCULATORS = [
    { name: 'Maßstabsrechner', url: 'https://massklar-rechner.de/massstabsrechner/', description: 'Für Karten, Grundrisse und Modellbau: Hier rechnest du echte Länge und Plan-Länge um — in beide Richtungen.' },
    { name: 'Altersrechner', url: 'https://massklar-rechner.de/altersrechner/', description: 'Wie alt bist du genau — in Jahren, Monaten und Tagen? Dazu gibt es noch einen Countdown bis zum nächsten Geburtstag.' },
    { name: 'Modellbau-Maßstab', url: 'https://massklar-rechner.de/massstabsrechner/modellbau/', description: 'Ob H0, Spur N oder 1:72: Hier wird aus der echten Länge die Länge für dein Modell.' },
    { name: 'Prozentrechner', url: 'https://massklar-rechner.de/prozentrechner/', description: 'Prozentwert, Rabatt oder Erhöhung ausrechnen — das dauert hier nur ein paar Sekunden.' },
    { name: 'BMI-Rechner', url: 'https://massklar-rechner.de/bmi-rechner/', description: 'Rechne deinen Body-Mass-Index aus und sieh gleich, wo du damit stehst.' },
    { name: 'Tage-Rechner', url: 'https://massklar-rechner.de/tage-rechner/', description: 'Zählt die Tage zwischen zwei Daten — und zeigt dir dazu auch Wochen, Arbeitstage und den Wochentag.' },
    { name: 'Stunden-Rechner', url: 'https://massklar-rechner.de/stunden-rechner/', description: 'Arbeitszeit und Stunden zwischen zwei Uhrzeiten, mit Pause und Nachtschicht — so behältst du deine Zeiten im Blick.' },
    { name: 'Indexmiete-Rechner', url: 'https://massklar-rechner.de/indexmiete-rechner/', description: 'Rechnet aus dem Verbraucherpreisindex deine neue Nettokaltmiete aus — mit Rechenweg und den Fristen dazu.' },
    { name: 'Brutto-Netto-Rechner', url: 'https://massklar-rechner.de/brutto-netto-rechner/', description: 'Was bleibt von deinem Gehalt wirklich übrig? Der Rechner zieht Steuern und Abgaben ab und zeigt dir das Ergebnis grob an.' },
    { name: 'Kreditrechner', url: 'https://massklar-rechner.de/kreditrechner/', description: 'Monatsrate, Zinsen und Gesamtkosten für deinen Kredit berechnen – mit Tilgungsplan und Rechenweg.' },
    { name: 'Grundsteuer-Rechner', url: 'https://massklar-rechner.de/grundsteuer-rechner/', description: 'Jahressteuer aus Grundsteuerwert, Messzahl und Hebesatz berechnen – mit Rechenweg und Beispiel.' },
    { name: 'Bürgergeld-Rechner', url: 'https://massklar-rechner.de/buergergeld-rechner/', description: 'Schätze deinen Anspruch aus Regelbedarf, Miete und Einkommen. Nur ein Richtwert – der Bescheid kommt vom Jobcenter.' },
    { name: 'Schlafzyklus-Rechner', url: 'https://massklar-rechner.de/schlafzyklus-rechner/', description: 'Finde deine Schlafenszeit in 90-Minuten-Schritten – 5 oder 6 Zyklen für 7,5 oder 9 Stunden Schlaf.' },
    { name: 'Quadratmeter-Rechner', url: 'https://massklar-rechner.de/quadratmeter-rechner/', description: 'Länge mal Breite für Zimmer und Grundstücke – mit Verschnitt und Kosten je m².' }
  ];

  navigator.modelContext.registerTool({
    name: 'list-calculators',
    description: 'List all free calculators on maßklar with their URLs and what they calculate.',
    inputSchema: { type: 'object', properties: {} },
    execute: async function () {
      return JSON.stringify(CALCULATORS, null, 2);
    }
  });
})();
