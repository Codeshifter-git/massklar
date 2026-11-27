#!/usr/bin/env python3
"""Build the 9 per-scale Maßstab pages for maßklar.

Template: massstabsrechner/index.html + massstabsrechner/app.js
Output:   massstabsrechner/1-zu-<scale>/index.html + app.js
          for scales 10, 20, 25, 50, 100, 200, 250, 500, 1000.

Re-run any time: the build is deterministic and idempotent (same input
template -> byte-identical output). Do NOT edit the generated pages by
hand — change the data below (or the template) and re-run.

Rules the generator enforces:
- German simple enough for a 5th grader to understand, but the words
  "Klasse 5" / "5. Klasse" / "fifth grader" never appear anywhere.
- No keyword stuffing, no hidden text, no copied competitor text.
- Title/H1/meta/guide prose use the keyword form "1:1000" (no dot);
  values the JS renders (length-table title, result context/formula,
  scale table) use de-DE formatting ("1:1.000"), matching Intl.
- The compare tool keeps its generic 1:25.000 vs 1:50.000 example.
- Area/volume guide steps keep their 1:100 example, framed as
  "Zum Beispiel bei 1:100" so it can't be misread as the page's scale.
"""
import html as htmlmod
import json
import re
import sys
from decimal import Decimal
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent  # massstabsrechner/
TEMPLATE_HTML = BASE / "index.html"
TEMPLATE_JS = BASE / "app.js"
SCALES = [10, 20, 24, 25, 35, 50, 72, 87, 100, 200, 250, 500, 1000, 25000, 50000]
LENGTH_CM = [0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9,
             10, 12, 14, 15, 16, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100]

# Per-scale data. one_cm / ten_cm are the brief's values; everything else is
# computed from them (or written out in plain German below).
DATA = {
    10: dict(
        one_cm="10 cm", ten_cm="1 m",
        use_line="Für Detailpläne und Modelle.", use_short="Detailpläne",
        map_label="DETAILPLAN",
        example="Ein Beispiel: Ein Modellauto ist auf dem Plan 12 cm lang — in echt sind das 1,2 m (12 × 10 = 120 cm).",
        wofuer=("1:10 ist der Maßstab fürs ganz genaue Hinsehen. Architekten zeichnen damit Details, die man auf einem Grundriss gar nicht sehen würde: einen Türanschlag, einen Fensterrahmen oder den Anschluss einer Treppe an die Wand. Auf einem A4-Blatt passt ein Ausschnitt von etwa 2 m × 3 m — genug für ein ganzes Fenster mit Rahmen und Laibung. Auch Schreiner und Möbelbauer arbeiten mit 1:10, wenn sie einen Schrank oder einen Tisch erst auf Papier durchdenken, bevor sie Holz schneiden. Ein Stuhl von 90 cm Höhe ist auf dem Plan 9 cm hoch, groß genug, um jede Lehne und jedes Bein zu zeichnen."),
        tipp="Tipp: Wenn du einen Detailplan liest, such zuerst die Angabe „1:10“ unten auf dem Blatt. Viele Detailpläne haben zusätzlich echte Maße direkt an den Linien stehen — die gelten immer, auch wenn der Plan beim Kopieren etwas größer oder kleiner geworden ist. Ein Plan, der nur 1 mm falsch kopiert wurde, ist bei 1:10 schon 1 cm daneben.",
        step1=("Nimm die Länge auf dem Plan mal die Maßstabszahl. Bei 1:10 werden aus 3 cm auf dem Plan 30 cm in echt.",
               "3 cm × 10 = 30 cm"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Modellauto, das 50 cm lang ist, ist im Maßstab 1:10 dann 5 cm lang.",
               "50 cm ÷ 10 = 5 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge auf dem Plan durch die echte Länge. 10 cm zu 1 m — das ist 1:10.",
               "10 cm : 100 cm = 1 : 10"),
    ),
    20: dict(
        one_cm="20 cm", ten_cm="2 m",
        use_line="Für Treppen und Innenausbau.", use_short="Treppen, Ausbau",
        map_label="TREPPE",
        example="Ein Beispiel: Eine Treppe ist auf dem Plan 15 cm lang — in echt sind das 3 m (15 × 20 = 300 cm).",
        wofuer=("Treppen sind das klassische Beispiel für 1:20. Eine Treppe ist zu lang für einen Grundriss in 1:50, aber zu kurz für eine eigene große Zeichnung — 1:20 liegt genau dazwischen. Auf einem A3-Blatt passt eine Treppe von 3 m Länge locker drauf: Sie ist dort 15 cm lang, und jede Stufe lässt sich noch einzeln zeichnen. Darum nutzen Architekten 1:20 auch für den Innenausbau: für eine Küche mit allen Schränken, für ein Bad mit Wanne und Dusche oder für einen Flur mit Einbauschrank. Wer eine Treppe plant, rechnet mit Stufen von etwa 17 cm Höhe und 29 cm Tiefe — auf dem Plan sind das knapp 1 cm hoch und etwa 1,5 cm tief."),
        tipp="Tipp: Zähl bei einer Treppenzeichnung die Stufen nach, statt nur die Gesamtlänge zu messen. Eine Treppe mit 17 Stufen zu je 17 cm Steigung ist 2,89 m hoch — auf dem Plan sind das 14,45 cm. Wenn die Stufenzahl nicht zur Höhe passt, stimmt etwas mit dem Plan nicht.",
        step1=("Nimm die Länge auf dem Plan mal die Maßstabszahl. Bei 1:20 werden aus 3 cm auf dem Plan 60 cm in echt.",
               "3 cm × 20 = 60 cm"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Zimmer, das 5 m lang ist, ist auf einem Plan im Maßstab 1:20 dann 25 cm lang.",
               "500 cm ÷ 20 = 25 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge auf dem Plan durch die echte Länge. 5 cm zu 1 m — das ist 1:20.",
               "5 cm : 100 cm = 1 : 20"),
    ),
    25: dict(
        one_cm="25 cm", ten_cm="2,5 m",
        use_line="Für Zimmer und Wohnungen.", use_short="Zimmer, Wohnungen",
        map_label="ZIMMERPLAN",
        example="Ein Beispiel: Ein Zimmer ist auf dem Plan 16 cm lang — in echt sind das 4 m (16 × 25 = 400 cm).",
        wofuer=("1:25 ist der Maßstab für ein einzelnes Zimmer. Ein Zimmer von 4 m × 3 m ist auf dem Plan 16 cm × 12 cm groß — das passt auf ein A4-Blatt, und man kann noch jeden Schrank und jedes Bett einzeichnen. Wer eine Wohnung einrichten will, zeichnet jedes Zimmer in 1:25 und schiebt die Möbel auf dem Papier hin und her, statt sie in echt zu rücken. Ein Bett von 2 m Länge ist auf dem Plan 8 cm lang, ein Kleiderschrank von 60 cm Tiefe nur 2,4 cm. Auch Modellautos gibt es in 1:25, vor allem in den USA — ein Auto von 4,5 m wird dort 18 cm lang."),
        tipp="Tipp: Bei 1:25 ist 1 cm auf dem Plan genau 25 cm in echt — ein Viertelmeter. Das macht das Rechnen im Kopf leicht: 4 cm sind ein Meter, 8 cm sind zwei Meter, 12 cm sind drei Meter. Wenn du einen Raumplan schnell prüfen willst, zähl einfach die Zentimeter und teil sie durch vier — das Ergebnis ist die Länge in Metern.",
        step1=("Nimm die Länge auf dem Plan mal die Maßstabszahl. Bei 1:25 werden aus 3 cm auf dem Plan 75 cm in echt.",
               "3 cm × 25 = 75 cm"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Zimmer, das 5 m lang ist, ist auf einem Zimmerplan im Maßstab 1:25 dann 20 cm lang.",
               "500 cm ÷ 25 = 20 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge auf dem Plan durch die echte Länge. 4 cm zu 1 m — das ist 1:25.",
               "4 cm : 100 cm = 1 : 25"),
    ),
    50: dict(
        one_cm="50 cm", ten_cm="5 m",
        use_line="Für Grundrisse und Wohnungen.", use_short="Wohnungsgrundrisse",
        map_label="GRUNDRISS",
        example="Ein Beispiel: Eine Wand ist auf dem Plan 6 cm lang — in echt sind das 3 m (6 × 50 = 300 cm).",
        wofuer=("1:50 ist der Standardmaßstab für Wohnungsgrundrisse — in Deutschland und in fast ganz Europa. Eine Wohnung von 10 m × 8 m ist auf dem Plan 20 cm × 16 cm groß und passt damit genau auf ein A4-Blatt. Darum liegt fast jedem Mietvertrag und jeder Wohnungsanzeige ein Grundriss in 1:50 bei: Man sieht auf einen Blick, wo die Küche ist, wie groß das Bad ist und ob das Sofa an die Wand passt. Ein Sofa von 2,20 m ist auf dem Plan 4,4 cm lang, eine Tür von 90 cm Breite nur 1,8 cm. Wer Möbel kaufen will, misst sie zu Hause nach und zeichnet sie in den Grundriss ein, bevor er sie bestellt."),
        tipp="Tipp: Bei 1:50 ist 1 cm auf dem Plan genau ein halber Meter in echt. 2 cm sind ein Meter, 10 cm sind fünf Meter — darum lässt sich mit 1:50 so leicht im Kopf rechnen. Achtung bei alten Plänen: Manche wurden beim Kopieren verkleinert, dann stimmt der Maßstab nicht mehr. Verlass dich in dem Fall auf die Maßangaben, die auf dem Plan stehen, nicht auf dein Lineal.",
        step1=("Nimm die Länge auf dem Plan mal die Maßstabszahl. Bei 1:50 werden aus 3 cm auf dem Plan 150 cm — also 1,5 m — in echt.",
               "3 cm × 50 = 150 cm = 1,5 m"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Zimmer, das 5 m lang ist, ist auf einem Grundriss im Maßstab 1:50 dann 10 cm lang.",
               "500 cm ÷ 50 = 10 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge auf dem Plan durch die echte Länge. 2 cm zu 1 m — das ist 1:50.",
               "2 cm : 100 cm = 1 : 50"),
    ),
    100: dict(
        one_cm="1 m", ten_cm="10 m",
        use_line="Für Baupläne und Grundrisse.", use_short="Baupläne, Grundrisse",
        map_label="BAUPLAN",
        example="Ein Beispiel: Eine Wand ist auf dem Grundriss 5 cm lang — in echt sind das 5 m (5 × 100 = 500 cm).",
        wofuer=("1:100 ist der Maßstab, in dem die meisten Häuser geplant werden. Ein Haus von 10 m × 8 m ist auf dem Plan 10 cm × 8 cm groß — das passt auf ein A4-Blatt, und man sieht trotzdem jedes Zimmer. Bauanträge enthalten fast immer Grundrisse in 1:100, weil das Bauamt damit arbeiten kann, ohne dass der Plan riesig wird. Eine Wand von 5 m ist auf dem Plan 5 cm lang, ein Fenster von 1,20 m nur 1,2 cm. Wer ein Haus kauft oder baut, bekommt die Pläne in 1:100 — und wer sie liest, muss nur die Zentimeter mal 100 nehmen, um die echten Meter zu bekommen."),
        tipp="Tipp: 1:100 ist der leichteste Maßstab zum Rechnen: 1 cm auf dem Plan ist genau 1 m in echt. Ein Zimmer, das auf dem Plan 4 cm breit ist, ist in echt 4 m breit — du musst gar nichts rechnen, nur die Einheit wechseln. Der häufigste Fehler ist, 1:100 mit 1:10 zu verwechseln: Bei 1:10 ist 1 cm nur 10 cm in echt, also zehnmal weniger.",
        step1=("Nimm die Länge auf dem Plan mal die Maßstabszahl. Bei 1:100 werden aus 3 cm auf dem Plan 300 cm — also 3 m — in echt.",
               "3 cm × 100 = 300 cm = 3 m"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Zimmer, das 5 m lang ist, ist auf einem Grundriss im Maßstab 1:100 dann 5 cm lang.",
               "500 cm ÷ 100 = 5 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge auf dem Plan durch die echte Länge. 1 cm zu 1 m — das ist 1:100.",
               "1 cm : 100 cm = 1 : 100"),
    ),
    200: dict(
        one_cm="2 m", ten_cm="20 m",
        use_line="Für Lagepläne.", use_short="Lagepläne",
        map_label="LAGEPLAN",
        example="Ein Beispiel: Ein Lageplan ist 10 cm lang — in echt sind das 20 m (10 × 200 = 2.000 cm).",
        wofuer=("1:200 ist der Maßstab für große Gebäude und Grundstücke. Ein Grundstück von 20 m × 15 m ist auf dem Plan 10 cm × 7,5 cm groß — das passt auf ein A4-Blatt, und man sieht das ganze Grundstück mit Haus, Garten und Zufahrt auf einmal. Architekten nutzen 1:200 auch für die ersten Entwürfe: Wenn ein Haus noch nicht fest geplant ist, zeichnet man es erst einmal grob in 1:200, bevor man die Details in 1:100 oder 1:50 ausarbeitet. Ein Haus von 12 m Länge ist auf dem Plan 6 cm lang, ein Garten von 10 m Tiefe nur 5 cm. Ein Lageplan für den Bauantrag ist dagegen meist 1:500 oder 1:1000 — je nachdem, wie groß das Grundstück ist."),
        tipp="Tipp: Bei 1:200 ist 1 cm auf dem Plan genau 2 m in echt. Das ist praktisch, wenn du einen Plan schnell prüfen willst: 5 cm sind 10 m, 25 cm sind 50 m. Und wenn du einen Plan in 1:100 hast und ihn auf 1:200 verkleinern willst, druckst du ihn mit 50 Prozent — dann ist alles halb so groß.",
        step1=("Nimm die Länge auf dem Plan mal die Maßstabszahl. Bei 1:200 werden aus 3 cm auf dem Plan 600 cm — also 6 m — in echt.",
               "3 cm × 200 = 600 cm = 6 m"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Grundstück, das 10 m lang ist, ist auf einem Lageplan im Maßstab 1:200 dann 5 cm lang.",
               "1.000 cm ÷ 200 = 5 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge auf dem Plan durch die echte Länge. 1 cm zu 2 m — das ist 1:200.",
               "1 cm : 200 cm = 1 : 200"),
    ),
    250: dict(
        one_cm="2,5 m", ten_cm="25 m",
        use_line="Für Grundstücke und Lagepläne.", use_short="Grundstücke",
        map_label="LAGEPLAN",
        example="Ein Beispiel: Ein Grundstück ist auf dem Plan 12 cm lang — in echt sind das 30 m (12 × 250 = 3.000 cm).",
        wofuer=("1:250 ist der Maßstab für Grundstücke, die etwas größer sind als der Durchschnitt. Ein Grundstück von 25 m × 20 m ist auf dem Plan 10 cm × 8 cm groß — genau wie ein Grundstück von 20 m × 15 m in 1:200, nur dass bei 1:250 noch ein Stück mehr draufpasst. Darum nutzen Vermesser und Architekten 1:250 für Lagepläne von Grundstücken, bei denen 1:200 schon zu groß und 1:500 schon zu klein wäre. Ein Haus von 15 m Länge ist auf dem Plan 6 cm lang, ein Weg von 5 m Breite nur 2 cm. Wer ein Grundstück kauft, findet den Lageplan oft in 1:250 oder 1:500 — der Maßstab steht immer unten auf dem Blatt."),
        tipp="Tipp: 1:250 und 1:200 werden oft verwechselt, weil sie nah beieinander liegen. Der Unterschied ist ein Viertel: 10 cm auf dem Plan sind bei 1:250 genau 25 m in echt, bei 1:200 nur 20 m. Wenn du zwei Pläne vergleichst, schau zuerst auf den Maßstab — ein Haus, das auf beiden Plänen gleich groß aussieht, ist in echt fünf Meter länger oder kürzer.",
        step1=("Nimm die Länge auf dem Plan mal die Maßstabszahl. Bei 1:250 werden aus 3 cm auf dem Plan 750 cm — also 7,5 m — in echt.",
               "3 cm × 250 = 750 cm = 7,5 m"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Grundstück, das 10 m lang ist, ist auf einem Lageplan im Maßstab 1:250 dann 4 cm lang.",
               "1.000 cm ÷ 250 = 4 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge auf dem Plan durch die echte Länge. 1 cm zu 2,5 m — das ist 1:250.",
               "1 cm : 250 cm = 1 : 250"),
    ),
    500: dict(
        one_cm="5 m", ten_cm="50 m",
        use_line="Für Bebauungspläne.", use_short="Bebauungspläne",
        map_label="BEBAUUNGSPLAN",
        example="Ein Beispiel: Ein Bebauungsplan ist 4 cm lang — in echt sind das 20 m (4 × 500 = 2.000 cm).",
        wofuer=("1:500 ist der Maßstab der Bebauungspläne — zumindest dort, wo es eng wird. Ein Bebauungsplan wird in der Regel in 1:1000 gezeichnet, aber in dicht bebauten Gebieten oder bei schwierigen Festsetzungen nehmen die Planer 1:500, damit man die einzelnen Grundstücke noch erkennen kann. Ein Haus von 20 m Länge ist auf dem Plan 4 cm lang, eine Straße von 10 m Breite nur 2 cm. Auf einem A3-Blatt passt in 1:500 ein Gebiet von etwa 150 m × 210 m — ein ganzes Baugebiet mit mehreren Straßen und Dutzenden Grundstücken. Wer wissen will, was auf seinem Grundstück gebaut werden darf, schaut in den Bebauungsplan — der liegt im Rathaus oder online aus."),
        tipp="Tipp: Ein Bebauungsplan ist kein Lageplan — er ist ein Gesetz. Er legt fest, was auf einem Grundstück gebaut werden darf: wie hoch, wie groß, wo genau. Die Linien auf dem Plan sind verbindlich, und wer dagegen baut, riskiert den Abriss. Wenn du einen Bebauungsplan liest, such zuerst die Baugrenze: Alles, was du bauen willst, muss innerhalb dieser Linie liegen.",
        step1=("Nimm die Länge auf dem Plan mal die Maßstabszahl. Bei 1:500 werden aus 3 cm auf dem Plan 1.500 cm — also 15 m — in echt.",
               "3 cm × 500 = 1.500 cm = 15 m"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Haus, das 20 m lang ist, ist auf einem Bebauungsplan im Maßstab 1:500 dann 4 cm lang.",
               "2.000 cm ÷ 500 = 4 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge auf dem Plan durch die echte Länge. 1 cm zu 5 m — das ist 1:500.",
               "1 cm : 500 cm = 1 : 500"),
    ),
    1000: dict(
        one_cm="10 m", ten_cm="100 m",
        use_line="Für Stadtpläne und Karten.", use_short="Stadtpläne, Karten",
        map_label="STADTPLAN",
        example="Ein Beispiel: Eine Straße ist auf dem Stadtplan 7 cm lang — in echt sind das 70 m (7 × 1.000 = 7.000 cm).",
        wofuer=("1:1000 ist der Maßstab der Bebauungspläne und der Stadtpläne. Ein Bebauungsplan wird in der Regel in 1:1000 gezeichnet, und die Planunterlagen dafür sollen im Maßstab 1:1000 gefertigt werden. Ein Viertel von 100 m × 100 m ist auf dem Plan 10 cm × 10 cm groß — ein ganzer Straßenzug passt auf ein Blatt. Auch Stadtpläne und Übersichtskarten von Stadtteilen nutzen 1:1000, weil man dort noch einzelne Häuser sieht, aber schon ein ganzes Viertel überblickt. Eine Straße von 70 m Länge ist auf dem Plan 7 cm lang, ein Platz von 50 m × 50 m nur 5 cm × 5 cm."),
        tipp="Tipp: Bei 1:1000 ist 1 cm auf dem Plan genau 10 m in echt — ein Zentimeter ist etwa eine Hauslänge. Wer einen Stadtplan liest, kann Entfernungen grob schätzen, ohne zu messen: Zwei Fingerbreit auf dem Plan sind etwa 20 m, eine Handbreit etwa 100 m. Und wenn du eine Strecke genau wissen willst, miss sie in Zentimetern und häng eine Null dran — 7 cm sind 70 m.",
        step1=("Nimm die Länge auf dem Plan mal die Maßstabszahl. Bei 1:1000 werden aus 3 cm auf dem Plan 3.000 cm — also 30 m — in echt.",
               "3 cm × 1.000 = 3.000 cm = 30 m"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Eine Straße, die 50 m lang ist, ist auf einem Stadtplan im Maßstab 1:1000 dann 5 cm lang.",
               "5.000 cm ÷ 1.000 = 5 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge auf dem Plan durch die echte Länge. 1 cm zu 10 m — das ist 1:1000.",
               "1 cm : 1.000 cm = 1 : 1.000"),
    ),
    # --- Modellbau-Maßstäbe (neu, 2026-11-06) ---
    87: dict(
        one_cm="87 cm", ten_cm="8,7 m",
        use_line="Für Modelleisenbahn Spur H0.",
        use_short="Modelleisenbahn H0",
        map_label="MODELLBAHN H0",
        meta_on="im Modell",
        example="Ein Beispiel: Eine Lok ist im Modell 13,8 cm lang — in echt sind das etwa 12 m (13,8 × 87 = 1.200,6 cm).",
        wofuer="1:87 ist die Spur H0 — die beliebteste Modelleisenbahn der Welt. Der Name H0 heißt „Halb-Null“, weil die Modelle halb so groß sind wie die alte Spur 0, und die Gleise haben 16,5 mm Abstand: Das entspricht der normalen Eisenbahnspur von 1.435 mm in echt. Eine Lok wie die BR 103 ist im Original etwa 20,2 m lang und im Modell rund 23 cm — groß genug für Details, klein genug für eine Anlage im Wohnzimmer. In Europa ist H0 seit Jahrzehnten die mit Abstand meistgebaute Nenngröße, und fast jeder Hersteller baut Fahrzeuge, Gleise und Häuser in diesem Maßstab.",
        tipp="Tipp: H0 ist nicht das Gleiche wie die britische Spur 00. Beide fahren auf 16,5-mm-Gleisen, aber 00 ist 1:76 und damit etwas größer. Ein Wagen von 12 m Länge ist in 00 etwa 15,7 cm lang, in H0 nur 13,8 cm — fast zwei Zentimeter Unterschied. Wer in Deutschland kauft, bekommt fast immer echtes H0 in 1:87; wer aus Großbritannien bestellt, sollte auf die Angabe „1:76“ achten.",
        step1=("Nimm die Länge im Modell mal die Maßstabszahl. Bei 1:87 werden aus 2 cm im Modell 174 cm — also 1,74 m — in echt.",
               "2 cm × 87 = 174 cm = 1,74 m"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Wagen, der 1,74 m lang ist, ist im Maßstab 1:87 dann 2 cm lang.",
               "174 cm ÷ 87 = 2 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge im Modell durch die echte Länge. 2 cm zu 1,74 m — das ist 1:87.",
               "2 cm : 174 cm = 1 : 87"),
    ),
    24: dict(
        one_cm="24 cm", ten_cm="2,4 m",
        use_line="Für Modellautos und Puppenhäuser.",
        use_short="Modellautos",
        map_label="MODELLAUTO",
        meta_on="im Modell",
        example="Ein Beispiel: Ein Auto ist im Modell 18,75 cm lang — in echt sind das 4,5 m (18,75 × 24 = 450 cm).",
        wofuer="1:24 ist der Maßstab der Modellautos. Die großen Hersteller bauen ihre Bausätze seit Jahrzehnten in diesem Maßstab, und ein Auto von 4,5 m Länge wird dabei 18,75 cm lang — groß genug, dass sich Türen öffnen lassen und der Motor unter der Haube Platz hat. Ein VW Käfer von 4,07 m wird 17 cm lang, ein Porsche 911 mit 4,53 m knapp 19 cm. Der gleiche Maßstab gilt im Puppenhaus: Dort heißt er „Half Scale“, weil ein halber Zoll einem Fuß entspricht, und eine Figur von 1,80 m ist dort 7,5 cm groß. Wer ein Auto und ein Puppenhaus im gleichen Maßstab hat, kann die Figuren sogar tauschen.",
        tipp="Tipp: 1:24 und 1:25 sehen fast gleich aus, sind es aber nicht. Ein Auto von 4,5 m ist in 1:24 genau 18,75 cm lang, in 1:25 nur 18 cm — der Unterschied ist ein Dreiviertel-Zentimeter, und wer beide Maßstäbe in einer Vitrine mischt, sieht es sofort. Kauf Zubehör immer im gleichen Maßstab wie das Auto.",
        step1=("Nimm die Länge im Modell mal die Maßstabszahl. Bei 1:24 werden aus 3 cm im Modell 72 cm in echt.",
               "3 cm × 24 = 72 cm"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Auto, das 4,5 m lang ist, ist im Maßstab 1:24 dann 18,75 cm lang.",
               "450 cm ÷ 24 = 18,75 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge im Modell durch die echte Länge. 3 cm zu 72 cm — das ist 1:24.",
               "3 cm : 72 cm = 1 : 24"),
    ),
    35: dict(
        one_cm="35 cm", ten_cm="3,5 m",
        use_line="Für Militärmodelle und Figuren.",
        use_short="Militärmodelle",
        map_label="MILITÄRMODELL",
        meta_on="im Modell",
        example="Ein Beispiel: Ein Panzer ist im Modell 20 cm lang — in echt sind das 7 m (20 × 35 = 700 cm).",
        wofuer="1:35 ist der Maßstab der Militärmodelle — und das seit den 1960er-Jahren, als Tamiya seine ersten motorisierten Panzerbausätze in diesem Maßstab verkaufte. Seitdem ist 1:35 der Standard: Fast jeder Panzer, jedes Fahrzeug und jede Figur gibt es in 1:35, und das Zubehör passt untereinander. Ein Tiger I von 8,45 m Länge wird 24,1 cm lang, ein M1 Abrams von 9,83 m sogar 28,1 cm — groß genug für einzelne Kettenglieder, Werkzeug und Tarnnetze. Eine Soldatenfigur von 1,80 m ist 5,1 cm groß, also etwa so hoch wie ein Daumen. Wer ein Diorama baut, stellt Panzer und Figuren im gleichen Maßstab zusammen, damit die Größen stimmen.",
        tipp="Tipp: Figuren sind der schnellste Test, ob ein Modell wirklich 1:35 ist. Eine Figur von 1,80 m muss 5,1 cm groß sein — ist sie nur 2,5 cm, gehört sie zu 1:72, und ist sie 7,5 cm, ist es 1:24. Wer Figuren aus verschiedenen Bausätzen mischt, misst am besten vorher nach: Ein Zentimeter Unterschied bei der Figur sind in echt schon 35 cm.",
        step1=("Nimm die Länge im Modell mal die Maßstabszahl. Bei 1:35 werden aus 3 cm im Modell 105 cm in echt.",
               "3 cm × 35 = 105 cm"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Panzer, der 7 m lang ist, ist im Maßstab 1:35 dann 20 cm lang.",
               "700 cm ÷ 35 = 20 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge im Modell durch die echte Länge. 3 cm zu 105 cm — das ist 1:35.",
               "3 cm : 105 cm = 1 : 35"),
    ),
    72: dict(
        one_cm="72 cm", ten_cm="7,2 m",
        use_line="Für Flugzeugmodelle.",
        use_short="Flugzeugmodelle",
        map_label="FLUGZEUGMODELL",
        meta_on="im Modell",
        example="Ein Beispiel: Ein Flugzeug ist im Modell 50 cm lang — in echt sind das 36 m (50 × 72 = 3.600 cm).",
        wofuer="1:72 ist der meistgebaute Maßstab für Flugzeugmodelle aus Plastik — weltweit. Ein Jagdflugzeug wie die Spitfire hat eine Spannweite von 11,23 m, im Modell sind das 15,6 cm, also etwa eine Handbreit. Größere Maschinen bleiben trotzdem handlich: Eine B-17 Flying Fortress wird 31,7 cm lang und hat 44 cm Spannweite, eine F-15C ist 27 cm lang. Der Maßstab stammt aus Großbritannien, wo ein Sechstel Zoll einem Fuß entsprach, und hat sich seit den 1930er-Jahren gehalten. Wer viele Flugzeuge sammelt, nimmt 1:72, weil auch große Bomber noch in die Vitrine passen.",
        tipp="Tipp: Bei Flugzeugen misst man meistens die Spannweite, nicht die Länge — und die steht selten auf der Packung. Eine Spitfire mit 15,6 cm Spannweite ist in 1:72 gebaut; misst du nur 7,8 cm, ist es 1:144, und misst du 23,4 cm, ist es 1:48. Wer zwei Modelle nebeneinander stellt, sollte immer den gleichen Maßstab nehmen, sonst wirkt das kleinere Flugzeug wie ein Spielzeug neben dem größeren.",
        step1=("Nimm die Länge im Modell mal die Maßstabszahl. Bei 1:72 werden aus 3 cm im Modell 216 cm in echt.",
               "3 cm × 72 = 216 cm"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Flugzeug, das 36 m lang ist, ist im Maßstab 1:72 dann 50 cm lang.",
               "3.600 cm ÷ 72 = 50 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge im Modell durch die echte Länge. 3 cm zu 216 cm — das ist 1:72.",
               "3 cm : 216 cm = 1 : 72"),
    ),
    # --- Karten-Maßstäbe (neu, 2026-11-06) ---
    25000: dict(
        one_cm="250 m", ten_cm="2,5 km",
        use_line="Für Wanderkarten (TK25).",
        use_short="Wanderkarten",
        map_label="WANDERKARTE",
        meta_on="auf der Karte",
        example="Ein Beispiel: Ein Wanderweg ist auf der Karte 20 cm lang — in echt sind das 5 km (20 × 25.000 = 500.000 cm).",
        wofuer="1:25.000 ist der Maßstab der Wanderkarten — die TK25 ist die detaillierteste amtliche Karte in Deutschland. Auf ihr sieht man einzelne Häuser, Feldwege und sogar kleine Bäche, weil 1 cm auf der Karte nur 250 m in der Natur sind. 4 cm auf der Karte sind genau 1 km: Wer wandert, kann die Strecke mit den Fingern abmessen und weiß sofort, wie weit es noch ist. Die Karte zeigt auch Höhenlinien, damit man sieht, ob es bergauf oder bergab geht. In Bayern stellen 237 Blätter die ganze Fläche dar, und ein Blatt deckt etwa 21 km × 22 km ab — genug für eine Tageswanderung mit allem drumherum.",
        tipp="Tipp: Die TK25 ist detaillierter als die TK50, obwohl die Zahl kleiner ist — genau andersherum, als man denkt. Kleine Zahl hinter dem Doppelpunkt heißt: großes Bild, viele Details. Wer nur grob wissen will, wo es langgeht, nimmt die TK50; wer jeden Weg und jede Abzweigung sehen will, nimmt die TK25. Und ein Blatt der TK50 deckt genau vier Blätter der TK25 ab.",
        step1=("Nimm die Länge auf der Karte mal die Maßstabszahl. Bei 1:25.000 werden aus 3 cm auf der Karte 750 m in echt.",
               "3 cm × 25.000 = 75.000 cm = 750 m"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Weg, der 5 km lang ist, ist auf einer Wanderkarte im Maßstab 1:25.000 dann 20 cm lang.",
               "500.000 cm ÷ 25.000 = 20 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge auf der Karte durch die echte Länge. 3 cm zu 750 m — das ist 1:25000.",
               "3 cm : 75.000 cm = 1 : 25.000"),
    ),
    50000: dict(
        one_cm="500 m", ten_cm="5 km",
        use_line="Für Radkarten (TK50).",
        use_short="Radkarten TK50",
        map_label="RADKARTE",
        meta_on="auf der Karte",
        example="Ein Beispiel: Eine Strecke ist auf der Karte 20 cm lang — in echt sind das 10 km (20 × 50.000 = 1.000.000 cm).",
        wofuer="1:50.000 ist der Maßstab fürs Radfahren und für längere Wanderungen — die TK50 ist die Karte, die man nimmt, wenn die TK25 zu klein wird. 1 cm auf der Karte sind 500 m in der Natur, und 2 cm sind genau 1 km: Eine Radtour von 40 km ist auf der Karte 80 cm lang und passt damit auf zwei Blätter nebeneinander. Die TK50 zeigt die Landschaft etwas vereinfacht, dafür sieht man ein viel größeres Gebiet auf einmal — ein Blatt deckt vier Blätter der TK25 ab, in Niedersachsen etwa 22 km × 22 km. Wer eine Tagestour mit dem Rad plant, kommt mit der TK50 am weitesten.",
        tipp="Tipp: Auf der TK50 ist 1 cm² auf der Karte genau 25 Hektar in der Natur — ein Viertel Quadratkilometer. Wer wissen will, wie groß ein Wald oder ein See ist, misst die Fläche auf der Karte in Quadratzentimetern und nimmt sie mal 25: Das Ergebnis ist die Fläche in Hektar. Und wenn du die TK25 gewohnt bist, denk dran: Bei der TK50 ist alles nur halb so groß auf dem Papier, dafür siehst du viermal so viel Land.",
        step1=("Nimm die Länge auf der Karte mal die Maßstabszahl. Bei 1:50.000 werden aus 3 cm auf der Karte 1,5 km in echt.",
               "3 cm × 50.000 = 150.000 cm = 1,5 km"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Eine Strecke, die 10 km lang ist, ist auf einer Radkarte im Maßstab 1:50.000 dann 20 cm lang.",
               "1.000.000 cm ÷ 50.000 = 20 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge auf der Karte durch die echte Länge. 3 cm zu 1,5 km — das ist 1:50000.",
               "3 cm : 150.000 cm = 1 : 50.000"),
    ),
}

# FAQ answers shared by all scale pages (from the template, unchanged).
# "Beispiel aus der Praxis" — ein echter Gegenstand im Maßstab, gezeichnet als
# reines CSS-Rechteck (kein Bild). diag_on: wo der Gegenstand liegt.
# diag_w: Breite des Rechtecks in % der Diagramm-Fläche; diag_ar: Seitenverhältnis.
DIAGRAM = {
    10:    dict(name="Stuhl", real="45 cm × 90 cm", draw="4,5 cm × 9 cm", on="auf dem Plan",
                w=30, ar="1 / 2",
                intro="Ein Stuhl von 45 cm × 90 cm ist im Maßstab 1:10 nur 4,5 cm × 9 cm groß auf dem Plan."),
    20:    dict(name="Treppe", real="3 m × 1 m", draw="15 cm × 5 cm", on="auf dem Plan",
                w=70, ar="3 / 1",
                intro="Eine Treppe von 3 m × 1 m ist im Maßstab 1:20 nur 15 cm × 5 cm groß auf dem Plan."),
    24:    dict(name="Auto", real="4,5 m × 1,8 m", draw="18,75 cm × 7,5 cm", on="im Modell",
                w=70, ar="5 / 2",
                intro="Ein Auto von 4,5 m × 1,8 m ist im Maßstab 1:24 nur 18,75 cm × 7,5 cm groß im Modell."),
    25:    dict(name="Zimmer", real="4 m × 3 m", draw="16 cm × 12 cm", on="auf dem Plan",
                w=55, ar="4 / 3",
                intro="Ein Zimmer von 4 m × 3 m ist im Maßstab 1:25 nur 16 cm × 12 cm groß auf dem Plan."),
    35:    dict(name="Panzer", real="7 m × 3,5 m", draw="20 cm × 10 cm", on="im Modell",
                w=65, ar="2 / 1",
                intro="Ein Panzer von 7 m × 3,5 m ist im Maßstab 1:35 nur 20 cm × 10 cm groß im Modell."),
    50:    dict(name="Wohnzimmer", real="5 m × 4 m", draw="10 cm × 8 cm", on="auf dem Plan",
                w=55, ar="5 / 4",
                intro="Ein Wohnzimmer von 5 m × 4 m ist im Maßstab 1:50 nur 10 cm × 8 cm groß auf dem Plan."),
    72:    dict(name="Flugzeug", real="36 m × 8 m", draw="50 cm × 11,1 cm", on="im Modell",
                w=80, ar="9 / 2",
                intro="Ein Flugzeug von 36 m × 8 m ist im Maßstab 1:72 nur 50 cm × 11,1 cm groß im Modell."),
    87:    dict(name="Modellhaus", real="8,7 m × 4,35 m", draw="10 cm × 5 cm", on="im Modell",
                w=65, ar="2 / 1",
                intro="Ein Modellhaus von 8,7 m × 4,35 m ist im Maßstab 1:87 nur 10 cm × 5 cm groß im Modell."),
    100:   dict(name="Haus", real="10 m × 8 m", draw="10 cm × 8 cm", on="auf dem Plan",
                w=55, ar="5 / 4",
                intro="Ein Haus von 10 m × 8 m ist im Maßstab 1:100 nur 10 cm × 8 cm groß auf dem Plan."),
    200:   dict(name="Grundstück", real="20 m × 15 m", draw="10 cm × 7,5 cm", on="auf dem Plan",
                w=55, ar="4 / 3",
                intro="Ein Grundstück von 20 m × 15 m ist im Maßstab 1:200 nur 10 cm × 7,5 cm groß auf dem Plan."),
    250:   dict(name="Grundstück", real="25 m × 20 m", draw="10 cm × 8 cm", on="auf dem Plan",
                w=55, ar="5 / 4",
                intro="Ein Grundstück von 25 m × 20 m ist im Maßstab 1:250 nur 10 cm × 8 cm groß auf dem Plan."),
    500:   dict(name="Haus", real="20 m × 15 m", draw="4 cm × 3 cm", on="auf dem Plan",
                w=55, ar="4 / 3",
                intro="Ein Haus von 20 m × 15 m ist im Maßstab 1:500 nur 4 cm × 3 cm groß auf dem Plan."),
    1000:  dict(name="Straße", real="100 m × 20 m", draw="10 cm × 2 cm", on="auf dem Plan",
                w=80, ar="5 / 1",
                intro="Eine Straße von 100 m × 20 m ist im Maßstab 1:1000 nur 10 cm × 2 cm groß auf dem Plan."),
    25000: dict(name="Kartenausschnitt", real="5 km × 4 km", draw="20 cm × 16 cm", on="auf der Karte",
                w=55, ar="5 / 4",
                intro="Ein Kartenausschnitt von 5 km × 4 km ist im Maßstab 1:25.000 nur 20 cm × 16 cm groß auf der Karte."),
    50000: dict(name="Region", real="10 km × 8 km", draw="20 cm × 16 cm", on="auf der Karte",
                w=55, ar="5 / 4",
                intro="Eine Region von 10 km × 8 km ist im Maßstab 1:50.000 nur 20 cm × 16 cm groß auf der Karte."),
}

# Vergleichstabelle: Nachbar-Maßstäbe je Seite (kleinere Zahl, größere Zahl).
NEIGHBOURS = {
    10: (20, 25), 20: (10, 25), 24: (20, 25), 25: (20, 50), 35: (25, 50),
    50: (25, 100), 72: (50, 100), 87: (72, 100), 100: (50, 200),
    200: (100, 250), 250: (200, 500), 500: (250, 1000), 1000: (500, 2000),
    25000: (10000, 50000), 50000: (25000, 100000),
}

# Maßstäbe ohne eigene Seite (nur für die Vergleichstabelle): 1 cm in echt + Wofür.
# Sie verlinken auf den Hauptrechner, nie auf eine tote Seite.
EXTRA_SCALES = {
    2000: ("20 m", "Stadtpläne"),
    10000: ("100 m", "Wanderkarten"),
    100000: ("1 km", "Autokarten"),
}

FAQ_KEEP = [
    ("Was ist der Unterschied zwischen großem und kleinem Maßstab?",
     "Kleine Zahl hinter dem Doppelpunkt, zum Beispiel 1:10.000: Du siehst ein kleines Stück Land, aber ganz genau. Große Zahl, zum Beispiel 1:1.000.000: Du siehst ein riesiges Stück Land, aber nur grob."),
    ("Kann ich verschiedene Einheiten verwenden?",
     "Ja, klar. Schreib die Länge auf dem Plan in cm und die echte Länge in m — oder andersrum. Der Rechner rechnet es passend um."),
    ("Ist der Maßstabsrechner kostenlos?",
     "Ja. Der Rechner ist kostenlos und du brauchst keine Anmeldung — rechne so oft du willst, auf dem Handy genauso wie am Computer."),
    ("Funktioniert der Rechner auch auf dem Handy?",
     "Ja. Die Seite passt sich deinem Bildschirm an — Handy, Tablet oder Computer, alles geht. Du musst nichts installieren."),
]


# More-tools grid for the generated scale pages: every tool that is live NOW
# as a live link (hrefs relative to a scale page, one level deeper than the
# template). Tools still "Bald da" are NOT listed here — when one goes live,
# add its card here and re-run; the grid below replaces the template's grid
# wholesale, so the template's own card set never leaks stale "Bald da"
# entries into the scale pages.
MORE_TOOLS = [
    ("🗺", "Maßstabsrechner", "Karten, Grundrisse, Modellbau: echte Länge und Plan-Länge umrechnen.", "../"),
    ("🎂", "Altersrechner", "Wie alt bist du in Jahren, Monaten und Tagen? Mit Geburtstag-Countdown.", "../../altersrechner/"),
    ("🚂", "Modellbau-Maßstab", "H0, Spur N, 1:72: echte Länge in Modell-Länge umrechnen.", "../modellbau/"),
    ("%", "Prozentrechner", "Prozentwert, Rabatt oder Erhöhung — in Sekunden.", "../../prozentrechner/"),
    ("⚖", "BMI-Rechner", "Body-Mass-Index ausrechnen und einordnen.", "../../bmi-rechner/"),
    ("📅", "Tage-Rechner", "Tage zwischen zwei Daten zählen — mit Wochen, Arbeitstagen und Wochentag.", "../../tage-rechner/"),
    ("🕐", "Stunden-Rechner", "Arbeitszeit und Stunden zwischen zwei Uhrzeiten — mit Pause und Nachtschicht.", "../../stunden-rechner/"),
    ("🏠", "Indexmiete-Rechner", "Neue Nettokaltmiete aus dem Verbraucherpreisindex — mit Rechenweg und Fristen.", "../../indexmiete-rechner/"),
    ("🧱", "Quadratmeter-Rechner", "Fläche von Zimmern und Grundstücken — mit Verschnitt und Kosten.", "../../quadratmeter-rechner/"),
    ("🌙", "Schlafzyklus-Rechner", "Besser aufwachen: Schlafenszeit in 90-Minuten-Schritten planen.", "../../schlafzyklus-rechner/"),
    ("🧾", "Bürgergeld-Rechner", "Regelbedarf, Miete und Einkommen — schätze deinen Anspruch.", "../../buergergeld-rechner/"),
    ("🏛️", "Grundsteuer-Rechner", "Grundsteuer im Jahr aus Grundsteuerwert, Messzahl und Hebesatz — mit Rechenweg.", "../../grundsteuer-rechner/"),
    ("💳", "Kreditrechner", "Monatsrate, Zinsen und Gesamtkosten — mit Tilgungsplan.", "../../kreditrechner/"),
    ("💶", "Brutto-Netto-Rechner", "Was bleibt vom Gehalt übrig? Steuern und Abgaben grob ausrechnen.", "../../brutto-netto-rechner/"),
]


def fmt_de(n):
    """Mimic Intl.NumberFormat('de-DE', {maximumSignificantDigits: 8})."""
    if n == 0:
        return "0"
    s = format(float(n), ".8g")
    if "e" in s or "E" in s:
        s = format(Decimal(s), "f")
    if "." in s:
        ip, dp = s.split(".")
    else:
        ip, dp = s, ""
    ip = f"{int(ip):,}".replace(",", ".")
    return ip + ("," + dp if dp else "")


def fmt_real(real_cm):
    """Same logic as app.js formatRealLength: >=100000 cm -> km, >=100 cm -> m."""
    if real_cm >= 100000:
        return f"{fmt_de(real_cm / 100000)} km"
    if real_cm >= 100:
        return f"{fmt_de(real_cm / 100)} m"
    return f"{fmt_de(real_cm)} cm"


def cm_raw(cm):
    return "%g" % cm


def rep(text, old, new, count=1):
    """Replace `old` with `new`, asserting it occurs exactly `count` times."""
    found = text.count(old)
    assert found == count, f"expected {count}x {old[:70]!r}, found {found}x"
    return text.replace(old, new, count)


def esc(s):
    return htmlmod.escape(s, quote=True)


def build_page(scale):
    d = DATA[scale]
    label = f"1:{scale}"            # keyword form, e.g. 1:1000
    label_de = "1:" + fmt_de(scale)  # de-DE form, e.g. 1:1.000 (what the JS renders)
    slug = f"1-zu-{scale}"
    canon = f"https://massklar-rechner.de/massstabsrechner/{slug}/"

    title = f"Maßstabsrechner {label} – 1 zu {scale} berechnen | maßklar"
    meta = (f"Maßstab {label} berechnen und umrechnen: 1 cm {d.get('meta_on', 'auf dem Plan')} sind "
            f"{d['one_cm']} in echt. Kostenloser Maßstabsrechner für {d['use_short']} "
            f"— zwei Zahlen eintippen, fertig.")
    assert len(title) <= 60, f"title length {len(title)} for 1:{scale}: {title!r}"
    assert 130 <= len(meta) <= 160, f"meta length {len(meta)} for 1:{scale}: {meta!r}"
    four_real = fmt_real(4 * scale)   # what 4 cm on the plan are in real life
    bar_real = fmt_real(2 * scale)    # what the 2 cm scale bar stands for
    # GEO: the paragraph under the title gives the direct, fact-checked answer.
    on = d.get("meta_on", "auf dem Plan")
    hero = (f"Bei {label} ist 1 cm {on} {d['one_cm']} in echt. "
            f"4 cm {on} sind {four_real} in echt.")

    # Static result defaults — must equal what app.js computes on load
    # (drawing 4 cm, scale S, real unit km, target "real").
    value = f"{fmt_de(0.04 * scale / 1000)} km"
    context = f"4 cm auf der Karte sind bei {label_de} in echt {value} lang."
    also = (f"Das sind auch: {fmt_de(40 * scale)} mm · {fmt_de(4 * scale)} cm · "
            f"{fmt_de(0.04 * scale)} m")
    formula = f"4 cm × {fmt_de(scale)} = {fmt_de(4 * scale)} cm"

    # FAQ 1 & 2 rewritten for this scale.
    faq1_q = f"Was bedeutet ein Maßstab von {label}?"
    faq1_a = (f"1 cm auf dem Plan sind {fmt_de(scale)} cm in echt"
              + (f" — also {d['one_cm']}." if scale >= 100 else ".")
              + f" Stell dir vor: Alles auf dem Papier ist {fmt_de(scale)}-mal kleiner als in echt.")
    faq2_q = f"Wie rechne ich {label} auf einer Karte um?"
    if 4 * scale >= 100:
        verb = "ist" if four_real in ("1 m", "1 km") else "sind"
        faq2_a = (f"Nimm die Strecke auf der Karte mal {fmt_de(scale)}. "
                  f"4 cm auf der Karte sind {fmt_de(4 * scale)} cm — das {verb} {four_real} in echt. "
                  f"Der Rechner macht das für dich.")
    else:
        faq2_a = (f"Nimm die Strecke auf der Karte mal {fmt_de(scale)}. "
                  f"4 cm auf der Karte sind {fmt_de(4 * scale)} cm in echt. "
                  f"Der Rechner macht das für dich.")
    faqs = [(faq1_q, faq1_a), (faq2_q, faq2_a)] + FAQ_KEEP

    html = TEMPLATE_HTML.read_text(encoding="utf-8")
    # JSON-LD: the template's injected blocks (FAQPage 14, HowTo, BreadcrumbList)
    # describe the MAIN tool page, not this scale page — strip them all; the
    # per-scale blocks are rebuilt fresh at the end of build_page.
    html = re.sub(r'    <script type="application/ld\+json">.*?</script>\n', '', html, flags=re.DOTALL)
    assert 'application/ld+json' not in html, "JSON-LD strip failed"
    css_version = re.search(r'href="\.\./styles\.min\.css\?v=(\d+)"', html).group(1)

    # --- head: title / meta / canonical / og / JSON-LD ---
    html = rep(html, "<title>Maßstabsrechner – Maßstab online berechnen | maßklar</title>",
               f"<title>{esc(title)}</title>")
    html = rep(html, '<meta name="description" content="Kostenloser Maßstabsrechner: Maßstab berechnen und umrechnen für Karten, Grundrisse und Baupläne. Zwei Zahlen eintippen, fertig — ohne Anmeldung.">',
               f'<meta name="description" content="{esc(meta)}">')
    html = rep(html, '<link rel="canonical" href="https://massklar-rechner.de/massstabsrechner/">',
               f'<link rel="canonical" href="{canon}">')
    html = rep(html, '<meta property="og:title" content="Maßstabsrechner – Maßstab online berechnen | maßklar">',
               f'<meta property="og:title" content="{esc(title)}">')
    html = rep(html, '<meta property="og:description" content="Kostenloser Maßstabsrechner: Maßstab berechnen und umrechnen für Karten, Grundrisse und Baupläne. Zwei Zahlen eintippen, fertig — ohne Anmeldung.">',
               f'<meta property="og:description" content="{esc(meta)}">')
    html = rep(html, '<meta property="og:url" content="https://massklar-rechner.de/massstabsrechner/">',
               f'<meta property="og:url" content="{canon}">')
    html = rep(html, '<meta name="twitter:title" content="Maßstabsrechner – Maßstab online berechnen | maßklar">',
               f'<meta name="twitter:title" content="{esc(title)}">')
    html = rep(html, '<meta name="twitter:description" content="Kostenloser Maßstabsrechner: Maßstab berechnen und umrechnen für Karten, Grundrisse und Baupläne. Zwei Zahlen eintippen, fertig — ohne Anmeldung.">',
               f'<meta name="twitter:description" content="{esc(meta)}">')
    # og:image, og:site_name, twitter:card and twitter:image are identical on
    # every scale page (absolute URL / site name / summary_large_image), so
    # they ride along from the template unchanged — no rep needed.
    html = rep(html, f'<link rel="stylesheet" href="../styles.min.css?v={css_version}">',
               f'<link rel="stylesheet" href="../../styles.min.css?v={css_version}">')
    # Cookie-Banner (2026-11-27): Skript und Datenschutz-Link im Banner
    # eine Ebene tiefer — wie der Stylesheet-Link oben.
    html = rep(html, '<script src="../assets/cookie-consent.min.js?v=3" defer></script>',
               '<script src="../../assets/cookie-consent.min.js?v=3" defer></script>')
    # WebMCP-Tool (2026-11-27): gleiches Muster wie der Cookie-Skript.
    html = rep(html, '<script src="../assets/webmcp.min.js?v=2" defer></script>',
               '<script src="../../assets/webmcp.min.js?v=2" defer></script>')
    html = rep(html, '<a class="cookie-banner-link" href="../datenschutz.html">',
               '<a class="cookie-banner-link" href="../../datenschutz.html">')
    # Font preloads are one level deeper on scale pages (template uses ../fonts/).
    html = rep(html, '<link rel="preload" href="../fonts/bitter-latin.woff2" as="font" type="font/woff2" crossorigin>',
               '<link rel="preload" href="../../fonts/bitter-latin.woff2" as="font" type="font/woff2" crossorigin>')
    html = rep(html, '<link rel="preload" href="../fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossorigin>',
               '<link rel="preload" href="../../fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossorigin>')
    # Logo + favicon assets are one level deeper on scale pages too.
    # Header logo only (width=30 — the footer logo is width=26 and is
    # handled by the footer-block rewrite below; replacing both here
    # would double-prefix the footer one).
    html = rep(html, '<img class="brand-img" src="../assets/logo-mark.svg" width="30" height="30" alt="">',
               '<img class="brand-img" src="../../assets/logo-mark.svg" width="30" height="30" alt="">')
    html = rep(html, '<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">',
               '<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">')
    # (FAQPage + BreadcrumbList + HowTo are rebuilt fresh per scale at the
    # end of build_page — the template's blocks were stripped above.)

    # --- nav / footer links: one level deeper ---
    html = rep(html, '<a class="brand" href="../" aria-label="Maßklar Startseite">',
               '<a class="brand" href="../../" aria-label="Maßklar Startseite">')
    # --- footer: the whole block goes one level deeper (every href/src
    # prefix ../ -> ../../). This replaces the old single-link footer rep:
    # the footer now has many links, so the block is rewritten at once.
    # It runs AFTER the logo rep above (count=1: header logo only),
    # so the footer logo's ../ is still untouched when this runs.
    _fm = re.search(r'    <footer class="site-footer">.*?</footer>', html, flags=re.DOTALL)
    assert _fm, "footer block not found"
    _block = _fm.group(0).replace('href="../', 'href="../../').replace('src="../', 'src="../../')
    html = html[:_fm.start()] + _block + html[_fm.end():]
    # Header nav: Ratgeber + Kontakt links, one level deeper too.
    html = rep(html, '<a href="../ratgeber/">Ratgeber</a>',
               '<a href="../../ratgeber/">Ratgeber</a>')
    html = rep(html, '<a href="../ueber-massklar.html">Was ist maßklar?</a>',
               '<a href="../../ueber-massklar.html">Was ist maßklar?</a>')
    # Header CTA (Kontakt button): one level deeper too.
    html = rep(html, '<a class="header-cta" href="../kontakt.html">Kontakt</a>',
               '<a class="header-cta" href="../../kontakt.html">Kontakt</a>')
    html = rep(html, '<a href="../">Alle Rechner</a>', '<a href="../../">Alle Rechner</a>')
    # --- more-tools grid: rebuild it from MORE_TOOLS (all live tools as live
    # links). The template's own grid is stale for scale pages — it once listed
    # Prozent/BMI as "Bald da" and lacks Tage/Stunden — so it is replaced
    # wholesale instead of patching individual hrefs.
    grid = ('        <div class="tool-grid">\n' + "\n".join(
        f'          <a class="tool-card" href="{href}"><span class="tool-icon" aria-hidden="true">{icon}</span><span class="tool-text"><span class="tool-title">{esc(title)}</span><span class="tool-desc">{esc(desc)}</span></span><span class="tool-arrow" aria-hidden="true">↗</span></a>'
        for icon, title, desc, href in MORE_TOOLS) + '\n        </div>')
    html, n = re.subn(r'        <div class="tool-grid">.*?</div>',
                      grid.replace("\\", "\\\\"), html, count=1, flags=re.DOTALL)
    assert n == 1, "more-tools grid not replaced"
    assert "tool-card--soon" not in html and "Bald da" not in html, "stale Bald da survived grid replacement"
    for _, _, _, href in MORE_TOOLS:
        assert f'href="{href}"' in html, f"more-tools link missing: {href}"
    html = rep(html, '<p class="more-tools-link"><a href="../">Alle Rechner ansehen',
               '<p class="more-tools-link"><a href="../../">Alle Rechner ansehen')
    # Ratgeber text-links in more-tools: one level deeper on scale pages.
    html = rep(html, '<a href="../ratgeber/was-ist-ein-massstab/">',
               '<a href="../../ratgeber/was-ist-ein-massstab/">')
    html = rep(html, '<a href="../ratgeber/massstab-berechnen/">',
               '<a href="../../ratgeber/massstab-berechnen/">')

    # --- hero ---
    html = rep(html, "<h1>Maßstabsrechner.<br><span>Für Karten, Grundrisse und Modelle.</span></h1>",
               f"<h1>Maßstab {label}.<br><span>{d['use_line']}</span></h1>")
    html = rep(html, '<p class="hero-description">Ein Maßstab sagt, wie viel kleiner etwas gezeichnet ist als in echt. Bei 1:25.000 ist 1 cm auf der Karte 250 m in echt. Echte Länge = Plan-Länge × Maßstabszahl.</p>',
               f'<p class="hero-description">{hero}</p>')
    html = rep(html, "<span>STADTPLAN · 1:25.000</span>",
               f"<span>{d['map_label']} · {label_de}</span>")
    html = rep(html, '<div class="map-scale"><span>0</span><span class="scale-line"></span><span>500 m</span></div>',
               f'<div class="map-scale"><span>0</span><span class="scale-line"></span><span>{bar_real}</span></div>')
    html = rep(html, "<span><strong>1 km</strong><small>in echt</small></span>",
               f"<span><strong>{four_real}</strong><small>in echt</small></span>")

    # --- calculator defaults + static result ---
    html = rep(html, 'id="scale-denominator" name="scale" type="number" min="0" step="any" value="25000"',
               f'id="scale-denominator" name="scale" type="number" min="0" step="any" value="{scale}"')
    html = rep(html, '<div class="result-value" id="result-value">1 km</div>',
               f'<div class="result-value" id="result-value">{value}</div>')
    html = rep(html, '<p class="result-context" id="result-context">4 cm auf der Karte sind bei 1:25.000 in echt 1 km lang.</p>',
               f'<p class="result-context" id="result-context">{context}</p>')
    html = rep(html, '<p class="result-also" id="result-also">Das sind auch: 1.000.000 mm · 100.000 cm · 1.000 m</p>',
               f'<p class="result-also" id="result-also">{also}</p>')
    html = rep(html, '<span id="result-formula">4 cm × 25.000 = 100.000 cm</span>',
               f'<span id="result-formula">{formula}</span>')
    html = rep(html, '<noscript><p class="form-error">Diese Seite braucht JavaScript zum Rechnen. Ein Beispiel: 4 cm auf der Karte sind bei 1:25.000 in echt 1 km.</p></noscript>',
               f'<noscript><p class="form-error">Diese Seite braucht JavaScript zum Rechnen. Ein Beispiel: 4 cm auf der Karte sind bei {label} in echt {four_real}.</p></noscript>')

    # --- "Wofür nutzt man" section (new, after the calculator) ---
    wofuer = (f'      <section class="table-section" id="wofuer">\n'
              f'        <div class="quick-title"><span class="eyebrow">Im Alltag</span><h2>Wofür nutzt man den Maßstab {label}?</h2></div>\n'
              f'        <p class="table-intro">{d["wofuer"]}</p>\n'
              f'        <p class="table-intro">{d["tipp"]}</p>\n'
              f'      </section>\n')
    # --- "Beispiel aus der Praxis" — reines CSS-Diagramm (nach dem Rechner) ---
    dg = DIAGRAM[scale]
    diagram = (f'      <section class="table-section" id="beispiel">\n'
               f'        <div class="quick-title"><span class="eyebrow">Ein Beispiel aus der Praxis</span><h2>So sieht {label} aus.</h2></div>\n'
               f'        <p class="table-intro">{dg["intro"]}</p>\n'
               f'        <div class="diagram">\n'
               f'          <p class="diagram-size">{dg["draw"]} {dg["on"]}</p>\n'
               f'          <div class="diagram-box" style="width: {dg["w"]}%; aspect-ratio: {dg["ar"]};">'
               f'<span>{dg["name"]}</span></div>\n'
               f'          <p class="diagram-real">in echt: {dg["real"]}</p>\n'
               f'        </div>\n'
               f'      </section>\n')
    html = rep(html, '      </section>\n\n      <section class="quick-examples" id="beispiele">',
               '      </section>\n\n' + wofuer + diagram + '      <section class="quick-examples" id="beispiele">')

    # --- "Alle Maßstäbe" section -> "Andere Maßstäbe" (same list, siblings) ---
    links = []
    for s in SCALES:
        text = f"Maßstab 1:{fmt_de(s)}"
        if s == scale:
            links.append(f'<span aria-current="page">{text}</span>')
        else:
            links.append(f'<a href="../1-zu-{s}/">{text}</a>')
    # Related text-links (no cards): the guides for every scale, plus the
    # Modellbau tool + guide for the model scales (24, 35, 72, 87).
    related = ('Weiterlesen: <a href="../../ratgeber/was-ist-ein-massstab/">Was ist ein Maßstab?</a> · '
               '<a href="../../ratgeber/massstab-berechnen/">Maßstab berechnen</a>')
    if scale in (24, 35, 72, 87):
        related += (' · <a href="../modellbau/">Modellbau-Maßstab</a> · '
                    '<a href="../../ratgeber/modellgroesse-berechnen/">Modellgröße berechnen</a>')
    other = (f'      <section class="scale-links-section" id="massstaebe">\n'
             f'        <div class="section-heading"><p class="eyebrow">Alle Maßstäbe</p><h2>Andere Maßstäbe.</h2></div>\n'
             f'        <p class="table-intro">Jeder Maßstab hat seine eigene Seite — mit Rechner, Längentabelle und einem Beispiel aus der Praxis. Zurück zum <a href="../">Maßstabsrechner</a>, oder schau dir die <a href="#anleitung">Formeln und Beispiele</a> an.</p>\n'
             f'        <p class="scale-links">{" · ".join(links)}</p>\n'
             f'        <p class="scale-links">{related}</p>\n'
             f'      </section>')
    html = re.sub(r'      <section class="scale-links-section" id="massstaebe">.*?</section>',
                  other.replace("\\", "\\\\"), html, count=1, flags=re.DOTALL)
    assert 'id="massstaebe"' in html and other.split("\n")[0] in html

    # --- length table: title span + regenerate the 36 static rows ---
    html = rep(html, '<span id="length-table-scale">1:25.000</span>',
               f'<span id="length-table-scale">{label_de}</span>')
    chunks = [LENGTH_CM[i * 12:(i + 1) * 12] for i in range(3)]
    counter = {"i": 0}

    def _tbody(m):
        rows = chunks[counter["i"]]
        counter["i"] += 1
        body = "\n" + "\n".join(
            f'              <tr class="length-row" data-cm="{cm_raw(cm)}"><th scope="row">{fmt_de(cm)} cm</th><td>{fmt_real(cm * scale)}</td></tr>'
            for cm in rows) + "\n            "
        return m.group(1) + body + m.group(3)

    html, n = re.subn(r'(<table class="length-table">.*?<tbody>)(.*?)(</tbody>)',
                      _tbody, html, count=3, flags=re.DOTALL)
    assert n == 3, f"expected 3 length-table tbodys, got {n}"

    # --- guide: intro (+ worked example), steps 1-3 ---
    html = rep(html, '<p>Ein Maßstab ist ein Verhältnis: Er sagt dir, wie stark die Wirklichkeit auf dem Papier verkleinert ist — bei 1:25.000 ist 1 cm auf der Karte 250 m in echt.</p>',
               f"<p>Ein Maßstab ist ein Verhältnis: Er sagt dir, wie stark die Wirklichkeit auf dem Papier verkleinert ist — bei {label} ist 1 cm auf der Karte {d['one_cm']} in echt. {d['example']}</p>")
    step_articles = [
        ("01", "Wie lang ist es in echt?", d["step1"]),
        ("02", "Wie lang wird es auf dem Plan?", d["step2"]),
        ("03", "Welcher Maßstab ist das?", d["step3"]),
    ]
    for num, heading, (text, eq) in step_articles:
        pat = re.compile(rf'<article class="guide-step"><span class="step-number">{num}</span><div><h3>{re.escape(heading)}</h3><p>.*?</p><span class="step-equation">.*?</span></div></article>')
        new = (f'<article class="guide-step"><span class="step-number">{num}</span><div><h3>{heading}</h3>'
               f'<p>{text}</p><span class="step-equation">{eq}</span></div></article>')
        html, n = pat.subn(new.replace("\\", "\\\\"), html, count=1)
        assert n == 1, f"guide step {num} not found once (found {n})"

    # --- FAQ 1 & 2 rewritten ---
    faq1_old = ('<details><summary>Was bedeutet ein Maßstab von 1:100?</summary>'
                '<p>1 cm auf dem Plan sind 100 cm in echt — also 1 m. Stell dir vor: Alles auf dem Papier ist 100-mal kleiner als in echt.</p></details>')
    faq1_new = (f'<details><summary>{faq1_q}</summary>'
                f'<p>{faq1_a}</p></details>')
    html = rep(html, faq1_old, faq1_new)
    faq2_old = ('<details><summary>Wie rechne ich 1:25.000 auf einer Karte um?</summary>'
                '<p>Nimm die Strecke auf der Karte mal 25.000. 4 cm auf der Karte sind 100.000 cm — das sind 1.000 m, also 1 km. Der Rechner macht das für dich.</p></details>')
    faq2_new = (f'<details><summary>{faq2_q}</summary>'
                f'<p>{faq2_a}</p></details>')
    html = rep(html, faq2_old, faq2_new)

    # --- "Rechenbeispiele" + "Vergleich" (neu, nach der Anleitung) ---
    on = d.get("meta_on", "auf dem Plan")
    dir_from = {"auf dem Plan": "Vom Plan", "im Modell": "Vom Modell",
                "auf der Karte": "Von der Karte"}[on]
    dir_from_low = {"auf dem Plan": "vom Plan", "im Modell": "vom Modell",
                    "auf der Karte": "von der Karte"}[on]
    dir_to = {"auf dem Plan": "auf den Plan", "im Modell": "ins Modell",
              "auf der Karte": "auf die Karte"}[on]
    fwd_eq = f"8 cm × {fmt_de(scale)} = {fmt_de(8 * scale)} cm"
    fwd_res = fmt_real(8 * scale)
    rev_eq = f"{fmt_de(8 * scale)} cm ÷ {fmt_de(scale)} = 8 cm"
    beispiele = (f'      <section class="table-section" id="rechenbeispiele">\n'
                 f'        <div class="quick-title"><span class="eyebrow">Zwei Rechnungen</span><h2>Rechenbeispiele für {label}.</h2></div>\n'
                 f'        <p class="table-intro">Einmal {dir_from_low} in die Wirklichkeit — und einmal zurück. Die Rechnung ist immer die gleiche: mal die Maßstabszahl, oder geteilt durch sie.</p>\n'
                 f'        <div class="table-wrap">\n'
                 f'          <table class="scale-table scale-table--static">\n'
                 f'            <thead><tr><th scope="col">Richtung</th><th scope="col">Rechnung</th><th scope="col">Ergebnis</th></tr></thead>\n'
                 f'            <tbody>\n'
                 f'              <tr><th scope="row">{dir_from} in die Wirklichkeit</th><td>{fwd_eq}</td><td>{fwd_res}</td></tr>\n'
                 f'              <tr><th scope="row">Von der Wirklichkeit {dir_to}</th><td>{rev_eq}</td><td>8 cm</td></tr>\n'
                 f'            </tbody>\n'
                 f'          </table>\n'
                 f'        </div>\n'
                 f'      </section>\n')

    def _cmp_row(s):
        if s in DATA:
            one_cm, use = DATA[s]["one_cm"], DATA[s]["use_short"]
        else:
            one_cm, use = EXTRA_SCALES[s]
        if s == scale:
            return (f'              <tr><th scope="row">1:{fmt_de(s)}</th><td>{one_cm}</td>'
                    f'<td>{use}</td></tr>')
        href = f"../1-zu-{s}/" if s in SCALES else "../"
        return (f'              <tr><th scope="row"><a href="{href}">1:{fmt_de(s)}</a></th><td>{one_cm}</td>'
                f'<td>{use}</td></tr>')

    lo, hi = NEIGHBOURS[scale]
    cmp_rows = "\n".join(_cmp_row(s) for s in sorted((lo, scale, hi)))
    vergleich = (f'      <section class="table-section" id="vergleich">\n'
                 f'        <div class="quick-title"><span class="eyebrow">Im Vergleich</span><h2>{label} oder doch ein anderer Maßstab?</h2></div>\n'
                 f'        <p class="table-intro">Je kleiner die Zahl hinter dem Doppelpunkt ist, desto größer ist der Plan — und desto mehr Details siehst du. So liegt {label} zwischen seinen Nachbarn.</p>\n'
                 f'        <div class="table-wrap">\n'
                 f'          <table class="scale-table scale-table--static">\n'
                 f'            <thead><tr><th scope="col">Maßstab</th><th scope="col">1 cm {on}</th><th scope="col">Wofür?</th></tr></thead>\n'
                 f'            <tbody>\n'
                 f'{cmp_rows}\n'
                 f'            </tbody>\n'
                 f'          </table>\n'
                 f'        </div>\n'
                 f'      </section>\n')
    html = rep(html, '      </section>\n\n      <section class="practice-section" id="ueben">',
               '      </section>\n\n' + beispiele + vergleich + '      <section class="practice-section" id="ueben">')

    # --- sanity: no grade mention, no leftover template scale in key spots ---
    assert "Klasse" not in html and "klasse 5" not in html.lower(), "grade mention!"
    if scale != 25000:  # 1:25.000 legitimately has the template's default context
        assert "1:25.000 in echt 1 km" not in html, "leftover template text"
    assert "Maßstabsrechner.</h1>" not in html, "leftover template H1"
    # The only "25000" left must be the compare tool's generic example (Karte A);
    # on the 1:25.000 page the main input legitimately reads 25000 too.
    assert html.count('value="25000"') == (2 if scale == 25000 else 1) and 'id="compare-scale-a"' in html, "unexpected 25000 leftovers"
    # --- JSON-LD: rebuild fresh per scale page (FAQPage + BreadcrumbList +
    # HowTo), inserted before the app.js script tag. HowTo steps are
    # extracted from the built page, so they match the rewritten
    # scale-specific steps 1-3 plus the kept Fläche/Volumen steps 4-5.
    # NOTE (2026-11-28, Semrush audit): NO WebApplication node — Google's
    # SoftwareApplication rich result requires a real review/aggregateRating,
    # which this free tool site does not have, so Semrush flagged all 116
    # WebApplication items as invalid. The pages keep FAQPage, BreadcrumbList
    # and HowTo, which need no reviews.
    # FAQPage must match the VISIBLE FAQ section (Google requires schema ==
    # visible content): extract all 14 questions/answers from the built page.
    faq_section = re.search(r'<section class="faq-section">(.*?)</section>', html, re.DOTALL).group(1)
    faq_re = re.compile(r'<details><summary>(.*?)</summary><p>(.*?)</p></details>', re.DOTALL)
    visible_faqs = [(re.sub(r"<[^>]+>", "", m.group(1)).strip(),
                     re.sub(r"<[^>]+>", "", m.group(2)).strip())
                    for m in faq_re.finditer(faq_section)]
    assert len(visible_faqs) == 14, f"expected 14 visible FAQs, got {len(visible_faqs)}"
    faq_ld = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in visible_faqs
        ],
    }
    breadcrumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Startseite",
             "item": "https://massklar-rechner.de/"},
            {"@type": "ListItem", "position": 2, "name": "Maßstabsrechner",
             "item": "https://massklar-rechner.de/massstabsrechner/"},
            {"@type": "ListItem", "position": 3, "name": f"Maßstab {label}",
             "item": canon},
        ],
    }
    step_re = re.compile(
        r'<article class="guide-step"><span class="step-number">(\d+)</span>'
        r'<div><h3>(.*?)</h3><p>(.*?)</p><span class="step-equation">(.*?)</span></div></article>')
    howto_steps = [
        {"@type": "HowToStep", "position": int(m.group(1)), "name": m.group(2),
         "text": re.sub(r"<[^>]+>", "", m.group(3)) + " " + m.group(4)}
        for m in step_re.finditer(html)
    ]
    assert len(howto_steps) == 5, f"expected 5 guide steps for HowTo, got {len(howto_steps)}"
    howto = {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": f"So rechnest du im Maßstab {label}",
        "description": f"Maßstab {label} berechnen: echte Länge, Plan-Länge, Maßstab, Fläche und Volumen — Schritt für Schritt.",
        "step": howto_steps,
    }
    ld_blocks = ""
    for block in (faq_ld, breadcrumb, howto):
        ld_blocks += ("    <script type=\"application/ld+json\">\n"
                      + "\n".join("      " + line for line in json.dumps(block, ensure_ascii=False, indent=2).split("\n"))
                      + "\n    </script>\n")
    html = rep(html, '    <script src="app.js" defer></script>',
               ld_blocks + '    <script src="app.js" defer></script>')
    assert html.count('application/ld+json') == 3, "expected 3 JSON-LD blocks"
    assert "massklar_v1" not in html  # storage key lives in app.js only
    return html, len(meta)


def build_js(scale):
    js = TEMPLATE_JS.read_text(encoding="utf-8")
    js = rep(js, 'const STORAGE_KEY = "massklar_v1";',
             f'const STORAGE_KEY = "massklar_v1_{scale}";')
    assert js.count('"25000"') == 2, f"expected 2x \"25000\" in app.js, got {js.count(chr(34)+'25000'+chr(34))}"
    js = js.replace('"25000"', f'"{scale}"')
    assert "Klasse" not in js
    return js


def main():
    for scale in SCALES:
        out = BASE / f"1-zu-{scale}"
        out.mkdir(parents=True, exist_ok=True)
        page, meta_len = build_page(scale)
        (out / "index.html").write_text(page, encoding="utf-8")
        (out / "app.js").write_text(build_js(scale), encoding="utf-8")
        print(f"1:{scale} -> {out.relative_to(BASE.parent)} (meta {meta_len} chars)")


if __name__ == "__main__":
    main()
