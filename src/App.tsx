import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { installGlobalErrorLogging } from "./lib/errorLog";
import { I18nProvider } from "./lib/i18n";
import { queryClient } from "./lib/query";
import { router } from "./lib/router";

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
