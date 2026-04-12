// test/numeric-sort.test.js
import { test, expect, describe } from "bun:test";

// Copy of the function under test (same code that will go in csv.js / excel.js)
function isNumericColumn(values) {
    var nonEmpty = values.filter(function(v) {
        return v !== null && v !== undefined && v !== '';
    });
    if (nonEmpty.length === 0) return false;
    return nonEmpty.every(function(v) {
        return typeof v === 'number' ||
               (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)));
    });
}

describe('isNumericColumn', function() {
    test('all integer strings → true', function() {
        expect(isNumericColumn(['1', '2', '10', '100'])).toBe(true);
    });

    test('all float strings → true', function() {
        expect(isNumericColumn(['1.5', '3.14', '-2.7'])).toBe(true);
    });

    test('negative numbers → true', function() {
        expect(isNumericColumn(['-1', '-10', '-100'])).toBe(true);
    });

    test('scientific notation → true', function() {
        expect(isNumericColumn(['1e3', '2.5e-4'])).toBe(true);
    });

    test('native JS number values → true', function() {
        expect(isNumericColumn([1, 2, 3])).toBe(true);
    });

    test('mixed JS numbers and numeric strings → true', function() {
        expect(isNumericColumn([1, '2', 3])).toBe(true);
    });

    test('mixed numbers and non-numeric strings → false', function() {
        expect(isNumericColumn(['1', '2', 'foo'])).toBe(false);
    });

    test('all strings → false', function() {
        expect(isNumericColumn(['foo', 'bar'])).toBe(false);
    });

    test('all empty → false', function() {
        expect(isNumericColumn(['', '', ''])).toBe(false);
    });

    test('empty array → false', function() {
        expect(isNumericColumn([])).toBe(false);
    });

    test('null and undefined excluded, rest numeric → true', function() {
        expect(isNumericColumn([null, undefined, '42', '7'])).toBe(true);
    });

    test('empty string excluded, rest numeric → true', function() {
        expect(isNumericColumn(['', '1', '2'])).toBe(true);
    });

    test('"Infinity" string → false', function() {
        expect(isNumericColumn(['Infinity', '1', '2'])).toBe(false);
    });

    test('"-Infinity" string → false', function() {
        expect(isNumericColumn(['-Infinity', '1'])).toBe(false);
    });

    test('whitespace-only string → false', function() {
        expect(isNumericColumn(['   ', '1'])).toBe(false);
    });

    test('numeric comparator sorts correctly', function() {
        var data = ['10', '2', '1', '20'];
        data.sort(function(a, b) { return Number(a) - Number(b); });
        expect(data).toEqual(['1', '2', '10', '20']);
    });
});
