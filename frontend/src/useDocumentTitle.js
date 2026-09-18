import { useEffect } from 'react';

/** Titre de l'onglet du navigateur : « Page · CodEval ». */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (typeof title !== 'string' || !title) return undefined;
    const previous = document.title;
    document.title = `${title} · CodEval`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
