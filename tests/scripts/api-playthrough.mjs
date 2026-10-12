// A real, over-the-network playthrough of the API: guest -> 10-question session -> duplicates ->
// rejections -> database verification. It needs a RUNNING API and the same database:
//
//   API_URL=http://127.0.0.1:3001 DATABASE_URL=postgres://... node tests/scripts/api-playthrough.mjs
//
// It plays the part of a browser (cookie jar, JSON over HTTP). It uses the multiplication in the
// prompt to choose answers, which is something only this test script does: the API never sends
// the answer before grading. Exit code 0 only if every check passed.
import pg from 'pg';

const API = process.env.API_URL ?? 'http://127.0.0.1:3001';
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required to verify database records');
  process.exit(2);
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : detail ? `  -> ${detail}` : ''}`);
  if (!ok) failures += 1;
};

class Browser {
  cookie = '';
  async call(method, path, body, headers = {}) {
    const res = await fetch(API + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const line of set) this.cookie = line.split(';')[0];
    let json;
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }
    return { status: res.status, json, headers: res.headers, setCookie: set };
  }
}

const product = (prompt) => {
  const m = /^(\d+) × (\d+)$/.exec(prompt);
  return Number(m[1]) * Number(m[2]);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const key = () => `playthrough-${Date.now().toString(36)}-${++n}`;

const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const q = async (text, params = []) => (await db.query(text, params)).rows;

try {
  console.log(`API ${API}\n`);

  // --- operational ---
  const health = await fetch(`${API}/health`);
  check('GET /health is 200', health.status === 200);
  const ready = await fetch(`${API}/ready`);
  check('GET /ready is 200 with the database ok', ready.status === 200 && (await ready.json()).checks.database === 'ok');

  // --- guest identity ---
  const a = new Browser();
  const guest = await a.call('POST', '/api/v1/guest', {});
  check('guest created (200)', guest.status === 200);
  const cookieLine = guest.setCookie[0] ?? '';
  check('cookie is HttpOnly + SameSite=Lax + Path=/', /HttpOnly/i.test(cookieLine) && /SameSite=Lax/i.test(cookieLine) && /Path=\//.test(cookieLine), cookieLine.replace(/=[^;]+/, '=<redacted>'));
  check('token is not in the response body', !JSON.stringify(guest.json).includes(a.cookie.split('=')[1]));
  const playerId = guest.json.player.id;
  const again = await a.call('POST', '/api/v1/guest', {});
  check('same cookie reconnects to the same guest (refresh)', again.json.player.id === playerId && again.setCookie.length === 0);

  // --- start + play 10 questions ---
  const start = await a.call('POST', '/api/v1/play-sessions', { gameId: 'zoo-sprint', mode: 'multiplication' });
  check('session created (201)', start.status === 201);
  const sessionId = start.json.session.id;

  const rewardsSeen = [];
  let firstAnswer;
  let firstQuestion;
  for (let i = 1; i <= 10; i++) {
    const issued = await a.call('POST', `/api/v1/play-sessions/${sessionId}/question`, {});
    const question = issued.json.question;
    const leaked = JSON.stringify(issued.json);
    if (i === 1) {
      firstQuestion = question;
      check('question has exactly {id,sequence,prompt,type,choices}', JSON.stringify(Object.keys(question).sort()) === JSON.stringify(['choices', 'id', 'prompt', 'sequence', 'type']));
      check('question response has no answer/grading fields', !/correctAnswer|correctChoice|answerKey|grading/i.test(leaked));
    }
    if (i === 3) {
      // Refresh in the middle: the same question comes back and the timer is not reset.
      const [before] = await q('select served_at from served_questions where id = $1', [question.id]);
      await wait(250);
      const restored = await a.call('POST', `/api/v1/play-sessions/${sessionId}/question`, {});
      const [after] = await q('select served_at from served_questions where id = $1', [question.id]);
      check('refresh restores the SAME question', restored.json.question.id === question.id);
      check('refresh does not reset served_at', before.served_at.getTime() === after.served_at.getTime());
      const [{ n }] = await q('select count(*)::int as n from served_questions where play_session_id = $1', [sessionId]);
      check('refresh issued no extra question', n === 3);
    }
    // Miss question 2 on purpose, to exercise the non-punitive path.
    const choose = i === 2 ? question.choices.find((c) => c !== product(question.prompt)) : product(question.prompt);
    const attemptId = key();
    await wait(60);
    const res = await a.call('POST', `/api/v1/play-sessions/${sessionId}/answers`, { attemptId, questionId: question.id, response: choose });
    if (res.status !== 200) {
      check(`answer ${i} accepted`, false, JSON.stringify(res.json));
      break;
    }
    if (i === 1) firstAnswer = { attemptId, body: res.json };
    rewardsSeen.push(...res.json.rewards);
    if (i === 2) check('a wrong answer is graded incorrect, earns nothing, and reveals the answer', res.json.correct === false && res.json.rewards.length === 0 && res.json.correctAnswer === product(question.prompt));
    if (i === 10) {
      check('session completes after 10 answers', res.json.session.status === 'completed');
      check('results are returned', res.json.session.results?.total === 10);
    }
  }

  // --- duplicates and rejections (after completion, plus on the first question) ---
  const dup = await a.call('POST', `/api/v1/play-sessions/${sessionId}/answers`, {
    attemptId: firstAnswer.attemptId,
    questionId: firstQuestion.id,
    response: product(firstQuestion.prompt),
  });
  check('duplicate submission (same attempt id) is replayed, not re-awarded', dup.status === 200 && dup.json.replayed === true && JSON.stringify(dup.json.rewards) === JSON.stringify(firstAnswer.body.rewards));

  const altKey = await a.call('POST', `/api/v1/play-sessions/${sessionId}/answers`, {
    attemptId: key(),
    questionId: firstQuestion.id,
    response: product(firstQuestion.prompt),
  });
  check('answered question + a different attempt id is refused (409)', altKey.status === 409);

  const nonexistent = await a.call('POST', `/api/v1/play-sessions/${sessionId}/answers`, {
    attemptId: key(),
    questionId: '99999999-9999-4999-8999-999999999999',
    response: 4,
  });
  check('nonexistent question is rejected (404 or 409)', [404, 409].includes(nonexistent.status), String(nonexistent.status));

  const b = new Browser();
  await b.call('POST', '/api/v1/guest', {});
  const bSession = (await b.call('POST', '/api/v1/play-sessions', { gameId: 'zoo-sprint', mode: 'multiplication' })).json.session.id;
  const bQuestion = (await b.call('POST', `/api/v1/play-sessions/${bSession}/question`, {})).json.question;
  const stolen = await a.call('POST', `/api/v1/play-sessions/${bSession}/answers`, { attemptId: key(), questionId: bQuestion.id, response: product(bQuestion.prompt) });
  check("player A cannot answer player B's question (404)", stolen.status === 404);
  const completedAttempt = await a.call('POST', `/api/v1/play-sessions/${sessionId}/answers`, { attemptId: key(), questionId: bQuestion.id, response: product(bQuestion.prompt) });
  check('answering into a COMPLETED session is refused (409), whatever the question id', completedAttempt.status === 409, String(completedAttempt.status));
  // Use a fresh ACTIVE session for A, so the question-belongs-to-session check is what refuses.
  const aSecond = (await a.call('POST', '/api/v1/play-sessions', { gameId: 'zoo-sprint', mode: 'multiplication' })).json.session.id;
  const forged = await a.call('POST', `/api/v1/play-sessions/${aSecond}/answers`, { attemptId: key(), questionId: bQuestion.id, response: product(bQuestion.prompt) });
  check("player B's question id is not accepted in A's own ACTIVE session (404)", forged.status === 404, String(forged.status));
  const [{ n: bAttempts }] = await q('select count(*)::int as n from attempts a join play_sessions s on s.id = a.play_session_id where s.id = $1', [bSession]);
  check("...and B's question was left ungraded", bAttempts === 0);
  const inject = await b.call('POST', `/api/v1/play-sessions/${bSession}/answers`, { attemptId: key(), questionId: bQuestion.id, response: product(bQuestion.prompt), coins: 999999, xp: 999999 });
  check('a body carrying coins/xp is rejected (400)', inject.status === 400);
  const post = await a.call('POST', `/api/v1/play-sessions/${sessionId}/question`, {});
  check('no new question after completion (409)', post.status === 409);

  // --- simultaneous duplicate submissions ---
  const c = new Browser();
  await c.call('POST', '/api/v1/guest', {});
  const cSession = (await c.call('POST', '/api/v1/play-sessions', { gameId: 'zoo-sprint', mode: 'multiplication' })).json.session.id;
  const cQuestion = (await c.call('POST', `/api/v1/play-sessions/${cSession}/question`, {})).json.question;
  const raceKey = key();
  const race = await Promise.all(
    Array.from({ length: 8 }, () =>
      c.call('POST', `/api/v1/play-sessions/${cSession}/answers`, { attemptId: raceKey, questionId: cQuestion.id, response: product(cQuestion.prompt) }),
    ),
  );
  check('8 simultaneous identical submissions all succeed', race.every((r) => r.status === 200));
  check('...and exactly one was the original commit', race.filter((r) => r.json.replayed === false).length === 1);
  const cId = (await c.call('GET', '/api/v1/me')).json.player.id;
  const [{ n: raceAttempts }] = await q('select count(*)::int as n from attempts where player_id = $1', [cId]);
  const [{ n: raceXp }] = await q('select count(*)::int as n from xp_events where player_id = $1', [cId]);
  const [{ n: raceCoins }] = await q('select count(*)::int as n from wallet_transactions where player_id = $1', [cId]);
  check('database: 1 attempt, 1 XP row, 1 coin row after the race', raceAttempts === 1 && raceXp === 1 && raceCoins === 1, `${raceAttempts}/${raceXp}/${raceCoins}`);

  // --- database verification for player A's completed session ---
  console.log('\nDatabase records for player A:');
  const [session] = await q('select * from play_sessions where id = $1', [sessionId]);
  check('play_sessions: completed, 10 answered, 9 correct', session.status === 'completed' && session.answered_count === 10 && session.correct_count === 9, JSON.stringify({ s: session.status, a: session.answered_count, c: session.correct_count }));
  const [{ n: served }] = await q('select count(*)::int as n from served_questions where play_session_id = $1 and answered_at is not null', [sessionId]);
  const [{ n: attempts }] = await q('select count(*)::int as n from attempts where play_session_id = $1', [sessionId]);
  check('served_questions: all answered; attempts: one per question', served >= 10 && attempts === 10 && served === attempts, `${served}/${attempts}`);
  const [{ n: dupAttempts }] = await q('select count(*)::int as n from (select served_question_id from attempts where play_session_id = $1 group by 1 having count(*) > 1) x', [sessionId]);
  check('no question has more than one grade', dupAttempts === 0);

  const [xpRow] = await q('select coalesce(sum(amount),0)::int as total, count(*)::int as n from xp_events where player_id = $1', [playerId]);
  const [coinRow] = await q('select coalesce(sum(amount),0)::int as total, count(*)::int as n from wallet_transactions where player_id = $1', [playerId]);
  console.log(`  ledger: xp ${xpRow.total} (${xpRow.n} rows), coins ${coinRow.total} (${coinRow.n} rows)`);
  check('ledger totals: 9 correct x (10 XP, 2 coins) + completion (25 XP, 10 coins)', xpRow.total === 9 * 10 + 25 && coinRow.total === 9 * 2 + 10, `${xpRow.total}/${coinRow.total}`);
  const granted = rewardsSeen.reduce((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + r.amount }), {});
  check('rewards reported by the API match the ledger exactly', granted.xp === xpRow.total && granted.coins === coinRow.total, JSON.stringify(granted));
  const me = await a.call('GET', '/api/v1/me');
  check('/me totals equal the ledger sums', me.json.totals.xp === xpRow.total && me.json.totals.coins === coinRow.total);

  const mastery = await q('select * from skill_mastery where player_id = $1 order by skill_key', [playerId]);
  check('mastery persisted for every fact asked', mastery.length >= 9 && mastery.length <= 10, String(mastery.length));
  // Question 2 was answered wrongly on purpose. The miss must be on record in mastery. If bounded
  // retry asked the fact again and it was right, Leitner puts it back in box 1 with streak 1;
  // if it was not retried, it must sit in box 0 with streak 0.
  const missed = mastery.find((m) => m.correct_count < m.attempts);
  check('the missed fact is recorded in mastery (attempts > correct)', missed !== undefined);
  if (missed) {
    const retriedRight = missed.attempts >= 2;
    check(
      `the missed fact ${missed.skill_key} is in the right Leitner state (${retriedRight ? 'retried correctly: box 1/streak 1' : 'not retried: box 0/streak 0'})`,
      retriedRight ? missed.box === 1 && missed.streak === 1 : missed.box === 0 && missed.streak === 0,
      `box ${missed.box}, streak ${missed.streak}, attempts ${missed.attempts}`,
    );
  }
  const [{ n: missRows }] = await q('select count(*)::int as n from attempts where player_id = $1 and correct = false', [playerId]);
  check('exactly one wrong attempt is stored for player A', missRows === 1);
  const fluent = mastery.filter((m) => m.box === 1 && m.fluent_days === 1);
  check('correct fast answers moved facts to box 1 with one fluent day', fluent.length >= 8, String(fluent.length));
  console.log('  mastery:', mastery.map((m) => `${m.skill_key}:box${m.box}/streak${m.streak}`).join('  '));

  const [{ n: unserved }] = await q('select count(*)::int as n from attempts a left join served_questions s on s.id = a.served_question_id where s.id is null');
  check('every attempt in the database refers to a served question', unserved === 0);
} catch (err) {
  console.error('Playthrough crashed:', err);
  failures += 1;
} finally {
  await db.end();
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
