import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Mode = "light" | "dark";
export type ColorTheme =
  | "teal"
  | "blue"
  | "green"
  | "red"
  | "yellow"
  | "purple"
  | "rose"
  | "orange";

export interface ColorThemeMeta {
  id: ColorTheme;
  label: string;
  /** Swatch shown in the picker (CSS color string). */
  swatch: string;
}

export const COLOR_THEMES: ColorThemeMeta[] = [
  { id: "teal", label: "زمردي", swatch: "hsl(170 43% 30%)" },
  { id: "blue", label: "أزرق", swatch: "hsl(217 84% 50%)" },
  { id: "green", label: "أخضر", swatch: "hsl(142 60% 38%)" },
  { id: "red", label: "أحمر", swatch: "hsl(0 72% 50%)" },
  { id: "yellow", label: "أصفر", swatch: "hsl(43 90% 50%)" },
  { id: "orange", label: "برتقالي", swatch: "hsl(24 90% 52%)" },
  { id: "purple", label: "بنفسجي", swatch: "hsl(265 65% 52%)" },
  { id: "rose", label: "وردي", swatch: "hsl(335 72% 52%)" },
];

interface ThemeContextValue {
  mode: Mode;
  color: ColorTheme;
  setMode: (mode: Mode) => void;
  setColor: (color: ColorTheme) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const MODE_KEY = "mudhakir.mode";
const COLOR_KEY = "mudhakir.color";

function readInitialMode(): Mode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(MODE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    ? "dark"
    : "light";
}

function readInitialColor(): ColorTheme {
  if (typeof window === "undefined") return "teal";
  const stored = window.localStorage.getItem(COLOR_KEY) as ColorTheme | null;
  if (stored && COLOR_THEMES.some((t) => t.id === stored)) return stored;
  return "teal";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => readInitialMode());
  const [color, setColorState] = useState<ColorTheme>(() => readInitialColor());

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    root.style.colorScheme = mode;
    try {
      window.localStorage.setItem(MODE_KEY, mode);
    } catch {}
  }, [mode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-color", color);
    try {
      window.localStorage.setItem(COLOR_KEY, color);
    } catch {}
  }, [color]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      color,
      setMode: setModeState,
      setColor: setColorState,
      toggleMode: () => setModeState((m) => (m === "dark" ? "light" : "dark")),
    }),
    [mode, color],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
