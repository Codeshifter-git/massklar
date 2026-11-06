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
SCALES = [10, 20, 25, 50, 100, 200, 250, 500, 1000]
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
}

# FAQ answers shared by all scale pages (from the template, unchanged).
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
    meta = (f"Maßstab {label} berechnen und umrechnen: 1 cm auf dem Plan sind "
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
        verb = "ist" if 4 * scale == 100 else "sind"
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
    html = rep(html, '      </section>\n\n      <section class="quick-examples" id="beispiele">',
               '      </section>\n\n' + wofuer + '      <section class="quick-examples" id="beispiele">')

    # --- "Alle Maßstäbe" section -> "Andere Maßstäbe" (same list, siblings) ---
    links = []
    for s in SCALES:
        text = f"Maßstab 1:{s}"
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

    # --- sanity: no grade mention, no leftover template scale in key spots ---
    assert "Klasse" not in html and "klasse 5" not in html.lower(), "grade mention!"
    for needle in ["1:25.000 in echt 1 km", "Maßstabsrechner.</h1>"]:
        assert needle not in html, f"leftover template text: {needle!r}"
    # The only "25000" left must be the compare tool's generic example (Karte A).
    assert html.count('value="25000"') == 1 and 'id="compare-scale-a"' in html, "unexpected 25000 leftovers"
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
