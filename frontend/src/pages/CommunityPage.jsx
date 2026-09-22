import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAction, useCommunity, useCommunityItem, useLanguages } from '../api/hooks';
import { useAuth } from '../auth';
import { SheetExercise } from '../components/SubjectSheet';
import { IconCheck, IconPlus, IconSearch } from '../components/icons';
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  Field,
  Loading,
  Menu,
  PageHeader,
  Segmented,
  Skeleton,
  Tabs,
} from '../components/ui';
import { EVAL_KIND_LABELS } from '../format';
import { KIND_LABELS, exerciseType } from '../exerciseTypes';

const TYPES = [
  { value: 'exercise', label: 'Exercices' },
  { value: 'subject', label: 'Sujets complets' },
];

const SCOPES = [
  { value: 'all', label: 'Toute la communauté' },
  { value: 'organization', label: 'Mon établissement' },
  { value: 'mine', label: 'Mes publications' },
];

const SORTS = [
  { value: 'recent', label: 'Les plus récents' },
  { value: 'popular', label: 'Les plus repris' },
  { value: 'rated', label: 'Les mieux notés' },
  { value: 'type', label: 'Par type (QCM, Vrai/Faux…)' },
];

const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** « aujourd'hui », « il y a 3 jours », puis la date : on situe sans calculer. */
function publishedOn(value) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days < 1) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  return `le ${dayFmt.format(new Date(value))}`;
}

/** Ce que contient la publication, en une ligne : « Sujet complet · 3 exercices ». */
function kindLabel(item) {
  if (item.item_type === 'subject') {
    const n = item.exercises_count;
    return `Sujet complet · ${n} exercice${n > 1 ? 's' : ''}`;
  }
  const kind = item.content?.exercise?.kind ?? item.exercise_kind;
  return kind ? `Exercice · ${exerciseType(kind).badge}` : 'Exercice';
}

const ratingFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Étoiles de lecture : la moyenne, arrondie à la demi-étoile, et le nombre de notes. */
function StarsSummary({ avg, count, compact = false }) {
  if (!count) {
    return compact ? null : <span className="stars-empty">Pas encore notée</span>;
  }
  const rounded = Math.round(avg * 2) / 2;
  const label = `${ratingFmt.format(avg)} sur 5, ${count} note${count > 1 ? 's' : ''}`;
  return (
    <span className="stars-summary" title={label}>
      <span className="stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} fill={rounded >= n ? 1 : rounded >= n - 0.5 ? 0.5 : 0} />
        ))}
      </span>
      <span className="visually-hidden">{label}</span>
      <span aria-hidden="true">
        <b>{ratingFmt.format(avg)}</b> ({count})
      </span>
    </span>
  );
}

function Star({ fill = 0 }) {
  const id = `star-half-${fill}`;
  return (
    <svg className="star" viewBox="0 0 20 20" width="14" height="14">
      {fill === 0.5 && (
        <defs>
          <linearGradient id={id}>
            <stop offset="50%" stopColor="var(--star-on)" />
            <stop offset="50%" stopColor="var(--star-off)" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z"
        fill={fill === 1 ? 'var(--star-on)' : fill === 0.5 ? `url(#${id})` : 'var(--star-off)'}
      />
    </svg>
  );
}

/** Donner sa note : cinq étoiles cliquables, recliquer la sienne la retire. */
function StarInput({ value, disabled, onChange }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;
  const words = ['', 'Faible', 'Passable', 'Correct', 'Bon', 'Excellent'];
  return (
    <div className="star-input" role="radiogroup" aria-label="Votre note" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} étoile${n > 1 ? 's' : ''} : ${words[n]}`}
          title={value === n ? 'Retirer ma note' : words[n]}
          disabled={disabled}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => onChange(value === n ? null : n)}
        >
          <Star fill={shown >= n ? 1 : 0} />
        </button>
      ))}
      <span className="star-input-word" aria-hidden="true">
        {shown ? words[shown] : 'Cliquez pour noter'}
      </span>
    </div>
  );
}

function points(total) {
  return `${String(total).replace('.', ',')} pt${total > 1 ? 's' : ''}`;
}

/**
 * La communauté : ce que les enseignants et l'administration de tous les
 * établissements ont déjà conçu, exercices seuls ou sujets entiers. On y
 * publie une copie de son travail ; on en tire une copie pour soi, dans sa
 * banque ou directement en évaluation brouillon.
 *
 * Les filtres vivent dans l'adresse : revenir d'un aperçu ou d'une épreuve
 * créée retrouve la recherche telle qu'on l'avait laissée.
 */
export default function CommunityPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isTeacher = user.role === 'teacher';
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const itemType = params.get('type');
  const language = params.get('langage') ?? '';
  const kind = params.get('format') ?? '';
  const scope = params.get('provenance') ?? 'all';
  const sort = params.get('tri') ?? 'recent';

  const [search, setSearch] = useState(q);
  const searchRef = useRef(null);
  const [previewId, setPreviewId] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [pending, setPending] = useState(null);
  const [added, setAdded] = useState(() => new Set());
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState('');

  /** Change un filtre ; tout changement de filtre ramène à la première page. */
  function setFilter(name, value, defaultValue = '') {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (!value || value === defaultValue) next.delete(name);
        else next.set(name, value);
        if (name !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    const id = setTimeout(() => {
      if (search.trim() !== q) setFilter('q', search.trim());
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Retour arrière ou lien : le champ suit l'adresse.
  const [syncedQ, setSyncedQ] = useState(q);
  if (syncedQ !== q) {
    setSyncedQ(q);
    setSearch(q);
  }

  // « / » place le curseur dans la recherche, comme sur la plupart des outils.
  useEffect(() => {
    function onKey(event) {
      const target = event.target;
      const typing =
        target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const languages = useLanguages();
  const languageLabel = (key) =>
    (languages.data ?? []).find((l) => l.key === key)?.label ?? key?.toUpperCase();
  const listing = useCommunity({ q, itemType, kind, language, scope, sort });

  const useItem = useAction(
    (id) => api(`/api/community/${id}/use`, { method: 'POST', body: {} }),
    [['evaluations'], ['community']],
  );
  const saveToBank = useAction(
    (id) => api(`/api/community/${id}/to-bank`, { method: 'POST' }),
    [['bank'], ['evaluation-templates'], ['community']],
  );
  const remove = useAction(
    (id) => api(`/api/community/${id}`, { method: 'DELETE' }),
    [['community']],
  );

  function run(key, promise, success) {
    setError('');
    setNotice(null);
    setPending(key);
    return promise
      .then(success)
      .catch((e) => setError(e.message))
      .finally(() => setPending(null));
  }

  function use(item) {
    run(`use-${item.id}`, useItem.mutateAsync(item.id), (created) =>
      navigate(`/evaluations/${created.evaluation_id}`),
    );
  }

  function addToBank(item) {
    run(`bank-${item.id}`, saveToBank.mutateAsync(item.id), (result) => {
      setAdded((current) => new Set(current).add(item.id));
      const template = result.target === 'template';
      setNotice({
        text: `« ${item.title} » est dans votre banque ${template ? "d'évaluations" : "d'exercices"}.`,
        to: template ? '/banque/evaluations' : '/banque',
      });
    });
  }

  function removeItem(item) {
    run(`remove-${item.id}`, remove.mutateAsync(item.id), () => {
      setConfirmDelete(null);
      setNotice({ text: `« ${item.title} » est retiré de la communauté.` });
    });
  }

  const busy = pending !== null;
  const items = listing.data?.pages.flatMap((p) => p.items) ?? [];
  const total = listing.data?.pages[0]?.total ?? 0;

  const activeFilters = [
    q && {
      key: 'q',
      label: `« ${q} »`,
      clear: () => {
        setSearch('');
        setFilter('q', null);
      },
    },
    itemType && {
      key: 'type',
      label: TYPES.find((t) => t.value === itemType)?.label,
      clear: () => setFilter('type', null),
    },
    kind && {
      key: 'format',
      label: KIND_LABELS[kind] ?? kind,
      clear: () => setFilter('format', null),
    },
    language && {
      key: 'langage',
      label: languageLabel(language),
      clear: () => setFilter('langage', null),
    },
  ].filter(Boolean);

  function clearFilters() {
    setSearch('');
    setParams(
      (current) => {
        const next = new URLSearchParams();
        for (const name of ['provenance', 'tri']) {
          if (current.get(name)) next.set(name, current.get(name));
        }
        return next;
      },
      { replace: true },
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={isTeacher ? 'Espace enseignant' : 'Supervision'}
        title="Communauté"
        meta="Exercices et sujets partagés par les enseignants de tous les établissements. Reprenez-les tels quels ou adaptez-les."
      >
        <Button onClick={() => setPublishing(true)}>
          <IconPlus />
          Publier
        </Button>
      </PageHeader>

      <Tabs
        tabs={SCOPES}
        value={scope}
        onChange={(value) => setFilter('provenance', value, 'all')}
      />

      <div className="content cm-content">
        <div className="cm-toolbar" role="search">
          <label className="cm-search">
            <span className="visually-hidden">Rechercher dans la communauté</span>
            <IconSearch />
            <input
              ref={searchRef}
              type="search"
              placeholder="Rechercher un titre, une matière, un mot-clé…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && search) {
                  e.preventDefault();
                  setSearch('');
                }
              }}
            />
            {!search && <kbd aria-hidden="true">/</kbd>}
          </label>

          <div className="cm-filters">
            <Segmented
              label="Type de publication"
              allLabel="Tout"
              value={itemType}
              onChange={(value) => setFilter('type', value)}
              options={TYPES}
            />
            <select
              className="select-inline"
              aria-label="Langage"
              value={language}
              onChange={(e) => setFilter('langage', e.target.value)}
            >
              <option value="">Tous les langages</option>
              {(languages.data ?? []).map((l) => (
                <option key={l.key} value={l.key}>{l.label}</option>
              ))}
            </select>
            <select
              className="select-inline cm-sort"
              aria-label="Trier"
              value={sort}
              onChange={(e) => setFilter('tri', e.target.value, 'recent')}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {itemType !== 'subject' && (
          <div className="cm-kind-legend" role="group" aria-label="Filtrer par type d'exercice">
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="cm-kind-chip"
                data-kind={value}
                aria-pressed={kind === value}
                onClick={() => setFilter('format', kind === value ? null : value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="cm-summary" aria-live="polite">
          <span className="cm-count">
            {listing.isPending ? (
              'Recherche…'
            ) : (
              <>
                <b>{total}</b> publication{total > 1 ? 's' : ''}
              </>
            )}
          </span>
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className="cm-filter-pill"
              onClick={filter.clear}
              aria-label={`Retirer le filtre ${filter.label}`}
            >
              {filter.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          {activeFilters.length > 1 && (
            <button type="button" className="cm-clear" onClick={clearFilters}>
              Tout effacer
            </button>
          )}
        </div>

        <Alert>{error || listing.error?.message}</Alert>
        {notice && (
          <Alert tone="success">
            {notice.text}
            {notice.to && (
              <>
                {' '}
                <Link to={notice.to}>Ouvrir ma banque</Link>
              </>
            )}
          </Alert>
        )}

        {listing.isPending && <CardsSkeleton />}

        {listing.data && items.length === 0 && (
          activeFilters.length > 0 ? (
            <EmptyState
              variant="search"
              title="Aucun résultat"
              action={<Button variant="secondary" onClick={clearFilters}>Effacer les filtres</Button>}
            >
              Essayez un autre mot, ou élargissez à toute la communauté.
            </EmptyState>
          ) : scope === 'mine' ? (
            <EmptyState
              title="Vous n'avez encore rien publié"
              action={<Button onClick={() => setPublishing(true)}>Publier un exercice ou un sujet</Button>}
            >
              Partagez un exercice de votre banque ou une évaluation mise en banque : vos collègues
              pourront la reprendre telle quelle.
            </EmptyState>
          ) : (
            <EmptyState
              title="Rien de publié ici pour le moment"
              action={<Button onClick={() => setPublishing(true)}>Publier le premier</Button>}
            >
              Partagez un exercice de votre banque ou une évaluation déjà donnée : les enseignants
              des autres établissements pourront la reprendre telle quelle.
            </EmptyState>
          )
        )}

        {items.length > 0 && (
          <>
            <ul className={`cm-grid ${listing.isPlaceholderData ? 'is-stale' : ''}`.trim()}>
              {items.map((item) => (
                <li key={item.id}>
                  <CommunityCard
                    item={item}
                    isTeacher={isTeacher}
                    busy={busy}
                    pending={pending}
                    added={added.has(item.id)}
                    languageLabel={languageLabel}
                    onPreview={() => setPreviewId(item.id)}
                    onUse={() => use(item)}
                    onAddToBank={() => addToBank(item)}
                    onRemove={() => setConfirmDelete(item)}
                  />
                </li>
              ))}
            </ul>
            <LoadMore
              hasMore={Boolean(listing.hasNextPage)}
              loading={listing.isFetchingNextPage}
              onLoad={() => listing.fetchNextPage()}
            />
          </>
        )}
      </div>

      <PreviewDialog
        id={previewId}
        onClose={() => setPreviewId(null)}
        languageLabel={languageLabel}
        actions={
          isTeacher
            ? (item) => (
                <>
                  <Button
                    variant="secondary"
                    disabled={busy || added.has(item.id)}
                    onClick={() => {
                      setPreviewId(null);
                      addToBank(item);
                    }}
                  >
                    {added.has(item.id) ? 'Dans ma banque' : 'Ajouter à ma banque'}
                  </Button>
                  <Button disabled={busy} onClick={() => use(item)}>
                    {pending === `use-${item.id}` ? 'Création…' : 'Créer une évaluation'}
                  </Button>
                </>
              )
            : null
        }
      />

      <Dialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Retirer de la communauté ?"
        description={
          confirmDelete
            ? `« ${confirmDelete.title} » ne sera plus proposé. Les copies déjà reprises par vos collègues restent intactes.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Annuler</Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => removeItem(confirmDelete)}
            >
              {pending?.startsWith('remove-') ? 'Retrait…' : 'Retirer'}
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
 * Une publication : d'abord ce qu'elle contient, en miniature, puis son titre
 * et son auteur. Toute la carte ouvre l'aperçu complet ; les boutons restent
 * au-dessus de ce lien.
 */
function CommunityCard({
  item,
  isTeacher,
  busy,
  pending,
  added,
  languageLabel,
  onPreview,
  onUse,
  onAddToBank,
  onRemove,
}) {
  const subject = item.item_type === 'subject';
  const kinds = item.exercise_kinds?.length
    ? item.exercise_kinds
    : [item.exercise_kind ?? 'code'];

  return (
    <article
      className={`cm-card ${subject ? 'cm-card--subject' : ''}`.trim()}
      data-kind={subject ? undefined : kinds[0]}
    >
      <CardPreview item={item} />

      <div className="cm-card-body">
        {(item.language || item.can_delete) && (
          <div className="cm-card-head">
            {item.language && <span className="cm-lang">{languageLabel(item.language)}</span>}
            {item.can_delete && (
              <Menu
                label={`Actions sur « ${item.title} »`}
                items={[{ label: 'Retirer de la communauté', danger: true, onClick: onRemove }]}
              />
            )}
          </div>
        )}

        <h3 className="cm-title">
          <button type="button" className="cm-open" onClick={onPreview}>
            {item.title}
          </button>
        </h3>

        <p className="cm-byline">
          {[
            item.author_name ?? 'Auteur inconnu',
            publishedOn(item.created_at),
            item.uses > 0 ? `repris ${item.uses} fois` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>

        {item.rating_count > 0 && (
          <p className="cm-rating">
            <StarsSummary avg={item.rating_avg} count={item.rating_count} compact />
            {item.my_rating && <span className="cm-rating-mine">Votre note : {item.my_rating}/5</span>}
          </p>
        )}

        {isTeacher && (
          <div className="cm-actions">
            <Button
              variant="secondary"
              size="small"
              disabled={busy || added}
              onClick={onAddToBank}
              title="Une copie rejoint votre banque, à retoucher à loisir"
            >
              {added ? (
                <>
                  <IconCheck />
                  Dans ma banque
                </>
              ) : pending === `bank-${item.id}` ? (
                'Ajout…'
              ) : (
                'Ajouter à ma banque'
              )}
            </Button>
            <Button
              size="small"
              disabled={busy}
              onClick={onUse}
              title="Crée une évaluation brouillon à partir de cette publication"
            >
              {pending === `use-${item.id}` ? 'Création…' : 'Utiliser'}
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * La miniature : une feuille de sujet posée sur la couleur du type, avec le
 * vrai contenu en petit. Un exercice
 * montre son énoncé et le début de ce que l'apprenant aura sous les yeux ; un
 * sujet empile ses premiers exercices.
 */
function CardPreview({ item }) {
  const preview = item.preview ?? {};
  const subject = item.item_type === 'subject';
  const label = subject
    ? `Sujet · ${item.exercises_count} exercice${item.exercises_count > 1 ? 's' : ''}`
    : exerciseType(preview.kind ?? item.exercise_kind).badge;
  return (
    <div className="cm-preview" aria-hidden="true">
      <div className="cm-sheet">
        <div className="cm-sheet-head">
          <span className="cm-sheet-kind">{label}</span>
          <span className="cm-sheet-points">{points(item.total_points)}</span>
        </div>
        {subject ? (
          <ol className="cm-preview-list">
            {(preview.exercises ?? []).map((exercise, index) => (
              <li key={index} data-kind={exercise.kind}>
                <span className="cm-preview-num">{index + 1}</span>
                <span className="cm-preview-ex">
                  <b>{exercise.title || exerciseType(exercise.kind).badge}</b>
                  {exercise.text && <span>{exercise.text}</span>}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <ExercisePreview preview={preview} />
        )}
      </div>
    </div>
  );
}

function ExercisePreview({ preview }) {
  const { kind, text } = preview;
  return (
    <>
      {text && <p className="cm-preview-text">{text}</p>}
      {kind === 'qcm' && (preview.choices ?? []).length > 0 && (
        <ul className="cm-preview-choices">
          {preview.choices.map((choice, index) => (
            <li key={index}>{choice || '…'}</li>
          ))}
        </ul>
      )}
      {kind === 'truefalse' && (preview.statements ?? []).length > 0 && (
        <ul className="cm-preview-tf">
          {preview.statements.map((statement, index) => (
            <li key={index}>
              <span>{statement || '…'}</span>
              <span className="cm-preview-vf">V</span>
              <span className="cm-preview-vf">F</span>
            </li>
          ))}
        </ul>
      )}
      {kind === 'matching' && (preview.pairs ?? []).length > 0 && (
        <ul className="cm-preview-pairs">
          {preview.pairs.map(([left, right], index) => (
            <li key={index}>
              <span>{left || '…'}</span>
              <span className="cm-preview-link" />
              <span>{right || '…'}</span>
            </li>
          ))}
        </ul>
      )}
      {kind === 'short' && (
        <div className="cm-preview-lines">
          <span />
          <span />
        </div>
      )}
      {kind === 'code' && preview.code && <pre className="cm-preview-code">{preview.code}</pre>}
      {preview.questions_count > 1 && (
        <span className="cm-preview-more">+ {preview.questions_count - 1} autre{preview.questions_count > 2 ? 's' : ''} question{preview.questions_count > 2 ? 's' : ''}</span>
      )}
    </>
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
      { rootMargin: '400px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  if (!hasMore) return null;
  return (
    <div ref={ref} className="cm-load-more">
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

/** Cartes fantômes : la grille garde sa forme pendant le chargement. */
function CardsSkeleton() {
  return (
    <ul className="cm-grid" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index}>
          <div className="cm-card cm-card--ghost">
            <Skeleton width="40%" height={12} />
            <Skeleton width={`${60 + ((index * 13) % 30)}%`} height={18} />
            <Skeleton width="92%" height={12} />
            <Skeleton width="70%" height={12} />
            <Skeleton width="50%" height={12} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Le contenu d'une publication, sur la feuille de sujet, jeux de tests compris. */
function PreviewDialog({ id, onClose, actions, languageLabel }) {
  const { data: item, isPending, error } = useCommunityItem(id);
  const rate = useAction(
    (stars) =>
      stars
        ? api(`/api/community/${id}/rating`, { method: 'PUT', body: { stars } })
        : api(`/api/community/${id}/rating`, { method: 'DELETE' }),
    [['community'], ['community-item', id]],
  );
  const exercises =
    item?.item_type === 'subject'
      ? (item.content?.exercises ?? [])
      : item?.content?.exercise
        ? [item.content.exercise]
        : [];
  const meta = item?.content?.evaluation;

  return (
    <Dialog
      open={Boolean(id)}
      onClose={onClose}
      size="wide"
      title={item?.title ?? 'Aperçu'}
      description={item ? kindLabel(item) : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
          {item && actions?.(item)}
        </>
      }
    >
      {isPending && <Loading variant="inline" />}
      {error && <Alert>{error.message}</Alert>}
      {item && (
        <div className="community-preview">
          <dl className="cm-meta">
            <div>
              <dt>Auteur</dt>
              <dd>
                {item.author_name ?? 'Auteur inconnu'}
                {item.organization_name && <span>{item.organization_name}</span>}
              </dd>
            </div>
            <div>
              <dt>Barème</dt>
              <dd>{points(item.total_points)}</dd>
            </div>
            {meta && (
              <div>
                <dt>Format</dt>
                <dd>
                  {[EVAL_KIND_LABELS[meta.kind], `${meta.duration_minutes} min`]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              </div>
            )}
            {(item.subject_name || item.language) && (
              <div>
                <dt>Matière</dt>
                <dd>
                  {[item.subject_name, item.language ? languageLabel(item.language) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              </div>
            )}
            <div>
              <dt>Publié</dt>
              <dd>
                {publishedOn(item.created_at)}
                {item.uses > 0 && <span>repris {item.uses} fois</span>}
              </dd>
            </div>
            <div>
              <dt>Note des enseignants</dt>
              <dd>
                <StarsSummary avg={item.rating_avg} count={item.rating_count} />
              </dd>
            </div>
          </dl>
          {item.can_rate && (
            <div className="cm-rate">
              <span className="cm-rate-label">
                {item.my_rating ? 'Votre note' : 'Vous avez utilisé ce travail ? Notez-le'}
              </span>
              <StarInput
                value={item.my_rating}
                disabled={rate.isPending}
                onChange={(stars) => rate.mutate(stars)}
              />
              {rate.error && <Alert>{rate.error.message}</Alert>}
            </div>
          )}
          {item.description && <p className="cm-preview-desc">{item.description}</p>}
          {meta?.instructions && <p className="community-instructions">{meta.instructions}</p>}
          <div className="sujet">
            {exercises.map((exercise, index) => (
              <SheetExercise
                key={index}
                exercise={{ ...exercise, id: index }}
                number={item.item_type === 'subject' ? index + 1 : undefined}
                showAnswerZone={false}
                showTests
              />
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}

/**
 * Publier : on choisit ce qu'on a déjà fait (un exercice de sa banque, une
 * évaluation ou un modèle), puis on le présente en deux lignes. Pour
 * l'administration, la liste couvre tout l'établissement.
 */
function PublishDialog({ open, onClose, onPublished }) {
  const [sourceType, setSourceType] = useState('evaluation');
  const [sourceId, setSourceId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const sources = useQuery({
    queryKey: ['community-sources'],
    queryFn: () => api('/api/community/sources'),
  });
  const publish = useAction((body) => api('/api/community', { method: 'POST', body }), [
    ['community'],
  ]);

  const options =
    sourceType === 'evaluation'
      ? (sources.data?.evaluations ?? []).map((e) => ({
          value: e.id,
          label: `${e.title} · ${e.exercises_count} exercice${e.exercises_count > 1 ? 's' : ''}`,
          title: e.title,
        }))
      : (sources.data?.exercises ?? []).map((e) => ({
          value: e.id,
          label: `${e.title} · ${exerciseType(e.kind).badge}`,
          title: e.title,
        }));

  function submit(event) {
    event.preventDefault();
    publish
      .mutateAsync({
        source_type: sourceType === 'evaluation' ? 'evaluation' : 'bank_exercise',
        source_id: Number(sourceId),
        title: title.trim() || null,
        description: description.trim(),
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10),
      })
      .then(onPublished)
      .catch(() => {});
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title="Publier dans la communauté"
      description="Une copie est publiée : modifier ou supprimer l'original plus tard ne la change pas."
    >
      <form onSubmit={submit}>
        <Field
          label="Que voulez-vous partager ?"
          hint="On publie depuis une banque : une épreuve se met d'abord en banque, depuis « Mes évaluations »."
        >
          <Segmented
            label="Que voulez-vous partager ?"
            value={sourceType}
            onChange={(value) => {
              if (!value) return;
              setSourceType(value);
              setSourceId('');
            }}
            options={[
              { value: 'evaluation', label: "Banque d'évaluations" },
              { value: 'exercise', label: "Banque d'exercices" },
            ]}
          />
        </Field>

        {sources.isPending ? (
          <Loading variant="inline" />
        ) : options.length === 0 ? (
          <Alert tone="info">
            {sourceType === 'evaluation'
              ? "Votre banque d'évaluations est vide. Depuis « Mes évaluations », le bouton « Mettre en banque » y range une épreuve : elle pourra ensuite être publiée."
              : "Votre banque d'exercices est vide : créez-en un depuis « Banque d'exercices »."}
          </Alert>
        ) : (
          <Field
            label={sourceType === 'evaluation' ? 'Évaluation en banque' : 'Exercice en banque'}
            id="community-source"
          >
            <select
              id="community-source"
              required
              value={sourceId}
              onChange={(e) => {
                setSourceId(e.target.value);
                const picked = options.find((o) => String(o.value) === e.target.value);
                setTitle(picked?.title ?? '');
              }}
            >
              <option value="" disabled>Choisir…</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Titre affiché" id="community-title" hint="Par défaut, celui de l'original.">
          <input
            id="community-title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field
          label="Description"
          id="community-description"
          hint="Niveau visé, notions travaillées, conseils de passation."
        >
          <textarea
            id="community-description"
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Mots-clés" id="community-tags" hint="Séparés par des virgules : boucles, tableaux, L1…">
          <input id="community-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>

        {publish.error && <Alert>{publish.error.message}</Alert>}

        <footer className="dialog-foot">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={!sourceId || publish.isPending}>
            {publish.isPending ? 'Publication…' : 'Publier'}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
