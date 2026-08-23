import type { RouteObject } from "react-router-dom";
import ClockCorrectionsPage from "../pages/ClockCorrectionsPage";
import { ClockPage } from "../pages/ClockPage";

export const clockRoutes: RouteObject[] = [
  { path: "clock", element: <ClockPage /> },
  { path: "clock/corrections", element: <ClockCorrectionsPage /> },
];
