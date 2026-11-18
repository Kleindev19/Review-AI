import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Sparkles,
  BookOpen,
  UserRound,
  GraduationCap,
} from "lucide-react";

const navigation = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Create", path: "/create", icon: Sparkles },
  { label: "Reviewers", path: "/my-reviewers", icon: BookOpen },
  { label: "Profile", path: "/profile", icon: UserRound },
];

function Navbar() {
  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <GraduationCap size={22} />
          </div>
          <div>
            <strong>StudyRoom</strong>
            <span>Your study workspace</span>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="sidebar-links">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          Built for focused learning.
        </div>
      </aside>

      <nav className="mobile-nav">
        {navigation.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `mobile-link ${isActive ? "active" : ""}`
              }
            >
              <Icon size={21} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}

export default Navbar;