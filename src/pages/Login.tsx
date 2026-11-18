
import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowRight,
  BookOpen,
  Sparkles,
  UserRound,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isRegister = pathname === "/register";

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Reset temporary form state when switching modes
  useEffect(() => {
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setErrorMessage("");
    setSuccessMessage("");
  }, [isRegister]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    setErrorMessage("");
    setSuccessMessage("");

    if (isRegister) {
      if (!displayName.trim()) {
        setErrorMessage("Please enter your name.");
        return;
      }

      if (password.length < 8) {
        setErrorMessage(
          "Password must be at least 8 characters."
        );
        return;
      }

      if (password !== confirmPassword) {
        setErrorMessage("Passwords do not match.");
        return;
      }
    }

    setLoading(true);

    try {
      if (isRegister) {
        // REGISTER USER
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName.trim(),
            },
          },
        });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        if (data.session) {
          navigate("/", { replace: true });
        } else {
          setSuccessMessage(
            "Registration submitted! Please check your email for a confirmation link if required."
          );
        }
      } else {
        // LOGIN USER
        const { error } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        navigate("/", { replace: true });
      }
    } catch {
      setErrorMessage(
        "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-6 font-sans sm:px-6"
      style={{
        background:
          "radial-gradient(circle at 10% 15%, #a9e4ff, transparent 40%), radial-gradient(circle at 85% 15%, #d3f4ff, transparent 40%), linear-gradient(135deg, #eaf8ff, #c9ecff 55%, #eefaff)",
      }}
    >
      {/* MAIN AUTH CONTAINER */}
      <div className="w-full max-w-[1150px] rounded-[32px] border border-white/90 bg-white/55 p-2 shadow-[0_25px_80px_rgba(35,121,175,0.18)] backdrop-blur-xl sm:p-3">

        <div className="grid overflow-hidden rounded-[25px] bg-white/85 lg:grid-cols-2">


          {/* RIGHT AUTH PANEL */}
          <div className="flex min-h-[650px] flex-col justify-between bg-[#f8fcff]/95 p-6 sm:p-10 lg:min-h-[700px]">

            {/* TOP BRAND */}
            <div className="flex items-center justify-between">
              <img src="/studyroom-logo.svg" alt="" className="h-11 w-11" />

              <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-600">
                StudyRoom
              </span>
            </div>

            {/* AUTH FORM */}
            <div className="mx-auto w-full max-w-[380px] py-8">

              {/* SWITCH LOGIN / REGISTER */}
              <div className="mb-7 flex rounded-xl border border-sky-100 bg-[#eaf7ff] p-1">

                <Link
                  to="/login"
                  className={`flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${
                    !isRegister
                      ? "bg-white text-sky-600 shadow-sm"
                      : "text-slate-500 hover:text-sky-600"
                  }`}
                >
                  Sign In
                </Link>

                <Link
                  to="/register"
                  className={`flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${
                    isRegister
                      ? "bg-white text-sky-600 shadow-sm"
                      : "text-slate-500 hover:text-sky-600"
                  }`}
                >
                  Sign Up
                </Link>

              </div>

              {/* HEADING */}
              <div className="mb-7">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-500">
                  Welcome to StudyRoom
                </p>

                <h1 className="text-3xl font-extrabold tracking-tight text-[#18384d] sm:text-4xl">
                  {isRegister
                    ? "Create Account"
                    : "Welcome Back"}
                </h1>

                <p className="mt-3 text-sm text-slate-500">
                  {isRegister
                    ? "Create your account and start learning."
                    : "Sign in to continue your learning journey."}
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                {/* FULL NAME - REGISTER ONLY */}
                {isRegister && (
                  <div>
                    <label
                      htmlFor="auth-name"
                      className="mb-2 block text-sm font-medium text-[#29455c]"
                    >
                      Full name
                    </label>

                    <div className="relative">
                      <UserRound
                        size={18}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sky-400"
                      />

                      <input
                        id="auth-name"
                        type="text"
                        placeholder="Enter your full name"
                        value={displayName}
                        onChange={(e) =>
                          setDisplayName(e.target.value)
                        }
                        autoComplete="name"
                        required
                        className="h-12 w-full rounded-xl border border-sky-100 bg-white/90 pl-12 pr-4 text-sm text-[#18384d] outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      />
                    </div>
                  </div>
                )}

                {/* EMAIL */}
                <div>
                  <label
                    htmlFor="auth-email"
                    className="mb-2 block text-sm font-medium text-[#29455c]"
                  >
                    Email address
                  </label>

                  <div className="relative">
                    <Mail
                      size={18}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sky-400"
                    />

                    <input
                      id="auth-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) =>
                        setEmail(e.target.value)
                      }
                      autoComplete="email"
                      required
                      className="h-12 w-full rounded-xl border border-sky-100 bg-white/90 pl-12 pr-4 text-sm text-[#18384d] outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    />
                  </div>
                </div>

                {/* PASSWORD */}
                <div>
                  <label
                    htmlFor="auth-password"
                    className="mb-2 block text-sm font-medium text-[#29455c]"
                  >
                    Password
                  </label>

                  <div className="relative">
                    <LockKeyhole
                      size={18}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sky-400"
                    />

                    <input
                      id="auth-password"
                      type={
                        showPassword ? "text" : "password"
                      }
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) =>
                        setPassword(e.target.value)
                      }
                      autoComplete={
                        isRegister
                          ? "new-password"
                          : "current-password"
                      }
                      required
                      minLength={isRegister ? 8 : undefined}
                      className="h-12 w-full rounded-xl border border-sky-100 bg-white/90 pl-12 pr-12 text-sm text-[#18384d] outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(!showPassword)
                      }
                      aria-label={
                        showPassword
                          ? "Hide password"
                          : "Show password"
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-sky-400 hover:text-sky-600"
                    >
                      {showPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                </div>

                {/* CONFIRM PASSWORD - REGISTER ONLY */}
                {isRegister && (
                  <div>
                    <label
                      htmlFor="auth-confirm"
                      className="mb-2 block text-sm font-medium text-[#29455c]"
                    >
                      Confirm password
                    </label>

                    <div className="relative">
                      <LockKeyhole
                        size={18}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sky-400"
                      />

                      <input
                        id="auth-confirm"
                        type={
                          showPassword ? "text" : "password"
                        }
                        placeholder="Confirm your password"
                        value={confirmPassword}
                        onChange={(e) =>
                          setConfirmPassword(e.target.value)
                        }
                        autoComplete="new-password"
                        required
                        className="h-12 w-full rounded-xl border border-sky-100 bg-white/90 pl-12 pr-4 text-sm text-[#18384d] outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      />
                    </div>
                  </div>
                )}

                {/* ERROR MESSAGE */}
                {errorMessage && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
                  >
                    {errorMessage}
                  </div>
                )}

                {/* SUCCESS MESSAGE */}
                {successMessage && (
                  <div
                    role="status"
                    className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
                  >
                    {successMessage}
                  </div>
                )}

                {/* SUBMIT BUTTON */}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 text-sm font-semibold text-white shadow-lg shadow-sky-200/70 transition hover:from-sky-600 hover:to-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    isRegister
                      ? "Creating account..."
                      : "Signing in..."
                  ) : (
                    <>
                      {isRegister
                        ? "Create Account"
                        : "Sign In"}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>

              </form>

              {/* SWITCH LINK */}
              <p className="mt-7 text-center text-sm text-slate-500">
                {isRegister ? (
                  <>
                    Already have an account?{" "}
                    <Link
                      to="/login"
                      className="font-semibold text-sky-600 hover:text-sky-700"
                    >
                      Sign in
                    </Link>
                  </>
                ) : (
                  <>
                    Don't have an account?{" "}
                    <Link
                      to="/register"
                      className="font-semibold text-sky-600 hover:text-sky-700"
                    >
                      Sign up
                    </Link>
                  </>
                )}
              </p>
            </div>

            {/* BOTTOM INFO */}
            <div className="rounded-2xl border border-sky-100 bg-[#eaf7ff] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sky-500 shadow-sm">
                  <BookOpen size={20} />
                </div>

                <div>
                  <p className="text-sm font-semibold text-[#234e68]">
                    One place for all your learning
                  </p>

                  <p className="mt-0.5 text-xs text-[#64869c]">
                    Reviewers · Flashcards · Practice Quizzes
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
