/**
 * Le corrigé proposé aux apprenants, rédigé avec l'exercice.
 *
 * Rangé dans `settings.solution` et `settings.solution_notes`, il ne quitte le
 * serveur qu'avec les notes publiées, et seulement si l'épreuve le propose
 * (modalité « Proposer le corrigé »). Une question fermée a déjà sa réponse
 * attendue : on n'y écrit que l'explication. Un exercice pratique reçoit en plus
 * sa solution type : un algorithme dans la structure du cours.
 */

import { Disclosure, Field } from './ui';

const ALGO_PLACEHOLDER = `Algorithme NomDeLAlgorithme
Déclaration
    Variable n : entier
Début
    Lire(n)
    Écrire(n * 2)
Fin`;

export default function SolutionEditor({ kind, settings, onChange, readOnly, name }) {
  const practical = kind === 'code' || kind === 'algo';
  const current = settings ?? {};
  const filled = Boolean(current.solution?.trim() || current.solution_notes?.trim());
  const set = (key, value) => onChange({ ...current, [key]: value });

  return (
    <Disclosure
      summary="Corrigé proposé aux étudiants"
      hint={filled ? 'rédigé' : 'facultatif · affiché avec les notes publiées'}
      defaultOpen={filled}
    >
      {practical && (
        <Field
          label={kind === 'algo' ? 'Algorithme corrigé' : 'Solution type'}
          id={`${name}-solution`}
          hint="Affichée sous la copie de l'apprenant, avec les résultats attendus de vos tests officiels."
        >
          <textarea
            id={`${name}-solution`}
            rows={10}
            style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
            placeholder={kind === 'algo' ? ALGO_PLACEHOLDER : ''}
            value={current.solution ?? ''}
            disabled={readOnly}
            onChange={(e) => set('solution', e.target.value)}
          />
        </Field>
      )}
      <Field
        label="Explications"
        id={`${name}-notes`}
        hint={
          practical
            ? 'La démarche, les pièges fréquents, ce qu’il fallait remarquer.'
            : 'Les réponses attendues sont déjà montrées à l’apprenant : dites-lui pourquoi.'
        }
      >
        <textarea
          id={`${name}-notes`}
          rows={4}
          value={current.solution_notes ?? ''}
          disabled={readOnly}
          onChange={(e) => set('solution_notes', e.target.value)}
        />
      </Field>
    </Disclosure>
  );
}
