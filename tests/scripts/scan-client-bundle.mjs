// Scans the BUILT frontend (what a browser downloads) for server-only material.
//   npm run build -w @bidazoo/play && node tests/scripts/scan-client-bundle.mjs [dir]
// Exit code 0 only if nothing forbidden is present. This inspects artifacts; it does not prove
// the absence of every possible leak, only of the specific ones listed here.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? 'apps/play/dist';

// Identifiers/strings that exist only on the server or hold answer-key / secret material.
// NOTE: `correctAnswer` is deliberately NOT listed: it is a legitimate post-grading field of
// AnswerResult, and the client displays it after the server has graded.
const FORBIDDEN = [
  ['privateGradingData', 'server column that holds the answer key'],
  ['private_grading_data', 'server column that holds the answer key'],
  ['readPrivateGrading', 'server grading helper'],
  ['answerKey', 'answer-key field'],
  ['correctChoiceId', 'answer-key field'],
  ['gradingData', 'grading field'],
  ['generateQuestion', 'learning-core question generator (answers are computed there)'],
  ['gradeAnswer', 'learning-core grader'],
  ['applyAttempt', 'learning-core mastery transition'],
  ['selectNextSkill', 'learning-core selection'],
  ['skill_mastery', 'database table'],
  ['wallet_transactions', 'database table'],
  ['xp_events', 'database table'],
  ['served_questions', 'database table'],
  ['DATABASE_URL', 'server environment variable'],
  ['postgres://', 'connection string'],
  ['postgresql://', 'connection string'],
  ['drizzle', 'server database library'],
  ['guest_sessions', 'database table'],
  ['token_hash', 'guest token hash column'],
  ['nodemailer', 'server-only mail library'],
  ['MAIL_SMTP_', 'server mail credentials/config'],
  ['IDENTITY_SECRET', 'server identity secret'],
  ['LEGACY_MATCH_PEPPER', 'server legacy-match secret'],
  // Developer-only character lab: it must exist only in the separate `--mode character-lab` build.
  ['CharacterLabScene', 'developer character lab scene'],
  ['Dino expression lab', 'developer character lab text'],
  ['expression lab (developer only)', 'developer character lab text'],
  // The canonical art library is documentation, never browser payload.
  ['docs/reference-art', 'reference-art path'],
  ['production-v1', 'reference-art library name'],
];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(root);

// Character art: every PNG in the build must be byte-identical to a curated runtime file listed in
// a character's PROVENANCE.json (so no QA sheet, silhouette, logo, library asset, or Git LFS pointer
// text can ship), and all 36 curated files (six cast members x six expressions) must be present.
const CAST = ['dino', 'koala', 'tarsier', 'eagle', 'bronco', 'click'];
const allowedPngs = new Map();
for (const id of CAST) {
  const provenance = JSON.parse(readFileSync(`games/zoo-sprint/assets/world-expedition/characters/${id}/PROVENANCE.json`, 'utf8'));
  for (const [state, e] of Object.entries(provenance.expressions)) allowedPngs.set(e.runtimeSha256, `${id}/${state}`);
}
const pngs = files.filter((f) => f.endsWith('.png'));
const seenPngs = new Set();
let hits = 0;
for (const file of pngs) {
  const bytes = readFileSync(file);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const known = allowedPngs.get(sha);
  if (!known) {
    hits += 1;
    console.log(`LEAK  ${relative('.', file)} is a PNG that is not a curated runtime asset (sha256 ${sha})`);
  } else seenPngs.add(known);
}
for (const known of allowedPngs.values()) {
  if (!seenPngs.has(known)) {
    hits += 1;
    console.log(`MISSING  curated runtime art ${known} is not in the build`);
  }
}
console.log(`PNGs in build: ${pngs.length} of ${allowedPngs.size} curated (${seenPngs.size} matched).`);

let bytes = 0;
for (const file of files) {
  if (file.endsWith('.png')) continue;
  const text = readFileSync(file, 'utf8');
  bytes += text.length;
  for (const [needle, why] of FORBIDDEN) {
    if (text.includes(needle)) {
      hits += 1;
      console.log(`LEAK  ${relative('.', file)} contains "${needle}"  (${why})`);
    }
  }
}
console.log(`Scanned ${files.length} file(s), ${bytes} bytes, ${FORBIDDEN.length} forbidden markers.`);
console.log(hits === 0 ? 'CLEAN: no forbidden markers found in the built frontend.' : `${hits} leak marker(s) found.`);
process.exit(hits === 0 ? 0 : 1);
