import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/errorMessage";
import { type GeolocationError, getCurrentCoords } from "../../lib/geolocation";
import { useT } from "../../lib/i18n";
import { getStore, setStoreGeofence } from "../../services/stores";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card, CardTitle } from "../ui/Card";
import { Input, Label } from "../ui/Input";

export function GeofenceCard({ storeId }: { storeId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const { data: store } = useQuery({
    queryKey: ["store", storeId],
    queryFn: () => getStore(storeId),
  });

  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("150");
  const [require, setRequire] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!store) return;
    setLat(store.lat != null ? String(store.lat) : "");
    setLng(store.lng != null ? String(store.lng) : "");
    setRadius(String(store.geofence_radius_m ?? 150));
    setRequire(Boolean(store.require_geofence));
  }, [store]);

  const useMyLocation = async () => {
    setLocErr(null);
    try {
      const c = await getCurrentCoords();
      setLat(c.lat.toFixed(6));
      setLng(c.lng.toFixed(6));
    } catch (e) {
      const gerr = e as GeolocationError;
      setLocErr(
        gerr.kind === "denied"
          ? t("geofence.denied")
          : gerr.kind === "unsupported"
            ? t("geofence.unsupported")
            : t("geofence.unavailable"),
      );
    }
  };

  const save = useMutation({
    mutationFn: () =>
      setStoreGeofence({
        storeId,
        lat: lat === "" ? null : Number(lat),
        lng: lng === "" ? null : Number(lng),
        radiusM: radius === "" ? null : Math.max(1, Number(radius)),
        require,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store", storeId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const parsedLat = lat === "" ? null : Number(lat);
  const parsedLng = lng === "" ? null : Number(lng);
  const clear = () => {
    setLat("");
    setLng("");
    setRequire(false);
  };

  return (
    <Card>
      <CardTitle>{t("settings.geofence.title")}</CardTitle>
      <p className="mb-3 text-sm text-slate-600">
        {t("settings.geofence.hint")}
      </p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="gf-lat">{t("settings.geofence.lat")}</Label>
            <Input
              id="gf-lat"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              placeholder="10.7769"
            />
          </div>
          <div>
            <Label htmlFor="gf-lng">{t("settings.geofence.lng")}</Label>
            <Input
              id="gf-lng"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
              placeholder="106.7009"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="gf-radius">{t("settings.geofence.radius_m")}</Label>
          <Input
            id="gf-radius"
            value={radius}
            onChange={(e) => setRadius(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="gf-require"
            type="checkbox"
            checked={require}
            onChange={(e) => setRequire(e.target.checked)}
            disabled={parsedLat == null || parsedLng == null}
          />
          <label htmlFor="gf-require" className="text-sm">
            {t("settings.geofence.require_toggle")}
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={useMyLocation} type="button">
            {t("settings.geofence.use_my_location")}
          </Button>
          <Button variant="secondary" onClick={clear} type="button">
            {t("settings.geofence.clear")}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={
              save.isPending ||
              (require && (parsedLat == null || parsedLng == null))
            }
          >
            {save.isPending ? t("common.loading") : t("common.save")}
          </Button>
        </div>
        {locErr && <Alert variant="error">{locErr}</Alert>}
        {save.error && (
          <Alert variant="error">{errorMessage(save.error)}</Alert>
        )}
        {saved && <Alert variant="success">{t("profile.saved")}</Alert>}
      </div>
    </Card>
  );
}
