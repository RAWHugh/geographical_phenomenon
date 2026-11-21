import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/build/three.core.js')) return 'three-core';
          if (id.includes('/node_modules/astronomy-engine/')) return 'ephemeris';
          if (id.includes('/node_modules/world-atlas/')) return 'land';
          if (id.includes('/node_modules/@photostructure/tz-lookup/')) return 'timezones';
        },
      },
    },
  },
});
