import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction, useEvaluations, useSubjects } from '../../api/hooks';
import { Alert, Button, Chips, EmptyState, Loading, PageHeader, Pagination, Tabs, Tag } from '../../components/ui';
import {
  CANCELLABLE_STATUSES,
  EVAL_KIND_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  formatSchedule,
  primaryAction,
} from '../../format';

const TABS = [
  { value: 'running', label: 'En cours' },
  { value: 'scheduled', label: 'Programmées' },
  { value: 'corrected', label: 'Corrigées' },
];

const EMPTY_BY_TAB = {
  running: {
    title: 'Aucune épreuve en cours',
    text: 'Les épreuves ouvertes à vos classes apparaissent ici pendant leur déroulement.',
  },
  scheduled: {
    title: 'Aucune épreuve programmée',
    text: 'Créez une évaluation et fixez sa date pour préparer votre prochaine épreuve pratique.',
  },
  corrected: {
    title: 'Aucune épreuve terminée',
    text: 'Les épreuves clôturées apparaissent ici, prêtes à être corrigées puis publiées.',
  },
};

export default function DashboardPage() {
  const navigate = useNavigate();
  // L'onglet vit dans l'URL : l'accueil peut y mener, et « Retour » y revient.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('onglet');
  const group = TABS.some((t) => t.value === requested) ? requested : 'running';
  const [subjectId, setSubjectId] = useState(null);
  const [page, setPage] = useState(1);
  // L'épreuve dont on confirme la suppression ou l'annulation : { id, action }.
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [bankedId, setBankedId] = useState(null);
  const subjects = useSubjects();
  const { data, isPending, error } = useEvaluations({ group, subjectId, page });
  const deleteEval = useAction(
    (id) => api(`/api/evaluations/${id}`, { method: 'DELETE' }),
    [['evaluations']],
  );
  /* Annuler une épreuve déjà passée : elle reste ici, étiquetée « Annulée »,
     mais sort des notes et des moyennes des étudiants, qui sont prévenus. */
  const cancelEval = useAction(
    (id) => api(`/api/evaluations/${id}/cancel`, { method: 'POST' }),
    [['evaluations'], ['evaluation'], ['stats-teacher']],
  );
  /* Ranger l'épreuve en banque : on en garde une copie figée, réutilisable
     telle quelle plus tard. L'épreuve d'origine n'est pas touchée. */
  const bankEval = useAction(
    (id) => api(`/api/evaluations/${id}/save-as-template`, { method: 'POST' }),
    [['evaluation-templates']],
  );

  const changeTab = (value) => {
    setSearchParams({ onglet: value }, { replace: true });
    setPage(1);
    setConfirmDelete(null);
  };

  const empty = EMPTY_BY_TAB[group];
  const subjectOptions = (subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }));

  return (
    <>
      <PageHeader breadcrumb="Espace enseignant" title="Évaluations">
        <Button onClick={() => navigate('/evaluations/nouvelle')}>+ Nouvelle évaluation</Button>
      </PageHeader>

      {/* Un seul choix possible n'est pas un filtre. */}
      {subjectOptions.length > 1 && (
        <Chips
          label="Matière :"
          allLabel="Toutes"
          value={subjectId}
          onChange={(value) => {
            setSubjectId(value);
            setPage(1);
          }}
          options={subjectOptions}
        />
      )}

      <Tabs tabs={TABS} value={group} onChange={changeTab} />

      {isPending && <Loading />}
      {error && (
        <div className="content">
          <Alert>{error.message}</Alert>
        </div>
      )}
      {(deleteEval.error || cancelEval.error || bankEval.error) && (
        <div className="content">
          <Alert>{(deleteEval.error ?? cancelEval.error ?? bankEval.error).message}</Alert>
        </div>
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          variant={subjectId ? 'search' : 'empty'}
          title={subjectId ? 'Aucune évaluation pour cette matière' : empty.title}
          action={
            subjectId ? (
              <Button variant="secondary" onClick={() => setSubjectId(null)}>
                Afficher toutes les matières
              </Button>
            ) : (
              <Button onClick={() => navigate('/evaluations/nouvelle')}>
                + Nouvelle évaluation
              </Button>
            )
          }
        >
          {subjectId ? 'Retirez le filtre pour voir toutes vos épreuves.' : empty.text}
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="content">
            <div className="exam-stack">
              {data.items.map((evaluation) => (
                <ExamSheet
                  key={evaluation.id}
                  evaluation={evaluation}
                  navigate={navigate}
                  confirmDelete={confirmDelete}
                  setConfirmDelete={setConfirmDelete}
                  deleteEval={deleteEval}
                  cancelEval={cancelEval}
                  bankEval={bankEval}
                  banked={bankedId === evaluation.id}
                  onBanked={() => setBankedId(evaluation.id)}
                />
              ))}
            </div>
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
function ExamSheet({
  evaluation,
  navigate,
  confirmDelete,
  setConfirmDelete,
  deleteEval,
  cancelEval,
  bankEval,
  banked,
  onBanked,
}) {
  const participants = evaluation.participants_count;
  // Le devoir laissé en brouillon avec une date : le prof croit l'avoir
  // programmé, mais rien ne partira vers la classe. On le dit sur la feuille.
  const unpublished = evaluation.status === 'draft' && Boolean(evaluation.scheduled_start);
  const main = primaryAction(evaluation);
  const deletable = ['draft', 'scheduled'].includes(evaluation.status);
  const cancellable = CANCELLABLE_STATUSES.includes(evaluation.status);
  const confirming = confirmDelete?.id === evaluation.id ? confirmDelete.action : null;

  return (
    <article className={`exam-sheet${participants > 1 ? '' : ' is-single'}`}>
      <div className="exam-sheet-top">
        <div>
          <div className="exam-sheet-kind">{EVAL_KIND_LABELS[evaluation.kind]}</div>
          <h3 className="exam-sheet-title">
            <Link to={main.to}>{evaluation.title}</Link>
          </h3>
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
        {confirming === 'cancel' ? (
          <>
            <span className="sub" role="alert">
              Annuler cette épreuve ? Elle restera ici, mais ne comptera plus dans les notes des
              étudiants, qui seront prévenus.
            </span>
            <div className="exam-sheet-foot-end">
              <Button variant="secondary" size="small" onClick={() => setConfirmDelete(null)} autoFocus>
                Garder l'épreuve
              </Button>
              <Button
                variant="danger"
                size="small"
                disabled={cancelEval.isPending}
                onClick={() => {
                  cancelEval.mutateAsync(evaluation.id).then(() => setConfirmDelete(null));
                }}
              >
                {cancelEval.isPending ? 'Annulation…' : "Annuler l'épreuve"}
              </Button>
            </div>
          </>
        ) : confirming === 'delete' ? (
          <>
            <span className="sub" role="alert">Supprimer définitivement cette épreuve ?</span>
            <div className="exam-sheet-foot-end">
              <Button variant="secondary" size="small" onClick={() => setConfirmDelete(null)} autoFocus>
                Annuler
              </Button>
              <Button
                variant="danger"
                size="small"
                disabled={deleteEval.isPending}
                onClick={() => {
                  deleteEval.mutateAsync(evaluation.id).then(() => setConfirmDelete(null));
                }}
              >
                {deleteEval.isPending ? 'Suppression…' : 'Supprimer'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button size="small" onClick={() => navigate(main.to)}>
              {main.label}
            </Button>
            {banked ? (
              <span className="exam-sheet-notice" role="status">
                ✓ Copiée en banque · <Link to="/banque/evaluations">Voir</Link>
              </span>
            ) : (
              <Button
                variant="secondary"
                size="small"
                disabled={bankEval.isPending}
                onClick={() => bankEval.mutateAsync(evaluation.id).then(onBanked)}
              >
                Mettre en banque
              </Button>
            )}
            {deletable && (
              <div className="exam-sheet-foot-end">
                <Button
                  variant="danger-ghost"
                  size="small"
                  onClick={() => setConfirmDelete({ id: evaluation.id, action: 'delete' })}
                >
                  Supprimer
                </Button>
              </div>
            )}
            {cancellable && (
              <div className="exam-sheet-foot-end">
                <Button
                  variant="danger-ghost"
                  size="small"
                  onClick={() => setConfirmDelete({ id: evaluation.id, action: 'cancel' })}
                >
                  Annuler l'épreuve
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}
