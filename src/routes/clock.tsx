import type { RouteObject } from "react-router-dom";
import { ClockPage } from "../pages/ClockPage";

export const clockRoutes: RouteObject[] = [{ path: "clock", element: <ClockPage /> }];
