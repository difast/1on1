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
  '/about': 'about.html',
  '/pricing': 'pricing.html',
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0])

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
