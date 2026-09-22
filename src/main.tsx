import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppWrapper } from "./ui/AppWrapper.tsx";
import { NavigationProvider } from "./context/NavigationContext.tsx";
import posthog from "posthog-js";
import { PostHogProvider } from "@posthog/react";

// The key is inlined at build time, so a build without it (e.g. CI, where the
// gitignored .env is absent) would otherwise init the SDK with `undefined` and
// fire doomed ingestion requests. Skip init instead — analytics goes dark, the
// app doesn't.
const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    defaults: "2026-01-30",
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <NavigationProvider>
        <AppWrapper>
          <App />
        </AppWrapper>
      </NavigationProvider>
    </PostHogProvider>
  </StrictMode>
);
