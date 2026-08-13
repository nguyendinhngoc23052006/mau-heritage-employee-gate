import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useT } from "../lib/i18n";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const t = useT();
  const location = useLocation();

  if (loading)
    return (
      <div className="p-6 text-sm text-slate-500">{t("common.loading")}</div>
    );
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
