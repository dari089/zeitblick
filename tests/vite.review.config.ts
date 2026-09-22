import { mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import mobile from '../mobile/vite.config';

export default mergeConfig(mobile, {
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false,
  build: {
    outDir: '../public/__review-check',
    rollupOptions: { input: {video:fileURLToPath(new URL('./video-browser.html', import.meta.url)),alignment:fileURLToPath(new URL('./alignment-browser.html', import.meta.url)),review:fileURLToPath(new URL('./review-browser.html', import.meta.url)),native:fileURLToPath(new URL('./native-browser.html', import.meta.url))} },
  },
});
