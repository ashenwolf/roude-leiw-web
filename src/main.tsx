import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppWrapper } from "./ui/AppWrapper.tsx";
import { NavigationProvider } from "./context/NavigationContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NavigationProvider>
      <AppWrapper>
        <App />
      </AppWrapper>
    </NavigationProvider>
  </StrictMode>
);
