import type { RouteObject } from "react-router-dom";
import { useParams } from "react-router-dom";
import { RulesPage } from "../pages/RulesPage";
import { ApplyRulePage } from "../pages/ApplyRulePage";

function RulesWrapper() {
  const { storeId } = useParams<{ storeId: string }>();
  if (!storeId) return <div className="p-6">Store not found</div>;
  return <RulesPage storeId={storeId} />;
}

function ApplyRuleWrapper() {
  const { storeId } = useParams<{ storeId: string }>();
  if (!storeId) return <div className="p-6">Store not found</div>;
  return <ApplyRulePage storeId={storeId} />;
}

export const rulesRoutes: RouteObject[] = [
  { path: "rules", element: <RulesWrapper /> },
  { path: "apply-rule", element: <ApplyRuleWrapper /> },
];
