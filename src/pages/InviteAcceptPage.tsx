import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LogoMark } from "../components/Brand/LogoMark";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { LoadingState } from "../components/ui/EmptyState";
import { Input, Label } from "../components/ui/Input";
import { PasswordInput } from "../components/ui/PasswordInput";
import { useSession } from "../hooks/useSession";
import { errorMessage } from "../lib/errorMessage";
import { useT } from "../lib/i18n";
import { signInWithPassword, signUpWithPassword } from "../services/auth";
import { acceptInvite } from "../services/invites";

type AuthMode = "signup" | "signin";

export function InviteAcceptPage() {
  const t = useT();
  const navigate = useNavigate();
  const { token } = useParams();
  const { user, loading: sessionLoading } = useSession();

  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once signed in, accept the invite automatically.
  useEffect(() => {
    if (sessionLoading || !user || !token) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const membership = await acceptInvite(token);
        if (!cancelled)
          navigate(`/store/${membership.store_id}`, { replace: true });
      } catch {
        if (!cancelled) setError(t("invite.accept.failed"));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, sessionLoading, token, navigate, t]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: authError } =
        mode === "signup"
          ? await signUpWithPassword(email, password)
          : await signInWithPassword(email, password);
      if (authError) {
        const fallback =
          mode === "signup" ? t("auth.signup_failed") : t("auth.signin_failed");
        setError(errorMessage(authError, fallback));
      }
    } catch (err) {
      const fallback =
        mode === "signup" ? t("auth.signup_failed") : t("auth.signin_failed");
      setError(errorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <LoadingState>{t("common.loading")}</LoadingState>
      </div>
    );
  }

  if (user && busy) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <LoadingState>{t("common.loading")}</LoadingState>
      </div>
    );
  }

  // Not signed in yet — show sign-up (default) or sign-in form. Also show form if there's an error so user can retry.
  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <LogoMark className="h-12 mx-auto text-brand-navy mb-3" />
        <CardTitle className="font-display">
          {t("invite.accept.title")}
        </CardTitle>
        <p className="mb-3 text-sm text-slate-600">
          {mode === "signup"
            ? t("invite.accept.signup_prompt")
            : t("invite.accept.signin_prompt")}
        </p>
        {error && (
          <Alert variant="error" className="mb-4">
            {error}
            {error.includes("email does not match") && (
              <div className="mt-2 text-xs">
                {t("invite.accept.email_mismatch_hint")}
              </div>
            )}
          </Alert>
        )}
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <Label htmlFor="invite-email">{t("auth.email_label")}</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="invite-password">{t("auth.password_label")}</Label>
            <PasswordInput
              id="invite-password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={busy}
            />
          </div>
          <Button
            type="submit"
            disabled={busy || !email || password.length < 6}
            className="w-full"
          >
            {busy
              ? t("auth.checking")
              : mode === "signup"
                ? t("auth.signup_button")
                : t("auth.signin_button")}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm text-slate-600">
          <button
            type="button"
            className="underline hover:text-slate-900"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError(null);
            }}
          >
            {mode === "signup"
              ? t("auth.switch_to_signin")
              : t("auth.switch_to_signup")}
          </button>
        </div>
      </Card>
    </div>
  );
}
