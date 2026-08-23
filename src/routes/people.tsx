import type { RouteObject } from "react-router-dom";
import { EmployeeDetailPage } from "../pages/EmployeeDetailPage";
import { PeoplePage } from "../pages/PeoplePage";

export const peopleRoutes: RouteObject[] = [
  { path: "people", element: <PeoplePage /> },
  { path: "people/:userId", element: <EmployeeDetailPage /> },
];
