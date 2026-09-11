/**
 * Éditeurs de question, partagés par l'éditeur d'évaluation et la banque
 * d'exercices : un QCM se règle de la même façon des deux côtés, et un type
 * ajouté au catalogue n'a qu'un seul formulaire à écrire.
 *
 * Tous les boutons sont `type="button"` : la banque édite dans un `<form>`, où
 * un bouton sans type soumettrait le formulaire au lieu d'ajouter une ligne.
 */

import { useState } from 'react';
import { Button, Field } from './ui';
import { TypePreview } from './TypePreviews';
import { typeFamilies } from '../exerciseTypes';
import { blankQuestion, questionsOf } from '../questions';

/**
 * Choix du type — première étape de toute création de question. Chaque type se
 * présente par une miniature de ce qu'il donne à l'écran : la forme d'un QCM ou
 * d'une correspondance se reconnaît plus vite qu'elle ne se lit.
 */
export function TypePicker({ onPick, title = "Quel type d'exercice voulez-vous créer ?" }) {
  return (
    <div className="card type-picker">
      <strong style={{ fontSize: 14 }}>{title}</strong>
      <p className="sub" style={{ margin: '4px 0 12px' }}>
        Le type décide de l'outil de réponse de l'apprenant et du mode de correction.
      </p>
      {typeFamilies().map((family) => (
        <div key={family.name} style={{ marginBottom: 14 }}>
          <div className="sub" style={{ marginBottom: 6 }}>{family.name}</div>
          <div className="type-picker-grid">
            {family.types.map((type) => (
              <button
                key={type.key}
                type="button"
                className="type-card"
                title={type.description}
                onClick={() => onPick(type.key)}
              >
                <TypePreview kind={type.key} />
                <span className="type-card-titre">{type.badge}</span>
                <span className="type-card-tagline">{type.tagline}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Une question de QCM. `name` isole le groupe de boutons radio : sans lui, deux
 * questions affichées sur la même page se voleraient la réponse cochée.
 */
export function QcmEditor({ question, readOnly, onChange, name = 'qcm' }) {
  const choices = question.choices ?? [{ text: '', correct: false }, { text: '', correct: false }];
  const multiple = Boolean(question.multiple);

  const updateChoice = (index, patch) =>
    onChange({ choices: choices.map((c, i) => (i === index ? { ...c, ...patch } : c)) });

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <strong style={{ fontSize: 13 }}>Choix de réponse</strong>
        <label className="switch" style={{ fontSize: 13, gap: 6, marginLeft: 'auto' }}>
          <input
            type="checkbox"
            checked={multiple}
            disabled={readOnly}
            onChange={(e) => onChange({ multiple: e.target.checked })}
          />
          <span>Plusieurs réponses possibles</span>
        </label>
      </div>
      <p className="sub">
        Cochez les réponses correctes. L'apprenant verra les choix dans un ordre aléatoire.
      </p>
      {choices.map((choice, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type={multiple ? 'checkbox' : 'radio'}
            name={`${name}-correct`}
            checked={Boolean(choice.correct)}
            disabled={readOnly}
            onChange={(e) => {
              if (!multiple) {
                onChange({ choices: choices.map((c, j) => ({ ...c, correct: j === i })) });
              } else {
                updateChoice(i, { correct: e.target.checked });
              }
            }}
            title="Réponse correcte"
          />
          <input
            value={choice.text}
            placeholder={`Choix ${i + 1}`}
            disabled={readOnly}
            onChange={(e) => updateChoice(i, { text: e.target.value })}
            style={{ flex: 1 }}
          />
          {choices.length > 2 && !readOnly && (
            <Button
              variant="secondary"
              size="small"
              type="button"
              onClick={() => onChange({ choices: choices.filter((_, j) => j !== i) })}
            >
              ×
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          variant="secondary"
          size="small"
          type="button"
          style={{ justifySelf: 'start' }}
          onClick={() => onChange({ choices: [...choices, { text: '', correct: false }] })}
        >
          + Ajouter un choix
        </Button>
      )}
    </div>
  );
}

/** Une grille de correspondance : les paires correctes, mélangées ensuite pour l'apprenant. */
export function MatchingEditor({ question, readOnly, onChange }) {
  const pairs = question.pairs ?? [{ left: '', right: '' }, { left: '', right: '' }];

  const updatePair = (index, patch) =>
    onChange({ pairs: pairs.map((p, i) => (i === index ? { ...p, ...patch } : p)) });

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <strong style={{ fontSize: 13 }}>Paires à relier</strong>
      <p className="sub">
        Définissez les correspondances correctes. L'apprenant verra la colonne de droite mélangée
        et devra retrouver les bonnes associations.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {pairs.map((pair, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="sub" style={{ minWidth: 20 }}>{i + 1}.</span>
            <input
              value={pair.left}
              placeholder="Élément gauche"
              disabled={readOnly}
              onChange={(e) => updatePair(i, { left: e.target.value })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 18, color: 'var(--text-muted)' }}>→</span>
            <input
              value={pair.right}
              placeholder="Élément droit"
              disabled={readOnly}
              onChange={(e) => updatePair(i, { right: e.target.value })}
              style={{ flex: 1 }}
            />
            {pairs.length > 2 && !readOnly && (
              <Button
                variant="secondary"
                size="small"
                type="button"
                onClick={() => onChange({ pairs: pairs.filter((_, j) => j !== i) })}
              >
                ×
              </Button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <Button
          variant="secondary"
          size="small"
          type="button"
          style={{ justifySelf: 'start' }}
          onClick={() => onChange({ pairs: [...pairs, { left: '', right: '' }] })}
        >
          + Ajouter une paire
        </Button>
      )}
    </div>
  );
}

/** Vrai/Faux : une liste d'affirmations, chacune avec sa réponse attendue. */
export function TrueFalseEditor({ settings, readOnly, onChange }) {
  const statements = settings.statements ?? [{ text: '', answer: true }];

  const updateStatement = (index, patch) =>
    onChange({ statements: statements.map((st, i) => (i === index ? { ...st, ...patch } : st)) });

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <strong style={{ fontSize: 13 }}>Affirmations</strong>
      <p className="sub">
        Indiquez pour chaque affirmation la réponse attendue. Le barème de la question est réparti
        également entre les affirmations.
      </p>
      {statements.map((statement, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="sub" style={{ minWidth: 20 }}>{i + 1}.</span>
          <input
            value={statement.text}
            placeholder={`Affirmation ${i + 1}`}
            disabled={readOnly}
            onChange={(e) => updateStatement(i, { text: e.target.value })}
            style={{ flex: 1 }}
          />
          <select
            aria-label={`Réponse attendue pour l'affirmation ${i + 1}`}
            value={statement.answer ? 'true' : 'false'}
            disabled={readOnly}
            onChange={(e) => updateStatement(i, { answer: e.target.value === 'true' })}
            style={{ width: 'auto' }}
          >
            <option value="true">Vrai</option>
            <option value="false">Faux</option>
          </select>
          {statements.length > 1 && !readOnly && (
            <Button
              variant="secondary"
              size="small"
              type="button"
              onClick={() => onChange({ statements: statements.filter((_, j) => j !== i) })}
            >
              ×
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          variant="secondary"
          size="small"
          type="button"
          style={{ justifySelf: 'start' }}
          onClick={() => onChange({ statements: [...statements, { text: '', answer: true }] })}
        >
          + Ajouter une affirmation
        </Button>
      )}
    </div>
  );
}

/**
 * Une question rédigée (définition ou autre). L'enseignant liste ce qu'il
 * accepte ; sans rien lister, la question part en correction manuelle plutôt
 * que d'être comptée fausse.
 */
export function ShortAnswerEditor({ question, readOnly, onChange, id = 'short' }) {
  const accepted = question.accepted ?? [];
  const keywords = Boolean(question.keywords_mode);

  const updateAnswer = (index, value) =>
    onChange({ accepted: accepted.map((a, i) => (i === index ? value : a)) });

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <strong style={{ fontSize: 13 }}>
          {keywords ? 'Mots-clés attendus' : 'Réponses acceptées'}
        </strong>
        <label className="switch" style={{ fontSize: 13, gap: 6, marginLeft: 'auto' }}>
          <input
            type="checkbox"
            checked={keywords}
            disabled={readOnly}
            onChange={(e) => onChange({ keywords_mode: e.target.checked })}
          />
          <span>Noter sur les mots-clés présents</span>
        </label>
      </div>
      <p className="sub">
        {keywords
          ? "Chaque mot-clé retrouvé dans la réponse rapporte une part égale du barème. La casse, les accents et la ponctuation sont ignorés."
          : "La réponse doit correspondre à l'une des formulations listées. La casse, les accents et la ponctuation sont ignorés. Laissez la liste vide pour corriger vous-même cette question."}
      </p>
      {accepted.map((answer, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            value={answer}
            placeholder={keywords ? `Mot-clé ${i + 1}` : `Formulation acceptée ${i + 1}`}
            disabled={readOnly}
            onChange={(e) => updateAnswer(i, e.target.value)}
            style={{ flex: 1 }}
          />
          {!readOnly && (
            <Button
              variant="secondary"
              size="small"
              type="button"
              onClick={() => onChange({ accepted: accepted.filter((_, j) => j !== i) })}
            >
              ×
            </Button>
          )}
        </div>
      ))}
      {accepted.length === 0 && (
        <p className="sub">
          Aucune réponse listée : cette question vous sera signalée pour une correction manuelle.
        </p>
      )}
      <div className="row">
        {!readOnly && (
          <Button
            variant="secondary"
            size="small"
            type="button"
            style={{ alignSelf: 'end' }}
            onClick={() => onChange({ accepted: [...accepted, ''] })}
          >
            {keywords ? '+ Ajouter un mot-clé' : '+ Ajouter une formulation'}
          </Button>
        )}
        <Field label="Lignes de réponse sur le sujet" id={`${id}-rows`}>
          <input
            id={`${id}-rows`}
            type="number"
            min="1"
            max="12"
            value={question.rows ?? 4}
            disabled={readOnly}
            onChange={(e) => onChange({ rows: Number(e.target.value) })}
          />
        </Field>
      </div>
    </div>
  );
}

const EDITORS = { qcm: QcmEditor, matching: MatchingEditor, short: ShortAnswerEditor };

const ADD_LABELS = {
  qcm: '+ Ajouter une question',
  matching: '+ Ajouter une grille',
  short: '+ Ajouter une question',
};

const PROMPT_LABELS = {
  qcm: 'Question posée',
  matching: 'Consigne de la grille',
  short: 'Question posée',
};

/** Résumé d'une question repliée : de quoi la reconnaître sans la déplier. */
function questionSummary(kind, question) {
  const prompt = (question.text ?? '').trim().split('\n')[0];
  const short = prompt.length > 70 ? `${prompt.slice(0, 70)}…` : prompt;
  const counts = {
    qcm: () => `${(question.choices ?? []).length} choix`,
    matching: () => `${(question.pairs ?? []).length} paires`,
    short: () =>
      (question.accepted ?? []).length === 0
        ? 'correction manuelle'
        : `${question.accepted.length} ${question.keywords_mode ? 'mots-clés' : 'formulations'}`,
  };
  return [short || 'Sans intitulé', counts[kind]?.()].filter(Boolean).join(' · ');
}

/**
 * Les questions d'un exercice de QCM, de correspondance ou de question-réponse.
 *
 * Ces exercices n'ont pas d'énoncé unique : chaque question porte le sien, suivi
 * de ses propres réponses. Le barème de l'exercice se partage également entre
 * elles — un exercice de 6 points à trois questions en met 2 sur chacune.
 *
 * Chaque question se replie : passé trois ou quatre questions, la liste dépliée
 * devient plus longue que l'écran et l'on perd de vue l'exercice qu'on écrit.
 * Le repli est un état d'affichage local — il ne touche pas aux données.
 */
export function QuestionListEditor({ kind, settings, readOnly, onChange, name = 'q' }) {
  const questions = questionsOf(kind, settings);
  const [collapsed, setCollapsed] = useState([]);
  const Editor = EDITORS[kind];
  if (!Editor) return null;

  const write = (next) => onChange({ ...settings, questions: next });
  const update = (index, patch) =>
    write(questions.map((question, i) => (i === index ? { ...question, ...patch } : question)));

  const isCollapsed = (index) => Boolean(collapsed[index]);
  const toggle = (index) =>
    setCollapsed((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });

  // Le repli suit la question, pas son rang : retirer la 2e ne doit pas replier la 3e.
  const removeAt = (index) => {
    write(questions.filter((_, i) => i !== index));
    setCollapsed((prev) => prev.filter((_, i) => i !== index));
  };

  const addQuestion = () => {
    write([...questions, blankQuestion(kind)]);
    setCollapsed((prev) => {
      const next = [...prev];
      next[questions.length] = false; // la nouvelle question s'ouvre pour être remplie
      return next;
    });
  };

  const allCollapsed = questions.length > 0 && questions.every((_, i) => isCollapsed(i));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>
          {questions.length > 1 ? `${questions.length} questions` : 'Question'}
        </strong>
        <span className="sub" style={{ marginLeft: 'auto' }}>
          {questions.length > 1
            ? 'Le barème de l’exercice se partage également entre les questions.'
            : 'Ajoutez-en autant que vous voulez : elles se partageront le barème.'}
        </span>
        {questions.length > 1 && (
          <Button
            variant="secondary"
            size="small"
            type="button"
            onClick={() => setCollapsed(allCollapsed ? [] : questions.map(() => true))}
          >
            {allCollapsed ? 'Tout déplier' : 'Tout replier'}
          </Button>
        )}
      </div>

      {questions.map((question, index) => (
        <div key={index} className="card" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => toggle(index)}
              aria-expanded={!isCollapsed(index)}
              title={isCollapsed(index) ? 'Déplier la question' : 'Replier la question'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flex: 1,
                minWidth: 0,
                background: 'none',
                border: 0,
                padding: 0,
                margin: 0,
                font: 'inherit',
                color: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {/* Le point de dépliement : une pastille colorée, assez visible pour
                  qu'on comprenne au premier coup d'œil que la question s'ouvre. */}
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none',
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  fontSize: 12,
                  lineHeight: 1,
                  color: 'var(--primary)',
                  background: 'var(--bg-nav-active)',
                  border: '1px solid var(--primary)',
                }}
              >
                {isCollapsed(index) ? '▸' : '▾'}
              </span>
              <strong style={{ fontSize: 13, color: 'var(--primary)' }}>
                Question {index + 1}
              </strong>
              {isCollapsed(index) && (
                <span
                  className="sub"
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {questionSummary(kind, question)}
                </span>
              )}
            </button>
            {questions.length > 1 && !readOnly && (
              <Button
                variant="secondary"
                size="small"
                type="button"
                onClick={() => removeAt(index)}
              >
                Retirer
              </Button>
            )}
          </div>

          {!isCollapsed(index) && (
            <>
              <Field label={PROMPT_LABELS[kind]} id={`${name}-prompt-${index}`}>
                <textarea
                  id={`${name}-prompt-${index}`}
                  rows={2}
                  value={question.text ?? ''}
                  disabled={readOnly}
                  onChange={(e) => update(index, { text: e.target.value })}
                />
              </Field>

              <Editor
                question={question}
                readOnly={readOnly}
                name={`${name}-${index}`}
                id={`${name}-${index}`}
                onChange={(patch) => update(index, patch)}
              />
            </>
          )}
        </div>
      ))}

      {!readOnly && (
        <Button
          variant="secondary"
          size="small"
          type="button"
          style={{ justifySelf: 'start' }}
          onClick={addQuestion}
        >
          {ADD_LABELS[kind]}
        </Button>
      )}
    </div>
  );
}
