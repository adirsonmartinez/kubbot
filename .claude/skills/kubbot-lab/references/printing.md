# Designing printable enclosures and mounts

Applies to FDM printers (0.4 mm nozzle, 0.2 mm layers, PLA/PETG/ABS), which is what the print service and most makers use. Numbers marked **(verify)** vary by printer, filament or part vendor: confirm with a test print or calipers before hard-coding them. Units are mm everywhere (bench units are 10 mm, see `layout.ts` `MM`).

The enclosure generator takes its facts from the catalog (`size`, `holes`) plus per-part cutout data in `src/models/lab/enclosureFeatures.ts`. The catalog does **not** yet hold connector positions (where the USB or jack sits on a board edge): add them to `enclosureFeatures.ts` per board before generating cutouts.

## 1. FDM rules

| Item | Rule |
|---|---|
| Walls | 2.0 mm or more (about 5 perimeters at 0.4 mm lines). 1.2 mm is the strict minimum (3 perimeters) for small non-structural boxes. Make wall thickness a multiple of the line width (0.4/0.45 mm) so no gaps appear. |
| Floor and lid plate | 1.6-2.4 mm |
| Smallest feature | 0.8 mm (two lines). Embossed text: stroke 0.8 mm or more, 0.6 mm tall. |
| Corners | Outer radius 2 mm or more (stronger, looks better, less warping). Add a 0.4-0.6 mm chamfer on the bottom edge against elephant foot. |
| Holes | Print 0.1-0.2 mm smaller than drawn. Make holes 0.2 mm larger than the nominal part you want to pass. Vertical holes are rounder than horizontal ones. |
| Overhangs | Under 45 degrees from vertical prints clean without supports (about 60 degrees works with good cooling). Replace flat undersides with a 45 degree chamfer. |
| Horizontal round holes | Use a teardrop or diamond top so no support is needed. |
| Bridges | Up to about 5-10 mm bridge cleanly **(verify)**. Longer spans sag: add a rib, or accept supports. |
| Layer strength | Parts are weakest between layers. Orient so loads and flexing run along the layers (see snap fits). |
| Orientation | Open side of the box up; lid with its flat outer face down (smoothest top); big flat faces on the bed; avoid supports on visible faces. Print the box and the lid as separate bodies (the generator's `group: "base" | "lid"`). |

### Fits and clearances (per side, test on your printer)
- Press or snug fit (lid lip into the box): 0.15-0.2 mm.
- Easy slide / removable lid: 0.25-0.3 mm.
- Loose or rotating: 0.4 mm.
- Board in a pocket: board outline + 0.3-0.5 mm per side so it drops in. The box inner size = board footprint + 2 x clearance + room for tall headers and cables.
- Print a small calibration piece (a 20 mm square with 0.1, 0.2, 0.3, 0.4 mm gaps) first when the printer is unknown.

### M3 screws, standoffs and bosses
- Standoff (post) under each board hole, from the catalog `holes` (`[x, y]` mm from the board corner; Uno R3 has 4, the holes are about 3.2 mm in diameter).
- **Hole in the boss:** 2.5-2.8 mm for a self-tapping M3 screw (use 2.8 mm in PLA to reduce cracking; 2.5 mm tight in PETG); **4.0-4.2 mm for an M3 heat-set insert** (typical insert OD about 4.6 mm, follow the insert's data sheet **(verify)**). Insert depth 4-5 mm, plus 1 mm of extra hole depth below it.
- **Boss outer diameter 6-7 mm** (use 6.5-7 mm for heat-set inserts). Add a fillet or ribs at the base to the floor.
- **Standoff height 3-5 mm** to keep solder joints off the floor; the PCB sits on top of the post, not in a pocket. For through screws use a pin 2.5 mm (not 3 mm) diameter on top to locate the board hole (board hole is about 3.2 mm).
- M3 clearance hole (lid screws, passing through): 3.2-3.4 mm. Screw head counterbore 6-6.5 mm wide. Nut trap: M3 nut is 5.5 mm across flats and 2.4 mm thick; make the pocket 5.7-5.9 mm across flats.
- Screws: M3 x 6 or 8 mm for board, M3 x 10-12 mm for lid, depending on the post depth. Never run a screw tip against a PCB trace.

### Lids, lips and snap fits
- **Lip (recommended default):** the lid has a ridge that sits inside the box walls: lip height 2-3 mm, lip thickness 1.0-1.2 mm (about half the wall), clearance 0.2-0.3 mm to the inner wall. Corner screws or 2 snap hooks hold it.
- **Cantilever snap fit:** beam thickness 1.5-2 mm, length 10x the thickness or more, hook depth 0.6-1 mm, 30-45 degree lead-in chamfer and a straighter return face. Print so layer lines run **along** the beam length (bend in the XY plane, not across layers). PLA is brittle and snap hooks fatigue: use PETG for repeated opening, or use screws.
- Add a finger notch or two tabs to open the lid. Make the lid tell its orientation (a one-sided notch) so it is not flipped.
- Sealed or outdoor boxes need a gasket or silicone and ASA; this lab's boxes are for indoor use.

### Ventilation and heat
- Heat sources: the Uno/Nano linear regulator when on a barrel/VIN supply (watts = (Vin - 5 V) x current), the **L298N** (runs very hot), motor drivers, relay coils, an ESP32 in a sealed box, batteries under load.
- Put vent slots 2-3 mm wide, 10-15 mm long, in rows, **above the hot part and low on the opposite side** so air moves through (hot air rises). Keep slots on side walls rather than the top if drips are possible. Aim for a total opening of at least a few cm2 for hot boards; for the L298N add a gap around its heatsink **(approx)**.
- DHT22 and soil sensors measure the air or soil, not the box: give the DHT22 its own opening or mount it outside the warm cavity so self-heating does not skew the reading.
- **Do not put a wall in front of ultrasonic eyes or the PIR dome:** open holes only.

### Materials for electronics

| Material | Softens at (approx) | Good for | Notes |
|---|---|---|---|
| PLA | about 55-60 C | prototypes, dry indoor sensor boxes, stands | Easiest. Deforms in a hot car or next to a hot regulator or an L298N heatsink. Brittle. |
| PETG | about 70-80 C | general enclosures, snap fits, parts near mild heat | Tougher, a little stringy, slightly flexible. Our default recommendation. |
| ABS / ASA | about 95-105 C | enclosures near heat (motor drivers), outdoors (ASA resists UV) | Needs an enclosed printer and ventilation (fumes); warps. |

- None of these is flame retardant by default (V-0 filaments exist, **verify**). **Never enclose mains-voltage wiring in a printed box.** The lab and its agent stay at low voltage (USB, 5-6 V packs).
- All of them are electrical insulators, so a printed box does not short anything, but metal screws and bare pins still can.

## 2. Cutouts and windows

Add 0.3-0.5 mm of clearance to every cutout, and cut through with an epsilon extra so faces do not coincide. Sizes are typical receptacle/plug envelopes; many cables have bulky overmolds, so the plug is larger than the port. **(verify with the actual cable)**

| Opening | Port / receptacle | Cutout to use |
|---|---|---|
| USB-B (Uno) | about 12 wide x 11 high mm | 13.5 x 12 mm |
| USB-C | receptacle shell about 9 x 3.3 mm; plug overmold up to about 12.4 x 6.5 mm | 13 x 7 mm if the cable must pass through the wall |
| micro-USB | receptacle about 7.5 x 2.5 mm; plug overmold up to about 10.6 x 8.5 mm | 11 x 9 mm for a bulky plug; 8.5 x 4 mm for slim plugs |
| mini-USB (classic Nano) | receptacle about 8 x 4 mm; plug overmold about 12 x 8 mm **(approx)** | 12.5 x 8.5 mm |
| DC barrel jack 5.5 / 2.1 mm (Uno) | jack body about 9 wide x 11 high mm; plug barrel 5.5 mm diameter, plug body larger | 10.5 x 12.5 mm for the jack; 14 mm wide if a bulky plug is used **(approx)** |
| Cable gland PG7 / PG9 / M12 | PG7 hole 12.5 mm (cable 3-6.5 mm); PG9 hole 15.2 mm (cable 4-8 mm); M12 hole 12 mm **(approx)** | Or a plain hole or slot 2-3 mm wider than the cable, plus a zip-tie loop inside as strain relief |
| Wire bundle | | A rounded slot in the base wall with a lid lip over it, 1.5 mm wider than the bundle |
| Power switch / button (6 mm tactile) | | 6.5-7 mm hole; panel buttons 12 mm: 12.3 mm hole |
| LED 5 mm | | 5.2-5.4 mm hole; 3 mm LED: 3.2 mm |

### Sensor and display windows

- **HC-SR04 (45 x 20 x 15 mm board, catalog `size`):** two open round "eyes", **about 16 mm diameter each, centers about 26 mm apart (verify: only one vendor drawing gave this; calipers on the actual module decide)**. Cut 16.5-17 mm holes so the metal cans slide in, leave them uncovered, and keep the board seated so the cans protrude through the wall. The module's mounting holes (if any) are small (about 2 mm) and are often unusable; hold the board by the hole edge/lip or with a clip.
- **PIR (catalog 32 x 24 x 25):** the white Fresnel dome is about 23 mm diameter **(approx)**: open round hole 23.5-24 mm with the dome poking through. Do not cover it with plastic (it blocks infrared).
- **OLED 0.96 inch (catalog 27 x 27 x 4):** active area about **21.74 x 10.86 mm** (SSD1306 panel); the module PCB is about 27 x 27-28 mm but varies by vendor (26-30 mm). Window 23.5 x 12.5 mm in the lid (a bit larger than the active area, with a 0.3 mm chamfer so it does not look cropped) and a recess behind it so the glass sits flush. Mounting holes about 2 mm at the corners on most modules **(verify per vendor)**.
- **LCD 1602 (catalog 80 x 36 x 12):** module 80 x 36 mm, viewing area **64.5 x 14-16 mm** (vendors differ: 13.8 vs 16 mm); window about 66 x 16 mm (verify). Mounting holes about 75 x 31 mm are common **(unverified)**. The I2C backpack adds about 4-8 mm of height on the back: allow depth in the lid.
- **Light sensor (LDR):** a 4-5 mm window in the lid; **soil sensor:** the probe leaves through a slot; seal it against water if the box sits near plants.
- **Buzzer:** a 2-3 mm hole or a few holes over the sound port.
- **Button on the board (not catalog):** use an external button part instead of reaching for tiny board buttons.

## 3. STL and OpenSCAD essentials

### Binary STL layout (what `toStl` must write)
- 80-byte header (anything; **do not start it with the text "solid"**, some tools then guess ASCII), then a `uint32` triangle count, then per triangle 50 bytes: normal (3 x `float32`), vertex 1, 2, 3 (3 x `float32` each), and a `uint16` attribute byte count (0). Little-endian. File size = 84 + 50 x triangles.
- Vertices wind **counter-clockwise when seen from outside**; the normal is the right-hand rule normal `(v2 - v1) x (v3 - v1)` normalized, pointing **outward**. A wrong winding turns the inside out and slicers show holes or invert.
- **Watertight (manifold):** every edge is shared by exactly two triangles, no gaps, no duplicate or zero-area triangles, no overlapping or self-intersecting shells. Solids that only touch (box + cylinder sharing a face) are fine; solids that overlap must be unioned first. A box with a cutout is one shell with an inner wall, not two overlapping boxes.
- Units: STL has none. **Write millimetres** (slicers assume mm). Z up. The origin does not matter, but center the part on the bed footprint and put the lowest point at z = 0 for the print service.
- Volume for estimates: `V = sum(v1 . (v2 x v3)) / 6` over all triangles (signed tetrahedra); it is exact for a closed outward-oriented mesh. Use it in a test: a 10 x 20 x 30 mm box must give 6000 mm3.
- Tests: assert counts, size = 84 + 50n, all normals unit length, an edge-pair check for watertightness, and the box volume.

### OpenSCAD basics (`toScad` output)
- Units are mm. Primitives: `cube([w, d, h])`, `cylinder(h = h, r = r, $fn = 48)`, `sphere`. Transforms: `translate([x, y, z])`, `rotate([rx, ry, rz])`, `mirror`. Booleans: `union()`, `difference()`, `intersection()`.
- Box with a cutout:
```openscad
difference() {
  cube([60, 40, 20]);                                   // outer
  translate([2, 2, 2]) cube([56, 36, 20]);              // hollow (inner)
  translate([-0.1, 12, 6]) cube([4, 13.5, 12]);         // USB cutout, with extra 0.1 mm
}
```
- Cut slightly beyond the surface (epsilon 0.01-0.1 mm) so coincident faces do not leave zero-thickness skins. Use `$fn` 32-64 for round holes (more for the eyes of the sensor).
- CLI: `openscad -o box.stl box.scad` (the STL is written as ASCII by default in 2021.01, some newer builds accept `--export-format binstl`; **verify your version**). Newer snapshots also have a faster `--backend=Manifold` **(verify)**. If the CLI is missing, the app can still export the `.scad` and generate the STL itself with `toStl`.
- Keep parameters at the top (`wall = 2; clearance = 0.3; screw = 2.8;`) so makers can tweak them.
- Use libraries only under an open license and say so in the file header (BOSL2 for rounded cuboids, threads and snap helpers; see below).

## 4. Open sources and licenses

Check the repo's `LICENSE` file before importing anything; the licenses below come from the project hand-off notes and were **not re-verified here** unless noted. Record the chosen source in a part's `source` field (name, license, url). Anything with a share-alike or GPL license makes derived data share-alike/GPL too: keep such code out of the closed product unless the team decides otherwise.

| Source | URL | Good for | License |
|---|---|---|---|
| YAPP_Box | https://github.com/mrWheel/YAPP_Box | Parametric OpenSCAD boxes for PCBs: lids, standoffs, cutouts | MIT **(unverified)** |
| BOSL2 | https://github.com/BelfrySCAD/BOSL2 | OpenSCAD library: rounded shapes, threads, joints, snap fits | BSD-2-Clause (allows selling) |
| NopSCADlib | https://github.com/nophead/NopSCADlib | 1,000+ parts: PCBs, screws, connectors, displays | GPL-3 **(unverified)**: derived work would be GPL |
| Adafruit CAD Parts | https://github.com/adafruit/Adafruit_CAD_Parts | Board/sensor dimensions as STEP/STL (ESP32 DevKit and Pico style boards, OLED) | MIT |
| kicad-lib-arduino | https://github.com/g200kg/kicad-lib-arduino | Arduino boards in 3D | CC0 |
| kicad-packages3D | https://gitlab.com/kicad/libraries/kicad-packages3D | Connectors and components in 3D | CC-BY-SA 4.0 (the KiCad libraries carry an exception for derived products **(verify the exact wording)**) |
| fritzing-parts | https://github.com/fritzing/fritzing-parts | 2D drawings, pin layouts | CC-BY-SA 3.0 |
| Arduino docs-content | https://github.com/arduino/docs-content | Official board drawings | Varies per file |

Not usable for a product that sells prints: **SparkFun 3D_Models** (no clear license), **Ultimate Box Maker** (no commercial use), **Thingiverse / Printables** (license per model, no bulk download). Do not copy geometry from them; measure the real part instead.

When you take only **measurements** (width, depth, hole positions) from a public datasheet, no geometry is copied: say "Hoja de datos del fabricante" in `source` and keep `license` as "medidas públicas".

## 5. How the print-service estimate works

The enclosure result carries `grams` and `printMinutes`; the UI shows them as an estimate.
1. **Volume:** from the mesh (`V` above) of the printed groups. Add the standoffs, bosses and lid. Exclude screws, inserts and the board.
2. **Grams:** `grams = V_cm3 x density x fill`, with PLA density **1.24 g/cm3** (PETG about 1.27, ABS about 1.04, ASA about 1.07: **approx**). Thin 2 mm walls are almost all perimeters, so use `fill = 1` for a conservative figure, or about 0.5-0.7 for 2 mm walls at 15-20 % infill **(approx; slicer decides)**. Spool waste and supports add 5-10 %.
3. **Time:** `minutes = V_mm3 / (flow x 60) x overhead`, with a typical effective volumetric flow of about 4 mm3/s (0.4 mm nozzle, 0.2 mm layers, about 50 mm/s) and overhead about 1.3 for travel, acceleration, layer changes and first layers. Sanity check: about 30 g of PLA is about 24 cm3, about 2.5-3 h, so roughly 8-12 g per hour. **(approx)**
4. **Show it as a range or "aprox."** and never as a quote. Pricing, material choice and shipping are business rules of the service, not decided here: do not invent prices. Do tell the person the material the estimate assumes.
5. Test the estimate with a known box (a 40 x 30 x 20 mm box with 2 mm walls has an easily computed shell volume) so the formula stays honest.

## 6. Checklist before offering a box

- Board fits (footprint + clearance) and the holes line up with the catalog `holes`.
- Every connector the person needs (USB, jack) has a cutout; every sensor that needs air or sight has an open hole or window.
- No overhang worse than 45 degrees without a plan; walls 2 mm or more; the STL passes the watertight test.
- Material suggestion fits the heat (PETG by default, ASA for L298N or outdoors).
- The estimate is labelled "aprox."
- Low voltage only.
