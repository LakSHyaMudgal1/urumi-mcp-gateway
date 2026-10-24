#!/usr/bin/env node

/**
 * Urumi MCP Gateway: Automated Acceptance Test Runner
 * Executes the requirement-by-requirement acceptance suite against the actual implementation.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

console.log('================================================================');
console.log('  Urumi MCP Gateway Platform: Full Acceptance Pass');
console.log('================================================================\n');

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    console.log(`> Running: ${command} ${args.join(' ')}`);
    const proc = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true
    });
    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
    proc.on('error', reject);
  });
}

async function main() {
  const rootDir = process.cwd();

  try {
    console.log('[1/3] Building all monorepo packages and services...');
    await runCommand('npm', ['run', 'build'], rootDir);
    console.log('✓ Build completed successfully.\n');

    console.log('[2/3] Running Helm Chart and Kubernetes Manifests Validation...');
    await runCommand('node', ['--test', 'infra/helm/helm-validation.test.mjs'], rootDir);
    console.log('✓ Helm validation passed.\n');

    console.log('[3/3] Running 12-Requirement End-to-End Acceptance Suite...');
    await runCommand('node', ['--test', 'services/gateway/dist/acceptance.test.js'], rootDir);
    console.log('\n================================================================');
    console.log('  ACCEPTANCE PASS: ALL 12 MANDATORY CHECKS PASSED');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n✖ Acceptance run failed:', err.message);
    process.exit(1);
  }
}

main();
