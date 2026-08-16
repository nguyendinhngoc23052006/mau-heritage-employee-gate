import { useNavigate } from "react-router-dom";
import { LogoMark } from "../components/Brand/LogoMark";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { useT } from "../lib/i18n";
import { getSupabase } from "../lib/supabaseClient";

export function DeactivatedPage() {
  const t = useT();
  const navigate = useNavigate();

  async function signOut() {
    await getSupabase().auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-cream p-4">
      <Card className="max-w-md w-full">
        <LogoMark className="h-12 mx-auto text-brand-navy mb-3" />
        <CardTitle className="font-display">{t("deactivated.title")}</CardTitle>
        <p className="text-sm text-brand-ink mt-2">{t("deactivated.body")}</p>
        <div className="mt-4">
          <Button onClick={signOut} className="w-full">
            {t("deactivated.signout")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
