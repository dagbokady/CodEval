const base = { width: 17, height: 17, viewBox: '0 0 17 17', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const IconHome = () => (
  <svg {...base}>
    <path d="M2.5 6.5L8.5 2l6 4.5V14a1 1 0 01-1 1h-10a1 1 0 01-1-1V6.5z" />
    <path d="M6 15V9h5v6" />
  </svg>
);

export const IconEvaluations = () => (
  <svg {...base}>
    <path d="M6 1h5v3H6z" />
    <rect x="3" y="3" width="11" height="13" rx="2" />
    <path d="M6 9h4M6 12h3" />
  </svg>
);

export const IconPlus = () => (
  <svg {...base}>
    <circle cx="8.5" cy="8.5" r="6.5" />
    <path d="M8.5 5.5v6M5.5 8.5h6" />
  </svg>
);

export const IconClasses = () => (
  <svg {...base}>
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="10" y="2" width="5" height="5" rx="1" />
    <rect x="10" y="10" width="5" height="5" rx="1" />
    <rect x="2" y="10" width="5" height="5" rx="1" />
  </svg>
);

export const IconStats = () => (
  <svg {...base}>
    <rect x="2" y="2" width="13" height="13" rx="2" />
    <path d="M5 11l3-3 2 2 2-4" />
  </svg>
);

export const IconSettings = () => (
  <svg {...base}>
    <circle cx="8.5" cy="8.5" r="2.5" />
    <path d="M8.5 1v2M8.5 14v2M1 8.5h2M14 8.5h2M3.2 3.2l1.4 1.4M12.4 12.4l1.4 1.4M13.8 3.2l-1.4 1.4M4.6 12.4l-1.4 1.4" />
  </svg>
);

export const IconUsers = () => (
  <svg {...base}>
    <circle cx="6" cy="6" r="2.5" />
    <path d="M1.5 15c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" />
    <path d="M11 4.2a2.5 2.5 0 010 4.6M12.5 15c0-1.9-.6-3-1.4-3.9" />
  </svg>
);

export const IconResults = () => (
  <svg {...base}>
    <path d="M3 15V8M8.5 15V3M14 15v-5" />
  </svg>
);

export const IconClock = () => (
  <svg {...base}>
    <circle cx="8.5" cy="8.5" r="6.5" />
    <path d="M8.5 4.5v4l2.5 1.5" />
  </svg>
);

export const IconCode = () => (
  <svg {...base}>
    <path d="M6 5L2.5 8.5 6 12M11 5l3.5 3.5L11 12" />
  </svg>
);

export const IconBook = () => (
  <svg {...base}>
    <path d="M2 3h4.5a2 2 0 012 2v10a1.5 1.5 0 00-1.5-1.5H2V3z" />
    <path d="M15 3h-4.5a2 2 0 00-2 2v10a1.5 1.5 0 011.5-1.5H15V3z" />
  </svg>
);

export const IconCommunity = () => (
  <svg {...base}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="12" cy="7" r="2" />
    <path d="M1.5 14.5a4.5 4.5 0 019 0M10 11.2a3.5 3.5 0 015.5 3.3" />
  </svg>
);

export const IconBell = () => (
  <svg {...base}>
    <path d="M4 6.5a4.5 4.5 0 019 0c0 5 2 6.5 2 6.5H2s2-1.5 2-6.5" />
    <path d="M6.5 13a2 2 0 004 0" />
  </svg>
);

export const IconChevronDown = () => (
  <svg {...base}>
    <path d="M3 6l5.5 5L14 6" />
  </svg>
);

export const IconSun = () => (
  <svg {...base}>
    <circle cx="8.5" cy="8.5" r="3.2" />
    <path d="M8.5 1v1.8M8.5 14.2V16M2.2 8.5H1M16 8.5h-1.2M4 4l1.3 1.3M11.7 11.7L13 13M13 4l-1.3 1.3M5.3 11.7L4 13" />
  </svg>
);

export const IconMoon = () => (
  <svg {...base}>
    <path d="M14 9.7A5.8 5.8 0 016.8 2.5a5.9 5.9 0 100 12 5.9 5.9 0 007.2-4.8z" />
  </svg>
);

export const IconAuto = () => (
  <svg {...base}>
    <circle cx="8.5" cy="8.5" r="6.5" />
    <path d="M8.5 2v13a6.5 6.5 0 000-13z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconSearch = () => (
  <svg {...base}>
    <circle cx="7.5" cy="7.5" r="5" />
    <path d="M11.2 11.2L15 15" />
  </svg>
);

/** Un sujet complet : plusieurs feuilles. */
export const IconSheets = () => (
  <svg {...base}>
    <rect x="4.5" y="1.5" width="10" height="12" rx="1.5" />
    <path d="M2.5 4.5v9a2 2 0 002 2h7" />
    <path d="M7.5 5.5h4M7.5 8.5h4" />
  </svg>
);

/** Un exercice seul : une feuille. */
export const IconSheet = () => (
  <svg {...base}>
    <rect x="3" y="1.5" width="11" height="14" rx="1.5" />
    <path d="M6 5.5h5M6 8.5h5M6 11.5h3" />
  </svg>
);

export const IconReuse = () => (
  <svg {...base}>
    <path d="M13.5 6.5A5.5 5.5 0 003.4 5M3.5 10.5A5.5 5.5 0 0013.6 12" />
    <path d="M3 2v3.2h3.2M14 15v-3.2h-3.2" />
  </svg>
);

export const IconCheck = () => (
  <svg {...base}>
    <path d="M3.5 9l3.2 3.2L13.5 5" />
  </svg>
);
