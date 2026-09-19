import { useState } from 'react';
import { AUDIT_LABELS, useAudit } from '../../api/admin';
import { Alert, Chips, EmptyState, Loading, PageHeader, Pagination } from '../../components/ui';
import { formatDateTime } from '../../format';

/** Familles d'opérations : chaque filtre réunit un ou plusieurs préfixes d'action. */
const CATEGORIES = [
  { value: 'auth', label: 'Connexions' },
  { value: 'user,organization', label: 'Comptes' },
  { value: 'classroom,subject', label: 'Classes et matières' },
  { value: 'evaluation,template,bank', label: 'Évaluations' },
  { value: 'session,submission,integrity', label: 'Sessions' },
  { value: 'correction,score,appreciation,results', label: 'Correction' },
];

const META_LABELS = {
  email: 'e-mail',
  role: 'rôle',
  name: 'nom',
  previous: 'ancien nom',
  fields: 'champs',
};

/** Détails utiles d'une entrée, en clair : les identifiants bruts restent au serveur. */
function describe(meta) {
  return Object.entries(meta ?? {})
    .filter(([key, value]) => META_LABELS[key] && value !== null && value !== '')
    .map(([key, value]) => `${META_LABELS[key]} : ${Array.isArray(value) ? value.join(', ') : value}`)
    .join(' · ');
}

/** Le journal des opérations sensibles de l'établissement, du plus récent au plus ancien. */
export default function AuditPage() {
  const [category, setCategory] = useState(null);
  const [page, setPage] = useState(1);
  const audit = useAudit({ action: category, page });
  const items = audit.data?.items ?? [];

  return (
    <>
      <PageHeader breadcrumb="Supervision" title="Journal d'activité" />
      <Chips
        label="Type"
        allLabel="Tout"
        value={category}
        onChange={(value) => {
          setCategory(value);
          setPage(1);
        }}
        options={CATEGORIES}
      />
      <div className="content">
        {audit.error && <Alert>{audit.error.message}</Alert>}
        {audit.isPending ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState title="Aucune opération">Rien n'a encore été journalisé pour ce type.</EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Opération</th>
                    <th>Auteur</th>
                    <th>Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => (
                    <tr key={entry.id}>
                      <td className="sub" style={{ whiteSpace: 'nowrap' }}>
                        <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
                      </td>
                      <td>
                        <span className="cell-title">{AUDIT_LABELS[entry.action] ?? entry.action}</span>
                        <span className="sub mono">{entry.action}</span>
                      </td>
                      <td>{entry.actor_name ?? <span className="cell-muted">Système</span>}</td>
                      <td className="sub">{describe(entry.meta) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={audit.data.page_size}
              total={audit.data.total}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}
