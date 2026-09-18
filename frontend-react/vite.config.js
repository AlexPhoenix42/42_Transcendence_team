// frontend-react/vite.config.js

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

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        host: '0.0.0.0',
        port: 3000,
        //allowedHosts: ["all"],
		allowedHosts: [
			"10.3.1.4.nip.io",
			".nip.io",  // This allows all subdomains of nip.io
			"mi-r1-p4",
			"100.103.253.101",
			"localhost",
			"127.0.0.1"
		],
        proxy: {
            '/api': {
                target: `http://${DOMAIN}:9000`,
                changeOrigin: true,
            },
            '/media': {
                target: `http://${DOMAIN}:9000`,
                changeOrigin: true,
            },
            //'/ws': {
            //    target: `ws://${DOMAIN}:9000`,
            //    ws: true,
			//	changeOrigin: true,
            //},

			'/ws': {
                target: `http://${DOMAIN}:9000`,
                ws: true,
                changeOrigin: true,
            },
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

