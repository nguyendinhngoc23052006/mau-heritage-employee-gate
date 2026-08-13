import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/EmptyState";
import { useT } from "../lib/i18n";
import { getSupabase } from "../lib/supabaseClient";

export function CallbackPage() {
  const t = useT();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          navigate("/onboarding");
        } else {
          setError(t("auth.callback_missing"));
        }
      } catch (err) {
        setError(t("auth.callback_missing"));
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, [navigate, t]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingState>{t("common.loading")}</LoadingState>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardTitle>Sign in</CardTitle>
        {error ? (
          <div className="space-y-4">
            <ErrorState message={error} />
            <Button onClick={() => navigate("/login")} className="w-full">
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
