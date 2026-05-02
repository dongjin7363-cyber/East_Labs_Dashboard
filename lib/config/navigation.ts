export interface NavigationLinkItem {
  type: "link";
  label: string;
  href: string;
}

export interface NavigationSubgroupItem {
  type: "subgroup";
  label: string;
  items: NavigationLinkItem[];
}

export type NavigationDropdownItem =
  | NavigationLinkItem
  | NavigationSubgroupItem;

export interface NavigationGroup {
  label: string;
  items: NavigationDropdownItem[];
}

export const NAV_GROUPS: NavigationGroup[] = [
  {
    label: "Invest Management",
    items: [
      { type: "link", label: "Portfolio", href: "/portfolio" },
      { type: "link", label: "Leaderboard", href: "/leaderboard" },
      { type: "link", label: "Asset Trend", href: "/asset-trend" },
      { type: "link", label: "Memo", href: "/memo" },
      { type: "link", label: "Expenditure", href: "/expenditure" },
      { type: "link", label: "Salary", href: "/salary" },
    ],
  },
  {
    label: "Market",
    items: [
      { type: "link", label: "Market Screening", href: "/market/screening" },
      { type: "link", label: "Daily Stock", href: "/market/daily" },
      { type: "link", label: "Momentum", href: "/market/momentum" },
      { type: "link", label: "수출입 데이터", href: "/market/export" },
    ],
  },
  {
    label: "Membership",
    items: [{ type: "link", label: "Membership", href: "/membership" }],
  },
];
