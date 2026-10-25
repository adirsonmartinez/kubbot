import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import "@/views/styles/ui.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const robotoMono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Qubbot",
  description: "Qubbot: laboratorio de sistemas Arduino en 3D",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} ${robotoMono.variable}`}>
      <body>
        {/* Liquid glass: bends what is behind a glass surface near its edges (see .glass-panel) */}
        <svg width="0" height="0" aria-hidden focusable="false" style={{ position: "absolute" }}>
          <filter id="liquid-glass" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves={2} seed={7} result="noise" />
            <feGaussianBlur in="noise" stdDeviation="2.5" result="soft" />
            <feDisplacementMap in="SourceGraphic" in2="soft" scale={38} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        {children}
      </body>
    </html>
  );
}
