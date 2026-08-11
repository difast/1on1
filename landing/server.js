const http = require('http')
const fs = require('fs')
const path = require('path')

const port = process.env.PORT || 3000

// Clean-URL routes → html files
const routes = {
  '/': 'index.html',
  '/features': 'features.html',
  '/pit': 'pit.html',
  '/tasks': 'tasks.html',
  '/analytics': 'analytics.html',
  '/faq': 'faq.html',
  // /about теперь ведёт на страницу компании; старый about.html («О продукте»)
  // оставлен в репозитории, но скрыт (без ссылок и без чистого маршрута).
  '/about': 'about-company.html',
  '/blog': 'blog.html',
  '/blog/what-is-oneonone': 'blog-what-is-oneonone.html',
  '/blog/effective-1-on-1': 'blog-effective-1-on-1.html',
  '/blog/ai-in-management': 'blog-ai-in-management.html',
  '/press': 'press.html',
  '/docs': 'docs.html',
  '/pricing': 'pricing.html',
  '/documents': 'documents.html',
  '/security': 'security.html',
}

// Абсолютный origin публичного сайта (без личного кабинета app.oneononehq.com).
const SITE_ORIGIN = 'https://oneononehq.com'

// Подсказки для sitemap по каждому маршруту. Любой маршрут из routes, которого
// нет здесь, получает значения по умолчанию — поэтому добавление новой публичной
// страницы в routes сразу попадает в sitemap без правок в нескольких местах.
const sitemapMeta = {
  '/': { changefreq: 'weekly', priority: '1.0' },
  '/pricing': { changefreq: 'weekly', priority: '0.9' },
  '/features': { changefreq: 'monthly', priority: '0.8' },
  '/pit': { changefreq: 'monthly', priority: '0.8' },
  '/tasks': { changefreq: 'monthly', priority: '0.7' },
  '/analytics': { changefreq: 'monthly', priority: '0.7' },
  '/about': { changefreq: 'monthly', priority: '0.7' },
  '/docs': { changefreq: 'monthly', priority: '0.7' },
  '/blog': { changefreq: 'weekly', priority: '0.6' },
  '/faq': { changefreq: 'monthly', priority: '0.6' },
  '/press': { changefreq: 'monthly', priority: '0.5' },
  '/documents': { changefreq: 'monthly', priority: '0.4' },
  '/security': { changefreq: 'monthly', priority: '0.5' },
}
const sitemapDefaultMeta = { changefreq: 'monthly', priority: '0.5' }

// Единственный источник правды для sitemap — карта routes выше.
function buildSitemap() {
  const rows = Object.keys(routes).map((p) => {
    const meta = sitemapMeta[p] || sitemapDefaultMeta
    return `  <url><loc>${SITE_ORIGIN}${p}</loc>` +
      `<changefreq>${meta.changefreq}</changefreq>` +
      `<priority>${meta.priority}</priority></url>`
  })
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!-- Автогенерируется из routes в server.js. Все публичные страницы лендинга.\n' +
    '     Личный кабинет (app.oneononehq.com) сюда не входит: он закрыт\n' +
    '     авторизацией и собственным robots.txt. -->\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    rows.join('\n') + '\n</urlset>\n'
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  // robots.txt и llms.txt должны отдаваться как текст, иначе краулер получит
  // application/octet-stream и предложит скачать файл вместо чтения.
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0])

  // Sitemap генерируется динамически из routes — единый источник правды.
  if (urlPath === '/sitemap.xml') {
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' })
    return res.end(buildSitemap())
  }

  // Clean-URL route
  if (routes[urlPath]) {
    const file = path.join(__dirname, routes[urlPath])
    return fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found') }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(data)
    })
  }

  // Static file (css, images, etc.) — restricted to landing dir
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
  const file = path.join(__dirname, safe)
  if (file.startsWith(__dirname) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    const ext = path.extname(file).toLowerCase()
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' })
    return res.end(fs.readFileSync(file))
  }

  // Fallback → landing
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(fs.readFileSync(path.join(__dirname, 'index.html')))
}).listen(port, () => console.log(`Landing running on :${port}`))
