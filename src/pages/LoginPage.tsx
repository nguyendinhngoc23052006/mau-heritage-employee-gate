import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { LogoMark } from "../components/Brand/LogoMark";
import { Wordmark } from "../components/Brand/Wordmark";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { Input, Label } from "../components/ui/Input";
import { PasswordInput } from "../components/ui/PasswordInput";
import { useSession } from "../hooks/useSession";
import { errorMessage } from "../lib/errorMessage";
import { useT } from "../lib/i18n";
import { signInWithPassword, signUpWithPassword } from "../services/auth";

type Mode = "signin" | "signup";

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading: sessionLoading } = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sessionLoading) return null;
  if (user) {
    const to = params.get("return") || "/onboarding";
    return <Navigate to={to} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
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
        return;
      }
      const to = params.get("return") || "/onboarding";
      navigate(to, { replace: true });
    } catch (err) {
      const fallback =
        mode === "signup" ? t("auth.signup_failed") : t("auth.signin_failed");
      setError(errorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-4">
          <LogoMark className="h-14 text-brand-navy" />
          <Wordmark className="text-lg" />
        </div>
        <CardTitle className="font-display">
          {mode === "signup" ? t("auth.signup_title") : t("auth.title")}
        </CardTitle>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">{t("auth.email_label")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t("auth.email_placeholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="password">{t("auth.password_label")}</Label>
            <PasswordInput
              id="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={busy}
            />
            {mode === "signin" && (
              <div className="text-right mt-2">
                <Link
                  to="/reset-password"
                  className="text-xs text-slate-600 hover:text-slate-900 underline"
                >
                  {t("auth.forgot_password")}
                </Link>
              </div>
            )}
          </div>
          {error && <Alert variant="error">{error}</Alert>}
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
          {mode === "signin" ? (
            <button
              type="button"
              className="underline hover:text-slate-900"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
            >
              {t("auth.switch_to_signup")}
            </button>
          ) : (
            <button
              type="button"
              className="underline hover:text-slate-900"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
            >
              {t("auth.switch_to_signin")}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
