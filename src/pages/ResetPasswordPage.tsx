import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { Input, Label } from "../components/ui/Input";
import { PasswordInput } from "../components/ui/PasswordInput";
import { useSession } from "../hooks/useSession";
import { errorMessage } from "../lib/errorMessage";
import { useT } from "../lib/i18n";
import { requestPasswordReset, updatePassword } from "../services/auth";

export function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useSession();

  const hasCode = !!params.get("code");
  const [state, setState] = useState<"request" | "confirm">(
    hasCode ? "confirm" : "request",
  );
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Handle recovery sessions (when user clicks reset link in email)
  useEffect(() => {
    if (hasCode || (user && state === "confirm")) {
      setState("confirm");
    }
  }, [hasCode, user, state]);

  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setMessage({ type: "success", text: t("auth.reset_sent") });
      setEmail("");
    } catch (err) {
      setMessage({
        type: "error",
        text: errorMessage(err, t("auth.reset_failed")),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmReset(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: t("auth.reset_mismatch") });
      return;
    }

    setBusy(true);
    try {
      await updatePassword(newPassword);
      setMessage({ type: "success", text: t("auth.reset_updated") });
      setTimeout(() => {
        navigate("/onboarding", { replace: true });
      }, 1500);
    } catch (err) {
      setMessage({
        type: "error",
        text: errorMessage(err, t("auth.reset_failed")),
      });
    } finally {
      setBusy(false);
    }
  }

  if (state === "request") {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardTitle className="font-display">
            {t("auth.reset_title")}
          </CardTitle>
          <p className="text-sm text-slate-600 mb-4">{t("auth.reset_body")}</p>
          <form onSubmit={handleRequestReset} className="space-y-4">
            <div>
              <Label htmlFor="reset-email">{t("auth.email_label")}</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                placeholder={t("auth.email_placeholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={busy}
              />
            </div>
            {message && <Alert variant={message.type}>{message.text}</Alert>}
            <Button type="submit" disabled={busy || !email} className="w-full">
              {busy ? t("auth.checking") : t("auth.reset_send")}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  // Confirm state
  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardTitle className="font-display">{t("auth.reset_title")}</CardTitle>
        <form onSubmit={handleConfirmReset} className="space-y-4">
          <div>
            <Label htmlFor="new-password">{t("auth.reset_new_password")}</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="confirm-password">{t("auth.reset_confirm")}</Label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              disabled={busy}
            />
          </div>
          {message && <Alert variant={message.type}>{message.text}</Alert>}
          <Button
            type="submit"
            disabled={busy || !newPassword || !confirmPassword}
            className="w-full"
          >
            {busy ? t("auth.checking") : t("auth.reset_update")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
