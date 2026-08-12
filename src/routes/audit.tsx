import type { RouteObject } from "react-router-dom";
import { AuditPage } from "../pages/AuditPage";

export const auditRoutes: RouteObject[] = [
  { path: "audit", element: <AuditPage /> },
];
