import { Navigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";

// Legacy magic-link landing. Password auth doesn't need it, but old emails
// (and Cloudflare Pages preview URLs shared before the switch) may still
// route here. Send the user wherever they should be next.
export function CallbackPage() {
  const { user, loading } = useSession();
  if (loading) return null;
  return <Navigate to={user ? "/onboarding" : "/login"} replace />;
}
