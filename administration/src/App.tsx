import { RouterProvider } from "react-router";
import { router } from "./app/router";
import { AuthProvider } from "./app/providers/AuthProvider";
import { BlockUiProvider } from "./app/providers/BlockUiProvider";
import { ThemeContextProvider } from "./contexts/ThemeContext/ThemeContextProvider";
import { AppContextProvider } from "./contexts/AppContext/AppContextProvider";
import "./layouts/design-system.css";
// import { PrimeReactProvider, PrimeReactContext } from 'primereact/api';

function App() {
  return (
    <ThemeContextProvider>
      <AppContextProvider>
        <BlockUiProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </BlockUiProvider>
      </AppContextProvider>
    </ThemeContextProvider>
  );
}

export default App;
