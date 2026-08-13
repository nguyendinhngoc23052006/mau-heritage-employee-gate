import { Outlet, useNavigate } from "react-router-dom";
import { useI18n, useT } from "../lib/i18n";
import { getSupabase } from "../lib/supabaseClient";
import { Nav } from "./Nav";
import { StoreSwitcher } from "./StoreSwitcher";
import { Button } from "./ui/Button";

export function Layout() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const navigate = useNavigate();

  async function signOut() {
    await getSupabase().auth.signOut();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-900">{t("app.name")}</span>
          <StoreSwitcher />
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            aria-label={t("profile.locale")}
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
          <Button variant="ghost" onClick={signOut}>
            {t("nav.signout")}
          </Button>
        </div>
      </header>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
