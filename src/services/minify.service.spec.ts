/**
 * Imports
 */

import { checkMinified } from './minify.service';

/**
 * Tests
 */

test('checkMinified passes a real minified blob', () => {
    // eslint-disable-next-line max-len
    const minified = '!function(){"use strict";function n(n,t){return n+t}var r=n(1,2);console.log(r);for(var o=0;o<10;o++)console.log(o);var i={a:1,b:2,c:3},u=Object.keys(i).map(function(n){return i[n]+1});console.log(u);var c=function(n){return n.split("").reverse().join("")};console.log(c("hello world"));}();';
    const result = checkMinified(minified);
    expect(result.minified).toBe(true);
});

test('checkMinified flags pretty-printed source', () => {
    const pretty = `function add(a, b) {
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
const values = Object.keys(obj).map(k => obj[k] + 1);
console.log(values);
`;
    const result = checkMinified(pretty);
    expect(result.minified).toBe(false);
});

test('checkMinified auto-passes tiny single-line source', () => {
    expect(checkMinified('console.log(1);').minified).toBe(true);
    expect(checkMinified('module.exports = 1;').minified).toBe(true);
});

test('checkMinified ignores a single trailing newline on otherwise one-line source', () => {
    expect(checkMinified('console.log(1);\n').minified).toBe(true);
});

test('checkMinified flags small but multi-line code (eval-extracted strings)', () => {
    expect(checkMinified('var x = 1;\nvar y = 2;').minified).toBe(false);
    expect(checkMinified('function add(a, b) {\n    return a + b;\n}\n').minified).toBe(false);
});

test('checkMinified identifier signal flags long names on otherwise compact text', () => {
    const compact = 'function add(a, b) { return a + b; }';
    const pretty = checkMinified(compact, {
        count: 10,
        meanLength: 7.4,
        shortRatio: 0.1
    });
    expect(pretty.minified).toBe(false);
    expect(pretty.signals.identifiers).toBe(true);
});

test('checkMinified identifier signal passes when most names are short', () => {
    const compact = 'function add(a, b) { return a + b; }';
    const minified = checkMinified(compact, {
        count: 10,
        meanLength: 1.2,
        shortRatio: 0.9
    });
    expect(minified.minified).toBe(true);
    expect(minified.signals.identifiers).toBe(false);
});

test('checkMinified ignores identifier stats below ID_CONFIDENCE_COUNT', () => {
    const compact = 'function add(a, b) { return a + b; }';
    const result = checkMinified(compact, { count: 2, meanLength: 8, shortRatio: 0 });
    expect(result.signals.identifiers).toBe(false);
});

test('checkMinified combines signals with OR — either triggers not minified', () => {
    const prettyShortNames = 'function f(a, b) {\n    return a + b;\n}\n';
    const result = checkMinified(prettyShortNames, {
        count: 10,
        meanLength: 1.0,
        shortRatio: 1.0
    });
    expect(result.minified).toBe(false);
    expect(result.signals.text).toBe(true);
    expect(result.signals.identifiers).toBe(false);
});
