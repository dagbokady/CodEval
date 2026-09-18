/**
 * La production de l'apprenant, relue.
 *
 * La même copie est lue deux fois : par l'apprenant sur sa feuille rendue, par
 * l'enseignant sur la feuille corrigée. C'est la même lecture : un QCM se relit
 * par ses choix cochés, une correspondance par ses paires, un algorithme par son
 * pseudo-code : et elle est écrite ici une seule fois. `published` dit si le
 * corrigé peut apparaître à côté de la réponse.
 */

import CodeBlock from './CodeBlock';
import MatchingBoard from './MatchingBoard';
import { hasQuestions } from '../exerciseTypes';
import { answersOf, questionsOf } from '../questions';
import { structFields, typeNotation } from '../algoVocabulary';

function algoDocument(code) {
  const trimmed = (code ?? '').trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.length > 0 && parsed[0]?.type ? { corps: parsed } : null;
    if (parsed && typeof parsed === 'object' && ('corps' in parsed || 'blocs' in parsed)) {
      return { ...parsed, corps: parsed.corps ?? parsed.blocs ?? [] };
    }
  } catch {
    /* pas un algorithme en blocs */
  }
  return null;
}

function commentaire(ligne) {
  const texte = String(ligne?.commentaire ?? '').trim();
  return texte ? ` /* ${texte} */` : '';
}

/** Le corps, relu comme sur le polycopié : mots-clés en capitales, sans point-virgule. */
function algoToText(blocs, indent = 0) {
  const pad = '    '.repeat(indent);
  const lines = [];
  const body = (list) => {
    if (list?.length) lines.push(algoToText(list, indent + 1));
  };
  for (const b of blocs ?? []) {
    if (b.type === 'variable') lines.push(`${pad}${b.nom} ← ${b.valeur || '0'}`);
    else if (b.type === 'lire') lines.push(`${pad}LIRE(${b.cible})`);
    else if (b.type === 'ecrire') lines.push(`${pad}ECRIRE(${b.expression})`);
    else if (b.type === 'affectation') lines.push(`${pad}${b.cible} ← ${b.expression}`);
    else if (b.type === 'retour') lines.push(`${pad}RETOURNE(${b.expression})`);
    else if (b.type === 'tableau') lines.push(`${pad}TABLEAU ${b.nom} DE TAILLE ${b.taille}`);
    else if (b.type === 'pour') {
      lines.push(`${pad}POUR ${b.variable} de ${b.debut} à ${b.fin} par pas de ${b.pas || '1'}`);
      body(b.corps);
      lines.push(`${pad}FINPOUR`);
    } else if (b.type === 'tantque') {
      lines.push(`${pad}TANTQUE ${b.condition} FAIRE`);
      body(b.corps);
      lines.push(`${pad}FINTANTQUE`);
    } else if (b.type === 'repeter') {
      lines.push(`${pad}REPETER`);
      body(b.corps);
      lines.push(`${pad}JUSQU'A ${b.condition}`);
    } else if (b.type === 'si') {
      lines.push(`${pad}SI ${b.condition} ALORS`);
      body(b.alors);
      if (b.sinon?.length) {
        lines.push(`${pad}SINON`);
        body(b.sinon);
      }
      lines.push(`${pad}FINSI`);
    } else if (b.type === 'fonction') {
      const retour = b.typeRetour ? ` :${String(b.typeRetour).toUpperCase()}` : '';
      lines.push(`${pad}FONCTION ${b.nom}(${(b.parametres || []).join(', ')})${retour}`);
      lines.push(`${pad}DEBUT`);
      body(b.corps);
      lines.push(`${pad}FIN`);
      lines.push(`${pad}FINFONCTION`);
    }
  }
  return lines.join('\n');
}

function algoDocumentToText(doc) {
  const lines = [`ALGORITHME ${doc.nom || ''}`.trimEnd()];
  if (doc.constantes?.length) {
    lines.push('    CONSTANTES');
    doc.constantes.forEach((c) => lines.push(`        ${c.nom} = ${c.valeur}${commentaire(c)}`));
  }
  if (doc.types?.length) {
    lines.push('    TYPES');
    doc.types.forEach((t) => {
      lines.push(`        ${t.nom} = STRUCTURE${commentaire(t)}`);
      structFields(t).forEach((c) => lines.push(`            ${c.nom} :${String(c.type).toUpperCase()}`));
      lines.push('        FINSTRUCTURE');
    });
  }
  if (doc.variables?.length) {
    lines.push('    VARIABLES');
    doc.variables.forEach((v) => {
      lines.push(`        ${v.nom} :${typeNotation(v.type ?? 'entier', v)}${commentaire(v)}`);
    });
  }
  lines.push('DEBUT');
  const corps = algoToText(doc.corps, 1);
  if (corps) lines.push(corps);
  lines.push('FIN');
  return lines.join('\n');
}

/** L'algorithme en blocs est stocké en JSON : on le relit en pseudo-code. */
function readableAnswer(code) {
  const doc = algoDocument(code);
  if (!doc) return code;
  try {
    return algoDocumentToText(doc);
  } catch {
    return code;
  }
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

/** Réponses cochées à une question de QCM, avec la correction quand elle est publiée. */
function QcmAnswer({ question, given, published }) {
  const choices = question.choices ?? [];
  const selected = given?.selected ?? [];

  if (choices.length === 0) {
    return <p className="copy-empty">Aucun choix enregistré pour cette question.</p>;
  }
  return (
    <ul className="copy-choices">
      {choices.map((choice, index) => {
        const chosen = selected.includes(index);
        const correct = published ? Boolean(choice.correct) : null;
        const tone =
          correct === null ? '' : correct ? 'copy-choice--correct' : chosen ? 'copy-choice--wrong' : '';
        return (
          <li key={index} className={`copy-choice ${chosen ? 'copy-choice--chosen' : ''} ${tone}`.trim()}>
            <span className="copy-choice-mark" aria-hidden="true">{chosen ? '✕' : ''}</span>
            <span>{choice.text}</span>
            {published && correct && <span className="copy-choice-tag">bonne réponse</span>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Associations relues par le serveur : l'apprenant a répondu par jetons opaques,
 * seul le serveur sait ce qu'il a relié. La paire attendue n'apparaît qu'après
 * publication.
 *
 * On relit la copie comme elle a été composée : deux blocs, et les traits que
 * l'apprenant a tirés : vert quand la paire tient, rouge barré sinon. La liste
 * détaillée reste dessous pour ce qu'un trait ne dit pas : ce qui était attendu.
 */
function MatchingAnswer({ rows }) {
  if (rows.length === 0) {
    return <p className="copy-empty">Aucune paire enregistrée pour cette question.</p>;
  }

  /* Le bloc de droite se reconstitue depuis la copie : ce que l'apprenant a
     relié, plus ce qui était attendu quand la correction est publiée. */
  const droite = [];
  const clés = new Map();
  const inscrire = (texte) => {
    if (!texte || clés.has(texte)) return;
    const clé = `r${droite.length}`;
    clés.set(texte, clé);
    droite.push({ key: clé, text: texte });
  };
  rows.forEach((row) => inscrire(row.expected));
  rows.forEach((row) => inscrire(row.chosen));

  const links = {};
  rows.forEach((row, index) => {
    if (row.chosen && clés.has(row.chosen)) links[String(index)] = clés.get(row.chosen);
  });

  const teinte = (clé) => {
    const row = rows[Number(clé)];
    if (!row || row.correct === null || row.correct === undefined) return null;
    return row.correct ? 'correct' : 'wrong';
  };

  return (
    <>
      <MatchingBoard
        left={rows.map((row, index) => ({ key: String(index), text: row.left }))}
        right={droite}
        links={links}
        tone={teinte}
        readOnly
        ariaLabel="Correspondances établies"
      />
      <ul className="copy-pairs">
        {rows.map((row, index) => (
          <li
            key={index}
            className={
              row.correct === null || row.correct === undefined
                ? ''
                : row.correct
                  ? 'copy-pair--correct'
                  : 'copy-pair--wrong'
            }
          >
            <span>{row.left}</span>
            <span aria-hidden="true">→</span>
            <span>{row.chosen ?? <em className="sub">non reliée</em>}</span>
            {row.correct === false && row.expected && (
              <span className="copy-pair-expected">attendu : {row.expected}</span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Vrai/Faux : ce que l'apprenant a coché, et la réponse attendue une fois publiée. */
function TrueFalseAnswer({ sheet, published }) {
  const statements = sheet.settings?.statements ?? [];
  const answers = parseJson(sheet.answer, {}).answers ?? {};

  if (statements.length === 0) {
    return <p className="copy-empty">Aucune affirmation enregistrée pour cette question.</p>;
  }
  return (
    <ul className="copy-pairs">
      {statements.map((statement, index) => {
        const chosen = answers[String(index)];
        const expected = published ? Boolean(statement.answer) : null;
        const correct = expected === null || chosen === undefined ? null : chosen === expected;
        return (
          <li
            key={index}
            className={correct === null ? '' : correct ? 'copy-pair--correct' : 'copy-pair--wrong'}
          >
            <span>{statement.text}</span>
            <span aria-hidden="true">→</span>
            <span>
              {chosen === undefined ? <em className="sub">sans réponse</em> : chosen ? 'Vrai' : 'Faux'}
            </span>
            {correct === false && (
              <span className="copy-pair-expected">attendu : {expected ? 'Vrai' : 'Faux'}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Un exercice à plusieurs questions se relit question par question. */
function QuestionsAnswer({ sheet, published }) {
  const questions = questionsOf(sheet.kind, sheet.settings);
  const given = answersOf(sheet.kind, sheet.answer, questions.length);
  const matches = sheet.matches ?? [];

  return (
    <ol className="copy-questions">
      {questions.map((question, rank) => (
        <li key={rank}>
          <p className="copy-question-enonce">
            <span className="copy-question-num">Q{rank + 1}.</span>{' '}
            {question.text || <em className="sub">(question sans énoncé)</em>}
          </p>
          {sheet.kind === 'qcm' && (
            <QcmAnswer question={question} given={given[rank]} published={published} />
          )}
          {sheet.kind === 'matching' && (
            <MatchingAnswer rows={matches.filter((row) => (row.question ?? 1) === rank + 1)} />
          )}
          {sheet.kind === 'short' &&
            (given[rank]?.text?.trim() ? (
              <p className="copy-texte">{given[rank].text}</p>
            ) : (
              <p className="copy-empty">Aucune réponse rédigée pour cette question.</p>
            ))}
        </li>
      ))}
    </ol>
  );
}

/**
 * `sheet` : { kind, settings, answer, language, matches }. La même forme des
 * deux côtés : l'appelant compose l'objet, ce composant ne connaît que la copie.
 */
export default function AnswerBlock({ sheet, published }) {
  if (hasQuestions(sheet.kind)) return <QuestionsAnswer sheet={sheet} published={published} />;
  if (sheet.kind === 'truefalse') return <TrueFalseAnswer sheet={sheet} published={published} />;
  if (!sheet.answer?.trim()) {
    return <p className="copy-empty">Aucune production enregistrée pour cette question.</p>;
  }
  return (
    <CodeBlock
      className="copy-code"
      code={readableAnswer(sheet.answer)}
      language={sheet.kind === 'algo' ? 'algo' : sheet.language}
    />
  );
}
