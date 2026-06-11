/**
 * Type-only imports erased during TypeScript compilation.
 */

import type { xBuildConfig } from '@remotex-labs/xbuild';

/**
 * Imports
 */

import { version } from 'process';

/**
 * xBuild configuration
 */

export const config: xBuildConfig = {
    common: {
        esbuild: {
            bundle: true,
            minify: true,
            outdir: 'dist',
            target: [ `node${ version.slice(1) }` ],
            platform: 'node',
            packages: 'external',
            sourcemap: true,
            legalComments: 'none',
            entryPoints: {
                'cli': 'src/cli.ts',
                'index': 'src/index.ts'
            }
        }
    },
    variants: {
        esm: {
            esbuild: {
                format: 'esm',
                outdir: 'dist/esm'
            }
        },
        cjs: {
            esbuild: {
                format: 'esm',
                outdir: 'dist/cjs'
            }
        }
    }
};

export default config;
