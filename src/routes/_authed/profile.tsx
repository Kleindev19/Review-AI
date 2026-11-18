
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Link, useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";

import {
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";

import { supabase } from "../../lib/supabaseClient";

// ==========================================
// CONFIGURATION
// ==========================================

const AVATAR_BUCKET = "studyroom-avatars";
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

type Action =
  | "profile"
  | "avatar"
  | "remove-avatar"
  | "email"
  | "verification"
  | "password"
  | "security-code"
  | "logout"
  | null;

// ==========================================
// HELPERS
// ==========================================

function readMetadata(
  user: User,
  key: string
): string {
  const value = user.user_metadata?.[key];

  return typeof value === "string" ? value : "";
}

function getDisplayName(user: User): string {
  return (
    readMetadata(user, "full_name") ||
    readMetadata(user, "display_name") ||
    readMetadata(user, "name") ||
    user.email?.split("@")[0] ||
    "StudyRoom User"
  );
}

function formatDate(value?: string | null): string {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/);

  return words
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase() || "U";
}

async function createAvatarUrl(
  path: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, 3600);

  if (error) {
    throw new Error(error.message);
  }

  return data.signedUrl;
}

// ==========================================
// PROFILE PAGE
// ==========================================

export default function ProfilePage() {
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(
    null
  );

  const [user, setUser] = useState<User | null>(null);

  const [displayName, setDisplayName] =
    useState("");

  const [email, setEmail] = useState("");

  const [avatarUrl, setAvatarUrl] =
    useState<string | null>(null);

  const [newPassword, setNewPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [securityCode, setSecurityCode] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Action>(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isBusy = busy !== null;

  // ==========================================
  // LOAD ACCOUNT
  // ==========================================

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      try {
        const {
          data: { user: account },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!account) {
          if (active) {
            setUser(null);
          }
          return;
        }

        if (!active) return;

        setUser(account);
        setDisplayName(getDisplayName(account));
        setEmail(account.email ?? "");

        const path = readMetadata(
          account,
          "avatar_path"
        );

        if (path) {
          try {
            const url = await createAvatarUrl(path);

            if (active) {
              setAvatarUrl(url);
            }
          } catch (avatarError) {
            console.error(
              "Avatar loading failed:",
              avatarError
            );
          }
        }
      } catch (err) {
        if (active) {
          setError(errorMessage(err));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadAccount();

    return () => {
      active = false;
    };
  }, []);

  function beginAction(action: Action) {
    setBusy(action);
    setError("");
    setNotice("");
  }

  // ==========================================
  // UPDATE DISPLAY NAME
  // ==========================================

  async function saveProfile(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!user || isBusy) return;

    const name = displayName.trim();

    if (name.length < 2 || name.length > 80) {
      setError(
        "Display name must contain 2 to 80 characters."
      );
      return;
    }

    beginAction("profile");

    try {
      const { data, error: updateError } =
        await supabase.auth.updateUser({
          data: {
            full_name: name,
            display_name: name,
          },
        });

      if (updateError) throw updateError;

      setUser(data.user);
      setDisplayName(name);
      setNotice("Profile saved successfully!");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  // ==========================================
  // UPLOAD PROFILE PICTURE
  // ==========================================

  async function uploadAvatar(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file || !user || isBusy) return;

    if (
      !ACCEPTED_IMAGE_TYPES.includes(file.type)
    ) {
      setError(
        "Please select a JPG, PNG, or WEBP image."
      );
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setError(
        "Profile picture must not exceed 2 MB."
      );
      return;
    }

    if (file.size === 0) {
      setError("The selected image is empty.");
      return;
    }

    beginAction("avatar");

    const previousPath = readMetadata(
      user,
      "avatar_path"
    );

    const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";

    const newPath =
      `${user.id}/${crypto.randomUUID()}.${extension}`;

    try {
      const { error: uploadError } =
        await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(newPath, file, {
            contentType: file.type,
            upsert: false,
          });

      if (uploadError) throw uploadError;

      const { data, error: updateError } =
        await supabase.auth.updateUser({
          data: {
            avatar_path: newPath,
          },
        });

      if (updateError) {
        // Remove the uploaded object if
        // account metadata cannot be saved.
        await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([newPath]);

        throw updateError;
      }

      setUser(data.user);

      try {
        const url = await createAvatarUrl(
          newPath
        );

        setAvatarUrl(url);
      } catch (urlError) {
        console.error(
          "Avatar preview unavailable:",
          urlError
        );

        setAvatarUrl(null);
      }

      // Best-effort removal of old avatar.
      if (
        previousPath &&
        previousPath !== newPath &&
        previousPath.startsWith(`${user.id}/`)
      ) {
        const { error: removalError } =
          await supabase.storage
            .from(AVATAR_BUCKET)
            .remove([previousPath]);

        if (removalError) {
          console.error(
            "Old avatar cleanup failed:",
            removalError
          );
        }
      }

      setNotice("Profile picture updated!");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  // ==========================================
  // REMOVE PROFILE PICTURE
  // ==========================================

  async function removeAvatar() {
    if (!user || isBusy) return;

    const path = readMetadata(
      user,
      "avatar_path"
    );

    if (!path) return;

    beginAction("remove-avatar");

    try {
      const { data, error: updateError } =
        await supabase.auth.updateUser({
          data: {
            avatar_path: null,
          },
        });

      if (updateError) throw updateError;

      setUser(data.user);
      setAvatarUrl(null);

      if (path.startsWith(`${user.id}/`)) {
        const { error: removalError } =
          await supabase.storage
            .from(AVATAR_BUCKET)
            .remove([path]);

        if (removalError) {
          console.error(
            "Avatar deletion cleanup failed:",
            removalError
          );
        }
      }

      setNotice("Profile picture removed.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  // ==========================================
  // CHANGE ACCOUNT EMAIL
  // ==========================================

  async function changeEmail(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!user || isBusy) return;

    const nextEmail = email.trim().toLowerCase();

    if (!nextEmail) {
      setError("Email address is required.");
      return;
    }

    if (
      nextEmail ===
      (user.email ?? "").toLowerCase()
    ) {
      setNotice("This is already your account email.");
      return;
    }

    beginAction("email");

    try {
      const { error: updateError } =
        await supabase.auth.updateUser({
          email: nextEmail,
        });

      if (updateError) throw updateError;

      setNotice(
        "Email change requested. Check your email for the confirmation instructions."
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  // ==========================================
  // RESEND EMAIL VERIFICATION
  // ==========================================

  async function resendVerification() {
    if (!user?.email || isBusy) return;

    beginAction("verification");

    try {
      const { error: resendError } =
        await supabase.auth.resend({
          type: "signup",
          email: user.email,
        });

      if (resendError) throw resendError;

      setNotice(
        "Verification email requested. Check your inbox."
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  // ==========================================
  // REQUEST SECURITY CODE
  // ==========================================

  async function requestSecurityCode() {
    if (!user || isBusy) return;

    beginAction("security-code");

    try {
      const { error: codeError } =
        await supabase.auth.reauthenticate();

      if (codeError) throw codeError;

      setNotice(
        "Security code requested. Check your email."
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  // ==========================================
  // CHANGE PASSWORD
  // ==========================================

  async function changePassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!user || isBusy) return;

    if (newPassword.length < 8) {
      setError(
        "New password must be at least 8 characters."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    beginAction("password");

    try {
      const nonce = securityCode.trim();

      const { error: updateError } =
        await supabase.auth.updateUser({
          password: newPassword,
          ...(nonce ? { nonce } : {}),
        });

      if (updateError) throw updateError;

      setNewPassword("");
      setConfirmPassword("");
      setSecurityCode("");

      setNotice("Password updated successfully!");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  // ==========================================
  // LOG OUT
  // ==========================================

  async function logout() {
    if (isBusy) return;

    beginAction("logout");

    try {
      const { error: signOutError } =
        await supabase.auth.signOut();

      if (signOutError) throw signOutError;

      navigate("/login", {
        replace: true,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your profile...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <UserRound className="mx-auto h-10 w-10 text-muted-foreground" />

        <h1 className="mt-4 text-xl font-semibold text-foreground">
          Sign in required
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {error ||
            "Sign in to view your account settings."}
        </p>

        <Link
          to="/login"
          className="btn btn-primary mt-5"
        >
          Go to login
        </Link>
      </div>
    );
  }

  const currentName = getDisplayName(user);

  const avatarPath = readMetadata(
    user,
    "avatar_path"
  );

  const verified = Boolean(
    user.email_confirmed_at
  );

  // ==========================================
  // PROFILE UI
  // ==========================================

  return (
    <div className="mx-auto max-w-4xl space-y-6">

      {/* HEADER */}

      <header className="border-b border-border pb-5">
        <p className="text-xs font-medium text-muted-foreground">
          Account settings
        </p>

        <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-foreground">
          My Profile
        </h1>

        <p className="mt-1.5 text-sm text-muted-foreground">
          Manage your personal information and
          account security.
        </p>
      </header>

      {/* ACCOUNT SUMMARY */}

      <section className="panel p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">

          {/* AVATAR */}

          <div className="relative shrink-0">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary text-2xl font-semibold text-foreground">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile picture"
                  className="h-full w-full object-cover"
                />
              ) : (
                initials(currentName)
              )}
            </div>

            <button
              type="button"
              title="Change profile picture"
              aria-label="Change profile picture"
              onClick={() =>
                fileInputRef.current?.click()
              }
              disabled={isBusy}
              className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "avatar" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                void uploadAvatar(event);
              }}
              className="hidden"
              aria-label="Upload profile picture"
            />
          </div>

          {/* USER INFORMATION */}

          <div className="min-w-0 flex-1">
            <h2 className="break-words text-xl font-semibold text-foreground">
              {currentName}
            </h2>

            <p className="mt-1 break-all text-sm text-muted-foreground">
              {user.email}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Joined {formatDate(user.created_at)}
              </span>

              <span className="inline-flex items-center gap-1.5">
                {verified ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Mail className="h-3.5 w-3.5" />
                )}

                {verified
                  ? "Email verified"
                  : "Email not verified"}
              </span>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              JPG, PNG, or WEBP. Maximum 2 MB.
            </p>

            {avatarPath && (
              <button
                type="button"
                onClick={() => {
                  void removeAvatar();
                }}
                disabled={isBusy}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove picture
              </button>
            )}
          </div>
        </div>
      </section>

      {/* FEEDBACK */}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-[13px] text-foreground"
        >
          <Check className="h-4 w-4 text-emerald-400" />
          {notice}
        </div>
      )}

      {/* EDIT PROFILE */}

      <section className="panel p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-foreground">
            Personal information
          </h2>

          <p className="mt-1 text-xs text-muted-foreground">
            Update the name shown on your account.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            void saveProfile(event);
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="label-xs mb-1.5 block">
              Display name
            </span>

            <input
              value={displayName}
              onChange={(event) =>
                setDisplayName(event.target.value)
              }
              maxLength={80}
              placeholder="Enter your full name"
              disabled={isBusy}
              className="input"
              required
            />
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isBusy}
              className="btn btn-primary btn-sm disabled:opacity-50"
            >
              {busy === "profile" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}

              {busy === "profile"
                ? "Saving..."
                : "Save changes"}
            </button>
          </div>
        </form>
      </section>

      {/* EMAIL SETTINGS */}

      <section className="panel p-5 sm:p-6">
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />

            <h2 className="text-sm font-semibold text-foreground">
              Email address
            </h2>
          </div>

          <p className="mt-1.5 text-xs text-muted-foreground">
            Changing your email may require
            confirmation through email.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            void changeEmail(event);
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="label-xs mb-1.5 block">
              Account email
            </span>

            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              disabled={isBusy}
              className="input"
              required
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {verified ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Verified account
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void resendVerification();
                  }}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Resend verification email
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="btn btn-secondary btn-sm disabled:opacity-50"
            >
              {busy === "email" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}

              Update email
            </button>
          </div>
        </form>
      </section>

      {/* CHANGE PASSWORD */}

      <section className="panel p-5 sm:p-6">
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />

            <h2 className="text-sm font-semibold text-foreground">
              Change password
            </h2>
          </div>

          <p className="mt-1.5 text-xs text-muted-foreground">
            Choose a strong password that you do
            not use on other websites.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            void changePassword(event);
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="label-xs mb-1.5 block">
              New password
            </span>

            <div className="relative">
              <input
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                value={newPassword}
                onChange={(event) =>
                  setNewPassword(event.target.value)
                }
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                disabled={isBusy}
                className="input pr-10"
                required
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword((value) => !value)
                }
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </label>

          <label className="block">
            <span className="label-xs mb-1.5 block">
              Confirm new password
            </span>

            <input
              type="password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
              minLength={8}
              autoComplete="new-password"
              placeholder="Repeat new password"
              disabled={isBusy}
              className="input"
              required
            />
          </label>

          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />

              <h3 className="text-xs font-medium text-foreground">
                Additional security verification
              </h3>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              If your account requires a security
              code to change passwords, request
              one and enter it below.
            </p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={securityCode}
                onChange={(event) =>
                  setSecurityCode(event.target.value)
                }
                placeholder="Security code (if required)"
                autoComplete="one-time-code"
                disabled={isBusy}
                className="input flex-1"
              />

              <button
                type="button"
                onClick={() => {
                  void requestSecurityCode();
                }}
                disabled={isBusy}
                className="btn btn-secondary btn-sm disabled:opacity-50"
              >
                {busy === "security-code" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}

                Request code
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isBusy}
              className="btn btn-primary btn-sm disabled:opacity-50"
            >
              {busy === "password" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}

              Update password
            </button>
          </div>
        </form>
      </section>

      {/* ACCOUNT INFORMATION */}

      <section className="panel p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-foreground">
          Account information
        </h2>

        <div className="mt-4 divide-y divide-border">
          <div className="flex flex-wrap justify-between gap-2 py-3 text-xs">
            <span className="text-muted-foreground">
              Account status
            </span>

            <span className="text-foreground">
              Active
            </span>
          </div>

          <div className="flex flex-wrap justify-between gap-2 py-3 text-xs">
            <span className="text-muted-foreground">
              Email verification
            </span>

            <span className="text-foreground">
              {verified
                ? "Verified"
                : "Pending verification"}
            </span>
          </div>

          <div className="flex flex-wrap justify-between gap-2 py-3 text-xs">
            <span className="text-muted-foreground">
              Member since
            </span>

            <span className="text-foreground">
              {formatDate(user.created_at)}
            </span>
          </div>

          <div className="flex flex-wrap justify-between gap-2 py-3 text-xs">
            <span className="text-muted-foreground">
              Account type
            </span>

            <span className="text-foreground">
              StudyRoom Member
            </span>
          </div>
        </div>
      </section>

      {/* LOG OUT */}

      <section className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Sign out
            </h2>

            <p className="mt-1 text-xs text-muted-foreground">
              End your StudyRoom session.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void logout();
            }}
            disabled={isBusy}
            className="btn btn-secondary disabled:opacity-50"
          >
            {busy === "logout" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}

            {busy === "logout"
              ? "Signing out..."
              : "Log out"}
          </button>
        </div>
      </section>
    </div>
  );
}
