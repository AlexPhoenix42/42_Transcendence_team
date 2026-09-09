/**
 * Dev server with live reload.
 *
 * Same static serving as `scripts/server.js` dev mode (public/ then src/ then
 * the root *.html files), plus:
 *  - an SSE endpoint at /__livereload
 *  - a tiny client script injected into every HTML response that listens on it
 *  - a watcher on src/ and the root *.html files that pings the browser on change
 *
 *   node scripts/dev-server.js       # http://localhost:3000
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import sirv from 'sirv';

const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();

const RELOAD_SNIPPET =
    '<script>(function(){var s=new EventSource("/__livereload");' +
    's.onmessage=function(){location.reload()};' +
    's.onerror=function(){setTimeout(function(){location.reload()},1500)};})();</script>';

const clients = new Set();
function notifyReload() {
    for (const res of clients) res.write('data: reload\n\n');
}

// Debounced watcher. `fs.watch` recursive is not available on Linux/Node 18,
// so we walk the tree and watch each directory individually.
let timer = null;
function bump() {
    clearTimeout(timer);
    timer = setTimeout(() => {
        console.log('  ↻ changement détecté, reload');
        notifyReload();
    }, 120);
}

function watchDir(dir) {
    try {
        fs.watch(dir, bump);
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory() && entry.name !== 'node_modules') {
                watchDir(path.join(dir, entry.name));
            }
        }
    } catch (e) {
        // directory vanished / unreadable - ignore
    }
}
watchDir(path.join(ROOT, 'src'));

// root *.html
for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.html')) fs.watchFile(path.join(ROOT, f), { interval: 300 }, bump);
}

const serveRootHtml = sirv(ROOT, { dev: true, extensions: ['html'] });
const servePublic = sirv('public', { dev: true });
const serveSrc = sirv('src', { dev: true });

const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];

    if (url === '/__livereload') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
        });
        res.write('\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
    }

    // `/game` -> the actual game page (src/index.html). Keeps the lobby's
    // redirect URL clean (`/game?room=...&role=...`) instead of `src/index.html`.
    if (url === '/game') {
        const full = path.join(ROOT, 'src', 'index.html');
        let html = fs.readFileSync(full, 'utf8');
        html = html.replace('</body>', RELOAD_SNIPPET + '</body>');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
        return;
    }

    // Serve root-level *.html (index.html, lobby.html, ...) with the snippet.
    if (url === '/' || url.endsWith('.html')) {
        const file = url === '/' ? 'index.html' : url.slice(1);
        const full = path.join(ROOT, file);
        if (fs.existsSync(full)) {
            let html = fs.readFileSync(full, 'utf8');
            html = html.includes('</body>')
                ? html.replace('</body>', RELOAD_SNIPPET + '</body>')
                : html + RELOAD_SNIPPET;
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(html);
            return;
        }
    }

    // Everything else: public/ then src/ then root.
    servePublic(req, res, () => serveSrc(req, res, () => serveRootHtml(req, res, () => {
        res.statusCode = 404;
        res.end('Not found');
    })));
});

server.listen(PORT, () => {
    console.log(`\n🎮 dev-server (live reload) : http://localhost:${PORT}\n`);
});
