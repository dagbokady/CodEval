import { useState } from 'react';
import { NavLink } from 'react-router-dom';

// type="button" par défaut : sans lui, un bouton dans un <form> vaut submit —
// « + Ajouter un test » enregistrait l'exercice et refermait l'éditeur.
export function Button({ variant = 'primary', size, type = 'button', children, ...props }) {
  return (
    <button type={type} className={`btn ${variant} ${size ?? ''}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function Tag({ tone = 'neutral', children }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

export function Field({ label, error, hint, children, id }) {
  return (
    <div className={`field ${error ? 'error' : ''}`.trim()}>
      {label && <label htmlFor={id}>{label}</label>}
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function Input({ id, ...props }) {
  return <input id={id} {...props} />;
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
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Chips({ options, value, onChange, label }) {
  return (
    <div className="chip-bar">
      {label && <span className="label">{label}</span>}
      {options.map((option) => (
        <button
          key={option.value ?? 'all'}
          type="button"
          className="chip"
          aria-pressed={value === option.value}
          onClick={() => onChange(value === option.value ? null : option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          className="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
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

export function Stat({ label, value }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="btn secondary small" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Précédent
      </button>
      <span>
        Page {page} / {pages} — {total} éléments
      </span>
      <button
        className="btn secondary small"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Suivant
      </button>
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
