import { Moon, Sun, Palette, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COLOR_THEMES, useTheme } from "./theme-provider";
import { cn } from "@/lib/utils";

export function ThemeModeToggle() {
  const { mode, toggleMode } = useTheme();
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleMode}
      aria-label={mode === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}
      className="rounded-full h-9 w-9"
    >
      {mode === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}

export function ColorThemePicker() {
  const { color, setColor } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-9 w-9"
          aria-label="اختر اللون"
        >
          <Palette className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 p-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">
          الثيم اللوني
        </p>
        <div className="grid grid-cols-4 gap-2">
          {COLOR_THEMES.map((t) => {
            const active = t.id === color;
            return (
              <button
                key={t.id}
                onClick={() => setColor(t.id)}
                className={cn(
                  "relative h-10 w-10 rounded-full border-2 transition-all hover:scale-110",
                  active
                    ? "border-foreground shadow-md"
                    : "border-transparent hover:border-border",
                )}
                style={{ background: t.swatch }}
                aria-label={t.label}
                title={t.label}
              >
                {active && (
                  <Check className="h-4 w-4 text-white absolute inset-0 m-auto drop-shadow" />
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>اللون الحالي:</span>
          <span className="font-medium text-foreground">
            {COLOR_THEMES.find((t) => t.id === color)?.label}
          </span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
