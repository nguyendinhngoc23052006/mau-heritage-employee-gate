import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from "react-router-dom";
import { AuthGate } from "../components/AuthGate";
import { Layout } from "../components/Layout";
import { RouteErrorFallback } from "../components/RouteErrorFallback";
import { AnalyticsPage } from "../pages/AnalyticsPage";
import { DeactivatedPage } from "../pages/DeactivatedPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";

import { announcementsRoutes } from "../routes/announcements";
import { auditRoutes } from "../routes/audit";
// Slice route files. Each slice exports RouteObject[] (children of /store/:storeId).
import { authRoutes } from "../routes/auth";
import { clockRoutes } from "../routes/clock";
import { dashboardRoutes } from "../routes/dashboard";
import { inviteRoutes } from "../routes/invite";
import { meRoutes } from "../routes/me";
import { mePayRoutes } from "../routes/mePay";
import { onboardingRoutes } from "../routes/onboarding";
import { payrollRoutes } from "../routes/payroll";
import { peopleRoutes } from "../routes/people";
import { rulesRoutes } from "../routes/rules";
import { salesRoutes } from "../routes/sales";
import { scheduleRoutes } from "../routes/schedule";
import { settingsRoutes } from "../routes/settings";

const storeChildren: RouteObject[] = [
  ...dashboardRoutes,
  ...scheduleRoutes,
  ...clockRoutes,
  ...salesRoutes,
  ...peopleRoutes,
  ...rulesRoutes,
  ...payrollRoutes,
  ...announcementsRoutes,
  ...auditRoutes,
  { path: "analytics", element: <AnalyticsPage /> },
  ...settingsRoutes,
  ...meRoutes,
  ...mePayRoutes,
];

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace /> },
  ...authRoutes,
  ...onboardingRoutes,
  ...inviteRoutes,
  { path: "/deactivated", element: <DeactivatedPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/health", element: <div>OK</div> },
  {
    path: "/store/:storeId",
    element: (
      <AuthGate>
        <Layout />
      </AuthGate>
    ),
    errorElement: <RouteErrorFallback />,
    children: storeChildren.map((r) => ({
      ...r,
      errorElement: r.errorElement ?? <RouteErrorFallback />,
    })),
  },
]);
