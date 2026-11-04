import { useEffect, useState } from "react";

export type HtmlTheme = "light" | "dark";

function readTheme(): HtmlTheme {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "dark" ? "dark" : "light";
}

export function useHtmlTheme(): HtmlTheme {
  const [theme, setTheme] = useState<HtmlTheme>(() => readTheme());

  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return theme;
}

