import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Site version: package.json's "version" (bumped with every app change; scripts/check-version.ts enforces it in CI),
// shown in the page's bottom-right corner, plus the commit it was built from (Vercel and GitHub Actions pass it;
// locally git, "+" when the working tree has uncommitted changes) and the build time. Also served at /version.json.
const git = (cmd: string) => {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || git('rev-parse HEAD')).slice(0, 7);
const dirty = !process.env.VERCEL_GIT_COMMIT_SHA && !process.env.GITHUB_SHA && git('status --porcelain') !== '';
const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_APP_COMMIT: sha ? `${sha}${dirty ? '+' : ''}` : 'dev',
    NEXT_PUBLIC_BUILT_AT: new Date().toISOString(),
  },
  turbopack: {
    root: process.cwd(), // a package-lock.json in the home folder would otherwise be taken as the root
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
