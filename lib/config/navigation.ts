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
    label: "Investment",
    items: [
      { type: "link", label: "Portfolio", href: "/portfolio" },
      { type: "link", label: "Leaderboard", href: "/leaderboard" },
      { type: "link", label: "Asset Trend", href: "/asset-trend" },
      { type: "link", label: "Memo", href: "/memo" },
      { type: "link", label: "Schedule", href: "/schedule" },
    ],
  },
  {
    label: "Asset Management",
    items: [
      { type: "link", label: "Expenditure", href: "/expenditure" },
      { type: "link", label: "Salary", href: "/salary" },
    ],
  },
  {
    label: "Market",
    items: [
      { type: "link", label: "News", href: "/market/news" },
      {
        type: "subgroup",
        label: "KR",
        items: [
          { type: "link", label: "Daily Market", href: "/market/kr/daily-market" },
          {
            type: "link",
            label: "Sector ETF Trend",
            href: "/market/kr/sector-etf-trend",
          },
          {
            type: "link",
            label: "Sector ETF Momentum",
            href: "/market/kr/sector-etf-momentum",
          },
        ],
      },
      {
        type: "subgroup",
        label: "US",
        items: [
          { type: "link", label: "Daily Market", href: "/market/us/daily-market" },
          {
            type: "link",
            label: "Sector ETF Trend",
            href: "/market/us/sector-etf-trend",
          },
          {
            type: "link",
            label: "Sector ETF Momentum",
            href: "/market/us/sector-etf-momentum",
          },
        ],
      },
      { type: "link", label: "Crypto", href: "/market/crypto" },
    ],
  },
  {
    label: "Membership",
    items: [{ type: "link", label: "Membership", href: "/membership" }],
  },
];
