/**
 * Type-only imports erased during TypeScript compilation.
 */

import type { ConfigInterface } from '@interfaces/config.interface';

/**
 * Imports
 */

import { DEFAULT_CONFIG } from './config.service';
import { validateSource } from './validator.service';

// eslint-disable-next-line max-len
const MINIFIED = '!function(){"use strict";function n(n,t){return n+t}var r=n(1,2);console.log(r);for(var o=0;o<10;o++)console.log(o);var i={a:1,b:2,c:3},u=Object.keys(i).map(function(n){return i[n]+1});console.log(u);var c=function(n){return n.split("").reverse().join("")};console.log(c("hello world"));}();';

test('validateSource accepts clean minified code', () => {
    expect(validateSource(MINIFIED, 'good.js')).toEqual([]);
});

test('validateSource flags a block comment with error severity by default', () => {
    const src = '!function(){"use strict";/* leftover */function n(n,t){return n+t}console.log(n(1,2));}();';
    const findings = validateSource(src, 'bad.js');
    expect(findings.length).toBe(1);
    expect(findings[0].kind).toBe('comment');
    expect(findings[0].severity).toBe('error');
});

test('validateSource skips the comment check when checks.comment is "off"', () => {
    const config: ConfigInterface = {
        ...DEFAULT_CONFIG,
        checks: { ...DEFAULT_CONFIG.checks, comment: 'off' }
    };
    const src = '!function(){"use strict";/* allowed */console.log(1);}();';
    const findings = validateSource(src, 'bad.js', config);
    expect(findings.filter((f) => f.kind === 'comment')).toEqual([]);
});

test('validateSource skips the minify check when checks.minify is "off"', () => {
    const pretty = 'function add(a, b) {\n    return a + b;\n}\n'.repeat(20);
    const config: ConfigInterface = {
        ...DEFAULT_CONFIG,
        checks: { ...DEFAULT_CONFIG.checks, minify: 'off' }
    };
    const findings = validateSource(pretty, 'pretty.js', config);
    expect(findings.filter((f) => f.kind === 'minify')).toEqual([]);
});

test('validateSource respects config.checks.comment severity', () => {
    const config: ConfigInterface = {
        ...DEFAULT_CONFIG,
        checks: { ...DEFAULT_CONFIG.checks, comment: 'warn' }
    };
    const src = '!function(){"use strict";/* hi */console.log(1);}();';
    const findings = validateSource(src, 'bad.js', config);
    expect(findings[0].severity).toBe('warn');
});

test('validateSource flags non-minified source', () => {
    const src = `function add(a, b) {
    return a + b;
}

function double(x) {
    return x * 2;
}

const result = add(1, 2);
const doubled = double(result);
console.log(doubled);

for (let i = 0; i < 10; i++) {
    console.log(i);
}

const obj = { a: 1, b: 2, c: 3 };
const values = Object.keys(obj).map((k) => obj[k] + 1);
console.log(values);
`;
    const findings = validateSource(src, 'pretty.js');
    expect(findings.some((f) => f.kind === 'minify')).toBe(true);
});

test('validateSource flags long-name code that the text heuristic alone would miss', () => {
    // eslint-disable-next-line max-len
    const longNames = 'const userAccountManager = new UserAccountManager(); const billingService = new BillingService(); const reportGenerator = new ReportGenerator(); const notificationDispatcher = new NotificationDispatcher(); const auditLogWriter = new AuditLogWriter(); const cacheController = new CacheController(); function processCustomerOrder(customerId, orderItems, paymentMethod) { return billingService.charge(customerId, paymentMethod, orderItems); } function dispatchOrderConfirmation(customerId, orderId) { notificationDispatcher.notify(customerId, orderId); }';
    const findings = validateSource(longNames, 'app.js');
    expect(findings.some((f) => f.kind === 'minify')).toBe(true);
});

test('validateSource passes minified output even with long single-line code', () => {
    // eslint-disable-next-line max-len
    const realMinified = 'function n(n,t){return n+t}function r(n){return 2*n}var t=n(1,2),e=r(t);console.log(e);for(var o=0;o<10;o++)console.log(o);var i={a:1,b:2,c:3},u=Object.keys(i).map(function(n){return i[n]+1});console.log(u);var c=function(n){return n.split("").reverse().join("")};console.log(c("hello world"));var l=[1,2,3,4,5].filter(function(n){return n%2}).map(function(n){return n*n});console.log(l);';
    expect(validateSource(realMinified, 'app.js').filter((f) => f.kind === 'minify')).toEqual([]);
});

test('validateSource flags unminified multi-line code inside an eval-like call', () => {
    const config: ConfigInterface = {
        ...DEFAULT_CONFIG,
        evalFunctions: [ 'xz' ]
    };
    const src = '!function(){xz("var x = 1;\\nvar y = 2;\\nfunction add(a, b) {\\n    return a + b;\\n}");}();';
    const findings = validateSource(src, 'app.js', config);
    expect(findings.some((f) => f.kind === 'minify' && f.label.includes('xz'))).toBe(true);
});

test('validateSource recurses into a user-configured eval-like function', () => {
    const config: ConfigInterface = {
        ...DEFAULT_CONFIG,
        evalFunctions: [ ...DEFAULT_CONFIG.evalFunctions, 'myExec' ]
    };
    const src = '!function(){myExec("/* sneaky */function add(a,b){return a+b}");}();';
    const findings = validateSource(src, 'app.js', config);
    expect(findings.some((f) => f.kind === 'comment' && f.label.includes('myExec'))).toBe(true);
});

test('validateSource recurses into a dotted callee like vm.runInThisContext', () => {
    const config: ConfigInterface = {
        ...DEFAULT_CONFIG,
        evalFunctions: [ 'vm.runInThisContext' ]
    };
    const src = '!function(){vm.runInThisContext("/* nope */1");}();';
    const findings = validateSource(src, 'app.js', config);
    expect(findings.some((f) => f.kind === 'comment' && f.label.includes('vm.runInThisContext'))).toBe(true);
});

test('validateSource skips eval recursion when evalFunctions is empty', () => {
    const config: ConfigInterface = { ...DEFAULT_CONFIG, evalFunctions: [] };
    const src = '!function(){eval("/* should be ignored */1");}();';
    const findings = validateSource(src, 'app.js', config);
    expect(findings.filter((f) => f.label.includes('eval'))).toEqual([]);
});

test('validateSource recurses into eval string and finds inner comment', () => {
    const src = '!function(){"use strict";eval("function add(a, b) {\\n  // sneaky\\n  return a + b;\\n}\\nconsole.log(add(1, 2));");}();';
    const findings = validateSource(src, 'eval.js');
    expect(findings.some((f) => f.kind === 'comment' && f.label.includes('eval'))).toBe(true);
});

test('validateSource recurses into new Function() string', () => {
    const src = '!function(){"use strict";new Function("a","b","/* inside */ return a+b;");}();';
    const findings = validateSource(src, 'fn.js');
    expect(findings.some((f) => f.kind === 'comment' && f.label.includes('new Function'))).toBe(true);
});

test('validateSource ignores shebang line at offset 0', () => {
    const src = '#!/usr/bin/env node\n!function(){"use strict";console.log(1);}();';
    expect(validateSource(src, 'cli.js').filter((f) => f.kind === 'comment')).toEqual([]);
});

test('validateSource ignores //# sourceMappingURL pragma', () => {
    const src = '!function(){"use strict";console.log(1);}();\n//# sourceMappingURL=app.js.map';
    expect(validateSource(src, 'app.js').filter((f) => f.kind === 'comment')).toEqual([]);
});

test('validateSource emits blacklist findings with configured severity', () => {
    const config: ConfigInterface = {
        ...DEFAULT_CONFIG,
        blacklist: [
            { pattern: 'console.log', level: 'warn' },
            { pattern: 'debugger', level: 'error' }
        ]
    };
    const src = '!function(){console.log("x");debugger;}();';
    const findings = validateSource(src, 'app.js', config);
    const blacklist = findings.filter((f) => f.kind === 'blacklist');
    expect(blacklist.length).toBe(2);
    expect(blacklist.find((f) => f.message.includes('console.log'))?.severity).toBe('warn');
    expect(blacklist.find((f) => f.message.includes('debugger'))?.severity).toBe('error');
});

test('validateSource returns parse finding on broken source', () => {
    const findings = validateSource('function (', 'broken.js');
    expect(findings.some((f) => f.kind === 'parse')).toBe(true);
});
