import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction, useEvaluationTemplates, useSubjects } from '../../api/hooks';
import {
  Alert,
  Button,
  Chips,
  EmptyState,
  Loading,
  PageHeader,
  Pagination,
  Tag,
} from '../../components/ui';
import { EVAL_KIND_LABELS } from '../../format';

/**
 * La banque d'évaluations : des épreuves entières — énoncés, jeux de tests,
 * barèmes — rangées pour resservir. On n'y travaille jamais directement sur un
 * modèle : « Utiliser » en tire une copie, qui part en brouillon et vit ensuite
 * sa propre vie, sans que le modèle en soit affecté.
 */
export default function BankEvaluationsPage() {
  const navigate = useNavigate();
  const [subjectId, setSubjectId] = useState(null);
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const subjects = useSubjects();
  const { data, isPending, error } = useEvaluationTemplates({ subjectId, page });

  const useTemplate = useAction(
    (id) => api(`/api/evaluations/templates/${id}/use`, { method: 'POST', body: {} }),
    [['evaluations']],
  );
  const removeTemplate = useAction(
    (id) => api(`/api/evaluations/${id}`, { method: 'DELETE' }),
    [['evaluation-templates']],
  );

  return (
    <>
      <PageHeader breadcrumb="Espace enseignant" title="Banque d'évaluations">
        <Button variant="secondary" onClick={() => navigate('/evaluations')}>
          Mes évaluations
        </Button>
      </PageHeader>

      <Chips
        label="Matière :"
        value={subjectId}
        onChange={(value) => {
          setSubjectId(value);
          setPage(1);
        }}
        options={(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
      />

      {isPending && <Loading />}
      {error && (
        <div className="content">
          <Alert>{error.message}</Alert>
        </div>
      )}
      {useTemplate.error && (
        <div className="content">
          <Alert>{useTemplate.error.message}</Alert>
        </div>
      )}

      {data && data.items.length === 0 && (
        <EmptyState title="Aucune épreuve en banque">
          Depuis « Mes évaluations », le bouton « Mettre en banque » range une épreuve ici pour
          la redonner plus tard, à une autre classe ou l'an prochain.
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="exam-stack">
            {data.items.map((template) => (
              <article className="exam-sheet is-single" key={template.id}>
                <div className="exam-sheet-top">
                  <div>
                    <div className="exam-sheet-kind">{EVAL_KIND_LABELS[template.kind]}</div>
                    <h3 className="exam-sheet-title">{template.title}</h3>
                  </div>
                  <Tag tone="neutral">Modèle</Tag>
                </div>

                <div className="exam-sheet-lines">
                  <div>{template.subject_name || 'Matière non précisée'}</div>
                  <div>
                    Exercices : <b>{template.exercises_count}</b> · Barème :{' '}
                    <b>{template.total_points} pts</b>
                  </div>
                  <div>
                    Durée : <b>{template.duration_minutes} min</b>
                  </div>
                </div>

                <div className="exam-sheet-foot">
                  <Button
                    size="small"
                    disabled={useTemplate.isPending}
                    onClick={() =>
                      useTemplate
                        .mutateAsync(template.id)
                        .then((created) => navigate(`/evaluations/${created.id}`))
                    }
                  >
                    Utiliser ce modèle
                  </Button>
                  {template.is_owner && (
                    <>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => navigate(`/evaluations/${template.id}`)}
                      >
                        Modifier
                      </Button>
                      {confirmDelete === template.id ? (
                        <>
                          <Button
                            variant="danger"
                            size="small"
                            disabled={removeTemplate.isPending}
                            onClick={() =>
                              removeTemplate
                                .mutateAsync(template.id)
                                .then(() => setConfirmDelete(null))
                            }
                          >
                            Confirmer
                          </Button>
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => setConfirmDelete(null)}
                          >
                            Annuler
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="danger"
                          size="small"
                          onClick={() => setConfirmDelete(template.id)}
                        >
                          Supprimer
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          <Pagination
            page={data.page}
            pageSize={data.page_size}
            total={data.total}
            onChange={setPage}
          />
        </>
      )}
    </>
  );
}
