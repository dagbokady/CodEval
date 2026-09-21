import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useDocumentTitle } from '../useDocumentTitle';

// type="button" par défaut : sans lui, un bouton dans un <form> vaut submit :
// « + Ajouter un test » enregistrait l'exercice et refermait l'éditeur.
export function Button({ variant = 'primary', size, type = 'button', children, ...props }) {
  return (
    <button type={type} className={`btn ${variant} ${size ?? ''}`.trim()} {...props}>
      {children}
    </button>
  );
}

/** Étiquette de catégorie : un filet fin, sans aplat. Pas pour un état. */
export function Tag({ tone = 'neutral', children, className, ...props }) {
  return (
    <span className={`tag ${tone} ${className ?? ''}`.trim()} {...props}>
      {children}
    </span>
  );
}

// Les tons historiques des étiquettes se ramènent aux quelques couleurs d'état.
const STATUS_TONE_ALIASES = { solid: 'info', purple: 'info' };

/**
 * État d'un objet (épreuve, compte, copie) : un point de couleur et un mot,
 * dans le flux du texte. Il se lit sans peser plus lourd que le nom qu'il
 * qualifie.
 */
export function Status({ tone = 'neutral', children, className, ...props }) {
  const resolved = STATUS_TONE_ALIASES[tone] ?? tone;
  return (
    <span className={`status status--${resolved} ${className ?? ''}`.trim()} {...props}>
      {children}
    </span>
  );
}

/**
 * Menu d'actions secondaires d'une ligne : « ⋯ », puis la liste. Se ferme au
 * clic extérieur, à Échap et après un choix. Avec `trigger`, le déclencheur est
 * un bouton secondaire qui porte ce libellé (« Exporter ▾ »).
 */
export function Menu({ label = 'Plus d’actions', items, trigger }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={trigger ? 'btn secondary menu-trigger' : 'icon-btn'}
        aria-label={trigger ? undefined : label}
        title={trigger ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {trigger ? (
          <>
            {trigger}
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
            <circle cx="3.5" cy="8" r="1.25" />
            <circle cx="8" cy="8" r="1.25" />
            <circle cx="12.5" cy="8" r="1.25" />
          </svg>
        )}
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {visible.map((item) =>
            item === 'separator' ? (
              <div key={`sep-${visible.indexOf(item)}`} className="menu-sep" role="separator" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={item.danger ? 'menu-danger' : undefined}
                disabled={item.disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Libellé, aide et erreur d'un champ. Le champ enfant reçoit `aria-invalid` et
 * `aria-describedby` : un lecteur d'écran annonce l'aide ou l'erreur avec lui,
 * au lieu de la laisser flotter dessous sans lien.
 */
export function Field({ label, error, hint, children, id }) {
  const describedBy = id && (error || hint) ? `${id}-${error ? 'error' : 'hint'}` : undefined;
  // Un seul champ : on le relie. Plusieurs enfants : on les laisse tels quels.
  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  const control =
    isValidElement(only) && id
      ? cloneElement(only, {
          'aria-invalid': error ? true : undefined,
          'aria-describedby': describedBy,
        })
      : children;
  return (
    <div className={`field ${error ? 'error' : ''}`.trim()}>
      {label && <label htmlFor={id}>{label}</label>}
      {control}
      {hint && !error && (
        <span className="hint" id={describedBy}>
          {hint}
        </span>
      )}
      {error && (
        <span className="error-text" role="alert" id={describedBy}>
          {error}
        </span>
      )}
    </div>
  );
}

/** Mot de passe avec bouton « Afficher » : on vérifie ce qu'on a tapé avant d'envoyer. */
export function PasswordInput({ id, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-input">
      <input id={id} type={visible ? 'text' : 'password'} {...props} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-controls={id}
      >
        {visible ? 'Masquer' : 'Afficher'}
      </button>
    </div>
  );
}

export function Alert({ tone = 'error', children }) {
  if (!children) return null;
  return (
    <div className={`alert ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

// Largeurs des lignes fantômes : variées, pour qu'on lise une liste et non un bloc.
const SKELETON_ROWS = [
  ['46%', '28%', 72],
  ['38%', '22%', 56],
  ['52%', '31%', 64],
  ['34%', '19%', 48],
  ['44%', '26%', 60],
];

function SkeletonList({ rows = 5 }) {
  return (
    <div className="loading-list" aria-hidden="true">
      {SKELETON_ROWS.slice(0, rows).map(([title, sub, side]) => (
        <div className="loading-row" key={title + sub}>
          <div className="loading-row-text">
            <Skeleton width={title} height={12} />
            <Skeleton width={sub} height={10} />
          </div>
          <Skeleton width={side} height={20} />
        </div>
      ))}
    </div>
  );
}

/**
 * État de chargement, à la forme de ce qui arrive : la page ne saute pas à
 * l'arrivée des données.
 * - `list` (défaut) : lignes fantômes, à la place d'un tableau ou d'une liste ;
 * - `page` : en-tête, chiffres clés et liste, quand toute la page attend ;
 * - `inline` : roue et libellé, dans une boîte de dialogue ou un petit bloc ;
 * - `screen` : plein écran, hors de la coquille (session, épreuve).
 * Le libellé est lu par les lecteurs d'écran ; il n'est visible qu'en `inline`
 * et `screen`. L'état n'apparaît qu'après un court délai : un chargement
 * instantané ne fait pas clignoter la page.
 */
export function Loading({ label = 'Chargement…', variant = 'list' }) {
  if (variant === 'inline') {
    return (
      <div className="loading" role="status">
        <span className="spinner" aria-hidden="true" />
        {label}
      </div>
    );
  }
  if (variant === 'screen') {
    return (
      <div className="loading-screen" role="status">
        <span className="loading-screen-mark" aria-hidden="true">&lt;/&gt;</span>
        <span className="loading-screen-label">{label}</span>
        <span className="loading-bar" aria-hidden="true" />
      </div>
    );
  }
  if (variant === 'page') {
    return (
      <div className="loading-page" role="status">
        <span className="visually-hidden">{label}</span>
        <div className="loading-page-head" aria-hidden="true">
          <Skeleton width={120} height={11} />
          <Skeleton width={260} height={22} />
        </div>
        <div className="loading-page-stats" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div className="loading-stat" key={i}>
              <Skeleton width="45%" height={10} />
              <Skeleton width="30%" height={22} />
            </div>
          ))}
        </div>
        <SkeletonList />
      </div>
    );
  }
  return (
    <div className="loading-block" role="status">
      <span className="visually-hidden">{label}</span>
      <SkeletonList />
    </div>
  );
}

const EMPTY_ICONS = {
  // Bac vide : rien n'a encore été créé.
  empty: (
    <>
      <path d="M4 14l2.6-6.2A1.5 1.5 0 018 7h12a1.5 1.5 0 011.4.8L24 14" />
      <path d="M4 14v6.5A1.5 1.5 0 005.5 22h17a1.5 1.5 0 001.5-1.5V14h-6l-1.5 2.5h-5L10 14H4z" />
    </>
  ),
  // Loupe : des éléments existent, les filtres les écartent tous.
  search: (
    <>
      <circle cx="12.5" cy="12.5" r="6.5" />
      <path d="M17.5 17.5L23 23M10 12.5h5" />
    </>
  ),
  // Coche : la liste est vide parce que tout est fait.
  done: (
    <>
      <circle cx="14" cy="14" r="9.5" />
      <path d="M9.5 14.2l3 3 6-6.4" />
    </>
  ),
  // Page barrée : l'élément demandé n'existe pas ou plus.
  missing: (
    <>
      <path d="M8 4h8l5 5v13.5A1.5 1.5 0 0119.5 24h-11A1.5 1.5 0 017 22.5v-17A1.5 1.5 0 018.5 4z" />
      <path d="M16 4v5h5M11.5 14.5l5 5M16.5 14.5l-5 5" />
    </>
  ),
};

/**
 * Liste ou page sans contenu : dire pourquoi, et quoi faire.
 * `variant` choisit le pictogramme : `empty` (rien encore), `search` (filtres
 * trop stricts), `done` (tout est traité), `missing` (introuvable).
 * `compact` réduit les marges, pour une rubrique ou une boîte de dialogue.
 */
export function EmptyState({ title, children, action, variant = 'empty', compact = false }) {
  return (
    <div className={`empty ${compact ? 'empty--compact' : ''}`.trim()}>
      <span className={`empty-icon empty-icon--${variant}`} aria-hidden="true">
        <svg
          viewBox="0 0 28 28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {EMPTY_ICONS[variant] ?? EMPTY_ICONS.empty}
        </svg>
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/**
 * Choix exclusif en contrôle segmenté. `allLabel` ajoute une option « Tous »
 * explicite : sans elle, on ne revient à la liste complète qu'en recliquant
 * sur le filtre actif : un geste que personne ne devine.
 */
export function Segmented({ options, value, onChange, label, allLabel }) {
  const all = allLabel ? [{ value: null, label: allLabel }] : [];
  return (
    <div className="segmented" role="group" aria-label={label}>
      {[...all, ...options].map((option) => (
        <button
          key={option.value ?? 'all'}
          type="button"
          className="chip"
          aria-pressed={value === option.value}
          onClick={() =>
            onChange(option.value === null || value !== option.value ? option.value : null)
          }
        >
          {option.label}
          {option.count !== undefined && <span className="chip-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Barre de filtres sous l'en-tête : un libellé, puis le contrôle segmenté. */
export function Chips({ options, value, onChange, label, allLabel, children }) {
  const name = label?.replace(/\s*:\s*$/, '');
  return (
    <div className="chip-bar">
      {label && <span className="label" aria-hidden="true">{name}</span>}
      <Segmented
        options={options}
        value={value}
        onChange={onChange}
        label={name}
        allLabel={allLabel}
      />
      {children}
    </div>
  );
}

/** Onglets au clavier : flèches, Début, Fin (motif ARIA « tabs »). */
export function Tabs({ tabs, value, onChange }) {
  const refs = useRef([]);
  function onKeyDown(event, index) {
    const last = tabs.length - 1;
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  }
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab, index) => {
        const selected = value === tab.value;
        return (
          <button
            key={tab.value}
            ref={(el) => (refs.current[index] = el)}
            type="button"
            role="tab"
            className="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
            {tab.count > 0 && <span className="tab-count">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Disclosure({ summary, hint, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`disclosure ${open ? 'open' : ''}`.trim()}>
      <button
        type="button"
        className="disclosure-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <strong>{summary}</strong>
          {hint && <span className="sub">{hint}</span>}
        </span>
        <span aria-hidden="true" className="disclosure-sign">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && <div className="disclosure-body">{children}</div>}
    </div>
  );
}

export function PageHeader({ breadcrumb, title, meta, children }) {
  useDocumentTitle(title);
  return (
    <header className="page-header">
      <div>
        {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
        <h1>{title}</h1>
        {meta && <div className="page-meta">{meta}</div>}
      </div>
      {children && <div className="header-actions">{children}</div>}
    </header>
  );
}

/**
 * Chiffre clé. Avec `onClick`, la carte mène à la liste qu'elle résume ;
 * `tone="attention"` la signale quand elle appelle une action.
 */
export function Stat({ label, value, hint, onClick, tone }) {
  const className = `stat ${tone ? `stat--${tone}` : ''} ${onClick ? 'stat--link' : ''}`;
  const body = (
    <>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={className.trim()} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={className.trim()}>{body}</div>;
}

/** Place réservée pendant le chargement : la page ne saute pas à l'arrivée des données. */
export function Skeleton({ width = '100%', height = 14 }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />;
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <Button variant="secondary" size="small" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Précédent
      </Button>
      <span aria-live="polite">
        Page {page} / {pages} · {total} éléments
      </span>
      <Button
        variant="secondary"
        size="small"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Suivant
      </Button>
    </nav>
  );
}

export function NavItem({ to, icon, label }) {
  return (
    <NavLink to={to} className="nav-item" end={false}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

/**
 * Boîte de dialogue modale, sur l'élément natif <dialog> : le navigateur
 * piège le focus, ferme à Échap et rend le reste de la page inerte. Un clic
 * sur le fond ne la ferme pas : une saisie en cours ne se perd pas par mégarde.
 */
export function Dialog({ open, onClose, title, description, children, footer, size }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      className={`dialog ${size ? `dialog--${size}` : ''}`.trim()}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {open && (
        <div className="dialog-body">
          <header className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            {description && <p className="sub">{description}</p>}
          </header>
          {children}
          {footer && <footer className="dialog-foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** Initiales d'un nom : « Jean Koné » donne « JK ». */
function initialsOf(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

/** La photo de la personne si elle en a une, ses initiales sinon. */
export function Avatar({ user, className = '' }) {
  return (
    <span className={`avatar ${className}`.trim()} aria-hidden="true">
      {user.photo ? <img src={user.photo} alt="" /> : initialsOf(user.full_name)}
    </span>
  );
}
