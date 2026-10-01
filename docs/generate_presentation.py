from pathlib import Path
from pptx import Presentation
from pptx.enum.shapes import MSO_AUTO_SHAPE_TYPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "WeatherGrid_ICT304_Presentation.pptx"

NAVY = RGBColor(18, 45, 68)
TEAL = RGBColor(0, 126, 137)
BLUE = RGBColor(45, 108, 223)
PURPLE = RGBColor(105, 78, 196)
GREEN = RGBColor(24, 132, 91)
AMBER = RGBColor(185, 105, 0)
RED = RGBColor(194, 56, 81)
INK = RGBColor(30, 45, 58)
MUTED = RGBColor(85, 101, 117)
PALE = RGBColor(244, 248, 250)
WHITE = RGBColor(255, 255, 255)
LINE = RGBColor(216, 226, 232)


def set_bg(slide, color=PALE):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def add_text(slide, x, y, w, h, text, size=20, color=INK, bold=False,
             align=PP_ALIGN.LEFT, font="Aptos", valign=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    frame = box.text_frame
    frame.clear()
    frame.word_wrap = True
    frame.vertical_anchor = valign
    p = frame.paragraphs[0]
    p.text = text
    p.alignment = align
    p.font.name = font
    p.font.size = Pt(size)
    p.font.bold = bold
    p.font.color.rgb = color
    return box


def add_header(slide, number, title, subtitle=None):
    add_text(slide, 0.62, 0.34, 0.55, 0.38, f"{number:02}", 13, TEAL, True)
    add_text(slide, 1.18, 0.25, 11.45, 0.52, title, 26, NAVY, True)
    if subtitle:
        add_text(slide, 1.18, 0.79, 11.1, 0.38, subtitle, 11, MUTED)
    line = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.RECTANGLE, Inches(0.62), Inches(1.2), Inches(12.05), Inches(0.025))
    line.fill.solid(); line.fill.fore_color.rgb = LINE; line.line.fill.background()


def add_footer(slide, label="ICT304 | WeatherGrid"):
    add_text(slide, 0.63, 7.13, 5.2, 0.2, label, 8, MUTED)
    add_text(slide, 11.8, 7.13, 0.8, 0.2, str(len(prs.slides)), 8, MUTED, align=PP_ALIGN.RIGHT)


def card(slide, x, y, w, h, title, body, accent=TEAL, title_size=16, body_size=11):
    shape = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid(); shape.fill.fore_color.rgb = WHITE
    shape.line.color.rgb = LINE
    shape.line.width = Pt(1)
    stripe = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.RECTANGLE, Inches(x), Inches(y), Inches(0.07), Inches(h))
    stripe.fill.solid(); stripe.fill.fore_color.rgb = accent; stripe.line.fill.background()
    add_text(slide, x + 0.25, y + 0.18, w - 0.45, 0.38, title, title_size, NAVY, True)
    add_text(slide, x + 0.25, y + 0.68, w - 0.45, h - 0.82, body, body_size, MUTED)


def pill(slide, x, y, w, text, color=TEAL):
    shape = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(0.42))
    shape.fill.solid(); shape.fill.fore_color.rgb = color; shape.line.fill.background()
    add_text(slide, x, y + 0.01, w, 0.36, text, 10, WHITE, True, PP_ALIGN.CENTER, valign=MSO_ANCHOR.MIDDLE)


def bullets(slide, x, y, w, h, items, size=16, color=INK):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    frame = box.text_frame
    frame.clear(); frame.word_wrap = True
    for i, item in enumerate(items):
        p = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        p.text = item
        p.level = 0
        p.font.name = "Aptos"
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.space_after = Pt(11)
        p.text = "•  " + item
    return box


def add_notes(slide, text):
    try:
        frame = slide.notes_slide.notes_text_frame
        frame.text = text
    except Exception:
        pass


def image_contain(slide, path, x, y, w, h):
    from PIL import Image
    with Image.open(path) as im:
        iw, ih = im.size
    ratio = min(w / iw, h / ih)
    pw, ph = iw * ratio, ih * ratio
    return slide.shapes.add_picture(str(path), Inches(x + (w - pw) / 2), Inches(y + (h - ph) / 2), Inches(pw), Inches(ph))


prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
blank = prs.slide_layouts[6]

# 1. Title
slide = prs.slides.add_slide(blank); set_bg(slide, NAVY)
add_text(slide, 0.78, 0.66, 2.2, 0.38, "ICT304 · ASSESSMENT 3", 12, RGBColor(104, 217, 205), True)
add_text(slide, 0.78, 1.35, 8.9, 0.78, "WeatherGrid", 40, WHITE, True)
add_text(slide, 0.78, 2.15, 9.4, 0.65, "Distributed IoT Weather Monitoring System", 24, RGBColor(207, 231, 238), True)
add_text(slide, 0.78, 3.1, 7.4, 0.7, "Reliable local weather telemetry from sensor node to live web dashboard.", 18, WHITE)
pill(slide, 0.78, 4.18, 1.65, "MQTT QoS 1", PURPLE)
pill(slide, 2.58, 4.18, 1.75, "Edge buffering", TEAL)
pill(slide, 4.48, 4.18, 1.65, "Live SSE", BLUE)
pill(slide, 6.28, 4.18, 1.9, "PostgreSQL", AMBER)
add_text(slide, 0.78, 5.52, 6.8, 0.8, "Group [INSERT NUMBER]\n[INSERT NAMES AND STUDENT IDs]", 14, RGBColor(207, 231, 238))
add_text(slide, 10.6, 6.65, 1.9, 0.25, "15-minute presentation", 9, RGBColor(169, 197, 208), align=PP_ALIGN.RIGHT)
add_notes(slide, "Presenter 1, 30 seconds. Introduce the group and one-sentence project purpose. Do not explain the architecture yet.")

# 2. Problem and objectives
slide = prs.slides.add_slide(blank); set_bg(slide); add_header(slide, 2, "Problem and project objectives", "Why a distributed weather platform is needed")
card(slide, 0.68, 1.53, 3.7, 4.8, "The problem", "Broad public forecasts may not represent a specific farm, campus or facility. Local operators need current, site-level observations and alerts, even when connectivity is unreliable.", RED, 18, 15)
card(slide, 4.64, 1.53, 3.7, 4.8, "Technical challenge", "Sensors are geographically distributed. Messages may be delayed or duplicated. Multiple users need consistent, secure access while services can fail independently.", PURPLE, 18, 15)
card(slide, 8.60, 1.53, 3.7, 4.8, "Our objective", "Collect six weather measures from multiple stations, deliver them reliably, store each reading once, detect abnormalities and present live information through an authenticated web application.", TEAL, 18, 15)
add_footer(slide); add_notes(slide, "Presenter 1, 75 seconds. Explain the user problem first, then connect it to distributed-system concerns: independent nodes, unreliable links, duplicates and concurrent users.")

# 3. Solution at a glance
slide = prs.slides.add_slide(blank); set_bg(slide); add_header(slide, 3, "Solution at a glance", "Three stations, one fault-tolerant data path")
locations = [("SYDNEY", "WX-SYD-001", 0.8), ("MELBOURNE", "WX-MEL-001", 4.65), ("BRISBANE", "WX-BNE-001", 8.5)]
for title, device, x in locations:
    card(slide, x, 1.55, 3.25, 1.45, title, device, BLUE, 18, 14)
add_text(slide, 0.85, 3.52, 11.6, 0.5, "Temperature  ·  Humidity  ·  Pressure  ·  Rainfall  ·  Wind speed  ·  Battery", 19, NAVY, True, PP_ALIGN.CENTER)
steps = [("1", "Publish", PURPLE), ("2", "Validate", TEAL), ("3", "Persist", AMBER), ("4", "Alert", RED), ("5", "Visualise", BLUE)]
for i, (n, label, color) in enumerate(steps):
    x = 1.0 + i * 2.42
    shape = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.OVAL, Inches(x), Inches(4.55), Inches(0.62), Inches(0.62))
    shape.fill.solid(); shape.fill.fore_color.rgb = color; shape.line.fill.background()
    add_text(slide, x, 4.65, 0.62, 0.3, n, 13, WHITE, True, PP_ALIGN.CENTER)
    add_text(slide, x - 0.28, 5.35, 1.2, 0.35, label, 12, INK, True, PP_ALIGN.CENTER)
    if i < 4:
        add_text(slide, x + 1.15, 4.62, 0.65, 0.3, "→", 24, MUTED, True, PP_ALIGN.CENTER)
add_footer(slide); add_notes(slide, "Presenter 1, 60 seconds. State that current nodes are software simulators with interfaces designed for future ESP32 hardware.")

# 4. Architecture
slide = prs.slides.add_slide(blank); set_bg(slide); add_header(slide, 4, "High-level architecture", "Independent layers communicate through explicit contracts")
image_contain(slide, ROOT / "weathergrid-high-level-architecture-generated.png", 0.55, 1.32, 12.25, 5.55)
add_footer(slide); add_notes(slide, "Presenter 2, 2 minutes. Trace the solid path left to right. Then explain dashed SSE fan-out and simulation commands. Emphasise that each layer can fail or scale independently.")

# 5. Sensor collection
slide = prs.slides.add_slide(blank); set_bg(slide); add_header(slide, 5, "How weather data is collected", "Current simulator and future physical-node design")
sensor_data = [
    ("Temperature / humidity", "DHT22 or BME280", "Digital bus", "°C / %"),
    ("Atmospheric pressure", "BME280", "I²C", "hPa"),
    ("Rainfall", "Tipping-bucket gauge", "Pulse input", "mm"),
    ("Wind speed", "Cup anemometer", "Pulse / ADC", "km/h"),
    ("Battery", "Voltage divider", "ADC", "%"),
]
x0, y0 = 0.75, 1.55
headers = ["MEASURE", "EXAMPLE SENSOR", "CONNECTION", "UNIT"]
widths = [3.2, 3.4, 2.6, 1.55]
xx = x0
for h, w in zip(headers, widths):
    rect = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.RECTANGLE, Inches(xx), Inches(y0), Inches(w), Inches(0.55))
    rect.fill.solid(); rect.fill.fore_color.rgb = NAVY; rect.line.fill.background()
    add_text(slide, xx + 0.12, y0 + 0.1, w - 0.2, 0.3, h, 10, WHITE, True)
    xx += w
for row_i, row in enumerate(sensor_data):
    xx = x0; yy = y0 + 0.55 + row_i * 0.72
    for value, w in zip(row, widths):
        rect = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.RECTANGLE, Inches(xx), Inches(yy), Inches(w), Inches(0.72))
        rect.fill.solid(); rect.fill.fore_color.rgb = WHITE if row_i % 2 == 0 else RGBColor(236, 243, 247)
        rect.line.color.rgb = LINE
        add_text(slide, xx + 0.12, yy + 0.17, w - 0.22, 0.35, value, 11, INK, row_i == 0 and value == row[0])
        xx += w
add_text(slide, 0.76, 5.95, 11.4, 0.62, "Prototype truth: these values are currently generated by independent Python device processes. Physical calibration is future work.", 14, RED, True)
add_footer(slide); add_notes(slide, "Presenter 2, 75 seconds. Clearly distinguish simulated sensors from proposed physical sensors. Explain that the ESP32 reads interfaces, converts units, attaches metadata and publishes via Wi-Fi.")

# 6. Flow
slide = prs.slides.add_slide(blank); set_bg(slide); add_header(slide, 6, "End-to-end telemetry flow", "From observation to a value displayed with units")
image_contain(slide, ROOT / "weathergrid-telemetry-flow.png", 0.5, 1.38, 12.35, 5.25)
pill(slide, 4.3, 6.55, 4.75, "Failure path: SQLite queue → bounded retry", PURPLE)
add_footer(slide); add_notes(slide, "Presenter 2, 90 seconds. Walk through all seven steps. Explain that SSE signals a change and the dashboard then refreshes current data.")

# 7. Distributed principles
slide = prs.slides.add_slide(blank); set_bg(slide); add_header(slide, 7, "Distributed computing principles", "The design choices that make WeatherGrid reliable")
card(slide, 0.75, 1.55, 5.75, 2.05, "Decoupling", "MQTT publishers do not know which consumer receives the message. Broker topics separate devices from the application.", PURPLE, 18, 14)
card(slide, 6.83, 1.55, 5.75, 2.05, "Fault tolerance", "The edge gateway stores temporary failures in SQLite and retries using bounded exponential backoff.", TEAL, 18, 14)
card(slide, 0.75, 3.93, 5.75, 2.05, "Idempotency", "QoS 1 can redeliver. Device ID plus sequence number prevents a repeated message from creating a second reading.", AMBER, 18, 14)
card(slide, 6.83, 3.93, 5.75, 2.05, "Concurrency and fan-out", "PostgreSQL transactions protect shared state. SSE distributes live change events to authenticated browser clients.", BLUE, 18, 14)
add_footer(slide); add_notes(slide, "Presenter 2, 90 seconds. This slide directly addresses ICT304. Define idempotency in plain language: repeating the same operation has no additional effect.")

# 8. Prototype
slide = prs.slides.add_slide(blank); set_bg(slide); add_header(slide, 8, "Working prototype", "Responsive live monitoring with explicit engineering units")
image_contain(slide, ROOT / "weathergrid-live-monitoring.png", 0.55, 1.35, 8.45, 5.5)
card(slide, 9.22, 1.5, 3.35, 1.25, "Monitor", "Overview, live values, history and map", BLUE, 15, 11)
card(slide, 9.22, 2.95, 3.35, 1.25, "Operate", "Devices, alerts, notifications and reports", TEAL, 15, 11)
card(slide, 9.22, 4.4, 3.35, 1.25, "Demonstrate", "Controlled scenarios and acknowledgements", PURPLE, 15, 11)
pill(slide, 9.22, 5.93, 3.35, "Admin + viewer roles", NAVY)
add_footer(slide); add_notes(slide, "Presenter 3, 60 seconds. This is a real authenticated screenshot. Mention Celsius, percent, hPa, millimetres, kilometres per hour and battery percent.")

# 9. Security
slide = prs.slides.add_slide(blank); set_bg(slide); add_header(slide, 9, "Security and data integrity", "Separate identities and validation at every trust boundary")
items = [
    ("Human access", "Payload sessions with admin and read-only viewer roles", BLUE),
    ("Machine access", "Dedicated edge-gateway service account and API key", TEAL),
    ("Validation", "Strict schemas, 16 KiB limit, ranges and timestamp ordering", PURPLE),
    ("Integrity", "UUID messages, persistent sequences, unique database constraint", AMBER),
    ("Local safety", "Development MQTT port bound to loopback only", GREEN),
]
for i, (title, detail, color) in enumerate(items):
    y = 1.45 + i * 1.03
    shape = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.OVAL, Inches(0.82), Inches(y + 0.08), Inches(0.55), Inches(0.55))
    shape.fill.solid(); shape.fill.fore_color.rgb = color; shape.line.fill.background()
    add_text(slide, 1.58, y, 2.4, 0.35, title, 16, NAVY, True)
    add_text(slide, 4.0, y, 8.1, 0.52, detail, 14, MUTED)
card(slide, 8.7, 6.05, 3.7, 0.78, "Production requirement", "MQTT over TLS, per-device credentials and secret rotation", RED, 12, 9)
add_footer(slide); add_notes(slide, "Presenter 3, 75 seconds. Do not show real .env values. State clearly that the current broker configuration is development-only and production requires TLS.")

# 10. Testing
slide = prs.slides.add_slide(blank); set_bg(slide); add_header(slide, 10, "Testing and evaluation", "Reproducible evidence from every implemented layer")
tests = [("Web logic", 8, BLUE), ("Gateway", 7, TEAL), ("Simulator", 27, PURPLE)]
max_value = 30
for i, (name, value, color) in enumerate(tests):
    y = 1.65 + i * 1.22
    add_text(slide, 0.82, y + 0.13, 1.6, 0.35, name, 15, NAVY, True)
    bg = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE, Inches(2.45), Inches(y), Inches(5.5), Inches(0.62))
    bg.fill.solid(); bg.fill.fore_color.rgb = RGBColor(227, 235, 240); bg.line.fill.background()
    bar = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE, Inches(2.45), Inches(y), Inches(5.5 * value / max_value), Inches(0.62))
    bar.fill.solid(); bar.fill.fore_color.rgb = color; bar.line.fill.background()
    add_text(slide, 8.16, y + 0.11, 1.1, 0.35, f"{value} passed", 14, color, True)
add_text(slide, 0.85, 5.52, 7.7, 0.5, "42 automated tests passed", 25, NAVY, True)
pill(slide, 0.85, 6.18, 1.9, "TypeScript: pass", GREEN)
pill(slide, 2.95, 6.18, 1.7, "ESLint: pass", GREEN)
pill(slide, 4.85, 6.18, 2.45, "Infrastructure: healthy", GREEN)
card(slide, 9.15, 1.62, 3.15, 3.95, "Live verification", "3 devices\n3 locations\n4,531 stored readings\n53 alert records\n\nLatest values received concurrently from Sydney, Melbourne and Brisbane on 24 Sep 2026.", AMBER, 18, 14)
add_footer(slide); add_notes(slide, "Presenter 3, 90 seconds. Explain that tests cover invalid data and failure paths, not only successful input. The database count is a point-in-time observation and may be higher during the live demo.")

# 11. Challenges
slide = prs.slides.add_slide(blank); set_bg(slide); add_header(slide, 11, "Challenges, solutions and learning", "How implementation problems improved the architecture")
rows = [
    ("Duplicate MQTT delivery", "Database idempotency key", "Transport guarantees require application semantics"),
    ("Temporary server outage", "Durable SQLite edge queue", "Reliable systems preserve state across failures"),
    ("Silent offline device", "Scheduled last-seen worker", "Absence of data is also an operational signal"),
    ("Untrusted input", "Layered schema and identity checks", "Validate at every distributed boundary"),
]
for i, (challenge, solution, learning) in enumerate(rows):
    y = 1.52 + i * 1.24
    pill(slide, 0.72, y, 2.85, challenge, RED)
    add_text(slide, 3.7, y + 0.04, 0.55, 0.3, "→", 20, MUTED, True, PP_ALIGN.CENTER)
    pill(slide, 4.38, y, 3.05, solution, TEAL)
    add_text(slide, 7.55, y + 0.04, 0.55, 0.3, "→", 20, MUTED, True, PP_ALIGN.CENTER)
    add_text(slide, 8.25, y - 0.03, 4.2, 0.55, learning, 12, INK, True)
add_text(slide, 0.78, 6.55, 11.8, 0.35, "Key learning: reliability is a chain of identity, validation, ordering, durable state, retries and observability.", 16, NAVY, True, PP_ALIGN.CENTER)
add_footer(slide); add_notes(slide, "Presenter 3, 75 seconds. Choose two challenges to explain in detail; summarise the remaining two to stay on time.")

# 12. Demo
slide = prs.slides.add_slide(blank); set_bg(slide, NAVY)
add_text(slide, 0.72, 0.42, 11.8, 0.5, "LIVE PROTOTYPE DEMONSTRATION", 27, WHITE, True)
add_text(slide, 0.72, 1.05, 10.4, 0.35, "Five-minute path through the complete system", 14, RGBColor(180, 213, 222))
demo = [
    ("01", "Sign in", "Open Overview and confirm three online stations"),
    ("02", "Observe", "Open Live Monitoring and explain values and units"),
    ("03", "Trigger", "Simulation → high temperature on one station"),
    ("04", "Verify", "Observe alert, acknowledge it, then reset normal"),
    ("05", "Evidence", "Open History/Reports and show the stored reading"),
]
for i, (num, title, detail) in enumerate(demo):
    y = 1.65 + i * 0.93
    add_text(slide, 0.85, y, 0.6, 0.35, num, 12, RGBColor(104, 217, 205), True)
    add_text(slide, 1.55, y - 0.05, 1.45, 0.42, title, 18, WHITE, True)
    add_text(slide, 3.15, y, 7.7, 0.38, detail, 14, RGBColor(211, 228, 233))
card(slide, 9.55, 5.85, 2.75, 0.82, "Fallback", "Use saved screenshot and test evidence", RED, 12, 9)
add_text(slide, 0.75, 6.72, 7.8, 0.28, "Never display passwords, API keys or the .env file during the demonstration.", 10, RGBColor(246, 188, 197), True)
add_notes(slide, "All presenters, 5 minutes. Rehearse with a timer. Start all services before class. Keep this slide visible only while introducing the demo, then switch to the browser. If the system fails, use the screenshot and explain the verified test results.")

# 13. Conclusion
slide = prs.slides.add_slide(blank); set_bg(slide); add_header(slide, 13, "Conclusion and future work", "What we achieved and how the prototype can evolve")
card(slide, 0.72, 1.48, 5.85, 4.65, "Objectives achieved", "✓ Multi-station telemetry\n✓ MQTT publish/subscribe transport\n✓ Durable edge buffering and retry\n✓ Idempotent PostgreSQL persistence\n✓ Live dashboard, alerts and reports\n✓ Role-based access and audit evidence\n✓ 42 passing automated tests", GREEN, 20, 16)
card(slide, 6.85, 1.48, 5.75, 4.65, "Next steps", "1. Calibrated ESP32 sensor stations\n2. MQTT over TLS and per-device certificates\n3. Cloud deployment and high availability\n4. Load, packet-loss and failover testing\n5. Predictive anomaly detection\n6. Progressive web application notifications", BLUE, 20, 16)
add_text(slide, 0.82, 6.48, 11.6, 0.45, "WeatherGrid demonstrates a complete, testable distributed IoT path from observation to action.", 19, NAVY, True, PP_ALIGN.CENTER)
add_footer(slide); add_notes(slide, "Presenter 1, 60 seconds plus questions. Reconnect the conclusion to the original problem and avoid introducing new technical detail.")

# 14. Questions
slide = prs.slides.add_slide(blank); set_bg(slide, NAVY)
add_text(slide, 0.8, 1.65, 11.7, 0.8, "Questions", 42, WHITE, True, PP_ALIGN.CENTER)
add_text(slide, 1.8, 2.7, 9.7, 0.55, "Thank you", 22, RGBColor(104, 217, 205), True, PP_ALIGN.CENTER)
add_text(slide, 2.1, 4.05, 9.1, 0.8, "WeatherGrid · Distributed IoT Weather Monitoring System", 17, RGBColor(207, 231, 238), align=PP_ALIGN.CENTER)
add_text(slide, 2.25, 5.65, 8.8, 0.55, "Architecture  ·  Reliability  ·  Live monitoring", 13, RGBColor(169, 197, 208), align=PP_ALIGN.CENTER)
add_notes(slide, "Invite questions. Be prepared to explain MQTT QoS 1, why duplicates occur, what happens when the Internet fails, the difference between admin and viewer, and which sensors would be used in physical hardware.")

prs.core_properties.title = "WeatherGrid - ICT304 Assessment 3 Presentation"
prs.core_properties.subject = "Distributed IoT Weather Monitoring System"
prs.core_properties.author = "WeatherGrid Project Group"
prs.core_properties.keywords = "ICT304, distributed computing, IoT, MQTT, WeatherGrid"
prs.save(OUTPUT)
print(OUTPUT)
