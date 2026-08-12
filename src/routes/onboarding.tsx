import type { RouteObject } from "react-router-dom";
import { AuthGate } from "../components/AuthGate";
import { OnboardingPage } from "../pages/OnboardingPage";

export const onboardingRoutes: RouteObject[] = [
  {
    path: "/onboarding",
    element: (
      <AuthGate>
        <OnboardingPage />
      </AuthGate>
    ),
  },
];
