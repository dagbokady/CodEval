import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import { exerciseType } from '../exerciseTypes';
import { Alert, Button, Dialog, Field, Loading, Segmented } from './ui';

/**
 * Publier pour toute la plateforme ce que l'établissement a déjà fait : un
 * exercice d'une banque ou un sujet. Réservé à l'administration ; un enseignant
 * partage depuis sa propre banque, d'un choix dans l'aperçu.
 */
export default function PublishDialog({ open, onClose, onPublished }) {
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
          hint="Ce que les enseignants de l'établissement ont rangé dans leur banque."
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
              { value: 'evaluation', label: 'Un sujet' },
              { value: 'exercise', label: 'Un exercice' },
            ]}
          />
        </Field>

        {sources.isPending ? (
          <Loading variant="inline" />
        ) : options.length === 0 ? (
          <Alert tone="info">
            {sourceType === 'evaluation'
              ? "Aucun sujet en banque dans l'établissement : un enseignant y range une épreuve depuis « Mes évaluations », avec « Mettre en banque »."
              : "Aucun exercice en banque dans l'établissement."}
          </Alert>
        ) : (
          <Field
            label={sourceType === 'evaluation' ? 'Sujet' : 'Exercice'}
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
