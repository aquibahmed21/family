import { defineConfig } from 'vite';

export default defineConfig({
  // You can add Vite configuration options here if needed.
  // For this basic project, the defaults should work fine.

  // Example of a common configuration:
  // server: {
  //   port: 3000, // Change the default development server port
  //   open: true, // Automatically open the browser on server start
  // },
  // build: {
  //   outDir: 'dist', // Specify the output directory for the build
  //   minify: 'terser', // Use terser for minification (default is esbuild)
  //   sourcemap: true, // Generate sourcemaps for debugging
  // },
  server: {
    open: true
  },
  base: "/family"
});