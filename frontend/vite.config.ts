import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['10.3.1.4.nip.io'],
    proxy: {
      '/api': {
        target: 'http://10.3.1.4.nip.io:9000',
        changeOrigin: true,
      },
    },
    // Redirect root to the test page
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/') {
          res.writeHead(302, { Location: '/index.html' });
          res.end();
          return;
        }
        next();
      });
    },
  },
});

















//import { defineConfig } from 'vite'
//import react from '@vitejs/plugin-react'
//
//// https://vite.dev/config/
//export default defineConfig({
//  plugins: [react()],
//})
