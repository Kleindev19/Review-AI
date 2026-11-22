
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  ArrowRight,
  BookOpen,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  Sparkles,
  UserRound,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isRegister = pathname === "/register";

  // ========================================
  // FORM STATES
  // ========================================

  const [displayName, setDisplayName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  const [loading, setLoading] =
    useState(false);

  const [resending, setResending] =
    useState(false);

  const [
    needsConfirmation,
    setNeedsConfirmation,
  ] = useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  // ========================================
  // RESET STATES WHEN SWITCHING PAGES
  // ========================================

  useEffect(() => {
    setPassword("");
    setConfirmPassword("");

    setShowPassword(false);
    setShowConfirmPassword(false);

    setErrorMessage("");
    setSuccessMessage("");
    setNeedsConfirmation(false);
  }, [isRegister]);

  // ========================================
  // REAL SUPABASE AUTHENTICATION
  // ========================================

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    setErrorMessage("");
    setSuccessMessage("");
    setNeedsConfirmation(false);

    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setErrorMessage(
        "Please enter your email and password."
      );
      return;
    }

    if (isRegister) {
      if (!displayName.trim()) {
        setErrorMessage(
          "Please enter your full name."
        );
        return;
      }

      if (password.length < 8) {
        setErrorMessage(
          "Password must be at least 8 characters."
        );
        return;
      }

      if (password !== confirmPassword) {
        setErrorMessage(
          "Passwords do not match."
        );
        return;
      }
    }

    setLoading(true);

    try {
      if (isRegister) {
        // ==================================
        // SUPABASE SIGN UP
        // ==================================

        const { data, error } =
          await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              emailRedirectTo:
                `${window.location.origin}/login`,
              data: {
                display_name: displayName.trim(),
              },
            },
          });

        if (error) {
          throw error;
        }

        if (data.session) {
          navigate("/", {
            replace: true,
          });

          return;
        }

        setNeedsConfirmation(true);

        setSuccessMessage(
          "Account created. Check your email for the confirmation link before signing in."
        );
      } else {
        // ==================================
        // SUPABASE SIGN IN
        // ==================================

        const { data, error } =
          await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

        if (error) {
          throw error;
        }

        if (!data.session) {
          throw new Error(
            "No login session was created. Please try again."
          );
        }

        // REAL LOGIN SUCCESS
        // Redirect to the StudyRoom dashboard.

        navigate("/", {
          replace: true,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Authentication failed. Please try again.";

      setErrorMessage(message);

      if (
        message
          .toLowerCase()
          .includes("email not confirmed")
      ) {
        setNeedsConfirmation(true);
      }
    } finally {
      setLoading(false);
    }
  }

  // ========================================
  // RESEND VERIFICATION EMAIL
  // ========================================

  async function handleResendConfirmation() {
    if (!email.trim() || resending) {
      return;
    }

    setResending(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { error } =
        await supabase.auth.resend({
          type: "signup",
          email: email.trim(),
          options: {
            emailRedirectTo:
              `${window.location.origin}/login`,
          },
        });

      if (error) {
        throw error;
      }

      setSuccessMessage(
        "If your account is eligible, a confirmation email has been sent."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to resend confirmation email."
      );
    } finally {
      setResending(false);
    }
  }

  // ========================================
  // UI
  // ========================================

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#081428] text-white">
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(16,185,236,0.08),transparent_38%),linear-gradient(180deg,#081428,#0a1930)]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1240px] flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">

        {/* TOP BRAND */}

        <header className="flex items-center justify-between rounded-2xl border border-[#2d3d54] bg-[#162236] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <img
              src="/studyroom-logo.svg"
              alt="StudyRoom logo"
              className="h-11 w-11 rounded-xl object-contain"
            />

            <div>
              <p className="text-lg font-semibold text-white">
                StudyRoom
              </p>

              <p className="text-xs text-[#a9b9d0]">
                Smart learning workspace
              </p>
            </div>
          </div>

          <span className="hidden rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200 sm:block">
            AI-powered reviewer platform
          </span>
        </header>

        {/* MAIN CONTENT */}

        <div className="flex flex-1 items-center justify-center py-8 sm:py-12">

          <div className="grid w-full max-w-[1150px] gap-6 lg:grid-cols-[1.1fr_1fr]">

            {/* LEFT INFORMATION PANEL */}

            <section className="hidden min-h-[610px] flex-col justify-between rounded-[28px] border border-[#2d3d54] bg-[#0d1c33] p-8 lg:flex">

              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">
                  <Sparkles className="h-3.5 w-3.5" />

                  Welcome to StudyRoom
                </div>

                <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-white">
                  Build reviewers, flashcards,
                  and quizzes in one clean
                  study workspace.
                </h1>

                <p className="mt-5 text-base leading-7 text-[#a9b9d0]">
                  Keep your lessons organized,
                  generate AI-powered reviewers,
                  practice with quizzes, and
                  study smarter in one place.
                </p>
              </div>

              {/* FEATURE CARDS */}

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  [
                    "Reviewers",
                    "Study guides from lessons and uploaded files.",
                  ],
                  [
                    "Flashcards",
                    "Quick cards for active recall.",
                  ],
                  [
                    "Practice Quiz",
                    "Check your learning and progress.",
                  ],
                ].map(([title, description]) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-[#2d3d54] bg-[#162236] p-4"
                  >
                    <p className="text-sm font-semibold text-white">
                      {title}
                    </p>

                    <p className="mt-2 text-sm leading-5 text-[#a9b9d0]">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* RIGHT AUTHENTICATION CARD */}

            <section className="mx-auto w-full max-w-[550px] rounded-[28px] border border-[#2d3d54] bg-[#0c192e] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.16)] sm:p-7 lg:max-w-none">

              {/* HEADING */}

              <div className="flex items-start justify-between gap-3">

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-cyan-300">
                    StudyRoom Access
                  </p>

                  <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">
                    {isRegister
                      ? "Create Account"
                      : "Welcome Back"}
                  </h2>

                  <p className="mt-2 text-sm text-[#a9b9d0]">
                    {isRegister
                      ? "Create your account to start learning."
                      : "Sign in to continue your study journey."}
                  </p>
                </div>

                <span className="hidden shrink-0 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200 sm:block">
                  StudyRoom
                </span>
              </div>

              {/* SIGN IN / SIGN UP TABS */}

              <nav
                className="mt-6 grid grid-cols-2 rounded-2xl border border-[#2d3d54] bg-[#162236] p-1"
                aria-label="Authentication pages"
              >

                <Link
                  to="/login"
                  aria-current={
                    !isRegister
                      ? "page"
                      : undefined
                  }
                  className={`rounded-xl px-4 py-3 text-center text-sm font-semibold transition ${
                    !isRegister
                      ? "bg-[#253752] text-white"
                      : "text-[#a9b9d0] hover:text-white"
                  }`}
                >
                  Sign In
                </Link>

                <Link
                  to="/register"
                  aria-current={
                    isRegister
                      ? "page"
                      : undefined
                  }
                  className={`rounded-xl px-4 py-3 text-center text-sm font-semibold transition ${
                    isRegister
                      ? "bg-[#253752] text-white"
                      : "text-[#a9b9d0] hover:text-white"
                  }`}
                >
                  Sign Up
                </Link>
              </nav>

              {/* AUTHENTICATION FORM */}

              <form
                onSubmit={handleSubmit}
                className="mt-6 space-y-4"
              >

                {/* FULL NAME */}

                {isRegister && (
                  <div>
                    <label
                      htmlFor="auth-name"
                      className="mb-2 block text-sm font-medium text-[#eaf0fb]"
                    >
                      Full name
                    </label>

                    <div className="flex h-12 items-center gap-3 rounded-xl border border-[#425776] bg-[#162236] px-4 focus-within:border-cyan-400">

                      <UserRound className="h-4 w-4 shrink-0 text-cyan-300" />

                      <input
                        id="auth-name"
                        type="text"
                        autoComplete="name"
                        required
                        value={displayName}
                        onChange={(event) =>
                          setDisplayName(
                            event.target.value
                          )
                        }
                        placeholder="Enter your full name"
                        className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#91a5c1]"
                      />
                    </div>
                  </div>
                )}

                {/* EMAIL */}

                <div>
                  <label
                    htmlFor="auth-email"
                    className="mb-2 block text-sm font-medium text-[#eaf0fb]"
                  >
                    Email address
                  </label>

                  <div className="flex h-12 items-center gap-3 rounded-xl border border-[#425776] bg-[#162236] px-4 focus-within:border-cyan-400">

                    <Mail className="h-4 w-4 shrink-0 text-cyan-300" />

                    <input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) =>
                        setEmail(
                          event.target.value
                        )
                      }
                      placeholder="you@example.com"
                      className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#91a5c1]"
                    />
                  </div>
                </div>

                {/* PASSWORD */}

                <div>
                  <label
                    htmlFor="auth-password"
                    className="mb-2 block text-sm font-medium text-[#eaf0fb]"
                  >
                    Password
                  </label>

                  <div className="flex h-12 items-center gap-3 rounded-xl border border-[#425776] bg-[#162236] px-4 focus-within:border-cyan-400">

                    <LockKeyhole className="h-4 w-4 shrink-0 text-cyan-300" />

                    <input
                      id="auth-password"
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      required
                      autoComplete={
                        isRegister
                          ? "new-password"
                          : "current-password"
                      }
                      minLength={
                        isRegister
                          ? 8
                          : undefined
                      }
                      value={password}
                      onChange={(event) =>
                        setPassword(
                          event.target.value
                        )
                      }
                      placeholder="Enter your password"
                      className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#91a5c1]"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          (value) => !value
                        )
                      }
                      aria-label={
                        showPassword
                          ? "Hide password"
                          : "Show password"
                      }
                      className="shrink-0 text-[#a9b9d0] hover:text-white"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* CONFIRM PASSWORD */}

                {isRegister && (
                  <div>
                    <label
                      htmlFor="auth-confirm"
                      className="mb-2 block text-sm font-medium text-[#eaf0fb]"
                    >
                      Confirm password
                    </label>

                    <div className="flex h-12 items-center gap-3 rounded-xl border border-[#425776] bg-[#162236] px-4 focus-within:border-cyan-400">

                      <LockKeyhole className="h-4 w-4 shrink-0 text-cyan-300" />

                      <input
                        id="auth-confirm"
                        type={
                          showConfirmPassword
                            ? "text"
                            : "password"
                        }
                        required
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(
                            event.target.value
                          )
                        }
                        placeholder="Confirm your password"
                        className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#91a5c1]"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(
                            (value) => !value
                          )
                        }
                        aria-label={
                          showConfirmPassword
                            ? "Hide confirmation password"
                            : "Show confirmation password"
                        }
                        className="shrink-0 text-[#a9b9d0] hover:text-white"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* ERROR MESSAGE */}

                {errorMessage && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                  >
                    {errorMessage}
                  </p>
                )}

                {/* SUCCESS MESSAGE */}

                {successMessage && (
                  <p
                    role="status"
                    className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
                  >
                    {successMessage}
                  </p>
                )}

                {/* EMAIL CONFIRMATION */}

                {needsConfirmation && (
                  <button
                    type="button"
                    onClick={() =>
                      void handleResendConfirmation()
                    }
                    disabled={resending}
                    className="text-sm font-semibold text-cyan-300 underline-offset-4 hover:underline disabled:opacity-60"
                  >
                    {resending
                      ? "Sending confirmation..."
                      : "Resend confirmation email"}
                  </button>
                )}

                {/* SUBMIT BUTTON */}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 text-sm font-semibold text-white shadow-lg shadow-cyan-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />

                      {isRegister
                        ? "Creating account..."
                        : "Signing in..."}
                    </>
                  ) : (
                    <>
                      {isRegister
                        ? "Create Account"
                        : "Sign In"}

                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              {/* SWITCH AUTH PAGE */}

              <p className="mt-5 text-center text-sm text-[#a9b9d0]">
                {isRegister ? (
                  <>
                    Already have an account?{" "}

                    <Link
                      to="/login"
                      className="font-semibold text-cyan-300 hover:underline"
                    >
                      Sign in
                    </Link>
                  </>
                ) : (
                  <>
                    Don't have an account?{" "}

                    <Link
                      to="/register"
                      className="font-semibold text-cyan-300 hover:underline"
                    >
                      Sign up
                    </Link>
                  </>
                )}
              </p>

              {/* BOTTOM INFO */}

              <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#2d3d54] bg-[#162236] p-4">

                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#253752]">
                  <BookOpen className="h-5 w-5 text-cyan-300" />
                </div>

                <div>
                  <p className="text-sm font-semibold text-white">
                    One place for all your learning
                  </p>

                  <p className="mt-1 text-xs text-[#a9b9d0]">
                    Reviewers · Flashcards · Practice Quizzes
                  </p>
                </div>
              </div>

            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
