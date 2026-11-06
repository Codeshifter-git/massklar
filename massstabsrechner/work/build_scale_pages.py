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
        wofuer=("Den Maßstab 1:10 nutzt man im Modellbau: für Detailpläne, kleine Modelle und Möbel. "
                "Alles ist 10-mal kleiner als in echt — ein Stuhl von 1 m ist auf dem Plan 10 cm groß. "
                "So zeichnet man Dinge, die man ganz genau sehen will."),
        step1=("Nimm die Länge auf dem Plan mal die Maßstabszahl. Bei 1:10 werden aus 3 cm auf dem Plan 30 cm in echt.",
               "3 cm × 10 = 30 cm"),
        step2=("Teile die echte Länge durch die Maßstabszahl. Ein Modellauto, das 50 cm lang ist, ist im Maßstab 1:10 dann 5 cm lang.",
               "50 cm ÷ 10 = 5 cm"),
        step3=("Bring beide Längen erst in die gleiche Einheit. Dann teilst du die Länge auf dem Plan durch die echte Länge. 10 cm zu 1 m — das ist 1:10.",
               "10 cm : 100 cm = 1 : 10"),
    ),
    20: dict(
        one_cm="20 cm", ten_cm="2 m",
        use_line="Für Treppen und Innenausbau.", use_short="Treppen, Innenausbau",
        map_label="TREPPE",
        example="Ein Beispiel: Eine Treppe ist auf dem Plan 15 cm lang — in echt sind das 3 m (15 × 20 = 300 cm).",
        wofuer=("Den Maßstab 1:20 nutzt man für Detailpläne, Treppen und den Innenausbau. "
                "Alles ist 20-mal kleiner als in echt — eine Treppe von 3 m ist auf dem Plan 15 cm lang. "
                "So plant man Räume ganz genau."),
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
        wofuer=("Den Maßstab 1:25 nutzt man für Zimmer und Wohnungen. "
                "Alles ist 25-mal kleiner als in echt — ein Zimmer von 4 m ist auf dem Plan 16 cm lang. "
                "So passt ein ganzes Zimmer auf ein Blatt."),
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
        wofuer=("Den Maßstab 1:50 nutzt man für Grundrisse und Wohnungen. "
                "Alles ist 50-mal kleiner als in echt — eine Wand von 3 m ist auf dem Plan 6 cm lang. "
                "So passt eine ganze Wohnung auf ein Blatt."),
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
        wofuer=("Den Maßstab 1:100 nutzt man für Baupläne und Grundrisse. "
                "Alles ist 100-mal kleiner als in echt — eine Wand von 5 m ist auf dem Plan 5 cm lang. "
                "So plant man ein ganzes Haus auf einem Blatt."),
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
        wofuer=("Den Maßstab 1:200 nutzt man für Lagepläne und Grundstücke. "
                "Alles ist 200-mal kleiner als in echt — ein Grundstück von 20 m ist auf dem Plan 10 cm lang. "
                "So sieht man ein ganzes Grundstück auf einmal."),
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
        wofuer=("Den Maßstab 1:250 nutzt man für Grundstücke und Lagepläne. "
                "Alles ist 250-mal kleiner als in echt — ein Grundstück von 25 m ist auf dem Plan 10 cm lang. "
                "So passt ein großes Grundstück auf ein Blatt."),
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
        wofuer=("Den Maßstab 1:500 nutzt man für Bebauungspläne und Lagepläne. "
                "Alles ist 500-mal kleiner als in echt — ein Haus von 20 m ist auf dem Plan 4 cm lang. "
                "So plant man ein ganzes Baugebiet."),
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
        wofuer=("Den Maßstab 1:1000 nutzt man für Stadtpläne und Karten. "
                "Alles ist 1000-mal kleiner als in echt — eine Straße von 70 m ist auf dem Plan 7 cm lang. "
                "So passt ein ganzes Viertel auf eine Karte."),
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
        wofuer="Den Maßstab 1:87 nutzt man für die Modelleisenbahn Spur H0. Alles ist 87-mal kleiner als in echt — eine Lok von 12 m ist im Modell 13,8 cm lang. So passt eine ganze Bahn auf eine Platte.",
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
        wofuer="Den Maßstab 1:24 nutzt man für Modellautos und Puppenhäuser. Alles ist 24-mal kleiner als in echt — ein Auto von 4,5 m ist im Modell 18,75 cm lang. So baut man Autos und Häuser zum Anfassen nach.",
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
        wofuer="Den Maßstab 1:35 nutzt man für Militärmodelle — Panzer, Figuren und Fahrzeuge. Alles ist 35-mal kleiner als in echt — ein Panzer von 7 m ist im Modell 20 cm lang. So baut man Geschichte zum Anfassen nach.",
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
        wofuer="Den Maßstab 1:72 nutzt man für Flugzeugmodelle. Alles ist 72-mal kleiner als in echt — ein Flugzeug von 36 m ist im Modell 50 cm lang. So passt ein ganzes Flugzeug auf den Tisch.",
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
        use_short="Wanderkarten TK25",
        map_label="WANDERKARTE",
        meta_on="auf der Karte",
        example="Ein Beispiel: Ein Wanderweg ist auf der Karte 20 cm lang — in echt sind das 5 km (20 × 25.000 = 500.000 cm).",
        wofuer="Den Maßstab 1:25.000 nutzt man für Wanderkarten und topografische Karten (TK25). Alles ist 25.000-mal kleiner als in echt — ein Weg von 5 km ist auf der Karte 20 cm lang. So passt eine ganze Wanderung auf ein Blatt.",
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
        wofuer="Den Maßstab 1:50.000 nutzt man für Radkarten und topografische Karten (TK50). Alles ist 50.000-mal kleiner als in echt — eine Strecke von 10 km ist auf der Karte 20 cm lang. So sieht man eine ganze Region auf einmal.",
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
    canon = f"https://codeshifter-git.github.io/massklar/massstabsrechner/{slug}/"

    title = f"Maßstabsrechner {label} – 1 zu {scale} berechnen & umrechnen | maßklar"
    meta = (f"Maßstab {label} berechnen und umrechnen: 1 cm {d.get('meta_on', 'auf dem Plan')} sind "
            f"{d['one_cm']} in echt. Kostenloser Maßstabsrechner für {d['use_short']} "
            f"— zwei Zahlen eintippen, fertig.")
    assert 130 <= len(meta) <= 165, f"meta length {len(meta)} for 1:{scale}: {meta!r}"
    hero = (f"Kostenlos, ohne Anmeldung: Rechne jede Strecke im Maßstab {label} um — "
            f"von der Karte in die Wirklichkeit und zurück. Maßstab und eine Länge "
            f"eintippen, fertig.")
    four_real = fmt_real(4 * scale)   # what 4 cm on the plan are in real life
    bar_real = fmt_real(2 * scale)    # what the 2 cm scale bar stands for

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
    css_version = re.search(r'href="\.\./styles\.css\?v=(\d+)"', html).group(1)

    # --- head: title / meta / canonical / og / JSON-LD ---
    html = rep(html, "<title>Maßstabsrechner – Maßstab online berechnen &amp; umrechnen | maßklar</title>",
               f"<title>{esc(title)}</title>")
    html = rep(html, '<meta name="description" content="Kostenloser Maßstabsrechner: Maßstab berechnen und umrechnen für Karten, Grundrisse und Baupläne. Zwei Zahlen eintippen, fertig — ohne Anmeldung.">',
               f'<meta name="description" content="{esc(meta)}">')
    html = rep(html, '<link rel="canonical" href="https://codeshifter-git.github.io/massklar/massstabsrechner/">',
               f'<link rel="canonical" href="{canon}">')
    html = rep(html, '<meta property="og:title" content="Maßstabsrechner – Maßstab online berechnen &amp; umrechnen | maßklar">',
               f'<meta property="og:title" content="{esc(title)}">')
    html = rep(html, '<meta property="og:description" content="Kostenloser Maßstabsrechner: Maßstab berechnen und umrechnen für Karten, Grundrisse und Baupläne. Zwei Zahlen eintippen, fertig — ohne Anmeldung.">',
               f'<meta property="og:description" content="{esc(meta)}">')
    html = rep(html, f'<link rel="stylesheet" href="../styles.css?v={css_version}">',
               f'<link rel="stylesheet" href="../../styles.css?v={css_version}">')
    html = rep(html, '"name": "Maßstabsrechner",',
               f'"name": "Maßstabsrechner {label}",')
    html = rep(html, '"description": "Maßstabsrechner: Maßstab berechnen, Länge auf der Karte und echte Länge umrechnen — für Karten, Grundrisse und Modellbau."',
               f'"description": "{meta}"')
    faq_ld = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in faqs
        ],
    }
    faq_json = json.dumps(faq_ld, ensure_ascii=False, indent=2)
    faq_block = ("    <script type=\"application/ld+json\">\n"
                 + "\n".join("      " + line for line in faq_json.split("\n"))
                 + "\n    </script>\n")
    html = rep(html, '    </script>\n    <script src="app.js" defer></script>',
               '    </script>\n' + faq_block + '    <script src="app.js" defer></script>')

    # --- nav / footer links: one level deeper ---
    html = rep(html, '<a class="brand" href="../" aria-label="Maßklar Startseite">',
               '<a class="brand" href="../../" aria-label="Maßklar Startseite">')
    html = rep(html, '<a class="brand footer-brand" href="../">',
               '<a class="brand footer-brand" href="../../">')
    html = rep(html, '<a href="../">Alle Rechner</a>', '<a href="../../">Alle Rechner</a>')
    html = rep(html, '<a class="tool-card" href="../altersrechner/">',
               '<a class="tool-card" href="../../altersrechner/">')
    html = rep(html, '<p class="more-tools-link"><a href="../">Alle Rechner ansehen',
               '<p class="more-tools-link"><a href="../../">Alle Rechner ansehen')

    # --- hero ---
    html = rep(html, "<h1>Maßstabsrechner.<br><span>Für Karten, Grundrisse und Modelle.</span></h1>",
               f"<h1>Maßstab {label}.<br><span>{d['use_line']}</span></h1>")
    html = rep(html, '<p class="hero-description">Kostenlos, ohne Anmeldung: Rechne jede Strecke um — von der Karte in die Wirklichkeit und zurück. Maßstab und eine Länge eintippen, fertig.</p>',
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
    other = (f'      <section class="scale-links-section" id="massstaebe">\n'
             f'        <div class="section-heading"><p class="eyebrow">Alle Maßstäbe</p><h2>Andere Maßstäbe.</h2></div>\n'
             f'        <p class="table-intro">Jeder Maßstab hat seine eigene Seite — mit Rechner, Längentabelle und einem Beispiel aus der Praxis. Zurück zum <a href="../">Maßstabsrechner</a>, oder schau dir die <a href="#anleitung">Formeln und Beispiele</a> an.</p>\n'
             f'        <p class="scale-links">{" · ".join(links)}</p>\n'
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
    faq1_old = ('<details><summary>Was bedeutet ein Maßstab von 1:100? <span aria-hidden="true">+</span></summary>'
                '<p>1 cm auf dem Plan sind 100 cm in echt — also 1 m. Stell dir vor: Alles auf dem Papier ist 100-mal kleiner als in echt.</p></details>')
    faq1_new = (f'<details><summary>{faq1_q} <span aria-hidden="true">+</span></summary>'
                f'<p>{faq1_a}</p></details>')
    html = rep(html, faq1_old, faq1_new)
    faq2_old = ('<details><summary>Wie rechne ich 1:25.000 auf einer Karte um? <span aria-hidden="true">+</span></summary>'
                '<p>Nimm die Strecke auf der Karte mal 25.000. 4 cm auf der Karte sind 100.000 cm — das sind 1.000 m, also 1 km. Der Rechner macht das für dich.</p></details>')
    faq2_new = (f'<details><summary>{faq2_q} <span aria-hidden="true">+</span></summary>'
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
    assert f"massklar_v1" not in html  # storage key lives in app.js only
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
