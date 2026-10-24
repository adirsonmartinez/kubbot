// Example file tree used when the page runs in a browser (no Electron, no disk access).
const file = (path) => ({ type: 'file', path, size: 1 });
const dir = (path, children) => ({ type: 'dir', path, children });

export const DEMO_TREE = [
  dir('src', [
    file('src/main.ts'),
    file('src/app.ts'),
    dir('src/lib', [file('src/lib/auth.ts'), file('src/lib/db.ts')]),
    dir('src/routes', [file('src/routes/index.ts'), file('src/routes/users.ts'), file('src/routes/tx.ts')]),
  ]),
  dir('components', [file('components/Button.tsx'), file('components/Card.tsx'), file('components/Chat.tsx'), file('components/Map.tsx')]),
  dir('public', [file('public/logo.svg'), file('public/favicon.ico')]),
  dir('supabase', [file('supabase/config.toml'), dir('supabase/migrations', [file('supabase/migrations/001_init.sql')])]),
  dir('tests', [file('tests/auth.test.ts')]),
  dir('docs', []),
  file('package.json'),
  file('README.md'),
  file('tsconfig.json'),
];
