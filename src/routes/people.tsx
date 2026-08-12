import type { RouteObject } from "react-router-dom";
import { PeoplePage } from "../pages/PeoplePage";

export const peopleRoutes: RouteObject[] = [
  { path: "people", element: <PeoplePage /> },
];
