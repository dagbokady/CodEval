import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../auth';
import { MODE_LABELS, useTheme } from '../theme';
import {
  IconAuto,
  IconMoon,
  IconSun,
  IconBell,
  IconBook,
  IconChevronDown,
  IconClasses,
  IconClock,
  IconCode,
  IconCommunity,
  IconEvaluations,
  IconHome,
  IconPlus,
  IconResults,
  IconSettings,
  IconStats,
  IconUsers,
} from './icons';
import { roleLabel } from '../roles';
import { Avatar } from './ui';

/** Ferme un menu au clic extérieur et à Échap : le minimum attendu d'un menu. */
function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen, ref]);
}

// `end` : « Mes évaluations » (/evaluations) ne doit pas rester allumé sur
// /evaluations/nouvelle, ni « Banque d'exercices » sur /banque/evaluations :
// deux entrées actives à la fois, et l'utilisateur ne sait plus où il est.
function NavItem({ to, icon, label, end = false }) {
  return (
    <NavLink to={to} className="nav-item" end={end} title={label}>
      {icon}
      <span className="nav-label">{label}</span>
    </NavLink>
  );
}

function NavGroup({ title, children }) {
  return (
    <div className="nav-group" role="group" aria-label={title}>
      <div className="nav-group-title" aria-hidden="true">{title}</div>
      {children}
    </div>
  );
}

const TEACHER_NAV = [
  { to: '/accueil', label: 'Accueil', icon: <IconHome /> },
  {
    title: 'Évaluations',
    items: [
      { to: '/evaluations', label: 'Mes évaluations', icon: <IconEvaluations />, end: true },
      { to: '/evaluations/nouvelle', label: 'Créer une évaluation', icon: <IconPlus /> },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { to: '/classes', label: 'Mes classes', icon: <IconClasses /> },
      { to: '/banque', label: "Banque d'exercices", icon: <IconCode />, end: true },
      { to: '/banque/evaluations', label: "Banque d'évaluations", icon: <IconBook /> },
      { to: '/communaute', label: 'Communauté', icon: <IconCommunity /> },
    ],
  },
  {
    title: 'Analyse',
    items: [
      { to: '/statistiques', label: 'Statistiques', icon: <IconStats /> },
    ],
  },
];

const STUDENT_NAV = [
  { to: '/mes-evaluations', label: 'Mes évaluations', icon: <IconCode /> },
  { to: '/mes-resultats', label: 'Mes résultats', icon: <IconResults /> },
];

const ADMIN_NAV = [
  { to: '/admin', label: 'Tableau de bord', icon: <IconHome />, end: true },
  {
    title: 'Établissement',
    items: [
      { to: '/admin/utilisateurs', label: 'Utilisateurs', icon: <IconUsers /> },
      { to: '/admin/classes', label: 'Classes', icon: <IconClasses /> },
      { to: '/admin/matieres', label: 'Matières', icon: <IconBook /> },
    ],
  },
  {
    title: 'Supervision',
    items: [
      { to: '/admin/evaluations', label: 'Évaluations', icon: <IconEvaluations /> },
      { to: '/admin/journal', label: "Journal d'activité", icon: <IconClock /> },
      { to: '/communaute', label: 'Communauté', icon: <IconCommunity /> },
    ],
  },
];

const NAV_MAP = { admin: ADMIN_NAV, teacher: TEACHER_NAV, student: STUDENT_NAV };

function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);

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

  const unread = countQuery.data?.unread ?? 0;
  const notifications = listQuery.data ?? [];

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['notif-count'] });
    queryClient.invalidateQueries({ queryKey: ['notif-list'] });
  }

  async function markRead(id) {
    await api(`/api/me/notifications/${id}/read`, { method: 'PUT' });
    refresh();
  }

  async function markAllRead() {
    await api('/api/me/notifications/read-all', { method: 'PUT' });
    refresh();
  }

  function handleClick(n) {
    if (!n.read) markRead(n.id);
    if (n.link) { navigate(n.link); setOpen(false); }
  }

  const label = unread > 0
    ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}`
    : 'Notifications';

  return (
    <div className="notif-wrapper" ref={ref}>
      <button
        type="button"
        className="shell-icon-btn"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
      >
        <IconBell />
        {unread > 0 && (
          <span className="shell-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="notif-dropdown" role="region" aria-label="Notifications">
          <div className="notif-header">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="notif-read-all" onClick={markAllRead}>
                Tout marquer comme lu
              </button>
            )}
          </div>
          {listQuery.isPending && <p className="notif-empty">Chargement…</p>}
          {!listQuery.isPending && notifications.length === 0 && (
            <p className="notif-empty">Vous êtes à jour : aucune notification.</p>
          )}
          {notifications.map((n) => (
            <button
              type="button"
              key={n.id}
              className={`notif-item ${n.read ? '' : 'notif-item--unread'}`}
              onClick={() => handleClick(n)}
            >
              <div className="notif-item-title">
                {!n.read && <span className="notif-dot" aria-label="Non lue" />}
                {n.title}
              </div>
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

const NEXT_MODE = { light: 'dark', dark: 'system', system: 'light' };

/** Bascule clair / sombre / système. L'infobulle dit l'état et ce que fera le clic. */
function ThemeToggle() {
  const { mode, cycle } = useTheme();
  const icon = mode === 'light' ? <IconSun /> : mode === 'dark' ? <IconMoon /> : <IconAuto />;
  const label = `${MODE_LABELS[mode]} : passer au ${MODE_LABELS[NEXT_MODE[mode]].toLowerCase()}`;
  return (
    <button
      type="button"
      className="shell-icon-btn"
      onClick={cycle}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

function UserMenu({ user, organization, signOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);
  return (
    <div className="sidebar-footer" ref={ref}>
      <button
        type="button"
        className="sidebar-user"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar user={user} />
        <span className="identity">
          <strong>{user.full_name}</strong>
          <span>{roleLabel(user.role, user.gender)}{organization ? ` · ${organization}` : ''}</span>
        </span>
        <span className={`sidebar-chevron ${open ? 'is-open' : ''}`} aria-hidden="true">
          <IconChevronDown />
        </span>
      </button>
      {open && (
        <div className="sidebar-menu" role="menu">
          <Link role="menuitem" to="/parametres" onClick={() => setOpen(false)}>
            Paramètres du compte
          </Link>
          <button role="menuitem" type="button" className="sidebar-menu-danger" onClick={signOut}>
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  const { user, organization, signOut } = useAuth();
  const navConfig = NAV_MAP[user.role] ?? [];

  return (
    <div className="shell">
      <a className="skip-link" href="#contenu">Aller au contenu</a>
      <nav className="sidebar" aria-label="Navigation principale">
        {/* Plus de barre du haut : le thème et les notifications vivent à côté
            du nom de l'application, toujours visibles, sans voler de hauteur
            au contenu. */}
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">&lt;/&gt;</span>
          CodEval
          <div className="brand-actions">
            <ThemeToggle />
            <NotificationBell />
          </div>
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

        <UserMenu user={user} organization={organization} signOut={signOut} />
      </nav>

      <main className="main" id="contenu" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
