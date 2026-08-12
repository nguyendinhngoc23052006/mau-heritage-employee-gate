import type { RouteObject } from "react-router-dom";
import { SchedulePage } from "../pages/SchedulePage";

export const scheduleRoutes: RouteObject[] = [
  { path: "schedule", element: <SchedulePage /> },
];
