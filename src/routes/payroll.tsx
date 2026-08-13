import type { RouteObject } from "react-router-dom";
import { useParams } from "react-router-dom";
import { PayrollPage } from "../pages/PayrollPage";

function PayrollWrapper() {
  const { storeId } = useParams<{ storeId: string }>();
  if (!storeId) return <div className="p-6">Store not found</div>;
  return <PayrollPage storeId={storeId} />;
}

export const payrollRoutes: RouteObject[] = [
  { path: "payroll", element: <PayrollWrapper /> },
];
