import { useContext } from "react";
import { AppContext } from "./AppContext";

export function useAppContext() {
  // Hook para usar o contexto no componente
  return useContext(AppContext);
}
