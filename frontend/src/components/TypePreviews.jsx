/**
 * Miniatures des types de question, pour le sélecteur de type.
 *
 * Montrer à quoi ressemble un QCM ou une correspondance dit en un coup d'œil ce
 * qu'un paragraphe explique mal. Ce sont des schémas, pas des captures : on y
 * lit la forme (des cases à cocher, deux colonnes reliées, des lignes vierges),
 * jamais un contenu.
 *
 * Tout est tracé avec les jetons de couleur de l'application, donc lisible en
 * thème clair comme en thème sombre.
 */

const VIEWBOX = '0 0 160 96';

const LIGNE = 'var(--border)';
const ENCRE = 'var(--text-faint)';
const ACCENT = 'var(--primary)';

/** Cadre commun : même fond et même respiration pour les six miniatures. */
function Cadre({ children }) {
  return (
    <svg className="type-apercu" viewBox={VIEWBOX} role="presentation" focusable="false">
      <rect x="0" y="0" width="160" height="96" rx="6" fill="var(--bg-subtle)" />
      {children}
    </svg>
  );
}

/** Une proposition ou un intitulé : un simple trait plein, jamais du faux texte. */
function Barre({ x, y, width, actif = false, height = 6 }) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={height / 2}
      fill={actif ? ACCENT : ENCRE}
      opacity={actif ? 0.75 : 0.35}
    />
  );
}

/** QCM : des cases à cocher, dont une retenue. */
function ApercuQcm() {
  const lignes = [26, 46, 66];
  return (
    <Cadre>
      {lignes.map((y, i) => (
        <g key={y}>
          <circle
            cx="24"
            cy={y}
            r="6"
            fill={i === 1 ? ACCENT : 'none'}
            stroke={i === 1 ? ACCENT : LIGNE}
            strokeWidth="2"
          />
          <Barre x={40} y={y - 3} width={i === 1 ? 88 : 72} actif={i === 1} />
        </g>
      ))}
    </Cadre>
  );
}

/** Correspondance : deux colonnes, reliées par des traits dont un se croise. */
function ApercuCorrespondance() {
  const rangs = [26, 48, 70];
  // Un seul croisement suffit à dire « à relier » : trois traits entremêlés ne
  // formeraient qu'un nœud illisible à cette taille.
  const liens = [[0, 1], [1, 0], [2, 2]];
  return (
    <Cadre>
      {rangs.map((y) => (
        <rect key={`g${y}`} x="14" y={y - 7} width="42" height="14" rx="4"
          fill={ENCRE} opacity="0.3" />
      ))}
      {rangs.map((y) => (
        <rect key={`d${y}`} x="104" y={y - 7} width="42" height="14" rx="4"
          fill={ENCRE} opacity="0.3" />
      ))}
      {liens.map(([from, to]) => (
        <line
          key={`${from}-${to}`}
          x1="58"
          y1={rangs[from]}
          x2="102"
          y2={rangs[to]}
          stroke={ACCENT}
          strokeWidth="2"
          opacity="0.8"
        />
      ))}
    </Cadre>
  );
}

/** Vrai/Faux : des affirmations, chacune suivie de ses deux cases. */
function ApercuVraiFaux() {
  const lignes = [
    { y: 26, vrai: true },
    { y: 48, vrai: false },
    { y: 70, vrai: true },
  ];
  return (
    <Cadre>
      {lignes.map(({ y, vrai }) => (
        <g key={y}>
          <Barre x={14} y={y - 3} width={78} />
          {[
            { x: 100, label: 'V', on: vrai },
            { x: 124, label: 'F', on: !vrai },
          ].map(({ x, label, on }) => (
            <g key={label}>
              <rect
                x={x}
                y={y - 8}
                width="18"
                height="16"
                rx="4"
                fill={on ? ACCENT : 'none'}
                stroke={on ? ACCENT : LIGNE}
                strokeWidth="1.5"
              />
              <text
                x={x + 9}
                y={y + 4}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={on ? 'var(--bg-card)' : ENCRE}
              >
                {label}
              </text>
            </g>
          ))}
        </g>
      ))}
    </Cadre>
  );
}

/** Question-réponse : la question, puis les lignes vierges de la copie. */
function ApercuQuestionReponse() {
  return (
    <Cadre>
      <Barre x={14} y={20} width={96} actif height={7} />
      {[44, 58, 72].map((y, i) => (
        <line
          key={y}
          x1="14"
          y1={y}
          x2={i === 2 ? 108 : 146}
          y2={y}
          stroke={LIGNE}
          strokeWidth="1.5"
        />
      ))}
    </Cadre>
  );
}

/** Code : la gouttière de numéros de lignes et un programme indenté. */
function ApercuCode() {
  const lignes = [
    { y: 22, x: 34, width: 74 },
    { y: 38, x: 44, width: 58 },
    { y: 54, x: 44, width: 76 },
    { y: 70, x: 34, width: 40 },
  ];
  return (
    <Cadre>
      <rect x="0" y="0" width="26" height="96" rx="6" fill={ENCRE} opacity="0.12" />
      {lignes.map(({ y, x, width }, i) => (
        <g key={y}>
          <rect x="10" y={y} width="7" height="5" rx="2" fill={ENCRE} opacity="0.4" />
          <Barre x={x} y={y} width={width} actif={i === 0} height={5} />
        </g>
      ))}
    </Cadre>
  );
}

/**
 * Algorithmique : des blocs empilés et imbriqués. Le retrait et la barre
 * d'imbrication le distinguent de l'éditeur de code, qui a lui une gouttière.
 */
function ApercuAlgo() {
  const blocs = [
    { y: 18, x: 14, width: 96, accent: true },
    { y: 40, x: 32, width: 78, accent: false },
    { y: 60, x: 32, width: 64, accent: false },
    { y: 80, x: 14, width: 96, accent: true },
  ];
  return (
    <Cadre>
      {/* La barre qui tient les blocs imbriqués, comme dans l'éditeur en blocs. */}
      <rect x="22" y="32" width="4" height="36" rx="2" fill={ACCENT} opacity="0.45" />
      {blocs.map(({ y, x, width, accent }) => (
        <rect
          key={y}
          x={x}
          y={y - 7}
          width={width}
          height="15"
          rx="4"
          fill={accent ? ACCENT : ENCRE}
          opacity={accent ? 0.6 : 0.32}
        />
      ))}
    </Cadre>
  );
}

const APERCUS = {
  qcm: ApercuQcm,
  matching: ApercuCorrespondance,
  truefalse: ApercuVraiFaux,
  short: ApercuQuestionReponse,
  code: ApercuCode,
  algo: ApercuAlgo,
};

/** Miniature d'un type. Rien n'est dessiné pour un type inconnu. */
export function TypePreview({ kind }) {
  const Apercu = APERCUS[kind];
  return Apercu ? <Apercu /> : null;
}
