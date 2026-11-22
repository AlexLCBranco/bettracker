// What this build is: its version (package.json), the commit it was built from and when (set in next.config.ts).

export const BUILD_INFO = {
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
  commit: process.env.NEXT_PUBLIC_APP_COMMIT ?? 'dev',
  builtAt: process.env.NEXT_PUBLIC_BUILT_AT ?? '',
};
