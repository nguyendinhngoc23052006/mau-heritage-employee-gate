import { Outlet, useNavigate, useParams } from "react-router-dom";
import { useMemberships } from "../hooks/useMemberships";
import { useI18n, useT } from "../lib/i18n";
import { clearAllQueries } from "../lib/query";
import { getSupabase } from "../lib/supabaseClient";
import { Wordmark } from "./Brand/Wordmark";
import { Nav } from "./Nav";
import { StoreSwitcher } from "./StoreSwitcher";
import { Button } from "./ui/Button";
import { Select } from "./ui/Select";

function StoreIdentity() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const { data: memberships } = useMemberships();

  if (!storeId) return null;
  const membership = memberships?.find((m) => m.store_id === storeId);
  if (!membership) return null;

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-slate-600">
      <span className="truncate">
        <span className="text-slate-400">{t("nav.store_label")}:</span>{" "}
        <span className="font-medium text-brand-ink">
          {membership.store.name}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-brand-cream-light px-2 py-0.5 font-medium text-brand-ink">
        {t(`people.role_${membership.role}`)}
      </span>
    </div>
  );
}

export function Layout() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const navigate = useNavigate();

  async function signOut() {
    await getSupabase().auth.signOut();
    clearAllQueries();
    navigate("/login");
  }

  return (
    // overflow-x-hidden on the root prevents any wide child (Nav's
    // horizontal-scroll strip, an over-long header row, etc.) from
    // pushing the whole viewport wider than the screen on mobile.
    <div className="min-h-screen w-full overflow-x-hidden bg-brand-cream-light">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-hairline bg-white px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Wordmark className="text-base" />
          <StoreSwitcher />
          <StoreIdentity />
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
