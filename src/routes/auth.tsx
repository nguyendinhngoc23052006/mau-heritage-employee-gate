import type { RouteObject } from "react-router-dom";
import { CallbackPage } from "../pages/CallbackPage";
import { LoginPage } from "../pages/LoginPage";

export const authRoutes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  { path: "/callback", element: <CallbackPage /> },
];
