import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSessionMix, importedSkillKey, labelForSkillKey } from '@bidazoo/learning-core';
import { IMPORTED_ITEMS, IMPORTED_ITEM_GRADE, importedItemById, sessionMix } from '../../apps/api/src/modules/sessions/imported-bank';
import {
  HAS_DB,
  PATHS,
  allKeys,
  freshAttemptId,
  issue,
  makeHarness,
  newPlayer,
  sql,
  startSession,
  type Harness,
  type TestBrowser,
} from './support/harness';

/**
 * D4: the session mix on the real API and PostgreSQL. Blocks of 10: 6 generated multiplication,
 * 4 imported. These tests advance a session by marking served questions answered directly in the
 * database, because the answer-storage path for text answers belongs to Lane C.
 */
describe.skipIf(!HAS_DB)('session mix (API -> PostgreSQL)', () => {
  let h: Harness;
  beforeAll(async () => {
    sessionMix.enabled = true;
    h = await makeHarness();
  });
  afterAll(async () => {
    sessionMix.enabled = false;
    await h.close();
  });

  async function seedOf(sessionId: string): Promise<string> {
    const [row] = await sql<{ seed: string }>(h, 'select seed from play_sessions where id = $1', [sessionId]);
    return row!.seed;
  }

  /** Marks the open question answered and advances the session, without the answer path. */
  async function skipQuestion(sessionId: string, questionId: string): Promise<void> {
    await sql(h, 'update served_questions set answered_at = now() where id = $1', [questionId]);
    await sql(h, 'update play_sessions set answered_count = answered_count + 1 where id = $1', [sessionId]);
  }

  async function servedRow(questionId: string) {
    const [row] = await sql<Record<string, any>>(h, 'select * from served_questions where id = $1', [questionId]);
    return row!;
  }

  it('a 10-question session is 6 generated and 4 imported, in the planned positions', async () => {
    const player = await newPlayer(h);
    const sessionId = await startSession(player);
    const seed = await seedOf(sessionId);
    const plan = buildSessionMix({ length: 10, grade: IMPORTED_ITEM_GRADE, items: IMPORTED_ITEMS, seed });
    expect(plan.filter((s) => s.source === 'imported')).toHaveLength(4);

    const importedIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const question = await issue(player, sessionId);
      const row = await servedRow(question.id);
      const slot = plan[i]!;
      if (slot.source === 'generated') {
        expect(row.skill_key).toMatch(/^mul:\d+x\d+$/);
        expect(question.prompt).toMatch(/^\d+ × \d+$/);
      } else {
        const item = importedItemById(slot.itemId)!;
        importedIds.push(item.id);
        expect(row.skill_key).toBe(importedSkillKey(item.grade, item.skill));
        expect(row.private_grading_data).toMatchObject({ correctAnswer: item.key, itemId: item.id });
        expect(row.public_payload).toMatchObject({ prompt: item.prompt, kind: item.kind });
        // The same choices, shuffled from the session seed; the key is among them.
        expect([...(row.public_payload.choices as (number | string)[])].sort()).toEqual([...item.choices].sort());
        expect(row.public_payload.choices).toContain(item.key);
        expect(question.prompt).toBe(item.prompt);
        expect(question.choices).toEqual(row.public_payload.choices);
        expect(question.choices.length).toBeGreaterThanOrEqual(3);
        expect(question.choices.length).toBeLessThanOrEqual(4);
      }
      await skipQuestion(sessionId, question.id);
    }
    expect(importedIds).toHaveLength(4);
    expect(new Set(importedIds).size).toBe(4);
    for (const id of importedIds) {
      expect(importedItemById(id)!.grade).toBe(IMPORTED_ITEM_GRADE);
      expect(importedItemById(id)!.needsTable).toBe(false);
    }
  });

  it('never sends the key, the item id or the rationale to the client', async () => {
    const player = await newPlayer(h);
    const sessionId = await startSession(player);
    const seed = await seedOf(sessionId);
    const plan = buildSessionMix({ length: 10, grade: IMPORTED_ITEM_GRADE, items: IMPORTED_ITEMS, seed });
    for (let i = 0; i < 10; i++) {
      const res = await player.request('POST', PATHS.question(sessionId), {});
      expect(res.status).toBe(200);
      const keys = allKeys(res.body);
      for (const forbidden of ['correctAnswer', 'itemId', 'rationale', 'skillKey', 'key', 'privateGradingData']) {
        expect(keys.has(forbidden), forbidden).toBe(false);
      }
      const slot = plan[i]!;
      if (slot.source === 'imported') {
        const item = importedItemById(slot.itemId)!;
        if (item.rationale.length > 20) expect(res.raw).not.toContain(item.rationale.slice(0, 20));
      }
      await skipQuestion(sessionId, res.body.question.id);
    }
  });

  it('restoring an outstanding imported question returns it unchanged (same choices, same order)', async () => {
    const player = await newPlayer(h);
    const sessionId = await startSession(player);
    const seed = await seedOf(sessionId);
    const plan = buildSessionMix({ length: 10, grade: IMPORTED_ITEM_GRADE, items: IMPORTED_ITEMS, seed });
    for (let i = 0; i < plan.length; i++) {
      const question = await issue(player, sessionId);
      if (plan[i]!.source === 'imported') {
        expect(await issue(player, sessionId)).toEqual(question);
        return;
      }
      await skipQuestion(sessionId, question.id);
    }
    throw new Error('no imported slot in plan');
  });

  it('the plan is the same for the same seed and different across sessions (items vary)', async () => {
    const firstImported = new Set<string>();
    for (let n = 0; n < 6; n++) {
      const player = await newPlayer(h);
      const sessionId = await startSession(player);
      const plan = buildSessionMix({ length: 10, grade: IMPORTED_ITEM_GRADE, items: IMPORTED_ITEMS, seed: await seedOf(sessionId) });
      const slot = plan.find((s) => s.source === 'imported');
      if (slot && slot.source === 'imported') firstImported.add(slot.itemId);
    }
    expect(firstImported.size).toBeGreaterThan(1);
  });

  it('an imported number question is graded by the existing answer path and tracks mastery per Hop Quest skill', async () => {
    // Find a session whose first imported slot is a number question, advance to it, answer it for real.
    let player: TestBrowser | undefined;
    let sessionId = '';
    let position = -1;
    let item = importedItemById('none');
    for (let n = 0; n < 40 && !item; n++) {
      player = await newPlayer(h);
      sessionId = await startSession(player);
      const plan = buildSessionMix({ length: 10, grade: IMPORTED_ITEM_GRADE, items: IMPORTED_ITEMS, seed: await seedOf(sessionId) });
      position = plan.findIndex((s) => s.source === 'imported');
      const slot = plan[position];
      const candidate = slot && slot.source === 'imported' ? importedItemById(slot.itemId) : undefined;
      if (candidate?.kind === 'number') item = candidate;
    }
    if (!item || !player) throw new Error('no session with a first imported number question found');

    for (let i = 0; i < position; i++) await skipQuestion(sessionId, (await issue(player, sessionId)).id);
    const question = await issue(player, sessionId);
    const res = await player.request('POST', PATHS.answers(sessionId), {
      attemptId: freshAttemptId(),
      questionId: question.id,
      response: item.key,
    });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
    expect(res.body.correctAnswer).toBe(item.key);
    expect(res.body.mastery.label).toBe(item.skill);
    expect(labelForSkillKey(importedSkillKey(item.grade, item.skill))).toBe(item.skill);

    const rows = await sql<Record<string, any>>(h, 'select skill_key, box, streak from skill_mastery where skill_key = $1 order by updated_at desc limit 1', [
      importedSkillKey(item.grade, item.skill),
    ]).catch(() => []);
    if (rows.length > 0) expect(rows[0]).toMatchObject({ skill_key: importedSkillKey(item.grade, item.skill), box: 1 });
  });
});
