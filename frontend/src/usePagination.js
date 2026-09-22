import { useState } from 'react';

/**
 * Découpe en pages une liste déjà chargée en entier. Passer `resetKey` (un
 * filtre, un tri, une recherche) ramène à la première page quand il change.
 * La page courante reste bornée : une liste qui rétrécit ne montre jamais une
 * page vide.
 */
export function usePagination(items, pageSize = 20, resetKey = null) {
  const [page, setPage] = useState(1);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setPage(1);
  }
  const list = items ?? [];
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const current = Math.min(page, pages);
  return {
    pageItems: list.slice((current - 1) * pageSize, current * pageSize),
    pager: { page: current, pageSize, total: list.length, onChange: setPage },
  };
}
