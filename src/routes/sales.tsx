import type { RouteObject } from "react-router-dom";
import { SalesPage } from "../pages/SalesPage";

export const salesRoutes: RouteObject[] = [
  { path: "sales", element: <SalesPage /> },
];
