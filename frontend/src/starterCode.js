/**
 * Squelettes de départ proposés à l'apprenant.
 *
 * L'ossature du langage (le `main`, le `return 0`) n'est pas ce que l'évaluation
 * mesure : on la pose d'office pour que personne ne perde du temps d'épreuve à la
 * retaper. L'enseignant reste libre de la remplacer par son propre énoncé de code.
 * Ces modèles doivent rester identiques à ceux du serveur
 * (`backend/app/grading/languages.py`).
 */

const STARTER_CODE = {
  c: `#include <stdio.h>

int main(void)
{
    /* Écrivez votre programme ici */

    return 0;
}
`,
  cpp: `#include <iostream>

int main()
{
    // Écrivez votre programme ici

    return 0;
}
`,
  python: `def main():
    # Écrivez votre programme ici
    pass


if __name__ == "__main__":
    main()
`,
};

/** Squelette d'un langage : vide pour les questions qui ne se programment pas. */
export function defaultStarter(language, kind = 'code') {
  if (kind !== 'code') return '';
  return STARTER_CODE[language] ?? '';
}

/**
 * Vrai si le contenu est encore un squelette non modifié : on peut alors le
 * remplacer sans détruire le travail de l'enseignant.
 */
export function isUntouchedStarter(code) {
  if (!code || !code.trim()) return true;
  return Object.values(STARTER_CODE).some((template) => template.trim() === code.trim());
}
