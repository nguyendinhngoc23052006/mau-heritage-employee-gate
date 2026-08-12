import type { RouteObject } from "react-router-dom";
import { LoginPage } from "../pages/LoginPage";
import { CallbackPage } from "../pages/CallbackPage";

export const authRoutes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  { path: "/callback", element: <CallbackPage /> },
];
