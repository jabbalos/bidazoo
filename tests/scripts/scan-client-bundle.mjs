// Scans the BUILT frontend (what a browser downloads) for server-only material.
//   npm run build -w @bidazoo/play && node tests/scripts/scan-client-bundle.mjs [dir]
// Exit code 0 only if nothing forbidden is present. This inspects artifacts; it does not prove
// the absence of every possible leak, only of the specific ones listed here.
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
];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(root);

let hits = 0;
let bytes = 0;
for (const file of files) {
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
