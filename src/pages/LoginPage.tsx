import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { Card, CardTitle } from "../components/ui/Card";
import { useT } from "../lib/i18n";
import { useSession } from "../hooks/useSession";
import { sendMagicLink } from "../services/auth";

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useSession();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    navigate("/onboarding");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await sendMagicLink(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardTitle>{t("auth.title")}</CardTitle>
        {sent ? (
          <div className="text-sm text-slate-600">{t("auth.link_sent", { email })}</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">{t("auth.email_label")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("auth.email_placeholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {error && <div className="text-sm text-red-600">{t("auth.failed", { message: error })}</div>}
            <Button type="submit" disabled={loading || !email} className="w-full">
              {loading ? t("auth.checking") : t("auth.send_link")}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
