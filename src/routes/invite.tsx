import type { RouteObject } from "react-router-dom";
import { InviteAcceptPage } from "../pages/InviteAcceptPage";

export const inviteRoutes: RouteObject[] = [
  { path: "/invite/:token", element: <InviteAcceptPage /> },
];
