import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { Card, CardTitle } from "../components/ui/Card";
import { LoadingState, ErrorState } from "../components/ui/EmptyState";
import { useT } from "../lib/i18n";
import { useSession } from "../hooks/useSession";
import { useMemberships } from "../hooks/useMemberships";
import { createStore } from "../services/stores";

export function OnboardingPage() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useSession();
  const { data: memberships, isLoading, error } = useMemberships();
  const [storeName, setStoreName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingState>{t("common.loading")}</LoadingState>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <ErrorState message={error instanceof Error ? error.message : "Error loading memberships"} />
      </div>
    );
  }

  if (memberships && memberships.length > 0) {
    navigate(`/store/${memberships[0].store_id}`);
    return null;
  }

  async function handleCreateStore() {
    if (!storeName.trim()) return;
    setCreateError(null);
    setCreating(true);
    try {
      const store = await createStore({ name: storeName });
      navigate(`/store/${store.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create store");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl grid gap-6">
        <Card>
          <CardTitle>{t("onboarding.create_store")}</CardTitle>
          <div className="space-y-4">
            <div>
              <Label htmlFor="store-name">{t("onboarding.store_name")}</Label>
              <Input
                id="store-name"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Mau Heritage Store #1"
                disabled={creating}
              />
            </div>
            {createError && <ErrorState message={createError} />}
            <Button onClick={handleCreateStore} disabled={creating || !storeName.trim()} className="w-full">
              {creating ? t("common.loading") : t("onboarding.create_button")}
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle>{t("onboarding.waiting_invite")}</CardTitle>
          <p className="text-sm text-slate-600 mt-2">{t("onboarding.waiting_invite", { email: user?.email || "" })}</p>
        </Card>
      </div>
    </div>
  );
}
