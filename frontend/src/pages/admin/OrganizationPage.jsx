import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import { useOrganization } from '../../api/admin';
import { Alert, Button, Field, Loading, PageHeader } from '../../components/ui';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Identité de l'établissement. Le nom apparaît sur chaque page et chaque sujet imprimé. */
export default function OrganizationPage() {
  const organization = useOrganization();
  if (organization.isPending) return <Loading />;
  return (
    <>
      <PageHeader breadcrumb={<Link to="/admin">Administration</Link>} title="Établissement" />
      <div className="content">
        <Alert>{organization.error?.message}</Alert>
        {organization.data && <OrganizationForm org={organization.data} />}
      </div>
    </>
  );
}

function OrganizationForm({ org }) {
  const [name, setName] = useState(org.name);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const save = useAction(
    (body) => api('/api/admin/organization', { method: 'PATCH', body }),
    [['admin']],
  );

  async function submit(event) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync({ name: name.trim() });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <Alert>{error}</Alert>
      {saved && (
        <Alert tone="success">
          Nom enregistré. Il s'affichera partout après la prochaine connexion de chacun.
        </Alert>
      )}
      <form className="card" style={{ maxWidth: 560 }} onSubmit={submit}>
        <Field label="Nom de l'établissement" id="o-name">
          <input
            id="o-name"
            required
            minLength={2}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
        </Field>
        <Field label="Identifiant" id="o-slug" hint="Fixé à la création, il ne change pas.">
          <input id="o-slug" value={org.slug} disabled readOnly />
        </Field>
        {org.created_at && (
          <p className="sub" style={{ marginBottom: 16 }}>
            Créé le {dateFmt.format(new Date(org.created_at))}
          </p>
        )}
        <Button type="submit" disabled={save.isPending || name.trim() === org.name}>
          Enregistrer
        </Button>
      </form>
    </>
  );
}
