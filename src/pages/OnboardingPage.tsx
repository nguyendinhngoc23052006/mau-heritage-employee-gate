import { Navigate } from "react-router-dom";
import { LogoMark } from "../components/Brand/LogoMark";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/EmptyState";
import { useMe } from "../hooks/useMe";
import { useMemberships } from "../hooks/useMemberships";
import { useSession } from "../hooks/useSession";
import { useT } from "../lib/i18n";
import { clearAllQueries } from "../lib/query";
import { getSupabase } from "../lib/supabaseClient";

// Where a signed-in person lands. Nobody creates or joins a store from here any
// more: tier 1 and directors go to the organisation; everyone else goes to
// their store, or waits to be placed by someone above them.
export function OnboardingPage() {
  const t = useT();
  const { user, loading: sessionLoading } = useSession();
  const { data: memberships, isLoading: membershipsLoading } = useMemberships();
  const me = useMe();

  if (sessionLoading || membershipsLoading || me.isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (me.isError) return <ErrorState message={t("org.error")} />;
  if (me.tier !== undefined && me.tier <= 2)
    return <Navigate to="/org" replace />;
  const first = memberships?.[0];
  if (first) return <Navigate to={`/store/${first.store_id}`} replace />;

  async function signOut() {
    await getSupabase().auth.signOut();
    clearAllQueries();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-cream p-4">
      <Card className="w-full max-w-md text-center">
        <div className="mb-4 flex justify-center">
          <LogoMark />
        </div>
        <CardTitle className="font-display">
          {t("onboarding.waiting_title")}
        </CardTitle>
        <p className="mt-2 text-sm text-brand-ink">
          {t("onboarding.waiting_body")}
        </p>
        <p className="mt-2 text-xs text-brand-muted">{user.email}</p>
        <div className="mt-4">
          <Button variant="ghost" onClick={signOut} className="w-full">
            {t("nav.signout")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
