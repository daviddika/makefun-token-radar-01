// token-radar-01 entry: rank pre-token protocols from a sealed snapshot.
//
// Pipeline, in order:
//   1. read the snapshot (sealed /input, or --input <file|dir>)
//   2. score every protocol with the model in lib/model.ts
//   3. refuse any board the gate rejects, before writing anything
//   4. write board.json + data.js, then mirror dashboard/ and screenshots/
//   5. write dossier.json last — the scorer rebuilds it from the output
//      directory and compares bytes, so it must see the finished tree.
//
// Node 22+, standard library only. No network, no framework.
// When running outside the grader, point MAKEFUN_OUTPUT_DIR at a local folder:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join as joinPath } from 'node:path';
import { fileURLToPath as urlToPath } from 'node:url';
import {
  boardIssue,
  buildRadar,
  dataScript,
  parseSnapshot,
} from './lib/model.ts';
import { buildDossier as makeDossier } from './vendor/makefun-board.ts';

// Directory this file lives in: dashboard/ and screenshots/ sit beside it.
const repoRoot = urlToPath(new URL('.', import.meta.url));

// The scorer's own caps (reference/gate.json).
const TEXT_MAX_BYTES = 64 * 1024;
const SHOT_LIMIT = 4;
const SHOT_MAX_BYTES = 512 * 1024;
const SHOT_NAME = new RegExp('^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$');

// Dashboard caps the dossier applies to the mirrored page.
const DOSSIER_DASHBOARD_FILES = 400;
const DOSSIER_DASHBOARD_BYTES = 4 * 1024 * 1024;

// At least this many screenshots must ship with the entry.
const SHOTS_REQUIRED = 3;

// Stop the run with the given exit code.
const fail = (code: number): never => process.exit(code);

/** Value of `--name <value>` or `--name=<value>`; `fallback` when absent. */
function flagValue(name: string, fallback: string): string {
  const spaced = process.argv.indexOf(`--${name}`);
  if (spaced >= 0 && spaced + 1 < process.argv.length) {
    return process.argv[spaced + 1]!;
  }
  const joined = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (joined === undefined) return fallback;
  return joined.slice(name.length + 3);
}

/** Mirror one directory's regular files into `targetDir`, skipping dotfiles. */
function mirrorTree(sourceDir: string, targetDir: string): string[] {
  if (!existsSync(sourceDir)) return [];
  mkdirSync(targetDir, { recursive: true });
  const moved: string[] = [];
  for (const name of readdirSync(sourceDir)) {
    if (name[0] === '.') continue;
    const source = joinPath(sourceDir, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, joinPath(targetDir, name));
    moved.push(name);
  }
  return moved;
}

// --- resolve the snapshot -------------------------------------------------

const inputGiven = flagValue('input', '/input');
const snapshotFile = inputGiven.endsWith('.json')
  ? inputGiven
  : joinPath(inputGiven, 'snapshot.json');
if (!existsSync(snapshotFile)) {
  process.stderr.write(
    `token radar: no snapshot at ${snapshotFile}: ` +
      'pass --input <snapshot.json|directory> or mount the sealed /input\n',
  );
  fail(2);
}
const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// --- score the board ------------------------------------------------------

const rawSnapshot = readFileSync(snapshotFile, 'utf8');
const snapshot = parseSnapshot(rawSnapshot);
const scored = buildRadar(snapshot);
const board = scored.board;
const radar = scored.radar;
const gateProblem = boardIssue(board, snapshot);
if (gateProblem !== null) {
  process.stderr.write(
    'token radar: the model wrote a board the gate refuses: ' +
      `${gateProblem}\n`,
  );
  fail(1);
}

// --- write the board ------------------------------------------------------

mkdirSync(outDir, { recursive: true });
const boardText = JSON.stringify({ rows: board }) + '\n';
writeFileSync(joinPath(outDir, 'board.json'), boardText);
writeFileSync(joinPath(outDir, 'data.js'), dataScript(radar));

// --- mirror the dashboard and the screenshots -----------------------------

mirrorTree(joinPath(repoRoot, 'dashboard'), joinPath(outDir, 'dashboard'));
const shots = mirrorTree(joinPath(repoRoot, 'screenshots'), joinPath(outDir, 'screenshots'));
if (shots.length < SHOTS_REQUIRED) {
  process.stderr.write(
    `token radar: screenshots/ holds ${shots.length} ` +
      `image${shots.length === 1 ? '' : 's'}: ` +
      'hand in 3, the board, a detail view and a filtered view\n',
  );
  fail(1);
}
for (const shot of shots) {
  if (!SHOT_NAME.test(shot)) {
    process.stderr.write(
      `token radar: screenshots/${shot}: ` +
        'a name is letters, digits and . _ -, 1 to 128 characters\n',
    );
    fail(1);
  }
}

// --- dossier, written last so it sees the finished output -----------------

const dossierBytes = makeDossier(outDir, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: { max: SHOT_LIMIT, max_bytes: SHOT_MAX_BYTES },
  dashboard: {
    max_files: DOSSIER_DASHBOARD_FILES,
    max_bytes: DOSSIER_DASHBOARD_BYTES,
  },
});
writeFileSync(joinPath(outDir, 'dossier.json'), dossierBytes);

// --- summary --------------------------------------------------------------

const firstLine =
  `token radar: ${snapshot.protocols.length} protocols, ` +
  `${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored ` +
  `(${radar.early_size} early, ${radar.live_size} live set aside)\n`;
const secondLine =
  `token radar: wrote ${joinPath(outDir, 'board.json')}, ` +
  `${joinPath(outDir, 'data.js')}, ${joinPath(outDir, 'dashboard')} (3 files), ` +
  `${joinPath(outDir, 'screenshots')} (${shots.length} images) and ` +
  `${joinPath(outDir, 'dossier.json')}\n`;
process.stdout.write(firstLine + secondLine);
