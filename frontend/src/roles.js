const LABELS = {
  admin: { F: 'Administratrice', M: 'Administrateur' },
  teacher: { F: 'Enseignante', M: 'Enseignant' },
  student: { F: 'Étudiante', M: 'Étudiant' },
};

/** Le rôle accordé au sexe de la personne ; au masculin si on ne le connaît pas. */
export function roleLabel(role, gender) {
  const forms = LABELS[role];
  if (!forms) return role;
  return gender === 'F' ? forms.F : forms.M;
}
