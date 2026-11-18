
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function LogoutButton() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogout() {
    setLoading(true);
    setErrorMessage("");

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      navigate("/login", { replace: true });
    } catch {
      setErrorMessage("Unable to log out. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {loading ? "Logging out..." : "Logout"}
      </button>

      {errorMessage && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
