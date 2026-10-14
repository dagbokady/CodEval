import sys, pymupdf
D = '/Users/christ-phanuel/Documents/Codeval/'
OUT = sys.argv[1]
SRC = {
  'algo': D + 'DEVOIR 30112024 INITIATION ALGORITHMIQUE.pdf',
  'cdevoir': D + 'DEVOIR C avance DU 27022024.pdf',
  'cexamen': D + 'EXAMEN 2eSESSION C AVANCE MASTER MARS 2025.pdf',
}
# (nom, sujet, page, début, fin) ; None = haut de page ; ('+', texte) = bas du texte
CROPS = [
  ('algo-entete', 'algo', 0, None, 'Exercice 1'),
  ('algo-ex1', 'algo', 0, 'Exercice 1', ('+', 'FIN', 14)),
  ('algo-ex2', 'algo', 1, 'Exercice 2', 'Exercice 3'),
  ('algo-ex3', 'algo', 1, 'Exercice 3', 'Exercice 4'),
  ('algo-ex4', 'algo', 1, 'Exercice 4', ('+', 'était le nombre numéro 3', 12)),
  ('cdevoir-entete', 'cdevoir', 0, None, 'Exercice 1 Question'),
  ('cdevoir-ex1', 'cdevoir', 0, 'Exercice 1 Question', 'Exercice 2 programmation'),
  ('cdevoir-ex2', 'cdevoir', 0, 'Exercice 2 programmation', ('+', 'Bon courage', 6)),
  ('cexamen-entete', 'cexamen', 0, None, 'On se propose'),
  ('cexamen-commun', 'cexamen', 0, 'On se propose', 'EXERCICE 1'),
  ('cexamen-ex1', 'cexamen', 0, 'EXERCICE 1', 'EXERCICE 2'),
  ('cexamen-ex2', 'cexamen', 0, 'EXERCICE 2', ('+', '(03 pts)', 6)),
  ('cexamen-ex3', 'cexamen', 1, 'EXERCICE 3', ('+', 'automatiquement gérées', 8)),
]
docs = {k: pymupdf.open(v) for k, v in SRC.items()}
for name, key, pno, start, end in CROPS:
    page = docs[key][pno]
    W, H = page.rect.width, page.rect.height
    def top(t):
        r = page.search_for(t)
        assert r, (name, t)
        return r[0].y0
    y0 = 18 if start is None else top(start) - 8
    if isinstance(end, tuple):
        r = page.search_for(end[1]); assert r, (name, end)
        y1 = max(x.y1 for x in r if x.y0 >= y0) + end[2]
    else:
        y1 = top(end) - 6
    # Largeur : celle des blocs de texte et des dessins compris dans la bande.
    xs = [b[0] for b in page.get_text('blocks') if b[1] >= y0 - 2 and b[3] <= y1 + 2] + [d['rect'].x0 for d in page.get_drawings() if d['rect'].y0 >= y0 - 2 and d['rect'].y1 <= y1 + 2]
    xe = [b[2] for b in page.get_text('blocks') if b[1] >= y0 - 2 and b[3] <= y1 + 2] + [d['rect'].x1 for d in page.get_drawings() if d['rect'].y0 >= y0 - 2 and d['rect'].y1 <= y1 + 2 and d['rect'].width < W - 20]
    x0 = max(0, min(xs) - 10); x1 = min(W, max(xe) + 10)
    clip = pymupdf.Rect(x0, y0, x1, y1)
    pix = page.get_pixmap(matrix=pymupdf.Matrix(2.6, 2.6), clip=clip)
    pix.save(f'{OUT}/{name}.png')
    print(name, pix.width, pix.height)
