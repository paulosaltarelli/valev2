import { useState, useEffect } from "react";

export function ThemeToggleButton() {
  // 1. Initialize state for the current theme
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  // 2. Function to update the theme on the HTML element
  const updateThemeOnHtmlEl = (theme: string) => {
    document.documentElement.setAttribute("data-theme", theme);
  };

  // 4. On initial render, set the theme from localStorage
  useEffect(() => {
    updateThemeOnHtmlEl(theme);
  }, [theme]);

  // 5. Toggle theme when button is clicked
  const handleThemeToggle = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeOnHtmlEl(newTheme);
  };

  return (
    <button
      type='button'
      data-theme-toggle
      aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
      className='w-40-px h-40-px bg-neutral-200 rounded-circle d-flex justify-content-center align-items-center'
      onClick={handleThemeToggle}
    >
      <span className="visually-hidden">Alternar tema</span>
    </button>
  );
}
