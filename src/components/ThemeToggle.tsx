
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

const STORAGE_KEY = "studyroom-theme";

function readTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;

  root.setAttribute("data-studyroom-theme", theme);

  root.classList.toggle("dark", theme === "dark");

  root.style.colorScheme = theme;

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Continue even if storage is unavailable.
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    function syncTheme(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;

      const nextTheme: Theme =
        event.newValue === "dark" ? "dark" : "light";

      setTheme(nextTheme);
    }

    window.addEventListener("storage", syncTheme);

    return () => {
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  const isDark = theme === "dark";

  function toggleTheme() {
    const nextTheme: Theme = isDark ? "light" : "dark";

    // Apply immediately on click.
    applyTheme(nextTheme);

    setTheme(nextTheme);
  }

  return (
    <button
      type="button"
      className="studyroom-theme-toggle"
      onClick={toggleTheme}
      aria-label={
        isDark
          ? "Switch to light mode"
          : "Switch to dark mode"
      }
      title={
        isDark
          ? "Switch to light mode"
          : "Switch to dark mode"
      }
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}

      <span>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
