import { useNavigate } from 'react-router-dom';
import { useClassrooms } from '../../api/hooks';
import { Alert, EmptyState, Loading, PageHeader } from '../../components/ui';
import { IconClasses, IconChevronRight, IconUsers } from '../../components/icons';

export default function ClassesPage() {
  const navigate = useNavigate();
  const classrooms = useClassrooms();

  if (classrooms.isPending) return <Loading />;

  return (
    <>
      <PageHeader breadcrumb="Espace enseignant" title="Mes classes" />
      <div className="content">
        {classrooms.error && <Alert>{classrooms.error.message}</Alert>}
        {classrooms.data?.length === 0 && (
          <EmptyState title="Aucune classe">
            Les classes et leurs effectifs sont préparés à l'ouverture de l'année.
          </EmptyState>
        )}
        <div className="class-grid">
          {(classrooms.data ?? []).map((classroom) => (
            <button
              key={classroom.id}
              type="button"
              className="class-card"
              onClick={() => navigate(`/classes/${classroom.id}`)}
            >
              <div className="class-card-icon">
                <IconClasses />
              </div>
              <div className="class-card-body">
                <div className="class-card-level">{classroom.level ?? 'Classe'}</div>
                <h3>{classroom.name}</h3>
                <div className="class-card-meta">
                  <IconUsers /> {classroom.students_count} apprenants
                </div>
              </div>
              <span className="class-card-arrow">
                <IconChevronRight />
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
