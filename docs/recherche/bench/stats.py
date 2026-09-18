"""Statistiques en Python pur (sans numpy/scipy) : percentiles, IC bootstrap,
ajustement de la loi de passage à l'échelle universelle (USL, Gunther 2007),
test de Mann-Whitney et taille d'effet de Cliff."""
import random, math
def pct(xs, p):
    if not xs: return None
    s = sorted(xs); k = (len(s)-1)*p/100.0; f = math.floor(k); c = math.ceil(k)
    return s[int(k)] if f == c else s[f] + (s[c]-s[f])*(k-f)
def median(xs): return pct(xs, 50)
def mean(xs): return sum(xs)/len(xs) if xs else None
def mad(xs):
    if not xs: return None
    m = median(xs); return median([abs(x-m) for x in xs])
def boot_ci(xs, stat=median, n=4000, alpha=0.05, seed=1):
    if len(xs) < 2: return (None, None)
    r = random.Random(seed); L = len(xs); reps = []
    for _ in range(n): reps.append(stat([xs[r.randrange(L)] for _ in range(L)]))
    return (pct(reps, 100*alpha/2), pct(reps, 100*(1-alpha/2)))
def mannwhitney_u(a, b):
    n1, n2 = len(a), len(b); comb = sorted([(v, 0) for v in a] + [(v, 1) for v in b])
    ranks = [0.0]*len(comb); i = 0
    while i < len(comb):
        j = i
        while j+1 < len(comb) and comb[j+1][0] == comb[i][0]: j += 1
        for k in range(i, j+1): ranks[k] = (i+j)/2.0+1
        i = j+1
    R1 = sum(ranks[k] for k in range(len(comb)) if comb[k][1] == 0)
    U1 = R1 - n1*(n1+1)/2.0; U = min(U1, n1*n2-U1)
    mu = n1*n2/2.0; sig = math.sqrt(n1*n2*(n1+n2+1)/12.0)
    if sig == 0: return U, 1.0
    z = (U-mu)/sig; return U, 2*(1-0.5*(1+math.erf(abs(z)/math.sqrt(2))))
def cliffs_delta(a, b):
    g = l = 0
    for x in a:
        for y in b:
            if x > y: g += 1
            elif x < y: l += 1
    return (g-l)/(len(a)*len(b))
def usl_fit(ns, X):
    """X(N) = lambda*N / (1 + sigma*(N-1) + kappa*N*(N-1)). Recherche des moindres carrés."""
    lam = X[0]/ns[0] if ns[0] else X[0]; best = None
    def sse(lam, sig, kap):
        return sum((x - lam*N/(1+sig*(N-1)+kap*N*(N-1)))**2 for N, x in zip(ns, X))
    for _ in range(6):
        for sig in [i/1000 for i in range(0, 600)]:
            for kap in [i/10000 for i in range(0, 400)]:
                e = sse(lam, sig, kap)
                if best is None or e < best[0]: best = (e, lam, sig, kap)
        _, lam, sig, kap = best
        num = sum(x*(N/(1+sig*(N-1)+kap*N*(N-1))) for N, x in zip(ns, X))
        den = sum((N/(1+sig*(N-1)+kap*N*(N-1)))**2 for N in ns)
        lam = num/den if den else lam; best = (sse(lam, sig, kap), lam, sig, kap)
    e, lam, sig, kap = best
    ybar = mean(X); sstot = sum((x-ybar)**2 for x in X)
    npeak = math.sqrt((1-sig)/kap) if kap > 0 and sig < 1 else float('inf')
    return dict(lam=lam, sigma=sig, kappa=kap, r2=(1-e/sstot if sstot else 0), npeak=npeak)
