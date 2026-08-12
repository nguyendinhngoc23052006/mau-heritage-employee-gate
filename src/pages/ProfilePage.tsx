import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/EmptyState";
import { Input, Label } from "../components/ui/Input";
import { useT } from "../lib/i18n";
import { getMyProfile, updateMyProfile } from "../services/profiles";

export function ProfilePage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [locale, setLocale] = useState("vi");
  const [saved, setSaved] = useState(false);

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: getMyProfile,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Parameters<typeof updateMyProfile>[0]) =>
      updateMyProfile(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (error) {
    return (
      <ErrorState
        message={
          error instanceof Error ? error.message : "Error loading profile"
        }
      />
    );
  }

  if (profile && displayName === "") {
    setDisplayName(profile.display_name ?? "");
    setPhone(profile.phone ?? "");
    setLocale(profile.locale);
  }

  function handleSave() {
    updateMutation.mutate({ display_name: displayName, phone, locale });
  }

  return (
    <div className="max-w-md">
      <Card>
        <CardTitle>{t("profile.title")}</CardTitle>
        <div className="space-y-4">
          <div>
            <Label htmlFor="display-name">{t("profile.display_name")}</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>

          <div>
            <Label htmlFor="phone">{t("profile.phone")}</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>

          <div>
            <Label htmlFor="locale">{t("profile.locale")}</Label>
            <select
              id="locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              disabled={updateMutation.isPending}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>

          {updateMutation.error && (
            <ErrorState
              message={
                updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Failed to save profile"
              }
            />
          )}

          {saved && (
            <div className="text-sm text-green-600">{t("profile.saved")}</div>
          )}

          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="w-full"
          >
            {updateMutation.isPending ? t("common.loading") : t("profile.save")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
