import type { RouteObject } from "react-router-dom";
import { useParams } from "react-router-dom";
import { MyFinesPage } from "../pages/MyFinesPage";
import { MyHistoryPage } from "../pages/MyHistoryPage";
import { MyPayPage } from "../pages/MyPayPage";

function MyPayWrapper() {
  const { storeId } = useParams<{ storeId: string }>();
  if (!storeId) return <div className="p-6">{storeId} not found</div>;
  return <MyPayPage />;
}

function MyHistoryWrapper() {
  const { storeId } = useParams<{ storeId: string }>();
  if (!storeId) return <div className="p-6">Store not found</div>;
  return <MyHistoryPage />;
}

function MyFinesWrapper() {
  const { storeId } = useParams<{ storeId: string }>();
  if (!storeId) return <div className="p-6">Store not found</div>;
  return <MyFinesPage />;
}

export const mePayRoutes: RouteObject[] = [
  { path: "me/pay", element: <MyPayWrapper /> },
  { path: "me/history", element: <MyHistoryWrapper /> },
  { path: "me/fines", element: <MyFinesWrapper /> },
];
