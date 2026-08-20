import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/EmptyState";
import { Input, Label } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { useI18n } from "../lib/i18n";
import { getMyProfile, updateMyProfile } from "../services/profiles";

export function ProfilePage() {
  const { t, locale: appLocale, setLocale: setAppLocale } = useI18n();
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (variables.locale) {
        setAppLocale(variables.locale);
      }
    },
  });

  // Populate form once when the profile first loads. useEffect avoids the
  // prior "setState during render" bug that caused an inconsistent tree.
  // Also adopts the persisted locale live so a login from a fresh device
  // picks up the saved preference instead of staying on the browser default.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only sync when profile first loads; don't re-sync on user typing
  useEffect(() => {
    if (profile && displayName === "") {
      setDisplayName(profile.display_name ?? "");
      setPhone(profile.phone ?? "");
      setLocale(profile.locale);
      if (profile.locale !== appLocale) {
        setAppLocale(profile.locale);
      }
    }
  }, [profile]);

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
            <Select
              id="locale"
              value={locale}
              onChange={setLocale}
              disabled={updateMutation.isPending}
              options={[
                { value: "vi", label: "Tiếng Việt" },
                { value: "en", label: "English" },
              ]}
              ariaLabel={t("profile.locale")}
            />
          </div>

          {updateMutation.error && (
            <Alert variant="error">
              {updateMutation.error instanceof Error
                ? updateMutation.error.message
                : "Failed to save profile"}
            </Alert>
          )}

          {saved && <Alert variant="success">{t("profile.saved")}</Alert>}

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
