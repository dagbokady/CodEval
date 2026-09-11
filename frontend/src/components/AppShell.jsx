import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../auth';
import { MODE_LABELS, useTheme } from '../theme';
import {
  IconAuto,
  IconMoon,
  IconSun,
  IconBell,
  IconChevronDown,
  IconClasses,
  IconCode,
  IconEvaluations,
  IconHome,
  IconPlus,
  IconResults,
  IconSettings,
  IconStats,
} from './icons';

function NavItem({ to, icon, label }) {
  return (
    <NavLink to={to} className="nav-item" end={false}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

function NavGroup({ title, children }) {
  return (
    <div className="nav-group">
      <div className="nav-group-title">{title}</div>
      {children}
    </div>
  );
}

const TEACHER_NAV = [
  { to: '/accueil', label: 'Accueil', icon: <IconHome /> },
  {
    title: 'ÉVALUATIONS',
    items: [
      { to: '/evaluations', label: 'Mes évaluations', icon: <IconEvaluations /> },
      { to: '/evaluations/nouvelle', label: 'Créer une évaluation', icon: <IconPlus /> },
    ],
  },
  {
    title: 'GESTION',
    items: [
      { to: '/classes', label: 'Mes classes', icon: <IconClasses /> },
      { to: '/banque', label: "Banque d'exercices", icon: <IconCode /> },
      { to: '/banque/evaluations', label: "Banque d'évaluations", icon: <IconEvaluations /> },
    ],
  },
  {
    title: 'ANALYSE',
    items: [
      { to: '/statistiques', label: 'Statistiques', icon: <IconStats /> },
    ],
  },
];

const STUDENT_NAV = [
  { to: '/mes-evaluations', label: 'Mes évaluations', icon: <IconCode /> },
  { to: '/mes-resultats', label: 'Mes résultats', icon: <IconResults /> },
];

const NAV_MAP = { teacher: TEACHER_NAV, student: STUDENT_NAV };
const ROLE_LABELS = { teacher: 'Enseignante', student: 'Étudiant' };

function Breadcrumb({ organization }) {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const crumbs = [organization ?? 'CodEval'];

  const labels = {
    accueil: 'Accueil',
    evaluations: 'Évaluations',
    nouvelle: 'Nouvelle',
    classes: 'Classes',
    banque: 'Banque',
    statistiques: 'Statistiques',
    parametres: 'Paramètres',
    etablissement: 'Tableau de bord',
    utilisateurs: 'Utilisateurs',
    'mes-evaluations': 'Mes évaluations',
    'mes-resultats': 'Mes résultats',
    session: 'Session',
    resultats: 'Résultats',
  };

  segments.forEach((seg) => {
    if (labels[seg]) crumbs.push(labels[seg]);
  });

  return (
    <div className="topbar-breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={i}>
          {i > 0 && <span className="topbar-sep" aria-hidden="true">›</span>}
          {crumb}
        </span>
      ))}
    </div>
  );
}

function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const countQuery = useQuery({
    queryKey: ['notif-count'],
    queryFn: () => api('/api/me/notifications/count'),
    refetchInterval: 15_000,
  });
  const listQuery = useQuery({
    queryKey: ['notif-list'],
    queryFn: () => api('/api/me/notifications?limit=10'),
    enabled: open,
  });

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const unread = countQuery.data?.unread ?? 0;
  const notifications = listQuery.data ?? [];

  async function markRead(id) {
    await api(`/api/me/notifications/${id}/read`, { method: 'PUT' });
    queryClient.invalidateQueries({ queryKey: ['notif-count'] });
    queryClient.invalidateQueries({ queryKey: ['notif-list'] });
  }

  async function markAllRead() {
    await api('/api/me/notifications/read-all', { method: 'PUT' });
    queryClient.invalidateQueries({ queryKey: ['notif-count'] });
    queryClient.invalidateQueries({ queryKey: ['notif-list'] });
  }

  function handleClick(n) {
    if (!n.read) markRead(n.id);
    if (n.link) { navigate(n.link); setOpen(false); }
  }

  return (
    <div className="notif-wrapper" ref={ref}>
      <button
        className="topbar-icon-btn"
        aria-label="Notifications"
        onClick={() => setOpen(!open)}
      >
        <IconBell />
        {unread > 0 && <span className="topbar-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button className="notif-read-all" onClick={markAllRead}>
                Tout marquer lu
              </button>
            )}
          </div>
          {notifications.length === 0 && (
            <p className="notif-empty">Aucune notification</p>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              className={`notif-item ${n.read ? '' : 'notif-item--unread'}`}
              onClick={() => handleClick(n)}
            >
              <div className="notif-item-title">{n.title}</div>
              {n.body && <div className="notif-item-body">{n.body}</div>}
              <div className="notif-item-time">
                {new Date(n.created_at).toLocaleString('fr-FR', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bascule clair / sombre / système. Un seul bouton, trois positions. */
function ThemeToggle() {
  const { mode, cycle } = useTheme();
  const icon = mode === 'light' ? <IconSun /> : mode === 'dark' ? <IconMoon /> : <IconAuto />;
  return (
    <button
      type="button"
      className="topbar-icon-btn"
      onClick={cycle}
      title={MODE_LABELS[mode]}
      aria-label={MODE_LABELS[mode]}
    >
      {icon}
    </button>
  );
}

export default function AppShell() {
  const { user, organization, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navConfig = NAV_MAP[user.role] ?? [];
  const initials = user.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Navigation principale">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">&lt;/&gt;</span>
          CodEval
        </div>

        <div className="nav">
          {navConfig.map((entry) => {
            if (entry.title) {
              return (
                <NavGroup key={entry.title} title={entry.title}>
                  {entry.items.map((item) => (
                    <NavItem key={item.to + item.label} {...item} />
                  ))}
                </NavGroup>
              );
            }
            return <NavItem key={entry.to} {...entry} />;
          })}
        </div>

        <div className="nav nav--bottom">
          <NavItem to="/parametres" label="Paramètres" icon={<IconSettings />} />
        </div>

        <div className="sidebar-footer">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <div className="identity">
            <strong title={organization}>{user.full_name}</strong>
            <span>{ROLE_LABELS[user.role]}</span>
          </div>
          <button
            className="sidebar-menu-btn"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-label="Menu utilisateur"
            aria-expanded={userMenuOpen}
          >
            <IconChevronDown />
          </button>
          {userMenuOpen && (
            <div className="sidebar-menu">
              <button onClick={signOut}>Se déconnecter</button>
            </div>
          )}
        </div>
      </nav>

      <main className="main">
        <header className="topbar">
          <Breadcrumb organization={organization} />
          <div className="topbar-actions">
            <ThemeToggle />
            <NotificationBell />
            <span className="avatar avatar--topbar" aria-hidden="true">{initials}</span>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
