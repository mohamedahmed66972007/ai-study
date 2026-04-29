import { Link, useLocation } from "wouter";
import { Sparkles, Library, FileQuestion, UploadCloud } from "lucide-react";
import { ThemeModeToggle, ColorThemePicker } from "./theme-controls";
import { cn } from "@/lib/utils";

function NavLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const [location] = useLocation();
  const active =
    href === "/" ? location === "/" : location.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{children}</span>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border/60 glass">
        <div className="container mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary/30 blur-md rounded-xl"></div>
              <div className="relative bg-gradient-to-br from-primary to-primary/70 p-2 rounded-xl shadow-sm">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-extrabold text-lg tracking-tight">
                مذاكر الذكي
              </span>
              <span className="text-[10px] font-medium text-muted-foreground hidden sm:inline">
                مساعدك الدراسي بالذكاء الاصطناعي
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink href="/" icon={Library}>
              مكتبتي
            </NavLink>
            <NavLink href="/sheets" icon={FileQuestion}>
              أوراق الأسئلة
            </NavLink>
            <NavLink href="/upload" icon={UploadCloud}>
              رفع جديد
            </NavLink>
          </nav>

          <div className="flex items-center gap-2">
            <ColorThemePicker />
            <ThemeModeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col relative">{children}</main>
    </div>
  );
}
