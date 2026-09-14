import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/__tests__/**'],
  splitting: false,
  sourcemap: true,
  clean: true,
  // .ejs views aren't TS entries, so tsup never touches them — copy them over so
  // `app.set('views', path.join(__dirname, 'public'))` finds them at runtime.
  onSuccess: 'cp -r src/public dist/public',
});
