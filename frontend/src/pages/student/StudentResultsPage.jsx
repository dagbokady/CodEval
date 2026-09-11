import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMyResults } from '../../api/hooks';
import { Alert, EmptyState, Loading, PageHeader } from '../../components/ui';
import CopyDeck from '../../components/CopyDeck';
import { useAuth } from '../../auth';
import { formatDateTime } from '../../format';

const TOUTES = '__toutes__';

export default function StudentResultsPage() {
  const navigate = useNavigate();
  const { organization } = useAuth();
  const results = useMyResults();
  /* Un apprenant ne relit pas « toutes ses copies » : il relit celles d'une
     matière — l'algorithmique avant le partiel d'algorithmique. */
  const [matiere, setMatiere] = useState(TOUTES);

  const items = useMemo(() => results.data ?? [], [results.data]);
  const matieres = useMemo(() => {
    const noms = new Set();
    items.forEach((result) => noms.add(result.subject_name || 'Sans matière'));
    return [...noms].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [items]);

  if (results.isPending) return <Loading />;

  const retenues =
    matiere === TOUTES
      ? items
      : items.filter((result) => (result.subject_name || 'Sans matière') === matiere);

  return (
    <>
      <PageHeader breadcrumb="Espace apprenant" title="Mes résultats" />

      {matieres.length > 1 && (
        <div className="chip-bar">
          <span className="label">Matière :</span>
          <button
            type="button"
            className="chip"
            aria-pressed={matiere === TOUTES}
            onClick={() => setMatiere(TOUTES)}
          >
            Toutes ({items.length})
          </button>
          {matieres.map((nom) => (
            <button
              key={nom}
              type="button"
              className="chip"
              aria-pressed={matiere === nom}
              onClick={() => setMatiere(nom)}
            >
              {nom} (
              {items.filter((r) => (r.subject_name || 'Sans matière') === nom).length})
            </button>
          ))}
        </div>
      )}

      <div className="content">
        {results.error && <Alert>{results.error.message}</Alert>}

        {items.length === 0 ? (
          <EmptyState title="Aucune copie disponible">
            Vos copies apparaîtront ici dès la fin de votre première épreuve. La note et les
            appréciations s'y ajouteront une fois la correction publiée par votre enseignant.
          </EmptyState>
        ) : (
          /* Mes copies, comme le paquet que l'enseignant reprend : on les
             feuillette, et chacune porte déjà sa note au stylo rouge. */
          <CopyDeck
            copies={retenues.map((result) => ({
              id: result.evaluation_id,
              heading: result.title,
              fields: [
                ['Matière', result.subject_name],
                ['Date', formatDateTime(result.date)],
              ],
              score: result.score,
              total: result.total_points,
              pending: !result.published,
              lines: result.lines ?? [],
              meta: result.status,
            }))}
            organization={organization}
            overline="Balayez vos copies, cliquez pour l'ouvrir"
            openLabel="Voir ma copie"
            emptyLabel="Aucune copie dans cette matière."
            onOpen={(copie) => navigate(`/mes-resultats/${copie.id}`)}
          />
        )}
      </div>
    </>
  );
}
