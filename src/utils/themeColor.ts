// Generates a Tailwind-style 100..950 shade scale (plus rgb helpers)
// from a single accent hex color, so admins can upload just one color
// and get a full custom theme without hand-picking every shade.

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return "#" + [r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("");
}

// Mix the color toward white (amount > 0) or black (amount < 0), amount in [-1, 1]
function mix(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return rgbToHex(r + (target - r) * t, g + (target - g) * t, b + (target - b) * t);
}

export interface ThemeShades {
  "100": string; "200": string; "300": string; "400": string; "500": string;
  "600": string; "700": string; "800": string; "900": string; "950": string;
  rgb500: string; rgb600: string;
}

export function generateShadesFromHex(baseHex: string): ThemeShades {
  const hex = baseHex.startsWith("#") ? baseHex : `#${baseHex}`;
  const shades: ThemeShades = {
    "100": mix(hex, 0.85),
    "200": mix(hex, 0.7),
    "300": mix(hex, 0.5),
    "400": mix(hex, 0.25),
    "500": hex,
    "600": mix(hex, -0.15),
    "700": mix(hex, -0.3),
    "800": mix(hex, -0.45),
    "900": mix(hex, -0.6),
    "950": mix(hex, -0.75),
    rgb500: hexToRgb(hex).join(", "),
    rgb600: hexToRgb(mix(hex, -0.15)).join(", "),
  };
  return shades;
}

export function shadesToCssVars(shades: ThemeShades): string {
  return `
    --theme-100: ${shades["100"]};
    --theme-200: ${shades["200"]};
    --theme-300: ${shades["300"]};
    --theme-400: ${shades["400"]};
    --theme-500: ${shades["500"]};
    --theme-600: ${shades["600"]};
    --theme-700: ${shades["700"]};
    --theme-800: ${shades["800"]};
    --theme-900: ${shades["900"]};
    --theme-950: ${shades["950"]};
    --theme-rgb-500: ${shades.rgb500};
    --theme-rgb-600: ${shades.rgb600};
  `;
}

export interface CustomThemeFile {
  name?: string;
  // Either provide a single accent color...
  primary?: string;
  // ...or a fully hand-picked shade scale.
  colors?: Partial<ThemeShades>;
}

export function resolveCustomTheme(file: CustomThemeFile): { name: string; shades: ThemeShades } {
  if (file.colors && file.colors["500"]) {
    const base = generateShadesFromHex(file.colors["500"]);
    return { name: file.name || "Custom", shades: { ...base, ...file.colors } as ThemeShades };
  }
  if (file.primary) {
    return { name: file.name || "Custom", shades: generateShadesFromHex(file.primary) };
  }
  throw new Error("Theme file needs either a 'primary' hex color or a 'colors' object with at least a '500' shade.");
}

// ---------------------------------------------------------------------------
// Full "reskin" theme support (Pterodactyl-style): a single uploaded JSON can
// also override the base surface palette (background/card/text/borders),
// the UI font, and inject raw CSS — so the whole panel changes, not just the
// accent color scale.
// ---------------------------------------------------------------------------

export interface SurfaceColors {
  background?: string;      // page background
  card?: string;            // card/panel background
  foreground?: string;      // primary text
  foregroundMuted?: string; // slightly muted text
  mutedForeground?: string; // secondary/label text
  border?: string;
  borderSubtle?: string;
  borderStrong?: string;
  muted?: string;           // subtle fill (e.g. hover backgrounds)
  mutedHover?: string;
  mutedSubtle?: string;
}

export interface ThemeFont {
  family: string;           // CSS font-family value for body text, e.g. "'Orbitron', sans-serif"
  mono?: string;            // CSS font-family value for code/mono elements
  googleFontUrl?: string;   // optional https://fonts.googleapis.com/... stylesheet to load
}

export interface ButtonColors {
  bg?: string;
  text?: string;
}

export interface GlowEffect {
  enabled?: boolean;   // adds a soft accent-colored glow on card hover
  intensity?: number;  // 0..1, defaults to 0.25
}

export interface BackgroundPattern {
  url: string;         // image/pattern to lay over the page background
  size?: string;        // CSS background-size, e.g. "cover", "400px"
  opacity?: number;     // 0..1, defaults to 0.15
}

export interface FullThemeFile extends CustomThemeFile {
  background?: SurfaceColors;
  font?: ThemeFont;
  buttonPrimary?: ButtonColors;
  radius?: string;              // e.g. "0.5rem", "1.25rem", "9999px" (pill), "0px" (sharp)
  glow?: GlowEffect;
  backgroundPattern?: BackgroundPattern;
  customCss?: string;           // raw CSS injected as-is (advanced users)
}

export interface ResolvedFullTheme {
  name: string;
  shades: ThemeShades;
  surface?: SurfaceColors;
  font?: ThemeFont;
  buttonPrimary?: ButtonColors;
  radius?: string;
  glow?: GlowEffect;
  backgroundPattern?: BackgroundPattern;
  customCss?: string;
}

const DEFAULT_ACCENT = "#6366f1"; // indigo, used only if a full reskin ships with no accent at all

export function resolveFullTheme(file: FullThemeFile): ResolvedFullTheme {
  const hasAccent = !!(file.primary || (file.colors && file.colors["500"]));
  const hasAnything =
    hasAccent || file.background || file.font || file.buttonPrimary ||
    file.radius || file.glow || file.backgroundPattern || file.customCss || file.name;
  if (!hasAnything) {
    throw new Error("Theme file is empty — provide at least a 'primary' color, 'background' palette, 'font', 'radius', 'glow', 'backgroundPattern', or 'customCss'.");
  }

  let shades: ThemeShades;
  if (file.colors && file.colors["500"]) {
    shades = { ...generateShadesFromHex(file.colors["500"]), ...file.colors } as ThemeShades;
  } else if (file.primary) {
    shades = generateShadesFromHex(file.primary);
  } else {
    shades = generateShadesFromHex(DEFAULT_ACCENT);
  }

  return {
    name: file.name || "Custom",
    shades,
    surface: file.background,
    font: file.font,
    buttonPrimary: file.buttonPrimary,
    radius: file.radius,
    glow: file.glow,
    backgroundPattern: file.backgroundPattern,
    customCss: file.customCss,
  };
}

export function surfaceToCssVars(s?: SurfaceColors): string {
  if (!s) return "";
  const map: Array<[string, string | undefined]> = [
    ["--bg-background", s.background],
    ["--bg-card", s.card],
    ["--text-foreground", s.foreground],
    ["--text-foreground-muted", s.foregroundMuted],
    ["--text-muted-foreground", s.mutedForeground],
    ["--border-border", s.border],
    ["--border-border-subtle", s.borderSubtle],
    ["--border-border-strong", s.borderStrong],
    ["--bg-muted", s.muted],
    ["--bg-muted-hover", s.mutedHover],
    ["--bg-muted-subtle", s.mutedSubtle],
  ];
  return map.filter(([, v]) => !!v).map(([k, v]) => `${k}: ${v};`).join("\n    ");
}

// Uniformly overrides every rounded-* utility (except rounded-full, so avatars
// and circular icons stay round) so a single radius value reshapes the whole
// panel — sharp/square, soft, or fully pill-shaped corners.
function radiusOverrideCss(radius?: string): string {
  if (!radius) return "";
  const classes = ["rounded-sm", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-3xl", "rounded"];
  const selectors = classes.map((c) => `[data-theme="custom"] [class*="${c}"]`).join(",\n");
  return `${selectors} {\n    border-radius: ${radius} !important;\n  }`;
}

function glowCss(glow?: GlowEffect, rgb500?: string): string {
  if (!glow?.enabled || !rgb500) return "";
  const intensity = glow.intensity ?? 0.25;
  return `[data-theme="custom"] .card-lift:hover, [data-theme="custom"] [class*="rounded-"]:hover {
    box-shadow: 0 0 28px rgba(${rgb500}, ${intensity});
  }`;
}

function backgroundPatternCss(pattern?: BackgroundPattern): string {
  if (!pattern?.url) return "";
  const opacity = pattern.opacity ?? 0.15;
  const size = pattern.size || "cover";
  return `[data-theme="custom"] body::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    opacity: ${opacity};
    background-image: url("${pattern.url}");
    background-size: ${size};
    background-repeat: repeat;
  }
  [data-theme="custom"] #root {
    position: relative;
    z-index: 1;
  }`;
}

// Builds the full <style> textContent for a resolved theme, scoped under
// [data-theme="custom"] so it only takes effect while the uploaded theme is
// the active selection (switching to a named theme reverts everything).
export function buildFullThemeCss(theme: ResolvedFullTheme | null): string {
  if (!theme) return "";
  const accentVars = shadesToCssVars(theme.shades);
  const surfaceVars = surfaceToCssVars(theme.surface);
  const fontVar = theme.font?.family ? `--font-sans: ${theme.font.family};` : "";
  const monoVar = theme.font?.mono ? `--font-mono: ${theme.font.mono};` : "";
  const btnVars = [
    theme.buttonPrimary?.bg ? `--btn-primary-bg: ${theme.buttonPrimary.bg};` : "",
    theme.buttonPrimary?.text ? `--btn-primary-text: ${theme.buttonPrimary.text};` : "",
  ].join("\n    ");

  const scoped = `[data-theme="custom"] {\n    ${accentVars}\n    ${surfaceVars}\n    ${fontVar}\n    ${monoVar}\n    ${btnVars}\n  }`;
  const radiusBlock = radiusOverrideCss(theme.radius);
  const glowBlock = glowCss(theme.glow, theme.shades.rgb500);
  const patternBlock = backgroundPatternCss(theme.backgroundPattern);
  const extra = theme.customCss ? `\n[data-theme="custom"] {\n${theme.customCss}\n}` : "";

  return [scoped, radiusBlock, glowBlock, patternBlock, extra].filter(Boolean).join("\n\n");
}
