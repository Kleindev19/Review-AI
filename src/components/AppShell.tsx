
import { useEffect, useState } from "react";

import {
  Link,
  NavLink,
  Outlet,
  useLocation,
} from "react-router-dom";

import {
  Menu,
  Plus,
  X,
} from "lucide-react";

// ==========================================
// COMPONENTS
// ==========================================

import MobileNav from "./nav/MobileNav";
import Sidebar from "./nav/Sidebar";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "./ThemeToggle";

// ==========================================
// NAVIGATION ITEMS
// ==========================================

import {
  NAV_GROUPS,
  EXTRA_ITEMS,
  sectionLabel,
} from "./nav/navItems";

// ==========================================
// COMPONENT STYLES ONLY
// ==========================================

import "./AppShell.css";

// ==========================================
// APP SHELL
// ==========================================

function AppShell() {
  const [menuOpen, setMenuOpen] =
    useState(false);

  const { pathname } = useLocation();

  // ========================================
  // CLOSE DRAWER ON NAVIGATION
  // ========================================

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // ========================================
  // MOBILE DRAWER BEHAVIOR
  // ========================================

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [menuOpen]);

  const currentPage = sectionLabel(
    pathname
  );

  // ========================================
  // UI
  // ========================================

  return (
    <div className="studyroom-layout">

      {/* DESKTOP SIDEBAR */}

      <Sidebar />

      {/* MAIN CONTENT */}

      <div className="studyroom-content">

        {/* TOP HEADER */}

        <header className="studyroom-topbar">

          {/* MOBILE BRAND */}

          <Link
            to="/"
            className="studyroom-mobile-brand"
          >
            <img src="/studyroom-logo.svg" alt="" />

            <strong>
              StudyRoom
            </strong>
          </Link>

          {/* DESKTOP BREADCRUMB */}

          <div className="studyroom-breadcrumb">
            <Link to="/">
              StudyRoom
            </Link>

            <span>/</span>

            <strong>
              {currentPage}
            </strong>
          </div>

          {/* HEADER ACTIONS */}

          <div className="studyroom-actions">

            {/* LIGHT / DARK TOGGLE */}

            <ThemeToggle />

            {/* CREATE REVIEWER */}

            <Link
              to="/create"
              className="studyroom-new-btn"
            >
              <Plus size={16} />

              New reviewer
            </Link>

            {/* DESKTOP LOGOUT */}

            <LogoutButton />

            {/* MOBILE MENU */}

            <button
              type="button"
              className="studyroom-menu-btn"
              aria-label="Open navigation menu"
              aria-expanded={menuOpen}
              aria-controls="studyroom-mobile-drawer"
              onClick={() =>
                setMenuOpen(true)
              }
            >
              <Menu size={20} />
            </button>

          </div>
        </header>

        {/* CURRENT PAGE */}

        <main className="studyroom-page">
          <Outlet />
        </main>

      </div>

      {/* ====================================
          MOBILE NAVIGATION DRAWER
      ==================================== */}

      {menuOpen && (
        <div className="studyroom-drawer-overlay">

          {/* BACKDROP */}

          <button
            type="button"
            className="studyroom-drawer-backdrop"
            aria-label="Close navigation menu"
            onClick={() =>
              setMenuOpen(false)
            }
          />

          {/* DRAWER */}

          <aside
            id="studyroom-mobile-drawer"
            className="studyroom-drawer"
            aria-label="Mobile navigation"
          >

            {/* DRAWER HEADER */}

            <div className="studyroom-drawer-header">

              <Link
                to="/"
                className="studyroom-drawer-brand"
                onClick={() =>
                  setMenuOpen(false)
                }
              >
                <div className="studyroom-drawer-logo">
                  <img src="/studyroom-logo.svg" alt="" />
                </div>

                <div className="studyroom-drawer-brand-info">
                  <strong>
                    StudyRoom
                  </strong>

                  <span>
                    Your study workspace
                  </span>
                </div>
              </Link>

              {/* CLOSE BUTTON */}

              <button
                type="button"
                className="studyroom-drawer-close"
                aria-label="Close navigation menu"
                onClick={() =>
                  setMenuOpen(false)
                }
              >
                <X size={19} />
              </button>
            </div>

            {/* =================================
                SCROLLABLE NAVIGATION
            ================================= */}

            <nav className="studyroom-drawer-links">

              {/* NAV GROUPS */}

              {NAV_GROUPS.map((group) => (
                <div
                  key={group.label}
                  className="studyroom-drawer-group"
                >
                  <p className="studyroom-drawer-group-label">
                    {group.label}
                  </p>

                  <div className="studyroom-drawer-group-items">

                    {group.items.map((item) => {
                      const Icon = item.icon;

                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === "/"}
                          onClick={() =>
                            setMenuOpen(false)
                          }
                          className={({
                            isActive,
                          }) =>
                            `studyroom-drawer-link ${
                              isActive
                                ? "active"
                                : ""
                            }`
                          }
                        >
                          {item.iconSrc ? (
                            <img
                              src={item.iconSrc}
                              alt=""
                            />
                          ) : (
                            <Icon size={18} />
                          )}

                          <span>
                            {item.label}
                          </span>
                        </NavLink>
                      );
                    })}

                  </div>
                </div>
              ))}

              {/* EXTRA ITEMS */}

              <div className="studyroom-drawer-extra">

                {EXTRA_ITEMS.map((item) => {
                  const Icon = item.icon;

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      onClick={() =>
                        setMenuOpen(false)
                      }
                      className={({
                        isActive,
                      }) =>
                        `studyroom-drawer-link ${
                          isActive
                            ? "active"
                            : ""
                        }`
                      }
                    >
                      {item.iconSrc ? (
                        <img
                          src={item.iconSrc}
                          alt=""
                        />
                      ) : (
                        <Icon size={18} />
                      )}

                      <span>
                        {item.label}
                      </span>
                    </NavLink>
                  );
                })}

              </div>

            </nav>

            {/* =================================
                LOGOUT FOOTER
            ================================= */}

            <div className="studyroom-drawer-footer">

              <div className="studyroom-drawer-logout">
                <LogoutButton />
              </div>

            </div>

          </aside>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION */}

      <MobileNav />

    </div>
  );
}

export default AppShell;
