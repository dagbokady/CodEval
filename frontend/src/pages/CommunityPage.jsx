import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAction, useCommunity, useCommunityItem, useLanguages } from '../api/hooks';
import { useAuth } from '../auth';
import { SheetExercise } from '../components/SubjectSheet';
import { IconCheck, IconPlus, IconReuse, IconSearch, IconSheet, IconSheets } from '../components/icons';
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  Field,
  Loading,
  Menu,
  PageHeader,
  Pagination,
  Segmented,
  Skeleton,
  Tabs,
} from '../components/ui';
import { EVAL_KIND_LABELS } from '../format';
import { exerciseType } from '../exerciseTypes';

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

function initials(name) {
  return (name ?? '?')
    .split(/[\s.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
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
  const scope = params.get('provenance') ?? 'all';
  const sort = params.get('tri') ?? 'recent';
  const page = Number(params.get('page')) || 1;

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
  const listing = useCommunity({ q, itemType, language, scope, sort, page });

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
  const items = listing.data?.items ?? [];
  const total = listing.data?.total ?? 0;

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
                    onTag={(tag) => {
                      setSearch(tag);
                      setFilter('q', tag);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                </li>
              ))}
            </ul>
            <Pagination
              page={listing.data.page}
              pageSize={listing.data.page_size}
              total={total}
              onChange={(value) => {
                setFilter('page', value > 1 ? String(value) : null);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
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
 * Une publication : ce que c'est, de quoi ça parle, qui l'a faite, puis les
 * deux gestes qui comptent. Toute la carte ouvre l'aperçu ; les boutons
 * restent au-dessus de ce lien.
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
  onTag,
}) {
  const subject = item.item_type === 'subject';
  const hasFacts = item.subject_name || item.language;

  return (
    <article className={`cm-card ${subject ? 'cm-card--subject' : ''}`.trim()}>
      <div className="cm-card-head">
        <span className="cm-kind">
          {subject ? <IconSheets /> : <IconSheet />}
          {kindLabel(item)}
        </span>
        <span className="cm-points" title="Barème total">{points(item.total_points)}</span>
        {item.uses > 0 && (
          <span className="cm-uses" title={`Repris ${item.uses} fois par des enseignants`}>
            <IconReuse />
            {item.uses}
          </span>
        )}
        {item.can_delete && (
          <Menu
            label={`Actions sur « ${item.title} »`}
            items={[{ label: 'Retirer de la communauté', danger: true, onClick: onRemove }]}
          />
        )}
      </div>

      <h3 className="cm-title">
        <button type="button" className="cm-open" onClick={onPreview}>
          {item.title}
        </button>
      </h3>

      {item.description && <p className="cm-desc">{item.description}</p>}

      {hasFacts && (
        <div className="cm-facts">
          {item.subject_name && <span className="cm-subject">{item.subject_name}</span>}
          {item.language && <span className="cm-lang">{languageLabel(item.language)}</span>}
        </div>
      )}

      {item.tags?.length > 0 && (
        <div className="cm-tags">
          {item.tags.slice(0, 5).map((tag) => (
            <button
              key={tag}
              type="button"
              className="cm-tag"
              title={`Chercher « ${tag} »`}
              onClick={() => onTag(tag)}
            >
              #{tag}
            </button>
          ))}
          {item.tags.length > 5 && <span className="cm-tag-more">+{item.tags.length - 5}</span>}
        </div>
      )}

      <div className="cm-author">
        <span className="cm-avatar" aria-hidden="true">{initials(item.author_name)}</span>
        <span className="cm-author-text">
          <b>{item.author_name ?? 'Auteur inconnu'}</b>
          <span>
            {[item.organization_name, publishedOn(item.created_at)].filter(Boolean).join(' · ')}
          </span>
        </span>
      </div>

      <div className="cm-actions">
        {isTeacher ? (
          <>
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
              {pending === `use-${item.id}` ? 'Création…' : 'Créer une évaluation'}
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="small" onClick={onPreview}>
            Aperçu
          </Button>
        )}
      </div>
    </article>
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
          </dl>
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
