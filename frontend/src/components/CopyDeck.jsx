/**
 * La pile de copies corrigées : les feuilles sont posées côte à côte sur le
 * bureau, on les fait défiler au doigt ou à la souris, et on en ouvre une d'un
 * clic. C'est le geste réel d'un enseignant qui reprend son paquet — pas une
 * ligne de tableau de plus.
 *
 * La note est écrite sur la feuille, au stylo rouge, comme elle le sera sur la
 * copie ouverte : la vignette et la copie disent la même chose.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import GradeMark from './GradeMark';

/** Les réglures de la feuille portent le relevé : au minimum quatre lignes. */
const LIGNES_MIN = 4;
const LIGNES_MAX = 6;

/** 3.5 → « 3,5 » : sur une copie française, la note s'écrit à la virgule. */
function chiffre(valeur) {
  if (valeur === null || valeur === undefined) return '—';
  return String(Math.round(valeur * 100) / 100).replace('.', ',');
}

/**
 * Le relevé écrit sur les réglures : « Exercice 1 : 0/4 ».
 *
 * C'est ce qu'on cherche en reprenant une copie sans l'ouvrir — non pas
 * seulement le total, mais où les points sont partis. Les lignes vides
 * complètent la feuille pour qu'elle garde sa hauteur dans le paquet.
 */
function Releve({ lignes }) {
  const relevé = (lignes ?? []).slice(0, LIGNES_MAX);
  const vides = Math.max(0, LIGNES_MIN - relevé.length);
  const reste = (lignes ?? []).length - relevé.length;

  return (
    <ul className="copie-feuille-reglure">
      {relevé.map((ligne, rang) => (
        <li key={ligne.label ?? rang} className="copie-feuille-ligne">
          <span className="copie-feuille-ligne-nom" title={ligne.title}>
            {ligne.label}
          </span>
          <span className="copie-feuille-ligne-note">
            {chiffre(ligne.score)}/{chiffre(ligne.max_score)}
          </span>
        </li>
      ))}
      {reste > 0 && (
        <li className="copie-feuille-ligne copie-feuille-ligne--suite">
          <span className="copie-feuille-ligne-nom">
            + {reste} autre{reste > 1 ? 's' : ''} exercice{reste > 1 ? 's' : ''}
          </span>
        </li>
      )}
      {Array.from({ length: vides }, (_, rang) => (
        <li key={`vide-${rang}`} className="copie-feuille-ligne" aria-hidden="true" />
      ))}
    </ul>
  );
}

/** Au-delà de ce déplacement, le geste était un balayage : le clic ne compte plus. */
const SEUIL_GLISSE = 6;

/**
 * Chaque copie se décrit ainsi :
 *   { id, heading, fields: [[intitulé, valeur], …], score, total, pending, meta }
 * — `heading` nomme la feuille (le nom du candidat pour l'enseignant, le titre
 * de l'épreuve pour l'apprenant), `fields` porte les deux ou trois mentions
 * qu'on lit sans ouvrir la copie.
 */
export default function CopyDeck({
  copies,
  organization,
  overline,
  onOpen,
  openLabel = 'Ouvrir la copie',
  emptyLabel = 'Aucune copie à afficher.',
}) {
  const piste = useRef(null);
  const glisse = useRef(null);
  const [index, setIndex] = useState(0);

  /** La feuille la plus proche du centre : c'est celle que l'on regarde. */
  const relire = useCallback(() => {
    const zone = piste.current;
    if (!zone) return;
    const centre = zone.scrollLeft + zone.clientWidth / 2;
    let proche = 0;
    let ecart = Infinity;
    Array.from(zone.children).forEach((feuille, rang) => {
      const milieu = feuille.offsetLeft + feuille.offsetWidth / 2;
      if (Math.abs(milieu - centre) < ecart) {
        ecart = Math.abs(milieu - centre);
        proche = rang;
      }
    });
    setIndex(proche);
  }, []);

  useEffect(() => {
    const zone = piste.current;
    if (!zone) return undefined;
    let attente = 0;
    const surDefilement = () => {
      cancelAnimationFrame(attente);
      attente = requestAnimationFrame(relire);
    };
    zone.addEventListener('scroll', surDefilement, { passive: true });
    return () => {
      cancelAnimationFrame(attente);
      zone.removeEventListener('scroll', surDefilement);
    };
  }, [relire]);

  const allerA = useCallback((rang) => {
    const zone = piste.current;
    if (!zone) return;
    const cible = zone.children[Math.max(0, Math.min(rang, zone.children.length - 1))];
    cible?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, []);

  function surTouche(event) {
    if (event.key === 'ArrowRight') { event.preventDefault(); allerA(index + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); allerA(index - 1); }
    else if (event.key === 'Home') { event.preventDefault(); allerA(0); }
    else if (event.key === 'End') { event.preventDefault(); allerA(copies.length - 1); }
  }

  /* Balayage à la souris : le doigt le fait nativement, le pointeur non. */
  function surPointeur(event) {
    if (event.pointerType === 'touch') return;
    const zone = piste.current;
    if (!zone) return;
    glisse.current = { x: event.clientX, depart: zone.scrollLeft, parcouru: 0 };
  }

  function surDeplacement(event) {
    const etat = glisse.current;
    const zone = piste.current;
    if (!etat || !zone) return;
    const dx = event.clientX - etat.x;
    etat.parcouru = Math.max(etat.parcouru, Math.abs(dx));
    if (etat.parcouru > SEUIL_GLISSE) zone.scrollLeft = etat.depart - dx;
  }

  function finGlisse() {
    const etat = glisse.current;
    if (etat && etat.parcouru > SEUIL_GLISSE) {
      // Le clic qui suit un balayage ouvrirait une copie qu'on ne visait pas.
      glisse.current = { ...etat, avale: true };
      setTimeout(() => { glisse.current = null; }, 0);
      return;
    }
    glisse.current = null;
  }

  function ouvrir(copie) {
    if (glisse.current?.avale) return;
    onOpen?.(copie);
  }

  if (copies.length === 0) {
    return <p className="copies-deck-vide sub">{emptyLabel}</p>;
  }

  return (
    <div className="copies-deck">
      <div className="copies-deck-barre">
        <span className="copies-deck-compteur">
          Copie {Math.min(index + 1, copies.length)} sur {copies.length}
        </span>
        <span className="sub copies-deck-aide">
          {overline ?? 'Balayez les feuilles, cliquez pour ouvrir'}
        </span>
        <div className="copies-deck-fleches">
          <button
            type="button"
            className="copies-deck-fleche"
            aria-label="Copie précédente"
            disabled={index === 0}
            onClick={() => allerA(index - 1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="copies-deck-fleche"
            aria-label="Copie suivante"
            disabled={index >= copies.length - 1}
            onClick={() => allerA(index + 1)}
          >
            ›
          </button>
        </div>
      </div>

      <div
        className="copies-deck-piste"
        ref={piste}
        tabIndex={0}
        role="group"
        aria-label="Copies corrigées"
        onKeyDown={surTouche}
        onPointerDown={surPointeur}
        onPointerMove={surDeplacement}
        onPointerUp={finGlisse}
        onPointerCancel={finGlisse}
        onPointerLeave={finGlisse}
      >
        {copies.map((copie, rang) => (
          <article
            key={copie.id}
            className={`copie-feuille ${rang === index ? 'copie-feuille--active' : ''}`.trim()}
            aria-current={rang === index ? 'true' : undefined}
            onClick={() => ouvrir(copie)}
          >
            <header className="copie-feuille-entete">
              <span className="copie-feuille-eta">{organization ?? 'CodEval'}</span>
              <span className="copie-feuille-eval">{copie.heading}</span>
            </header>

            <div className="copie-feuille-corps">
              <dl className="copie-feuille-identite">
                {(copie.fields ?? []).map(([intitule, valeur]) => (
                  <div key={intitule} className="copie-feuille-mention">
                    <dt>{intitule}</dt>
                    <dd>{valeur ?? '—'}</dd>
                  </div>
                ))}
              </dl>
              <GradeMark
                score={copie.score}
                total={copie.total}
                size="sm"
                pending={copie.pending || copie.score === null || copie.score === undefined}
                label={`${copie.heading} — ${
                  !copie.pending && copie.score !== null && copie.score !== undefined
                    ? `${copie.score} sur ${copie.total}`
                    : 'non notée'
                }`}
              />
            </div>

            <Releve lignes={copie.lines} />

            <footer className="copie-feuille-pied">
              <span className="copie-feuille-meta">{copie.meta}</span>
              <button
                type="button"
                className="btn small"
                onClick={(event) => { event.stopPropagation(); ouvrir(copie); }}
              >
                {openLabel}
              </button>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
