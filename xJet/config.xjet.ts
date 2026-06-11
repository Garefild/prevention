import type { xJetConfig } from '@remotex-labs/xjet';

import { version } from 'process';

export default {
    parallel: 1,
    logLevel: 'Debug',
    build: {
        target: [ `node${ version.slice(1) }` ],
        platform: 'node',
        packages: 'bundle'
    }
} as xJetConfig;
