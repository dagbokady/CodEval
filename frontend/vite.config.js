import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Pages publiques proposées aux moteurs de recherche. Le reste de l'application
// demande une connexion : il n'a rien à faire dans les résultats.
const PUBLIC_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/inscription', priority: '0.8', changefreq: 'monthly' },
  { path: '/rejoindre', priority: '0.8', changefreq: 'monthly' },
  { path: '/connexion', priority: '0.5', changefreq: 'monthly' },
]

// Espaces privés : les moteurs n'y verraient qu'une redirection vers la connexion.
const PRIVATE_PREFIXES = [
  '/accueil', '/admin', '/banque', '/classes', '/communaute', '/epreuve', '/evaluations',
  '/matieres', '/mes-evaluations', '/mes-resultats', '/parametres', '/statistiques',
  '/reset-password', '/rejoindre/lien/',
]

/** Écrit sitemap.xml et robots.txt au build, avec l'adresse publique du site. */
function seoFiles(siteUrl) {
  return {
    name: 'codeval-seo-files',
    apply: 'build',
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10)
      const urls = PUBLIC_PAGES.map(
        (p) => `  <url>
    <loc>${siteUrl}${p.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
      ).join('\n')
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
      })
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *
Allow: /
${PRIVATE_PREFIXES.map((p) => `Disallow: ${p}`).join('\n')}

Sitemap: ${siteUrl}/sitemap.xml
`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = (env.VITE_SITE_URL || 'http://localhost:5173').replace(/\/+$/, '')
  if (mode === 'production' && !env.VITE_SITE_URL) {
    console.warn(
      '\n[codeval] VITE_SITE_URL absent : sitemap, lien canonique et partages pointeront vers localhost.\n',
    )
  }
  // index.html lit %VITE_SITE_URL% : on y pose la valeur nettoyée.
  process.env.VITE_SITE_URL = siteUrl
  return {
    plugins: [react(), seoFiles(siteUrl)],
  }
})
