import { defineConfig }		from 'vite'
import react				from '@vitejs/plugin-react'
import tailwindcss			from '@tailwindcss/vite'
import { execSync }			from 'child_process'


//export default defineConfig({
//    plugins: [react(), tailwindcss()],
//    server: {
//        host: '0.0.0.0',
//        port: 3000,
//        allowedHosts: [
//            "10.3.1.4.nip.io",
//            ".nip.io",
//            "mi-r1-p4",
//            "localhost",
//            "127.0.0.1"
//        ],
//        proxy: {
//            '/api': {
//                target: 'http://localhost:9000',
//                changeOrigin: true,
//            },
//            '/media': {
//                target: 'http://localhost:9000',
//                changeOrigin: true,
//            },
//            '/ws': {
//                target: 'http://localhost:9000',
//                ws: true,
//				ChangeOrigin: true,
//            },
//        },
//    },
//})

//const IP = execSync("hostname -I | awk '{print $1}'").toString().trim()
//const DOMAIN = `${IP}.nip.io`
const DOMAIN = "10.3.1.4.nip.io"

// ── Env-driven, so one config serves both the lab machine and localhost ──
// Defaults are exactly the previous hard-coded values, so anyone who sets
// no environment variables sees no change at all.
//
//   VITE_PROXY_TARGET   where /api, /media and /ws are proxied
//   VITE_ALLOWED_HOSTS  extra comma-separated hostnames to accept
//
// docker-compose-local.yml sets the target to http://trans_backend_django:9000
// — the compose service name, because "localhost" inside that container is
// the container itself, not Django.
const PROXY_TARGET = process.env.VITE_PROXY_TARGET || `http://${DOMAIN}:9000`

const EXTRA_HOSTS = (process.env.VITE_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        host: '0.0.0.0',
        port: 3000,
        allowedHosts: [
            "10.3.1.4.nip.io",
            ".nip.io",          // all nip.io subdomains
            "mi-r1-p4",
            "100.103.253.101",
            "localhost",
            "127.0.0.1",
            ...EXTRA_HOSTS,
        ],
        proxy: {
            '/api':   { target: PROXY_TARGET, changeOrigin: true },
            '/media': { target: PROXY_TARGET, changeOrigin: true },
            '/ws':    { target: PROXY_TARGET, changeOrigin: true, ws: true },
        },
    },
})
//import { defineConfig } from 'vite'
//import react from '@vitejs/plugin-react'
//import tailwindcss from '@tailwindcss/vite'
//
//export default defineConfig({
//    plugins: [react(), tailwindcss()],
//    server: {
//        host: '0.0.0.0',
//        port: 3000,
//        allowedHosts: "all",
//        proxy: {
//            '/api': {
//                target: 'http://localhost:9000',
//                changeOrigin: true,
//            },
//            '/media': {
//                target: 'http://localhost:9000',
//                changeOrigin: true,
//            },
//            '/ws': {
//                target: 'ws://localhost:9000',
//                ws: true,
//            },
//        },
//    },
//})

