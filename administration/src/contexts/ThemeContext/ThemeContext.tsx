import { initialThemeState } from "./initialThemeState";
import type { ThemeStateModel } from "../../models/ThemeStateModel";
import { createContext } from "react";
import type { ThemeActionModel } from "./themeActions";

const initialContextValue = {
  state: initialThemeState,
  dispatch: () => {},
};

type ThemeContextProps = {
  state: ThemeStateModel;
  dispatch: React.Dispatch<ThemeActionModel>;
};

export const ThemeContext = createContext<ThemeContextProps>(initialContextValue);
