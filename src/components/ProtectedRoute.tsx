
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type AuthStatus = "loading" | "authenticated" | "guest";

export default function ProtectedRoute() {
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let active = true;

    // Check existing login session
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;

      setStatus(
        !error && data.session ? "authenticated" : "guest"
      );
    });

    // Listen for login and logout changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      setStatus(session ? "authenticated" : "guest");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Checking authentication...</p>
      </div>
    );
  }

  if (status === "guest") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
