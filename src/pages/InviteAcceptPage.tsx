import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/EmptyState";
import { useT } from "../lib/i18n";
import { useSession } from "../hooks/useSession";
import { acceptInvite } from "../services/invites";

export function InviteAcceptPage() {
  const t = useT();
  const navigate = useNavigate();
  const { token } = useParams();
  const { user, loading: sessionLoading } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      navigate(`/login?return=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const acceptThisInvite = async () => {
      if (!token) {
        setError(t("invite.accept.failed"));
        return;
      }
      setLoading(true);
      try {
        const membership = await acceptInvite(token);
        navigate(`/store/${membership.store_id}`);
      } catch (err) {
        setError(t("invite.accept.failed"));
      } finally {
        setLoading(false);
      }
    };

    acceptThisInvite();
  }, [user, sessionLoading, token, navigate, t]);

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingState>{t("common.loading")}</LoadingState>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardTitle>{t("invite.accept.title")}</CardTitle>
          <div className="space-y-4">
            <ErrorState message={error} />
            <Button onClick={() => navigate("/login")} className="w-full">
              {t("common.retry")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return null;
}
