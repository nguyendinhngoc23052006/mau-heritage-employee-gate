import { Outlet, useNavigate } from "react-router-dom";
import { useI18n, useT } from "../lib/i18n";
import { getSupabase } from "../lib/supabaseClient";
import { Nav } from "./Nav";
import { StoreSwitcher } from "./StoreSwitcher";
import { Button } from "./ui/Button";
import { Select } from "./ui/Select";

export function Layout() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const navigate = useNavigate();

  async function signOut() {
    await getSupabase().auth.signOut();
    navigate("/login");
  }

  return (
    // overflow-x-hidden on the root prevents any wide child (Nav's
    // horizontal-scroll strip, an over-long header row, etc.) from
    // pushing the whole viewport wider than the screen on mobile.
    <div className="min-h-screen w-full overflow-x-hidden bg-slate-50">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate font-semibold text-slate-900">
            {t("app.name")}
          </span>
          <StoreSwitcher />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={locale}
            onChange={setLocale}
            options={[
              { value: "vi", label: "Tiếng Việt" },
              { value: "en", label: "English" },
            ]}
            ariaLabel={t("profile.locale")}
            className="w-32"
          />
          <Button variant="ghost" onClick={signOut}>
            {t("nav.signout")}
          </Button>
        </div>
      </header>
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
