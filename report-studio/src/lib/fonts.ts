// Self-hosted static fonts (see src/fonts/README.md). Static instances, not
// the variable fonts next/font/google would fetch, so the PDF matches the
// reference glyph for glyph.
import localFont from "next/font/local";

// App chrome (GBS brand).
export const baloo = localFont({
  src: [
    { path: "../fonts/Baloo2-SemiBold.ttf", weight: "600" },
    { path: "../fonts/Baloo2-Bold.ttf", weight: "700" },
    { path: "../fonts/Baloo2-ExtraBold.ttf", weight: "800" },
  ],
  variable: "--font-baloo",
  display: "block",
});
export const poppins = localFont({
  src: [
    { path: "../fonts/Poppins-Regular.ttf", weight: "400" },
    { path: "../fonts/Poppins-Medium.ttf", weight: "500" },
    { path: "../fonts/Poppins-SemiBold.ttf", weight: "600" },
    { path: "../fonts/Poppins-Bold.ttf", weight: "700" },
  ],
  variable: "--font-poppins",
  display: "swap",
});

// Client reports.
export const instrumentSerif = localFont({
  src: [
    { path: "../fonts/InstrumentSerif-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/InstrumentSerif-Italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument-serif",
  display: "block",
});
export const hanken = localFont({
  src: [
    { path: "../fonts/HankenGrotesk-Regular.ttf", weight: "400" },
    { path: "../fonts/HankenGrotesk-Medium.ttf", weight: "500" },
    { path: "../fonts/HankenGrotesk-SemiBold.ttf", weight: "600" },
    { path: "../fonts/HankenGrotesk-Bold.ttf", weight: "700" },
  ],
  variable: "--font-hanken",
  display: "block",
});

export const fontVariables = [baloo.variable, poppins.variable, instrumentSerif.variable, hanken.variable].join(" ");
