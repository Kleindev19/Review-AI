
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import type { User } from "@supabase/supabase-js";

import { supabase } from "../../lib/supabaseClient";

import {
  NAV_GROUPS,
  EXTRA_ITEMS,
  type NavItem,
} from "./navItems";

import "./Sidebar.css";

// ==========================================
// PROFILE HELPERS
// ==========================================

function getMetadata(
  user: User | null,
  key: string
): string {
  if (!user) return "";

  const value = user.user_metadata?.[key];

  return typeof value === "string"
    ? value.trim()
    : "";
}

function getDisplayName(user: User | null): string {
  if (!user) return "StudyRoom User";

  return (
    getMetadata(user, "full_name") ||
    getMetadata(user, "display_name") ||
    getMetadata(user, "name") ||
    user.email?.split("@")[0] ||
    "StudyRoom User"
  );
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);

  return (
    words
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase() || "U"
  );
}

// ==========================================
// SIDEBAR
// ==========================================

function Sidebar() {
  const [user, setUser] = useState<User | null>(null);

  const [avatarUrl, setAvatarUrl] =
    useState<string | null>(null);

  const displayName = getDisplayName(user);

  const accountEmail =
    user?.email ?? "Your account";

  const avatarPath = getMetadata(
    user,
    "avatar_path"
  );

  // ========================================
  // LOAD ACCOUNT AND LISTEN FOR CHANGES
  // ========================================

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      const {
        data: { user: account },
        error,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (error) {
        console.error(
          "Could not load sidebar profile:",
          error
        );
        return;
      }

      setUser(account);
    }

    void loadAccount();

    // Automatically respond when the user
    // updates their profile or signs out.

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;

        setUser(session?.user ?? null);
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // ========================================
  // LOAD PRIVATE PROFILE PICTURE
  // ========================================

  useEffect(() => {
    let active = true;

    setAvatarUrl(null);

    async function loadAvatar() {
      if (
        !user ||
        !avatarPath ||
        !avatarPath.startsWith(`${user.id}/`)
      ) {
        return;
      }

      const { data, error } =
        await supabase.storage
          .from("studyroom-avatars")
          .createSignedUrl(avatarPath, 3600);

      if (!active) return;

      if (error) {
        console.error(
          "Could not load sidebar avatar:",
          error
        );
        return;
      }

      setAvatarUrl(data.signedUrl);
    }

    void loadAvatar();

    return () => {
      active = false;
    };
  }, [user?.id, avatarPath]);

  // ========================================
  // RENDER NAVIGATION ITEM
  // ========================================

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === "/"}
        className={({ isActive }) =>
          `study-sidebar-link ${
            isActive ? "active" : ""
          }`
        }
      >
        {item.iconSrc ? (
          <img
            src={item.iconSrc}
            alt=""
            className="study-sidebar-link-icon"
          />
        ) : (
          <Icon
            size={17}
            className="study-sidebar-link-icon"
          />
        )}

        <span>{item.label}</span>
      </NavLink>
    );
  };

  // ========================================
  // SIDEBAR UI
  // ========================================

  return (
    <aside className="study-sidebar">

      {/* BRAND */}

      <div className="study-sidebar-brand">
        <NavLink
          to="/"
          className="study-brand-link"
        >
          <div className="study-brand-logo">
            <img src="/studyroom-logo.svg" alt="" />
          </div>

          <div className="study-brand-info">
            <strong>StudyRoom</strong>
            <span>Your study workspace</span>
          </div>
        </NavLink>
      </div>

      {/* NAVIGATION */}

      <nav className="study-sidebar-navigation">

        {NAV_GROUPS.map((group) => (
          <div
            className="study-sidebar-group"
            key={group.label}
          >
            <p className="study-sidebar-group-label">
              {group.label}
            </p>

            <div className="study-sidebar-items">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}

        <div className="study-sidebar-extra">
          {EXTRA_ITEMS.map(renderItem)}
        </div>

      </nav>

      {/* DYNAMIC PROFILE FOOTER */}

      <div className="study-sidebar-footer">

        <NavLink
          to="/profile"
          className="study-sidebar-user"
          title="View your profile"
          style={{
            width: "100%",
            minWidth: 0,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          {/* PROFILE AVATAR */}

          <div
            className="study-sidebar-avatar"
            style={{
              overflow: "hidden",
              borderRadius: "50%",
              flexShrink: 0,
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`${displayName}'s profile`}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: "50%",
                }}
              />
            ) : (
              getInitials(displayName)
            )}
          </div>

          {/* DISPLAY NAME + EMAIL */}

          <div
            className="study-sidebar-user-info"
            style={{
              minWidth: 0,
              flex: 1,
            }}
          >
            <strong
              style={{
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayName}
            </strong>

            <span
              title={accountEmail}
              style={{
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {accountEmail}
            </span>
          </div>
        </NavLink>

      </div>
    </aside>
  );
}

export default Sidebar;
