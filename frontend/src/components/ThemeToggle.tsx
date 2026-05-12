"use client";

import { useTheme } from "next-themes";
import { SunIcon, MoonIcon } from "./icons";

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  if (!resolvedTheme) return <div className="h-9 w-9" />;

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border transition-colors hover:bg-border/40"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <SunIcon className="h-4 w-4" />
      ) : (
        <MoonIcon className="h-4 w-4" />
      )}
    </button>
  );
}
