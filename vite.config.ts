import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals();

export default defineConfig({
  plugins: [
    remix({
      build: {
        // Relying on the adapter to handle function naming and routing automatically
        server: {
          adapter: "@remix-run/netlify",
        },
      },
    }),
    tsconfigPaths(),
  ],
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  define: { // ADDED THIS BLOCK
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@supabase/supabase-js'],
    exclude: ['libs/three.min.js', 'libs/cannon.min.js', 'libs/teal.js']
  },
  build: {
    target: 'es2020',
    minify: 'terser',
    cssCodeSplit: true,
    rollupOptions: {
      external: ['libs/three.min.js', 'libs/cannon.min.js', 'libs/teal.js']
    },
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: true
      }
    }
  }
});
