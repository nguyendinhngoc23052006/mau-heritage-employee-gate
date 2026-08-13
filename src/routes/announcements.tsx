import type { RouteObject } from "react-router-dom";
import { AnnouncementsPage } from "../pages/AnnouncementsPage";
import { NotificationsInbox } from "../pages/NotificationsInbox";

export const announcementsRoutes: RouteObject[] = [
  { path: "announcements", element: <AnnouncementsPage /> },
  { path: "notifications", element: <NotificationsInbox /> },
];
