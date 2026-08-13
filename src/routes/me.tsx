import type { RouteObject } from "react-router-dom";
import { ProfilePage } from "../pages/ProfilePage";

export const meRoutes: RouteObject[] = [
  { path: "me", element: <ProfilePage /> },
];
