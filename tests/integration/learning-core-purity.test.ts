import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Enforces the learning-core boundary: pure TypeScript only.
 * Complements the tsconfig (no DOM lib, no node types) with a source-level scan.
 */

const ALLOWED_PACKAGE_IMPORTS = new Set(['@bidazoo/contracts']);
const FORBIDDEN_IDENTIFIERS =
  /\b(document|window|localStorage|sessionStorage|navigator|fetch|process|require|Phaser|React)\b/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function findViolations(source: string): string[] {
  const code = stripComments(source);
  const violations: string[] = [];

  for (const match of code.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const specifier = match[1] ?? '';
    const isRelative = specifier.startsWith('.');
    if (!isRelative && !ALLOWED_PACKAGE_IMPORTS.has(specifier)) {
      violations.push(`forbidden import: ${specifier}`);
    }
  }

  const identifier = FORBIDDEN_IDENTIFIERS.exec(code);
  if (identifier) {
    violations.push(`forbidden identifier: ${identifier[1]}`);
  }
  return violations;
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

const packageRoot = fileURLToPath(new URL('../../packages/learning-core', import.meta.url));

describe('learning-core purity', () => {
  it('the scanner itself catches violations (self-test)', () => {
    expect(findViolations(`import Phaser from 'phaser';`)).not.toEqual([]);
    expect(findViolations(`import { x } from 'fastify';`)).not.toEqual([]);
    expect(findViolations(`import pg from 'pg';`)).not.toEqual([]);
    expect(findViolations(`const el = document.body;`)).not.toEqual([]);
    expect(findViolations(`localStorage.setItem('a', 'b');`)).not.toEqual([]);
    expect(findViolations(`// mentions window in a comment only\nexport const a = 1;`)).toEqual([]);
    expect(findViolations(`import type { A } from '@bidazoo/contracts';\nimport { b } from './b';`)).toEqual([]);
  });

  it('has source files to scan', () => {
    expect(listSourceFiles(join(packageRoot, 'src')).length).toBeGreaterThan(0);
  });

  it('source files import only relative modules and @bidazoo/contracts, and use no browser/runtime globals', () => {
    for (const file of listSourceFiles(join(packageRoot, 'src'))) {
      const violations = findViolations(readFileSync(file, 'utf8'));
      expect({ file, violations }).toEqual({ file, violations: [] });
    }
  });

  it('declares no runtime dependencies other than @bidazoo/contracts', () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(['@bidazoo/contracts']);
  });
});
