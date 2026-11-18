
import {
  LayoutDashboard,
  BookOpen,
  Layers,
  ClipboardCheck,
  FolderOpen,
  User,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  iconSrc?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        label: "Dashboard",
        to: "/",
        icon: LayoutDashboard,
        iconSrc: "/icons/nav-home.png",
      },
      {
        label: "Reviewers",
        to: "/reviewers",
        icon: BookOpen,
        iconSrc: "/icons/nav-reviewers.png",
      },
      { label: "Materials", to: "/materials", icon: FolderOpen },
    ],
  },
  {
    label: "Study",
    items: [
      {
        label: "Flashcards",
        to: "/flashcards",
        icon: Layers,
        iconSrc: "/icons/nav-cards.png",
      },
      {
        label: "Practice quiz",
        to: "/quizzes",
        icon: ClipboardCheck,
        iconSrc: "/icons/nav-practice.png",
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] =
  NAV_GROUPS.flatMap((group) => group.items);

export const EXTRA_ITEMS: NavItem[] = [
  {
    label: "Create reviewer",
    to: "/create",
    icon: Sparkles,
    iconSrc: "/icons/nav-create.png",
  },
  { label: "Profile", to: "/profile", icon: User },
];

export const MOBILE_TABS: NavItem[] = [
  {
    label: "Home",
    to: "/",
    icon: LayoutDashboard,
    iconSrc: "/icons/nav-home.png",
  },
  {
    label: "Reviewers",
    to: "/reviewers",
    icon: BookOpen,
    iconSrc: "/icons/nav-reviewers.png",
  },
  {
    label: "Create",
    to: "/create",
    icon: Sparkles,
    iconSrc: "/icons/nav-create.png",
  },
  {
    label: "Cards",
    to: "/flashcards",
    icon: Layers,
    iconSrc: "/icons/nav-cards.png",
  },
  {
    label: "Practice",
    to: "/quizzes",
    icon: ClipboardCheck,
    iconSrc: "/icons/nav-practice.png",
  },
];

export const isActivePath = (
  pathname: string,
  to: string
): boolean =>
  to === "/"
    ? pathname === "/"
    : pathname === to || pathname.startsWith(`${to}/`);

export const sectionLabel = (pathname: string): string => {
  const match = [...NAV_ITEMS, ...EXTRA_ITEMS].find(
    (item) => isActivePath(pathname, item.to)
  );

  return match?.label ?? "Workspace";
};
