// A small flat illustration of each catalog part (48x48). Colors come from CSS: the body takes the
// part's own color (--part, set by the card), details are neutral. Static markup, no project data.

import type { ReactNode } from "react";

// Shorthand classes (see lab.css): b = body, d = dark detail, m = metal, l = outline, w = light detail
const ART: Record<string, ReactNode> = {
  "arduino-uno": (
    <>
      <rect className="b" x="4" y="9" width="40" height="30" rx="3" />
      <rect className="m" x="2" y="13" width="12" height="9" rx="1" />
      <rect className="d" x="2" y="28" width="9" height="8" rx="1.5" />
      <rect className="d" x="24" y="21" width="14" height="6" rx="1" />
      <path className="l" d="M18 9v3M22 9v3M26 9v3M30 9v3M34 9v3M18 36v3M22 36v3M26 36v3M30 36v3M34 36v3" />
      <circle className="w" cx="19" cy="24" r="2.2" />
    </>
  ),
  "arduino-nano": (
    <>
      <rect className="b" x="3" y="16" width="42" height="16" rx="2.5" />
      <rect className="m" x="1" y="20" width="8" height="8" rx="1" />
      <rect className="d" x="22" y="20" width="11" height="8" rx="1" />
      <path className="l" d="M12 16v-3M16 16v-3M20 16v-3M24 16v-3M28 16v-3M32 16v-3M36 16v-3M12 32v3M16 32v3M20 32v3M24 32v3M28 32v3M32 32v3M36 32v3" />
    </>
  ),
  "esp32-devkit": (
    <>
      <rect className="b" x="14" y="4" width="20" height="40" rx="3" />
      <rect className="m" x="17" y="14" width="14" height="14" rx="1.5" />
      <path className="l" d="M18 11h12l-3-3h-6zM20 8v-2M24 8V6M28 8V6" />
      <rect className="d" x="20" y="38" width="8" height="6" rx="1" />
      <path className="l" d="M10 12v22M38 12v22" strokeDasharray="1 3" />
    </>
  ),
  pico: (
    <>
      <rect className="b" x="14" y="3" width="20" height="42" rx="2.5" />
      <rect className="m" x="19" y="1" width="10" height="7" rx="1" />
      <rect className="d" x="19" y="21" width="10" height="10" rx="1" />
      <path className="l" d="M10 10v28M38 10v28" strokeDasharray="1.6 2.2" />
      <circle className="w" cx="24" cy="14" r="1.6" />
    </>
  ),
  "hc-sr04": (
    <>
      <rect className="b" x="3" y="12" width="42" height="24" rx="3" />
      <circle className="m" cx="15" cy="24" r="8" />
      <circle className="d" cx="15" cy="24" r="4.5" />
      <circle className="m" cx="33" cy="24" r="8" />
      <circle className="d" cx="33" cy="24" r="4.5" />
      <path className="l" d="M18 36v4M22 36v4M26 36v4M30 36v4" />
    </>
  ),
  pir: (
    <>
      <rect className="b" x="6" y="26" width="36" height="16" rx="3" />
      <circle className="w" cx="24" cy="23" r="13" />
      <path className="l" d="M24 10v26M14 15l10 8 10-8M12 23h24" />
      <path className="l" d="M14 42v3M24 42v3M34 42v3" />
    </>
  ),
  dht22: (
    <>
      <rect className="b" x="11" y="4" width="26" height="31" rx="3" />
      <path className="l" d="M16 10h16M16 15h16M16 20h16M16 25h16" />
      <path className="l" d="M15 35v9M21 35v9M27 35v9M33 35v9" />
    </>
  ),
  soil: (
    <>
      <path className="b" d="M10 5h28v14l-4 4v18l-4 5-4-5V23H22v18l-4 5-4-5V23l-4-4z" />
      <rect className="d" x="15" y="8" width="18" height="8" rx="1.5" />
      <circle className="w" cx="19" cy="12" r="1.6" />
      <path className="l" d="M18 28v10M30 28v10" strokeDasharray="1 3" />
    </>
  ),
  ldr: (
    <>
      <circle className="b" cx="24" cy="21" r="14" />
      <path className="l" d="M14 16h20M14 21h20M14 26h20" strokeDasharray="0.1 0.1" />
      <path className="w" d="M15 16c6 0 4 5 10 5s4-5 10-5M15 26c6 0 4-5 10-5s4 5 10 5" />
      <path className="l" d="M20 35v10M28 35v10" />
    </>
  ),
  "servo-sg90": (
    <>
      <rect className="b" x="4" y="14" width="34" height="22" rx="2.5" />
      <rect className="b" x="1" y="22" width="5" height="6" rx="1" />
      <rect className="b" x="36" y="22" width="5" height="6" rx="1" />
      <circle className="d" cx="30" cy="25" r="6" />
      <rect className="w" x="28" y="8" width="4" height="17" rx="2" />
      <circle className="m" cx="30" cy="25" r="2.2" />
    </>
  ),
  relay: (
    <>
      <rect className="b" x="5" y="9" width="38" height="30" rx="3" />
      <rect className="d" x="9" y="13" width="18" height="22" rx="2" />
      <path className="l" d="M31 17h8M31 24h8M31 31h8" />
      <circle className="w" cx="35" cy="14" r="1.7" />
    </>
  ),
  buzzer: (
    <>
      <circle className="b" cx="24" cy="24" r="17" />
      <circle className="d" cx="24" cy="24" r="4" />
      <path className="l" d="M24 12a12 12 0 0 1 12 12M24 17a7 7 0 0 1 7 7" />
      <path className="w" d="M16 41v4M32 41v4" />
    </>
  ),
  led: (
    <>
      <path className="b" d="M14 24V16a10 10 0 0 1 20 0v8z" />
      <rect className="b" x="12" y="24" width="24" height="5" rx="1" />
      <path className="w" d="M19 18a6 6 0 0 1 4-5" />
      <path className="l" d="M19 29v15M29 29v11" />
      <path className="l" d="M38 6l4-3M40 14h5M8 6L4 3" />
    </>
  ),
  l298n: (
    <>
      <rect className="b" x="5" y="6" width="38" height="36" rx="3" />
      <rect className="m" x="11" y="8" width="26" height="14" rx="1.5" />
      <path className="l" d="M15 8v14M19 8v14M23 8v14M27 8v14M31 8v14M35 8v14" />
      <rect className="d" x="11" y="28" width="9" height="8" rx="1" />
      <rect className="w" x="26" y="29" width="4" height="7" rx="1" />
      <rect className="w" x="33" y="29" width="4" height="7" rx="1" />
    </>
  ),
  "oled-128x64": (
    <>
      <rect className="b" x="7" y="8" width="34" height="32" rx="3" />
      <rect className="d" x="11" y="12" width="26" height="17" rx="1.5" />
      <path className="w" d="M14 17h12M14 21h18M14 25h8" />
      <path className="l" d="M16 34v4M22 34v4M28 34v4M34 34v4" />
    </>
  ),
  "lcd-1602-i2c": (
    <>
      <rect className="b" x="2" y="10" width="44" height="28" rx="3" />
      <rect className="d" x="6" y="14" width="36" height="16" rx="1.5" />
      <path className="w" d="M9 19h4M15 19h4M21 19h4M27 19h4M33 19h4M9 25h4M15 25h4M21 25h4" />
      <path className="l" d="M10 34h28" strokeDasharray="1.2 2" />
    </>
  ),
  button: (
    <>
      <rect className="b" x="7" y="7" width="34" height="34" rx="4" />
      <circle className="d" cx="24" cy="24" r="11" />
      <circle className="w" cx="24" cy="24" r="6.5" />
      <path className="l" d="M3 14h4M3 34h4M41 14h4M41 34h4" />
    </>
  ),
  potentiometer: (
    <>
      <rect className="b" x="6" y="12" width="36" height="30" rx="3" />
      <circle className="d" cx="24" cy="23" r="12" />
      <circle className="m" cx="24" cy="23" r="7" />
      <path className="w" d="M24 23l5-8" />
      <path className="l" d="M14 42v3M24 42v3M34 42v3" />
    </>
  ),
  "battery-aa4": (
    <>
      <rect className="b" x="3" y="9" width="42" height="30" rx="4" />
      <rect className="d" x="7" y="13" width="7" height="22" rx="3" />
      <rect className="d" x="16" y="13" width="7" height="22" rx="3" />
      <rect className="d" x="25" y="13" width="7" height="22" rx="3" />
      <rect className="d" x="34" y="13" width="7" height="22" rx="3" />
      <path className="w" d="M10.5 17v4M8.5 19h4M19.5 17v4M17.5 19h4" />
    </>
  ),
};

// Fallback by category (the same line icons the prototype used), drawn on a 24-unit grid
const CATEGORY_ART: Record<string, ReactNode> = {
  boards: (
    <>
      <rect className="l" x="6" y="6" width="12" height="12" rx="2" />
      <rect className="l" x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path className="l" d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" />
    </>
  ),
  sensors: (
    <>
      <circle className="l" cx="12" cy="15" r="2" />
      <path className="l" d="M8.5 11.5a5 5 0 0 1 7 0M5.6 8.6a9 9 0 0 1 12.8 0M12 17v4" />
    </>
  ),
  actuators: (
    <>
      <circle className="l" cx="12" cy="12" r="3" />
      <path className="l" d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>
  ),
  displays: (
    <>
      <rect className="l" x="3" y="4.5" width="18" height="12" rx="2" />
      <path className="l" d="M7 8.5h6M7 12.5h10M9 20h6M12 16.5V20" />
    </>
  ),
  inputs: (
    <>
      <circle className="l" cx="12" cy="13.5" r="6.5" />
      <path className="l" d="M12 13.5l3.2-3.2M12 2.5v2" />
    </>
  ),
  power: (
    <>
      <rect className="l" x="2.5" y="7" width="16.5" height="10" rx="2" />
      <path className="l" d="M21.5 10.5v3M8 12h5M10.5 9.5v5" />
    </>
  ),
};

export function PartIcon({ id, category, size = 40 }: { id: string; category?: string; size?: number }) {
  const art = ART[id];
  const fallback = !art ? (category && CATEGORY_ART[category]) || CATEGORY_ART.sensors : null;
  return (
    <svg
      className="part-icon"
      viewBox={art ? "0 0 48 48" : "0 0 24 24"}
      width={size}
      height={size}
      aria-hidden
      focusable="false"
    >
      {art ?? fallback}
    </svg>
  );
}
