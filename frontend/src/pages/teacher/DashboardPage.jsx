import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction, useEvaluations, useSubjects } from '../../api/hooks';
import { Alert, Button, Chips, EmptyState, Loading, PageHeader, Pagination, Tabs, Tag } from '../../components/ui';
import { EVAL_KIND_LABELS, STATUS_LABELS, STATUS_TONES, formatSchedule } from '../../format';

const TABS = [
  { value: 'running', label: 'En cours' },
  { value: 'scheduled', label: 'Programmées' },
  { value: 'corrected', label: 'Corrigées' },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [group, setGroup] = useState('running');
  const [subjectId, setSubjectId] = useState(null);
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const subjects = useSubjects();
  const { data, isPending, error } = useEvaluations({ group, subjectId, page });
  const deleteEval = useAction(
    (id) => api(`/api/evaluations/${id}`, { method: 'DELETE' }),
    [['evaluations']],
  );
  /* Ranger l'épreuve en banque : on en garde une copie figée, réutilisable
     telle quelle plus tard. L'épreuve d'origine n'est pas touchée. */
  const bankEval = useAction(
    (id) => api(`/api/evaluations/${id}/save-as-template`, { method: 'POST' }),
    [['evaluation-templates']],
  );

  const changeTab = (value) => {
    setGroup(value);
    setPage(1);
  };

  return (
    <>
      <PageHeader breadcrumb="Espace enseignant" title="Évaluations">
        <Button onClick={() => navigate('/evaluations/nouvelle')}>+ Nouvelle évaluation</Button>
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

      <Tabs tabs={TABS} value={group} onChange={changeTab} />

      {isPending && <Loading />}
      {error && (
        <div className="content">
          <Alert>{error.message}</Alert>
        </div>
      )}

      {data && data.items.length === 0 && (
        <EmptyState title="Aucune évaluation dans cette catégorie">
          Créez une évaluation pour préparer votre prochaine épreuve pratique.
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="exam-stack">
            {data.items.map((evaluation) => (
              <ExamSheet
                key={evaluation.id}
                evaluation={evaluation}
                navigate={navigate}
                confirmDelete={confirmDelete}
                setConfirmDelete={setConfirmDelete}
                deleteEval={deleteEval}
                bankEval={bankEval}
              />
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

/** Une épreuve = une feuille de sujet posée sur le bureau de l'enseignant. */
function ExamSheet({ evaluation, navigate, confirmDelete, setConfirmDelete, deleteEval, bankEval }) {
  const participants = evaluation.participants_count;
  // Le devoir laissé en brouillon avec une date : le prof croit l'avoir
  // programmé, mais rien ne partira vers la classe. On le dit sur la feuille.
  const unpublished = evaluation.status === 'draft' && Boolean(evaluation.scheduled_start);

  return (
    <article className={`exam-sheet${participants > 1 ? '' : ' is-single'}`}>
      <div className="exam-sheet-top">
        <div>
          <div className="exam-sheet-kind">{EVAL_KIND_LABELS[evaluation.kind]}</div>
          <h3 className="exam-sheet-title">{evaluation.title}</h3>
        </div>
        <Tag tone={STATUS_TONES[evaluation.status]}>{STATUS_LABELS[evaluation.status]}</Tag>
      </div>

      <div className="exam-sheet-lines">
        <div>
          {[evaluation.classroom_name, evaluation.subject_name].filter(Boolean).join(' · ') ||
            'Classe non affectée'}
        </div>
        <div>
          Programmation : <b>{formatSchedule(evaluation)}</b>
        </div>
        <div>
          Étudiants : <b>{participants}</b>
          {evaluation.success_rate !== null && <> · Réussite : <b>{evaluation.success_rate}%</b></>}
        </div>
      </div>

      {unpublished && (
        <p className="exam-sheet-warn">
          Épreuve non publiée : la date est enregistrée mais les étudiants ne la voient pas
          encore. Ouvrez-la et terminez l'assistant pour la programmer.
        </p>
      )}

      <div className="exam-sheet-foot">
        <Button
          variant="secondary"
          size="small"
          disabled={bankEval.isPending}
          onClick={() => bankEval.mutateAsync(evaluation.id).then(() => navigate('/banque/evaluations'))}
        >
          Mettre en banque
        </Button>
        {evaluation.status === 'running' && (
          <Button
            variant="secondary"
            size="small"
            onClick={() => navigate(`/evaluations/${evaluation.id}/session`)}
          >
            Suivi
          </Button>
        )}
        {['closed', 'correcting', 'corrected', 'validated'].includes(evaluation.status) && (
          <Button
            variant="secondary"
            size="small"
            onClick={() => navigate(`/evaluations/${evaluation.id}/resultats`)}
          >
            Résultats
          </Button>
        )}
        {['draft', 'scheduled'].includes(evaluation.status) && (
          <>
            <Button
              variant="secondary"
              size="small"
              onClick={() => navigate(`/evaluations/${evaluation.id}`)}
            >
              Modifier
            </Button>
            {confirmDelete === evaluation.id ? (
              <>
                <Button
                  variant="danger"
                  size="small"
                  disabled={deleteEval.isPending}
                  onClick={() => {
                    deleteEval.mutateAsync(evaluation.id).then(() => setConfirmDelete(null));
                  }}
                >
                  Confirmer
                </Button>
                <Button variant="secondary" size="small" onClick={() => setConfirmDelete(null)}>
                  Annuler
                </Button>
              </>
            ) : (
              <Button variant="danger" size="small" onClick={() => setConfirmDelete(evaluation.id)}>
                Supprimer
              </Button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
