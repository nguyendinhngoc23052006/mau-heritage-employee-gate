import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import { Layout } from "../components/Layout";
import { AuthGate } from "../components/AuthGate";

// Slice route files. Each slice exports RouteObject[] (children of /store/:storeId).
import { authRoutes } from "../routes/auth";
import { onboardingRoutes } from "../routes/onboarding";
import { inviteRoutes } from "../routes/invite";
import { dashboardRoutes } from "../routes/dashboard";
import { scheduleRoutes } from "../routes/schedule";
import { clockRoutes } from "../routes/clock";
import { salesRoutes } from "../routes/sales";
import { peopleRoutes } from "../routes/people";
import { rulesRoutes } from "../routes/rules";
import { payrollRoutes } from "../routes/payroll";
import { announcementsRoutes } from "../routes/announcements";
import { auditRoutes } from "../routes/audit";
import { settingsRoutes } from "../routes/settings";
import { meRoutes } from "../routes/me";

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
  ...settingsRoutes,
  ...meRoutes,
];

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace /> },
  ...authRoutes,
  ...onboardingRoutes,
  ...inviteRoutes,
  {
    path: "/store/:storeId",
    element: (
      <AuthGate>
        <Layout />
      </AuthGate>
    ),
    children: storeChildren,
  },
]);
