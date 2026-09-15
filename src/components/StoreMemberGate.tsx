import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStoreAccess } from "../hooks/useStoreAccess";
import { useT } from "../lib/i18n";
import { Button } from "./ui/Button";
import { Card, CardTitle } from "./ui/Card";

export function StoreMemberGate({ children }: { children: ReactNode }) {
  const t = useT();
  const navigate = useNavigate();
  const { storeId } = useParams<{ storeId: string }>();
  const { canEnter, isLoading } = useStoreAccess(storeId);

  if (!storeId) return <>{children}</>;
  if (isLoading)
    return (
      <div className="p-6 text-sm text-slate-500">{t("common.loading")}</div>
    );

  if (!canEnter) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-cream p-4">
        <Card className="w-full max-w-md text-center">
          <CardTitle className="font-display">
            {t("deeplink.not_a_member_title")}
          </CardTitle>
          <p className="mt-2 text-sm text-brand-ink">
            {t("deeplink.not_a_member_body")}
          </p>
          <div className="mt-4">
            <Button onClick={() => navigate("/")} className="w-full">
              {t("deeplink.go_home")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
