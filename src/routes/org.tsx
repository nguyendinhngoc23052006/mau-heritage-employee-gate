import type { RouteObject } from "react-router-dom";
import { OrgPage } from "../pages/org/OrgPage";
import { SectorPage } from "../pages/org/SectorPage";

// Children of /org — the layer above stores. No storeId in these URLs.
export const orgRoutes: RouteObject[] = [
  { index: true, element: <OrgPage /> },
  { path: "sector/:sectorId", element: <SectorPage /> },
];
