import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from 'react';
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
 * clic extérieur, à Échap et après un choix.
 */
export function Menu({ label = 'Plus d’actions', items }) {
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
        className="icon-btn"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <circle cx="3.5" cy="8" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="12.5" cy="8" r="1.25" />
        </svg>
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

export function Input({ id, ...props }) {
  return <input id={id} {...props} />;
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

export function Loading({ label = 'Chargement…' }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
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

export function PageHeader({ breadcrumb, title, children }) {
  useDocumentTitle(title);
  return (
    <header className="page-header">
      <div>
        {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
        <h1>{title}</h1>
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
