
import { Link, useLocation } from "react-router-dom";
import { MOBILE_TABS, isActivePath } from "./navItems";
import "./MobileNav.css";

function MobileNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="studyroom-bottom-nav"
      aria-label="Mobile navigation"
    >
      <div className="studyroom-bottom-nav-inner">
        {MOBILE_TABS.map(({ label, to, icon: Icon, iconSrc }) => {
          const active = isActivePath(pathname, to);

          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={`studyroom-bottom-link ${
                active ? "active" : ""
              }`}
            >
              {iconSrc ? (
                <img src={iconSrc} alt="" />
              ) : (
                <Icon
                  size={19}
                  strokeWidth={active ? 2.2 : 1.8}
                />
              )}

              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default MobileNav;
