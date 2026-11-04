import { useContext } from "react";
import { ThemeContext } from "./ThemeContext";

export function useThemeContext() {
  // Hook para usar o contexto no componente
  return useContext(ThemeContext);
}
