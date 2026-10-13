import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import {
  useAction,
  useCommunity,
  useCommunityItem,
  useDrafts,
  useEvaluation,
  useLanguages,
  useLibrary,
  useSubjects,
} from '../../api/hooks';
import { useAuth } from '../../auth';
import { defaultStarter, isUntouchedStarter } from '../../starterCode';
import { KIND_LABELS, exerciseType, needsTests, typeFamilies, usesLanguage } from '../../exerciseTypes';
import { autoDistribute, isSimpleScoring } from '../../bareme';
import { EVAL_KIND_LABELS, formatRating } from '../../format';
import { exerciseIssues } from '../../sheetEditor';
import { ExerciseOnSheet } from '../../components/SheetEditor';
import { ExerciseSettings } from '../../components/SheetPanel';
import { SheetExercise } from '../../components/SubjectSheet';
import { Star, StarInput, StarsSummary } from '../../components/Stars';
import PublishDialog from '../../components/PublishDialog';
import { IconCheck, IconUsers } from '../../components/icons';
import { Alert, Button, Dialog, EmptyState, Loading, PageHeader, Segmented, Tabs } from '../../components/ui';
import '../../styles/feuille.css';
import '../../styles/banque.css';

/**
 * La banque : ce qu'on reprend pour composer une évaluation.
 *
 * Deux onglets, une seule manière de faire. « Ma banque » réunit ses exercices
 * et ses sujets (les épreuves mises de côté) ; « Communauté », ce que les
 * enseignants ont partagé, de l'établissement ou d'ailleurs. La liste est à
 * gauche, l'aperçu toujours ouvert à droite : on parcourt d'un clic, et tout ce
 * qu'on peut faire d'un élément se trouve dans son aperçu. Le partage se règle
 * là aussi, en trois positions : personne, l'établissement, tous les enseignants.
 *
 * Un exercice de la banque s'écrit comme dans l'éditeur d'évaluation, sur la
 * feuille et d'un seul écran (voir `BankEditor`). Il n'a pas de points : ils se
 * décident dans l'évaluation qui l'importe, où ils se répartissent avec ceux
 * des autres.
 *
 * Les filtres et l'élément ouvert vivent dans l'adresse : revenir de l'éditeur
 * retrouve la liste telle qu'on l'avait laissée.
 */

const SHARES = [
  { value: 'none', label: 'Personne' },
  { value: 'organization', label: 'Établissement' },
  { value: 'all', label: 'Tous les enseignants' },
];

const SHARED = {
  none: (title) => `« ${title} » n’est plus partagé.`,
  organization: (title) => `« ${title} » est visible par vos collègues de l’établissement.`,
  all: (title) => `« ${title} » est partagé avec tous les enseignants.`,
};

function plural(n, word) {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

function points(total) {
  return `${String(total).replace('.', ',')} pt${total > 1 ? 's' : ''}`;
}

/** Une ligne de « Ma banque » : un exercice, ou un sujet (modèle d'épreuve). */
function libraryRow(item) {
  if (item.source === 'subject') {
    const label = EVAL_KIND_LABELS[item.evaluation_kind] ?? 'Sujet';
    return {
      key: `s${item.id}`,
      source: 'template',
      id: item.id,
      title: item.title,
      subject: true,
      tag: label,
      meta: [`${label} · ${plural(item.exercises_count, 'exercice')}`, item.subject_name]
        .filter(Boolean)
        .join(' · '),
      share: item.share,
      item,
    };
  }
  const kind = item.kind ?? 'code';
  return {
    key: `e${item.id}`,
    source: 'bank_exercise',
    id: item.id,
    title: item.title,
    kind,
    subject: false,
    tag: exerciseType(kind).badge,
    meta: [
      exerciseType(kind).badge,
      usesLanguage(kind) ? item.language?.toUpperCase() : null,
      item.subject_name,
      item.uses > 0 ? `utilisé ${item.uses} fois` : 'jamais utilisé',
    ]
      .filter(Boolean)
      .join(' · '),
    share: item.share,
    item,
  };
}

/** Une ligne de la communauté. */
function communityRow(item) {
  const subject = item.item_type === 'subject';
  const kind = subject ? null : (item.exercise_kind ?? 'code');
  return {
    key: `c${item.id}`,
    source: 'community',
    id: item.id,
    title: item.title,
    kind,
    subject,
    tag: subject ? 'Sujet' : exerciseType(kind).badge,
    meta: [
      subject ? `Sujet · ${plural(item.exercises_count, 'exercice')}` : exerciseType(kind).badge,
      item.is_mine ? 'Vous' : (item.author_name ?? 'Auteur inconnu'),
      item.uses > 0 ? `repris ${item.uses} fois` : 'pas encore repris',
    ].join(' · '),
    rating: item.rating_count ? item.rating_avg : null,
    ratingCount: item.rating_count,
    item,
  };
}

export default function BankPage() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isAdmin = user.role === 'admin';
  // /communaute reste l'adresse de l'administration ; un enseignant y trouve
  // l'onglet Communauté de sa banque.
  if (!isAdmin && pathname === '/communaute') {
    return <Navigate to="/banque?onglet=communaute" replace />;
  }
  return <Bank isAdmin={isAdmin} />;
}

function Bank({ isAdmin }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = isAdmin || params.get('onglet') === 'communaute' ? 'communaute' : 'banque';
  const q = params.get('q') ?? '';
  const type = params.get('type') ?? '';

  const [search, setSearch] = useState(q);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const listRef = useRef(null);

  /** Change un paramètre de l'adresse sans empiler d'entrée d'historique. */
  function setParam(changes) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [name, value] of Object.entries(changes)) {
          if (value) next.set(name, value);
          else next.delete(name);
        }
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    const id = setTimeout(() => {
      if (search.trim() !== q) setParam({ q: search.trim(), ouvert: null });
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Retour arrière ou changement d'onglet : le champ suit l'adresse.
  const [syncedQ, setSyncedQ] = useState(q);
  if (syncedQ !== q) {
    setSyncedQ(q);
    setSearch(q);
  }

  const communityFilters = {
    itemType: type === 'subject' ? 'subject' : undefined,
    kind: type && type !== 'subject' ? type : undefined,
  };
  // Les totaux des onglets ; sans filtre, ce sont les listes elles-mêmes.
  const libraryAll = useLibrary({ enabled: !isAdmin });
  const communityAll = useCommunity();
  const libraryList = useLibrary({ q, kind: type, enabled: !isAdmin && tab === 'banque' });
  const communityList = useCommunity({ q, ...communityFilters, enabled: tab === 'communaute' });
  const listing = tab === 'banque' ? libraryList : communityList;

  const rows = useMemo(
    () =>
      (listing.data?.pages.flatMap((page) => page.items) ?? []).map(
        tab === 'banque' ? libraryRow : communityRow,
      ),
    [listing.data, tab],
  );
  const total = listing.data?.pages[0]?.total ?? 0;
  const selected = rows.find((row) => row.key === params.get('ouvert')) ?? rows[0] ?? null;

  const remove = useAction(
    (row) =>
      api(row.source === 'template' ? `/api/evaluations/${row.id}` : `/api/bank/exercises/${row.id}`, {
        method: 'DELETE',
      }),
    [['library'], ['bank'], ['community']],
  );
  const share = useAction(
    ({ row, visibility }) =>
      api('/api/community/share', {
        method: 'PUT',
        body: { source_type: row.source, source_id: row.id, visibility },
      }),
    [['library'], ['community']],
  );
  const toBank = useAction(
    (id) => api(`/api/community/${id}/to-bank`, { method: 'POST' }),
    [['library'], ['bank'], ['community']],
  );
  const unpublish = useAction(
    (id) => api(`/api/community/${id}`, { method: 'DELETE' }),
    [['community'], ['library']],
  );
  const fromTemplate = useAction(
    (id) => api(`/api/evaluations/templates/${id}/use`, { method: 'POST', body: {} }),
    [['evaluations']],
  );
  const fromCommunity = useAction(
    (id) => api(`/api/community/${id}/use`, { method: 'POST', body: {} }),
    [['evaluations'], ['community']],
  );
  const busy = [remove, share, toBank, unpublish, fromTemplate, fromCommunity].some((m) => m.isPending);

  function run(promise, done) {
    setError('');
    setNotice(null);
    return promise.then(done).catch((err) => setError(err.message));
  }

  function changeTab(value) {
    setSearch('');
    setNotice(null);
    setError('');
    setParams(value === 'communaute' ? { onglet: 'communaute' } : {}, { replace: true });
  }

  function choose(row) {
    setParam({ ouvert: row.key });
  }

  /** ↑ et ↓ parcourent la liste : l'aperçu suit. */
  function onListKey(event) {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || rows.length === 0) return;
    event.preventDefault();
    const index = rows.findIndex((row) => row.key === selected?.key);
    const next = rows[Math.min(rows.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    choose(next);
    listRef.current?.querySelector(`[data-key="${next.key}"]`)?.focus();
  }

  /**
   * Ajouter un exercice à une évaluation : on l'y retrouve sur la feuille, ses
   * points déjà pris sur le total. Il reste à enregistrer.
   */
  function addToEvaluation(evaluationId, exercise, origin) {
    navigate(evaluationId ? `/evaluations/${evaluationId}` : '/evaluations/nouvelle', {
      state: { importer: { exercise, origin } },
    });
  }

  function startFromSubject(row) {
    const created =
      row.source === 'template'
        ? fromTemplate.mutateAsync(row.id).then((evaluation) => evaluation.id)
        : fromCommunity.mutateAsync(row.id).then((result) => result.evaluation_id);
    run(created, (id) => navigate(`/evaluations/${id}`));
  }

  function editRow(row) {
    if (row.source === 'template') {
      navigate(`/evaluations/${row.id}`);
      return;
    }
    const exercise = row.item;
    setNotice(null);
    setError('');
    setEditing({
      ...exercise,
      kind: exercise.kind ?? 'code',
      settings: exercise.settings ?? {},
      subject_id: exercise.subject_id ?? '',
      tags: (exercise.tags ?? []).join(', '),
      tests: exercise.tests ?? [],
    });
    window.scrollTo({ top: 0 });
  }

  function create(kind) {
    setNotice(null);
    setError('');
    setEditing(withKind({ ...EMPTY }, kind));
    window.scrollTo({ top: 0 });
  }

  function changeShare(row, visibility) {
    if (visibility === row.share) return;
    run(share.mutateAsync({ row, visibility }), () => setNotice({ text: SHARED[visibility](row.title) }));
  }

  function copyToBank(row) {
    run(toBank.mutateAsync(row.id), () => {
      setCopied((current) => new Set(current).add(row.id));
      setNotice({
        text: `« ${row.title} » est copié dans votre banque.`,
        to: '/banque',
        toLabel: 'Ouvrir Ma banque',
      });
    });
  }

  function stopSharing(row) {
    run(unpublish.mutateAsync(row.id), () =>
      setNotice({
        text: row.item.is_mine
          ? `« ${row.title} » n’est plus partagé.`
          : `« ${row.title} » est retiré de la communauté.`,
      }),
    );
  }

  function confirmRemove(row) {
    run(remove.mutateAsync(row), () => {
      setConfirmDelete(null);
      setParam({ ouvert: null });
      setNotice({ text: `« ${row.title} » est supprimé de votre banque.` });
    });
  }

  // L'éditeur remplace la page : ouvert depuis le bas de la liste, il se
  // retrouvait sinon hors écran.
  if (editing) {
    return (
      <BankEditor
        key={editing.id ?? 'nouveau'}
        initial={editing}
        onClose={(message) => {
          setEditing(null);
          setNotice(message ? { text: message } : null);
        }}
      />
    );
  }

  const filtered = Boolean(q || type);
  const tabs = [
    { value: 'banque', label: 'Ma banque', count: libraryAll.data?.pages[0]?.total },
    { value: 'communaute', label: 'Communauté', count: communityAll.data?.pages[0]?.total },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={isAdmin ? 'Supervision' : 'Espace enseignant'}
        title={isAdmin ? 'Communauté' : 'Banque'}
        meta={
          isAdmin
            ? 'Ce que les enseignants ont partagé. Un exercice ou un sujet de l’établissement se publie pour toute la plateforme.'
            : undefined
        }
      >
        {tab === 'banque' && <NewExerciseMenu onPick={create} />}
        {isAdmin && <Button onClick={() => setPublishing(true)}>Publier</Button>}
      </PageHeader>

      {!isAdmin && <Tabs tabs={tabs} value={tab} onChange={changeTab} />}

      <div className="content banque">
        <div className="banque-filtres" role="search">
          <input
            className="search-input banque-recherche"
            type="search"
            aria-label={tab === 'banque' ? 'Rechercher dans ma banque' : 'Rechercher dans la communauté'}
            placeholder={
              tab === 'banque'
                ? 'Rechercher dans ma banque…'
                : 'Rechercher un titre, une matière, un mot-clé…'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && search) {
                e.preventDefault();
                setSearch('');
              }
            }}
          />
          <select
            className="select-inline banque-type"
            aria-label="Type"
            value={type}
            onChange={(e) => setParam({ type: e.target.value, ouvert: null })}
          >
            <option value="">Tous les types</option>
            <option value="subject">Sujets complets</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <span className="banque-compte" aria-live="polite">
            {listing.isPending
              ? 'Recherche…'
              : plural(total, tab === 'banque' ? 'élément' : 'publication')}
          </span>
        </div>

        <Alert>{error || listing.error?.message}</Alert>
        {notice && (
          <Alert tone="success">
            {notice.text}
            {notice.to && (
              <>
                {' '}
                <Link to={notice.to}>{notice.toLabel}</Link>
              </>
            )}
          </Alert>
        )}

        {listing.isPending && <Loading />}

        {listing.data && rows.length === 0 && (
          filtered ? (
            <EmptyState
              variant="search"
              title="Rien ne correspond"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setParam({ q: null, type: null, ouvert: null });
                  }}
                >
                  Tout afficher
                </Button>
              }
            >
              Essayez un autre mot, ou un autre type.
            </EmptyState>
          ) : tab === 'banque' ? (
            <div className="banque-vide">
              <EmptyState title="Votre banque est vide">
                Créez un exercice réutilisable, enregistrez-en un depuis le panneau d’une évaluation,
                ou mettez une épreuve entière en banque depuis « Mes évaluations ». La communauté
                en propose aussi, prêts à reprendre.
              </EmptyState>
              <TypeGrid onPick={create} />
            </div>
          ) : (
            <EmptyState title="Rien de partagé pour le moment">
              Partagez un exercice ou un sujet depuis votre banque : vos collègues le trouveront ici.
            </EmptyState>
          )
        )}

        {rows.length > 0 && (
          <div className="banque-double">
            <div
              ref={listRef}
              className={`banque-liste ${listing.isPlaceholderData ? 'est-perime' : ''}`.trim()}
              role="list"
              aria-label={tab === 'banque' ? 'Ma banque' : 'Communauté'}
              onKeyDown={onListKey}
            >
              {rows.map((row) => (
                <div role="listitem" key={row.key}>
                  <button
                    type="button"
                    className="banque-ligne"
                    data-key={row.key}
                    aria-current={row.key === selected?.key ? 'true' : undefined}
                    onClick={() => choose(row)}
                  >
                    <span
                      className={`banque-point ${row.subject ? 'banque-point--sujet' : ''}`.trim()}
                      data-kind={row.kind ?? undefined}
                      aria-hidden="true"
                    />
                    <span className="banque-ligne-texte">
                      <span className="banque-ligne-titre">{row.title}</span>
                      <span className="banque-ligne-meta">{row.meta}</span>
                    </span>
                    {row.rating !== null && row.rating !== undefined && (
                      <span
                        className="banque-ligne-note"
                        title={`Noté ${formatRating(row.rating)} sur 5 par ${plural(row.ratingCount, 'collègue')}`}
                      >
                        <Star fill={1} size={13} />
                        {formatRating(row.rating)}
                      </span>
                    )}
                    {tab === 'communaute' && copied.has(row.id) && (
                      <span className="banque-ligne-etat banque-ligne-etat--ok" title="Dans ma banque">
                        <IconCheck />
                        <span className="visually-hidden">Dans ma banque</span>
                      </span>
                    )}
                    {tab === 'banque' && row.share && row.share !== 'none' && (
                      <span
                        className="banque-ligne-etat"
                        title={row.share === 'all' ? 'Partagé avec tous les enseignants' : 'Partagé avec l’établissement'}
                      >
                        <IconUsers />
                        <span className="visually-hidden">Partagé</span>
                      </span>
                    )}
                  </button>
                </div>
              ))}
              <LoadMore
                hasMore={Boolean(listing.hasNextPage)}
                loading={listing.isFetchingNextPage}
                onLoad={() => listing.fetchNextPage()}
              />
            </div>

            {selected && (
              <Preview
                key={selected.key}
                row={selected}
                isAdmin={isAdmin}
                busy={busy}
                copied={copied.has(selected.id)}
                onAdd={addToEvaluation}
                onUseSubject={() => startFromSubject(selected)}
                onEdit={() => editRow(selected)}
                onDelete={() => setConfirmDelete(selected)}
                onShare={(visibility) => changeShare(selected, visibility)}
                onCopy={() => copyToBank(selected)}
                onUnpublish={() => stopSharing(selected)}
              />
            )}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Supprimer de votre banque ?"
        description={
          confirmDelete
            ? `« ${confirmDelete.title} » disparaît de votre banque${
                confirmDelete.share !== 'none' ? ' et n’est plus partagé' : ''
              }. Les évaluations qui l’ont repris, et les copies de vos collègues, restent intactes.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Annuler
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => confirmRemove(confirmDelete)}>
              {remove.isPending ? 'Suppression…' : 'Supprimer'}
            </Button>
          </>
        }
      />

      {/* Monté à l'ouverture seulement : chaque publication repart d'un formulaire vide. */}
      {publishing && (
        <PublishDialog
          open
          onClose={() => setPublishing(false)}
          onPublished={(item) => {
            setPublishing(false);
            setError('');
            setNotice({ text: `« ${item.title} » est publié dans la communauté.` });
          }}
        />
      )}
    </>
  );
}

/**
 * L'aperçu de l'élément choisi : ce que l'étudiant lira, avec le corrigé à
 * l'encre rouge, et tout ce qu'on peut en faire.
 */
function Preview({
  row,
  isAdmin,
  busy,
  copied,
  onAdd,
  onUseSubject,
  onEdit,
  onDelete,
  onShare,
  onCopy,
  onUnpublish,
}) {
  const fromCommunity = row.source === 'community';
  const template = useEvaluation(row.source === 'template' ? row.id : null);
  const detail = useCommunityItem(fromCommunity ? row.id : null);
  const rate = useAction(
    (stars) =>
      stars
        ? api(`/api/community/${row.id}/rating`, { method: 'PUT', body: { stars } })
        : api(`/api/community/${row.id}/rating`, { method: 'DELETE' }),
    [['community'], ['community-item', row.id]],
  );

  let exercises = null;
  if (row.source === 'bank_exercise') exercises = [row.item];
  else if (row.source === 'template') exercises = template.data?.exercises ?? null;
  else if (detail.data) {
    exercises =
      detail.data.item_type === 'subject'
        ? (detail.data.content?.exercises ?? [])
        : [detail.data.content?.exercise].filter(Boolean);
  }
  const loading = exercises === null && (template.isPending || detail.isPending);
  const loadError = template.error ?? detail.error;

  const item = fromCommunity ? (detail.data ?? row.item) : row.item;
  const exercise = !row.subject && exercises ? exercises[0] : null;
  const origin =
    row.source === 'bank_exercise' ? { type: 'bank', id: row.id } : { type: 'community', id: row.id };

  const meta = fromCommunity
    ? [
        item.subject_name,
        item.is_mine
          ? `Partagé par vous, ${item.visibility === 'organization' ? 'pour l’établissement' : 'pour tous les enseignants'}`
          : [item.author_name ?? 'Auteur inconnu', item.organization_name].filter(Boolean).join(', '),
        item.uses > 0 ? `repris ${item.uses} fois` : 'pas encore repris',
      ]
    : row.subject
      ? [
          item.subject_name,
          plural(item.exercises_count, 'exercice'),
          points(item.total_points),
          `${item.duration_minutes} min`,
        ]
      : [item.subject_name, item.uses > 0 ? `utilisé ${item.uses} fois` : 'jamais utilisé'];

  return (
    <section className="banque-apercu" aria-label={`Aperçu de « ${row.title} »`}>
      <header className="banque-apercu-tete">
        <div className="banque-apercu-etiquettes">
          {row.subject ? (
            <span className="banque-tag-sujet">{row.tag}</span>
          ) : (
            <span className="panneau-tag" data-kind={row.kind}>
              {row.tag}
            </span>
          )}
          {fromCommunity && <StarsSummary avg={item.rating_avg} count={item.rating_count} />}
          {copied && (
            <span className="banque-dans">
              <IconCheck />
              Dans ma banque
            </span>
          )}
        </div>
        <h2 className="banque-apercu-titre">{row.title}</h2>
        <p className="banque-apercu-meta">{meta.filter(Boolean).join(' · ')}</p>

        <div className="banque-apercu-actions">
          {!isAdmin &&
            (row.subject ? (
              <Button disabled={busy} onClick={onUseSubject}>
                Créer une évaluation avec ce sujet
              </Button>
            ) : (
              <AddToEvaluation
                disabled={!exercise}
                onPick={(evaluationId) => onAdd(evaluationId, exercise, origin)}
              />
            ))}
          {!fromCommunity && (
            <>
              <Button variant="secondary" onClick={onEdit}>
                Modifier
              </Button>
              <Button variant="danger-ghost" onClick={onDelete}>
                Supprimer
              </Button>
            </>
          )}
          {fromCommunity && !isAdmin && !item.is_mine && (
            <Button variant="secondary" disabled={busy || copied} onClick={onCopy}>
              {copied ? (
                <>
                  <IconCheck />
                  Dans ma banque
                </>
              ) : (
                'Copier dans ma banque'
              )}
            </Button>
          )}
          {fromCommunity && item.can_delete && (
            <Button variant="secondary" disabled={busy} onClick={onUnpublish}>
              {item.is_mine ? 'Ne plus partager' : 'Retirer de la communauté'}
            </Button>
          )}
        </div>

        {/* La communauté ne partage que des sujets complets. */}
        {row.source === 'template' && (
          <div className="banque-partage">
            <span className="banque-partage-titre" id="banque-partage">
              Partagé avec
            </span>
            <div className="segmented" role="group" aria-labelledby="banque-partage">
              {SHARES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="chip"
                  aria-pressed={(row.share ?? 'none') === option.value}
                  disabled={busy}
                  onClick={() => onShare(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="banque-apercu-corps">
        {loading && <Loading variant="inline" />}
        <Alert>{loadError?.message}</Alert>
        {exercises && exercises.length === 0 && (
          <p className="sub">Ce sujet ne contient encore aucun exercice.</p>
        )}
        {exercises && exercises.length > 0 && (
          <article className="feuille-papier sujet banque-feuille" aria-label="Ce que voit l’étudiant">
            {exercises.map((ex, index) => {
              const kind = ex.kind ?? 'code';
              const heading =
                index === 0 || (exercises[index - 1].kind ?? 'code') !== kind
                  ? exerciseType(kind).sheetTitle
                  : null;
              return (
                <div key={ex.id ?? index}>
                  {heading && <h3 className="sujet-bloc-titre">{heading}</h3>}
                  <ExerciseOnSheet
                    exercise={{ ...ex, kind, settings: ex.settings ?? {}, tests: ex.tests ?? [] }}
                    index={row.subject ? index : null}
                    onChange={() => {}}
                    canEditSubject={false}
                    canEditCorrection={false}
                    ui={{}}
                    onUi={() => {}}
                  />
                </div>
              );
            })}
          </article>
        )}

        {fromCommunity && exercises && item.can_rate && (
          <div className="banque-noter">
            <span>{item.my_rating ? 'Votre note' : 'Vous l’avez utilisé ? Notez-le'}</span>
            <StarInput
              value={item.my_rating}
              disabled={rate.isPending}
              onChange={(stars) => rate.mutate(stars)}
            />
            {rate.error && <Alert>{rate.error.message}</Alert>}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * « Ajouter à une évaluation » : un de ses brouillons, ou une évaluation
 * nouvelle. On l'y retrouve sur la feuille, à enregistrer.
 */
function AddToEvaluation({ disabled, onPick }) {
  const [open, setOpen] = useState(false);
  const drafts = useDrafts();
  const close = () => setOpen(false);
  const items = drafts.data?.items ?? [];

  return (
    <div className="banque-menu" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <Button aria-expanded={open} aria-haspopup="menu" disabled={disabled} onClick={() => setOpen((v) => !v)}>
        Ajouter à une évaluation
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </Button>
      {open && (
        <>
          <button
            type="button"
            className="banque-menu-voile"
            aria-label="Fermer le menu"
            tabIndex={-1}
            onClick={close}
          />
          <div className="banque-ajout" role="menu" aria-label="Ajouter à une évaluation">
            <span className="banque-ajout-titre">Mes brouillons</span>
            {drafts.isPending && <Loading variant="inline" />}
            {drafts.data && items.length === 0 && (
              <span className="banque-ajout-vide">Aucun brouillon en cours.</span>
            )}
            {items.map((draft, index) => (
              <button
                key={draft.id}
                type="button"
                role="menuitem"
                className="banque-ajout-choix"
                autoFocus={index === 0}
                onClick={() => {
                  close();
                  onPick(draft.id);
                }}
              >
                <strong>{draft.title}</strong>
                <span>
                  {[draft.classroom_name ?? 'Sans classe', plural(draft.exercises_count, 'exercice')].join(
                    ' · ',
                  )}
                </span>
              </button>
            ))}
            <div className="banque-ajout-sep" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="banque-ajout-nouvelle"
              autoFocus={drafts.data && items.length === 0}
              onClick={() => {
                close();
                onPick(null);
              }}
            >
              + Nouvelle évaluation
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Fin de liste : charge la page suivante quand elle entre à l'écran. */
function LoadMore({ hasMore, loading, onLoad }) {
  const ref = useRef(null);
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  });
  useEffect(() => {
    const node = ref.current;
    if (!node || !hasMore || loading) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadRef.current();
      },
      { root: node.parentElement, rootMargin: '200px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  if (!hasMore) return null;
  return (
    <div ref={ref} className="banque-plus">
      {loading ? (
        <Loading variant="inline" />
      ) : (
        <Button variant="ghost" size="small" onClick={onLoad}>
          Afficher plus
        </Button>
      )}
    </div>
  );
}

/**
 * Un exercice neuf. Ses points restent ceux que le serveur donne par défaut :
 * ils ne s'affichent nulle part ici, mais le barème simplifié des tests s'en
 * sert pour se répartir.
 */
const EMPTY = {
  title: '',
  statement: '',
  language: 'c',
  points: 5,
  starter_code: defaultStarter('c', 'code'),
  kind: 'code',
  settings: {},
  subject_id: '',
  tags: '',
  tests: [],
};

/**
 * Le squelette du langage suit le langage choisi, tant que l'enseignant ne l'a pas
 * réécrit : sinon on écraserait son propre code de départ.
 */
function withLanguage(form, language) {
  const starter = isUntouchedStarter(form.starter_code)
    ? defaultStarter(language, form.kind)
    : form.starter_code;
  return { ...form, language, starter_code: starter };
}

/**
 * Changer de type refait l'exercice à neuf : ses paramètres n'ont de sens que
 * pour le type qui les a créés. Un squelette resté intact suit le type (celui
 * du langage pour du code, rien pour un algorithme) ; un code de départ réécrit
 * par l'enseignant reste, tant que le type est pratique.
 */
function withKind(form, kind) {
  const starter = isUntouchedStarter(form.starter_code)
    ? defaultStarter(form.language, kind)
    : needsTests(kind)
      ? form.starter_code
      : '';
  return { ...form, kind, settings: exerciseType(kind).defaults(), starter_code: starter };
}

/**
 * Ce que le serveur reçoit : ni clés d'affichage, ni nombres saisis en texte. Le
 * partage ne passe plus par l'exercice lui-même : il se règle dans l'aperçu.
 */
function payloadOf(form) {
  const withTests = needsTests(form.kind);
  // Le barème simplifié se recalcule à l'enregistrement, comme dans l'éditeur
  // d'évaluation : un test ajouté pèse sa part.
  const noté = isSimpleScoring(form) ? autoDistribute({ ...form, tests: form.tests ?? [] }) : form;
  return {
    title: form.title.trim(),
    statement: form.statement,
    language: form.language,
    points: Number(form.points) || EMPTY.points,
    starter_code: withTests ? form.starter_code : '',
    kind: form.kind,
    settings: noté.settings,
    subject_id: form.subject_id === '' ? null : Number(form.subject_id),
    tags: form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    tests: withTests
      ? (noté.tests ?? []).map((test) => {
          const copy = { ...test };
          delete copy._key;
          return { ...copy, points: Number(test.points), timeout_ms: Number(test.timeout_ms) };
        })
      : [],
  };
}

/** Les types d'exercice, par famille : un clic ouvre l'exercice déjà réglé pour ce type. */
function TypeGrid({ onPick, autoFocus = false }) {
  return (
    <div className="banque-types">
      {typeFamilies().map((family, f) => (
        <div key={family.name} className="banque-famille">
          <span className="banque-famille-nom">{family.name}</span>
          <div className="feuille-types">
            {family.types.map((type, t) => (
              <button
                key={type.key}
                type="button"
                className="feuille-type"
                data-kind={type.key}
                autoFocus={autoFocus && f === 0 && t === 0}
                onClick={() => onPick(type.key)}
              >
                <strong>{type.badge}</strong>
                <span>{type.tagline}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** « + Nouvel exercice » : le type se choisit dans un menu, sans écran intermédiaire. */
function NewExerciseMenu({ onPick }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="banque-menu" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <Button aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        + Nouvel exercice
      </Button>
      {open && (
        <>
          <button
            type="button"
            className="banque-menu-voile"
            aria-label="Fermer le menu"
            tabIndex={-1}
            onClick={close}
          />
          <div className="banque-menu-panneau" role="dialog" aria-label="Type du nouvel exercice">
            <span className="panneau-sous-titre">Quel type d’exercice ?</span>
            <TypeGrid
              autoFocus
              onPick={(kind) => {
                close();
                onPick(kind);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Un exercice de sa banque, sur la feuille. */
function BankEditor({ initial, onClose }) {
  const [form, setForm] = useState(initial);
  const [view, setView] = useState('teacher');
  const [ui, setUi] = useState({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);

  const subjects = useSubjects();
  const languages = useLanguages();
  const save = useAction(
    ({ id, body }) =>
      id
        ? api(`/api/bank/exercises/${id}`, { method: 'PUT', body })
        : api('/api/bank/exercises', { method: 'POST', body }),
    [['bank'], ['library'], ['community']],
  );

  // Quitter la page avec des changements non enregistrés : le navigateur prévient.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (next) => {
    setForm(next);
    setDirty(true);
  };
  const change = (patch) => {
    setForm((current) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }));
    setDirty(true);
  };
  const onUi = (patch) => setUi((current) => ({ ...current, ...patch }));

  const type = exerciseType(form.kind);
  const issues = exerciseIssues(form, { points: false });
  const titled = form.title.trim().length >= 2;

  function cancel() {
    if (dirty && !window.confirm('Abandonner les modifications de cet exercice ?')) return;
    onClose();
  }

  async function submit() {
    setError(null);
    try {
      await save.mutateAsync({ id: form.id, body: payloadOf(form) });
      setDirty(false);
      onClose(form.id ? `« ${form.title.trim()} » mis à jour.` : `« ${form.title.trim()} » ajouté à la banque.`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={`Banque · ${form.id ? 'Modifier' : 'Nouvel exercice'}`}
        title={form.title.trim() || 'Nouvel exercice'}
      />

      <div className="feuille-barre">
        <Segmented
          label="Affichage de la feuille"
          value={view}
          options={[
            { value: 'teacher', label: 'Avec le corrigé' },
            { value: 'student', label: 'Vue étudiant' },
          ]}
          onChange={(value) => value && setView(value)}
        />
        <div className="feuille-barre-fin">
          {!titled && <span className="sub">Donnez un intitulé pour enregistrer.</span>}
          {titled && dirty && <span className="sub">Modifications non enregistrées</span>}
          <Button variant="secondary" onClick={cancel}>
            Annuler
          </Button>
          <Button disabled={!titled || save.isPending} onClick={submit}>
            {save.isPending ? 'Enregistrement…' : form.id ? 'Enregistrer' : 'Ajouter à la banque'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="feuille-alertes">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="feuille-atelier">
        <div className="feuille-plateau">
          <article className="feuille-papier sujet" aria-label="Feuille de l’exercice">
            <h2 className="sujet-bloc-titre">{type.sheetTitle}</h2>
            {view === 'student' ? (
              <SheetExercise exercise={form} showPoints={false} />
            ) : (
              <ExerciseOnSheet
                exercise={form}
                onChange={change}
                canEditSubject
                canEditCorrection
                ui={ui}
                onUi={onUi}
              />
            )}
          </article>
        </div>

        <aside className="feuille-panneau" aria-label="Réglages de l’exercice">
          <div className="feuille-panneau-corps">
            <section className="panneau-section">
              <span className="panneau-titre">Exercice</span>
              <label className="panneau-sous-titre" htmlFor="banque-type">
                Type
              </label>
              <select
                id="banque-type"
                className="panneau-select"
                value={form.kind}
                onChange={(e) => {
                  edit(withKind(form, e.target.value));
                  setUi({});
                }}
              >
                {typeFamilies().map((family) => (
                  <optgroup key={family.name} label={family.name}>
                    {family.types.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.badge}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {usesLanguage(form.kind) && (
                <>
                  <label className="panneau-sous-titre" htmlFor="banque-langage">
                    Langage
                  </label>
                  <select
                    id="banque-langage"
                    className="panneau-select"
                    value={form.language}
                    onChange={(e) => edit(withLanguage(form, e.target.value))}
                  >
                    {(languages.data ?? []).map((l) => (
                      <option key={l.key} value={l.key}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <p className="panneau-aide">{type.gradingNote}</p>
            </section>

            <section className="panneau-section">
              <span className="panneau-sous-titre">À vérifier</span>
              {issues.length === 0 ? (
                <span className="panneau-etat panneau-etat--pret">Prêt : rien ne manque.</span>
              ) : (
                <ul className="panneau-problemes">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
            </section>

            <ExerciseSettings
              exercise={form}
              change={change}
              name="banque"
              canEditSubject
              canEditCorrection
              showPoints={false}
            />

            <section className="panneau-section">
              <span className="panneau-sous-titre">Classement</span>
              <label className="panneau-aide" htmlFor="banque-matiere">
                Matière
              </label>
              <select
                id="banque-matiere"
                className="panneau-select"
                value={form.subject_id}
                onChange={(e) => edit({ ...form, subject_id: e.target.value })}
              >
                <option value="">Aucune</option>
                {(subjects.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <label className="panneau-aide" htmlFor="banque-etiquettes">
                Étiquettes, séparées par des virgules
              </label>
              <input
                id="banque-etiquettes"
                className="panneau-select"
                value={form.tags}
                placeholder="boucles, tableaux…"
                onChange={(e) => edit({ ...form, tags: e.target.value })}
              />
              <p className="panneau-aide">
                Le partage avec vos collègues se règle dans l’aperçu de l’exercice, depuis la banque.
              </p>
            </section>

            <p className="panneau-aide">
              Pas de points ici : ils se fixent dans l’évaluation, quand vous y importez
              l’exercice.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
