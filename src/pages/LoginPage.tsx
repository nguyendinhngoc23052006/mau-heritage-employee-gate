import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { Input, Label } from "../components/ui/Input";
import { useSession } from "../hooks/useSession";
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
        setError(authError.message);
        return;
      }
      const to = params.get("return") || "/onboarding";
      navigate(to, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardTitle>
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
            <Input
              id="password"
              type="password"
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
          {error && (
            <div className="text-sm text-red-600">
              {t("auth.failed", { message: error })}
            </div>
          )}
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
