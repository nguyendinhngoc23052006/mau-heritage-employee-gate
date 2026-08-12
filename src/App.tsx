import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { router } from "./lib/router";
import { queryClient } from "./lib/query";
import { I18nProvider } from "./lib/i18n";
import { installGlobalErrorLogging } from "./lib/errorLog";

installGlobalErrorLogging();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>
  );
}
