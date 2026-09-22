import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import { useAdminLanguages, useAdminSubjects } from '../../api/admin';
import { Alert, EmptyState, Loading, Paged, PageHeader, Tag } from '../../components/ui';

const INVALIDATE = [['admin'], ['disciplines'], ['languages']];

/**
 * Ce que la plateforme enseigne. L'administration ouvre ou ferme les langages ;
 * les enseignants créent leurs matières parmi ceux qui sont ouverts. Fermer un
 * langage ne touche à aucune épreuve existante : il empêche d'en créer de nouvelles.
 */
export default function LanguagesPage() {
  const languages = useAdminLanguages();
  const subjects = useAdminSubjects();
  const [error, setError] = useState(null);
  const toggle = useAction(
    ({ key, enabled }) => api(`/api/admin/languages/${key}`, { method: 'PUT', body: { enabled } }),
    INVALIDATE,
  );

  async function onToggle(key, enabled) {
    setError(null);
    try {
      await toggle.mutateAsync({ key, enabled });
    } catch (err) {
      setError(err.message);
    }
  }

  const labels = Object.fromEntries((languages.data ?? []).map((l) => [l.key, l.label]));
  const enabled = new Set((languages.data ?? []).filter((l) => l.enabled).map((l) => l.key));
  const list = subjects.data ?? [];

  return (
    <>
      <PageHeader breadcrumb="Administration" title="Langages et matières" />
      <div className="content">
        {(languages.error || subjects.error || error) && (
          <Alert>{languages.error?.message ?? subjects.error?.message ?? error}</Alert>
        )}

        <section className="card" style={{ maxWidth: 640, marginBottom: 24 }}>
          <h2 className="form-section-title">Langages proposés aux enseignants</h2>
          <p className="sub" style={{ margin: '0 0 4px' }}>
            Un enseignant choisit le langage de chacune de ses matières parmi ceux qui sont
            cochés ici.
          </p>
          {languages.isPending ? (
            <Loading />
          ) : (
            (languages.data ?? []).map((l) => (
              <label className="switch" key={l.key}>
                <input
                  type="checkbox"
                  checked={l.enabled}
                  disabled={toggle.isPending}
                  onChange={(e) => onToggle(l.key, e.target.checked)}
                />
                <span>
                  <strong>{l.label}</strong>
                  <span className="sub">
                    {l.kind === 'algo'
                      ? 'Copies composées en blocs de pseudo-code, sans compilateur.'
                      : 'Programmes compilés et exécutés sur les jeux de tests.'}
                  </span>
                </span>
              </label>
            ))
          )}
        </section>

        <h2 className="form-section-title">Matières créées par les enseignants</h2>
        {subjects.isPending ? (
          <Loading />
        ) : list.length === 0 ? (
          <EmptyState title="Aucune matière">
            Les enseignants créent leurs matières depuis leur espace, en choisissant un des
            langages ouverts ci-dessus.
          </EmptyState>
        ) : (
          <Paged items={list}>
            {(page) => (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Matière</th>
                      <th>Langage</th>
                      <th>Créée par</th>
                      <th className="num">Évaluations</th>
                      <th className="num">Exercices en banque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.map((s) => (
                      <tr key={s.id}>
                        <td className="cell-title">{s.name}</td>
                        <td>
                          {labels[s.language] ?? s.language}
                          {!enabled.has(s.language) && languages.data && (
                            <>
                              {' '}
                              <Tag tone="warning">fermé</Tag>
                            </>
                          )}
                        </td>
                        {/* Sans auteur : créée par l'administration, avant que les matières
                            ne reviennent aux enseignants. */}
                        <td>{s.author_name ?? <span className="sub">Administration</span>}</td>
                        <td className="num">{s.evaluations_count}</td>
                        <td className="num">{s.bank_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Paged>
        )}
      </div>
    </>
  );
}
