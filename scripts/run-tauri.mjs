import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const tauriCommand = process.argv[2];
const tauriArgs = process.argv.slice(3);
const cargoBinDir = path.join(os.homedir(), '.cargo', 'bin');

if (existsSync(cargoBinDir)) {
  process.env.PATH = `${cargoBinDir}${path.delimiter}${process.env.PATH ?? ''}`;
}

function runCheck(command, args) {
  return spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function commandAvailable(command, args = ['--version']) {
  const result = runCheck(command, args);
  return result.status === 0;
}

function printSection(title, lines) {
  console.error(`\n${title}`);
  for (const line of lines) {
    console.error(line);
  }
}

function formatMissingPackages(packages) {
  return packages.map((pkg) => `- ${pkg}`);
}

function runPreflight() {
  const errors = [];

  if (!existsSync(path.join(projectRoot, 'node_modules'))) {
    errors.push('JavaScript dependencies are missing.');
    printSection('Run this first:', ['npm install']);
  }

  if (!commandAvailable('cargo', ['-V']) || !commandAvailable('rustc', ['-V'])) {
    errors.push('Rust is not available in the current shell.');
    printSection('Install Rust and load Cargo into PATH:', [
      "curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh",
      'source "$HOME/.cargo/env"',
      'cargo -V',
    ]);
  }

  if (process.platform === 'linux') {
    if (!commandAvailable('pkg-config', ['--version'])) {
      errors.push('pkg-config is missing, so Tauri system libraries cannot be checked.');
      printSection('Install Linux desktop prerequisites:', [
        'sudo apt update',
        'sudo apt install -y \\',
        '  libwebkit2gtk-4.1-dev \\',
        '  build-essential \\',
        '  curl \\',
        '  wget \\',
        '  file \\',
        '  libxdo-dev \\',
        '  libssl-dev \\',
        '  libayatana-appindicator3-dev \\',
        '  librsvg2-dev \\',
        '  pkg-config',
      ]);
    } else {
      const requiredPackages = ['webkit2gtk-4.1', 'libsoup-3.0'];
      const missingPackages = requiredPackages.filter(
        (pkg) => runCheck('pkg-config', ['--exists', pkg]).status !== 0,
      );

      if (missingPackages.length > 0) {
        errors.push(`Missing Linux packages: ${missingPackages.join(', ')}.`);
        printSection('Missing pkg-config packages:', formatMissingPackages(missingPackages));
        printSection('Install the Ubuntu/Debian Tauri prerequisites:', [
          'sudo apt update',
          'sudo apt install -y \\',
          '  libwebkit2gtk-4.1-dev \\',
          '  build-essential \\',
          '  curl \\',
          '  wget \\',
          '  file \\',
          '  libxdo-dev \\',
          '  libssl-dev \\',
          '  libayatana-appindicator3-dev \\',
          '  librsvg2-dev \\',
          '  pkg-config',
        ]);
      }
    }
  }

  if (errors.length > 0) {
    console.error('\nDesktop preflight failed. See the commands above, then retry.');
    process.exit(1);
  }

  if (tauriCommand === 'check') {
    console.log('Desktop preflight passed.');
  }
}

function resolveTauriBinary() {
  const binaryName = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
  return path.join(projectRoot, 'node_modules', '.bin', binaryName);
}

if (!tauriCommand) {
  console.error('Usage: node ./scripts/run-tauri.mjs <check|dev|build> [extra args]');
  process.exit(1);
}

runPreflight();

if (tauriCommand === 'check') {
  process.exit(0);
}

const tauriBinary = resolveTauriBinary();

if (!existsSync(tauriBinary)) {
  console.error('Tauri CLI is not installed in node_modules. Run `npm install` and retry.');
  process.exit(1);
}

const child = spawn(tauriBinary, [tauriCommand, ...tauriArgs], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

