// 時間差のメンション（threads-007。めぐるの mention/mention-service.ts・mention-view.ts を写した）。
// 承認した返信の文は書き換えない（めぐるの原則II）。人を一覧から消したとき、承認済みは承認待ちに戻し、投稿済みの予定は「やめた」にする。
// 返信そのものは定期の仕事（mention-runner.ts）が出す。本文・返信の文はログに出さない。
import {
  MENTION_DELAY_DEFAULT,
  MENTION_PEOPLE_MAX,
  MENTION_PER_REPLY_MAX,
  MENTION_PUBLISHED_DAYS,
  MENTION_SAME_PERSON_HOURS,
  THREADS_ERRORS,
  buildMentionText,
  checkPublishable,
  findNgWords,
  mentionDueAt,
  mentionUsernamesIn,
  normalizeMentionUsername,
  threadsLength,
  toggleMentionInText,
} from "@workspace/contracts/threads";
import type {
  MentionAttachInput,
  MentionPersonUpdateInput,
  MentionSettings,
  MentionSettingsInput,
  PostMention,
} from "@workspace/contracts/threads";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { lockKey } from "./locks.ts";
import { changeDraftState, listNgWords, lockDrafts } from "./repository.ts";
import type { PostDraftRecord, ThreadsAccountRecord } from "./repository.ts";
import {
  threadsAccount,
  threadsMentionPerson,
  threadsMentionSetting,
  threadsPostDraft,
  threadsPostMention,
} from "./schema.ts";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** 案の時間差のメンションの行。 */
export type PostMentionRow = typeof threadsPostMention.$inferSelect;

/**
 * 入力の誤り（欄のそばに出す）。
 * @param path 欄
 * @param message 文
 * @returns エラー
 */
function invalid(path: string, message: string): AppError {
  return new AppError("INVALID_INPUT", { fields: [{ path, message }] });
}

/**
 * 行を応答の形にする。
 * @param row 時間差のメンションの行
 * @param publishedAt 案の投稿した日時（投稿の前は null）
 * @param username 運用アカウントの Threads のユーザー名（返信の URL を作る。わからなければ null）
 * @returns 応答の時間差のメンション
 */
export function toPostMention(
  row: PostMentionRow,
  publishedAt: Date | null,
  username: string | null,
): PostMention {
  return {
    usernames: row.usernames,
    text: row.text,
    delayMinutes: row.delayMinutes,
    state: row.state,
    dueAt:
      mentionDueAt(
        { delayMinutes: row.delayMinutes, sendAfter: row.sendAfter },
        publishedAt,
      )?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    failureReason: row.failureReason,
    replyPermalink:
      row.replyMediaId && username
        ? `https://www.threads.com/@${username}/post/${row.replyMediaId}`
        : null,
  };
}

/**
 * 案の時間差のメンションを、まとめて読む。
 * @param db DB
 * @param drafts 案（ID と投稿した日時）
 * @param username 運用アカウントの Threads のユーザー名
 * @returns 案の ID から応答の時間差のメンションへ
 */
export async function loadMentions(
  db: Executor,
  drafts: readonly { id: string; publishedAt: Date | null }[],
  username: string | null,
): Promise<Map<string, PostMention>> {
  if (drafts.length === 0) return new Map();
  const rows = await db
    .select()
    .from(threadsPostMention)
    .where(
      inArray(
        threadsPostMention.draftId,
        drafts.map((draft) => draft.id),
      ),
    );
  const publishedAt = new Map(drafts.map((draft) => [draft.id, draft.publishedAt]));
  return new Map(
    rows.map((row) => [
      row.draftId,
      toPostMention(row, publishedAt.get(row.draftId) ?? null, username),
    ]),
  );
}

/**
 * ひとこと・時間差・人を読む。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns ひとこと・時間差・版・人
 */
async function readSettings(db: Executor, threadsAccountId: string) {
  const [[row], people] = await Promise.all([
    db
      .select()
      .from(threadsMentionSetting)
      .where(eq(threadsMentionSetting.threadsAccountId, threadsAccountId))
      .limit(1),
    db
      .select()
      .from(threadsMentionPerson)
      .where(eq(threadsMentionPerson.threadsAccountId, threadsAccountId))
      .orderBy(asc(threadsMentionPerson.createdAt), asc(threadsMentionPerson.id)),
  ]);
  return {
    message: row?.message ?? "",
    delayMinutes: row?.delayMinutes ?? MENTION_DELAY_DEFAULT,
    version: row?.version ?? 0,
    people,
  };
}

/**
 * 今は選べない人の行（まだ出していない予定・24時間以内に出した返信）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 * @param exceptDraftId 数えない案
 * @returns 行
 */
async function busyRows(
  db: Executor,
  threadsAccountId: string,
  now: Date,
  exceptDraftId: string | null,
) {
  const since = new Date(now.getTime() - MENTION_SAME_PERSON_HOURS * HOUR_MS);
  return db
    .select({
      draftId: threadsPostMention.draftId,
      usernames: threadsPostMention.usernames,
      state: threadsPostMention.state,
    })
    .from(threadsPostMention)
    .where(
      and(
        eq(threadsPostMention.threadsAccountId, threadsAccountId),
        exceptDraftId ? ne(threadsPostMention.draftId, exceptDraftId) : undefined,
        sql`(${threadsPostMention.state} = 'pending' OR (${threadsPostMention.state} = 'sent' AND ${threadsPostMention.sentAt} > ${since}))`,
      ),
    );
}

/**
 * メンションの設定（ひとこと・時間差・人・今は選べない人）。
 * @param db DB
 * @param account 運用アカウント
 * @param now 今
 * @returns 設定
 */
export async function getMentionSettings(
  db: Executor,
  account: ThreadsAccountRecord,
  now: Date,
): Promise<MentionSettings> {
  const [settings, busy, [fresh]] = await Promise.all([
    readSettings(db, account.id),
    busyRows(db, account.id, now, null),
    db
      .select({ repliesDeniedAt: threadsAccount.repliesDeniedAt })
      .from(threadsAccount)
      .where(eq(threadsAccount.id, account.id)),
  ]);
  const pending = busy.filter((row) => row.state === "pending");
  return {
    message: settings.message,
    delayMinutes: settings.delayMinutes,
    version: settings.version,
    people: settings.people.map((person) => ({
      id: person.id,
      username: person.username,
      label: person.label,
      always: person.always,
      pendingCount: pending.filter((row) => row.usernames.includes(person.username)).length,
    })),
    repliesDenied: (fresh?.repliesDeniedAt ?? null) !== null,
    blocked: busy.flatMap((row) =>
      row.usernames.map((username) => ({
        username,
        draftId: row.draftId,
        reason: row.state === "sent" ? ("recent" as const) : ("pending" as const),
      })),
    ),
  };
}

/**
 * ひとことと時間差を保存する（読んだ版と同じときだけ。NG ワードを含むひとことは保存しない）。
 * @param db DB
 * @param account 運用アカウント
 * @param input 入力
 * @returns 設定
 * @throws {AppError} NG ワード（INVALID_INPUT）・版が合わない（THREADS_VERSION_CONFLICT）
 */
export async function saveMentionSettings(
  db: Db,
  account: ThreadsAccountRecord,
  input: MentionSettingsInput,
): Promise<MentionSettings> {
  const ngWords = await listNgWords(db, account.id);
  const hits = findNgWords(input.message, ngWords);
  if (hits.length > 0)
    throw invalid(
      "message",
      `NGワード（${hits.map((hit) => hit.word).join("、")}）を外してください。`,
    );
  const values = { message: input.message, delayMinutes: input.delayMinutes };
  const [row] =
    input.version === 0
      ? await db
          .insert(threadsMentionSetting)
          .values({ threadsAccountId: account.id, ...values })
          .onConflictDoNothing()
          .returning()
      : await db
          .update(threadsMentionSetting)
          .set({ ...values, version: sql`${threadsMentionSetting.version} + 1` })
          .where(
            and(
              eq(threadsMentionSetting.threadsAccountId, account.id),
              eq(threadsMentionSetting.version, input.version),
            ),
          )
          .returning();
  if (!row) throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
  return getMentionSettings(db, account, new Date());
}

/**
 * メンションする人を足す。
 * @param db DB
 * @param account 運用アカウント
 * @param input ユーザー名・呼び名・いつも付ける
 * @returns 設定
 * @throws {AppError} 形・自分・同じ人（INVALID_INPUT）・上限（THREADS_ITEM_LIMIT）
 */
export async function addMentionPerson(
  db: Db,
  account: ThreadsAccountRecord,
  input: { username: string; label: string; always: boolean },
): Promise<MentionSettings> {
  const username = normalizeMentionUsername(input.username);
  if (!username)
    throw invalid(
      "username",
      "ユーザー名は、英小文字・数字・「.」「_」の30文字までで入れてください。",
    );
  if (username === account.username?.toLowerCase())
    throw invalid("username", "このアカウント自身は足せません。");
  await db.transaction(async (tx) => {
    // 同時に足しても上限と重なりを超えないよう、運用アカウントごとの鍵をかける
    await lockKey(tx, `threads-mention-people:${account.id}`);
    const people = await tx
      .select({ username: threadsMentionPerson.username })
      .from(threadsMentionPerson)
      .where(eq(threadsMentionPerson.threadsAccountId, account.id));
    if (people.some((person) => person.username === username))
      throw invalid("username", "同じ人がもういます。");
    if (people.length >= MENTION_PEOPLE_MAX) throw new AppError(THREADS_ERRORS.THREADS_ITEM_LIMIT);
    await tx.insert(threadsMentionPerson).values({
      threadsAccountId: account.id,
      username,
      label: input.label,
      always: input.always,
    });
  });
  return getMentionSettings(db, account, new Date());
}

/**
 * メンションする人の呼び名・いつも付けるを直す。
 * @param db DB
 * @param account 運用アカウント
 * @param personId 人の ID
 * @param input 呼び名・いつも付ける
 * @returns 設定
 * @throws {AppError} ないとき（NOT_FOUND）
 */
export async function updateMentionPerson(
  db: Db,
  account: ThreadsAccountRecord,
  personId: string,
  input: MentionPersonUpdateInput,
): Promise<MentionSettings> {
  const [row] = await db
    .update(threadsMentionPerson)
    .set({ label: input.label, always: input.always })
    .where(
      and(
        eq(threadsMentionPerson.id, personId),
        eq(threadsMentionPerson.threadsAccountId, account.id),
      ),
    )
    .returning();
  if (!row) throw new AppError("NOT_FOUND");
  return getMentionSettings(db, account, new Date());
}

/**
 * メンションする人を消す。承認した文は書き換えない：承認待ち・承認済みの案は文からその人を外して承認待ちにし、
 * 投稿済みの予定は「やめた」にする（公開を送ったあとは、出たかを確かめるため取りやめない）。
 * @param db DB
 * @param account 運用アカウント
 * @param personId 人の ID
 * @returns 設定
 * @throws {AppError} ないとき（NOT_FOUND）
 */
export async function removeMentionPerson(
  db: Db,
  account: ThreadsAccountRecord,
  personId: string,
): Promise<MentionSettings> {
  await db.transaction(async (tx) => {
    const [person] = await tx
      .delete(threadsMentionPerson)
      .where(
        and(
          eq(threadsMentionPerson.id, personId),
          eq(threadsMentionPerson.threadsAccountId, account.id),
        ),
      )
      .returning();
    if (!person) throw new AppError("NOT_FOUND");
    const rows = await tx
      .select({ mention: threadsPostMention, draft: threadsPostDraft })
      .from(threadsPostMention)
      .innerJoin(threadsPostDraft, eq(threadsPostDraft.id, threadsPostMention.draftId))
      .where(
        and(
          eq(threadsPostMention.threadsAccountId, account.id),
          eq(threadsPostMention.state, "pending"),
          sql`${person.username} = ANY(${threadsPostMention.usernames})`,
        ),
      )
      .for("update", { of: threadsPostDraft });
    for (const { mention, draft } of rows) {
      if (draft.status === "needs_review" || draft.status === "approved") {
        const usernames = mention.usernames.filter((name) => name !== person.username);
        if (usernames.length === 0)
          await tx.delete(threadsPostMention).where(eq(threadsPostMention.draftId, draft.id));
        else
          await tx
            .update(threadsPostMention)
            .set({ usernames, text: toggleMentionInText(mention.text, person.username) })
            .where(eq(threadsPostMention.draftId, draft.id));
        // 返信の文が変わるので、承認済みは承認待ちに戻す。承認待ちも版を上げて、画面の古い版での保存を止める
        await reopenOrBump(tx, draft);
      } else if (!mention.publishRequestedAt) {
        await tx
          .update(threadsPostMention)
          .set({ state: "canceled" })
          .where(eq(threadsPostMention.draftId, draft.id));
      }
    }
  });
  return getMentionSettings(db, account, new Date());
}

/**
 * 承認済みの案は承認待ちに戻し、承認待ちの案は版だけを上げる。
 * @param tx トランザクション
 * @param draft 案
 * @returns 直したあとの案
 */
async function reopenOrBump(tx: Executor, draft: PostDraftRecord): Promise<PostDraftRecord> {
  if (draft.status === "approved") {
    const [row] = await changeDraftState(tx, [draft.id], { status: "needs_review" });
    return row ?? draft;
  }
  const [row] = await tx
    .update(threadsPostDraft)
    .set({ version: sql`${threadsPostDraft.version} + 1` })
    .where(eq(threadsPostDraft.id, draft.id))
    .returning();
  return row ?? draft;
}

/**
 * 今は選べない人（ほかの投稿でまだ出していない予定に入っている人と、24時間以内に返信を出した人）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param exceptDraftId 数えない案（付けようとしている案）
 * @param now 今
 * @returns ユーザー名の集まり
 */
async function blockedUsernames(
  db: Executor,
  threadsAccountId: string,
  exceptDraftId: string,
  now: Date,
): Promise<Set<string>> {
  const rows = await busyRows(db, threadsAccountId, now, exceptDraftId);
  return new Set(rows.flatMap((row) => row.usernames));
}

/**
 * 時間差のメンションを付ける・直す。承認待ち・承認済みの案には時間差で付け（承認済みは承認し直し）、
 * 投稿済み（7日以内・付いていない・返信の権限がある）の案には今から出す（押したことを返信の文の承認とする）。
 * @param db DB
 * @param account 運用アカウント
 * @param draftId 案の ID
 * @param input 版・選んだ人・文
 * @param now 今
 * @returns 直したあとの案と、その時間差のメンション
 * @throws {AppError} ない・状態・版・人・文の誤り
 */
export async function attachMention(
  db: Db,
  account: ThreadsAccountRecord,
  draftId: string,
  input: MentionAttachInput,
  now: Date,
): Promise<{ draft: PostDraftRecord; mention: PostMention | null }> {
  const result = await db.transaction(async (tx) => {
    const [draft] = await lockDrafts(tx, account.id, [draftId]);
    if (!draft) throw new AppError("NOT_FOUND");
    if (draft.version !== input.version)
      throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
    const settings = await readSettings(tx, account.id);
    const known = settings.people.map((person) => person.username);
    const requested = input.usernames.map((name) => name.toLowerCase());
    // 文があれば、文の中の一覧の人が選んだ人。なければ選んだ人から文を作る
    const text = input.text?.trim() ?? buildMentionText(settings.message, requested);
    const usernames = input.text !== undefined ? mentionUsernamesIn(text, known) : requested;
    if (usernames.some((name) => !known.includes(name)))
      throw invalid(
        "usernames",
        "一覧にない人は選べません。設定でメンションする人に足してください。",
      );
    if (usernames.length < 1 || usernames.length > MENTION_PER_REPLY_MAX)
      throw invalid(
        "text",
        `返信の文に、一覧の人を1〜${MENTION_PER_REPLY_MAX}人入れてください（@ユーザー名）。`,
      );
    if (threadsLength(text) > 500) throw invalid("text", "返信の文は500文字までにしてください。");
    const blocked = await blockedUsernames(tx, account.id, draftId, now);
    if (usernames.some((name) => blocked.has(name)))
      throw new AppError(THREADS_ERRORS.THREADS_MENTION_BLOCKED);

    const [existing] = await tx
      .select()
      .from(threadsPostMention)
      .where(eq(threadsPostMention.draftId, draftId));
    if (draft.status === "needs_review" || draft.status === "approved") {
      const values = {
        usernames,
        text,
        delayMinutes: settings.delayMinutes,
        sendAfter: null,
        state: "pending" as const,
        failureReason: null,
        containerId: null,
        publishRequestedAt: null,
        attempts: 0,
        nextAttemptAt: null,
      };
      await tx
        .insert(threadsPostMention)
        .values({ draftId, threadsAccountId: account.id, ...values })
        .onConflictDoUpdate({ target: threadsPostMention.draftId, set: values });
      // 承認のあとに返信の文を変えたら、承認し直し（本文を直したときと同じ）
      return reopenOrBump(tx, draft);
    }
    if (draft.status === "published") {
      const [fresh] = await tx
        .select({ repliesDeniedAt: threadsAccount.repliesDeniedAt })
        .from(threadsAccount)
        .where(eq(threadsAccount.id, account.id));
      const tooOld =
        !draft.publishedAt ||
        now.getTime() - draft.publishedAt.getTime() > MENTION_PUBLISHED_DAYS * DAY_MS;
      if (!draft.threadsMediaId || tooOld || existing || fresh?.repliesDeniedAt)
        throw new AppError(THREADS_ERRORS.THREADS_MENTION_NOT_ALLOWED);
      // 「返信する」が承認なので、ここで NG ワードと上限を確かめる
      if (!checkPublishable(text, await listNgWords(tx, account.id)).approvable)
        throw invalid("text", "返信の文に NG ワードがあるか、Threads の上限を超えています。");
      await tx.insert(threadsPostMention).values({
        draftId,
        threadsAccountId: account.id,
        usernames,
        text,
        delayMinutes: null,
        sendAfter: now,
      });
      return draft;
    }
    throw new AppError(THREADS_ERRORS.THREADS_MENTION_NOT_ALLOWED);
  });
  const mentions = await loadMentions(db, [result], account.username);
  return { draft: result, mention: mentions.get(result.id) ?? null };
}

/**
 * 時間差のメンションを外す・やめる。承認待ち・承認済みの案からは外し（版を上げる）、投稿済みの予定は「やめた」にする。
 * @param db DB
 * @param account 運用アカウント
 * @param draftId 案の ID
 * @returns 直したあとの案
 * @throws {AppError} ない（NOT_FOUND）・もう出した・出している途中（THREADS_MENTION_SENT）
 */
export async function detachMention(
  db: Db,
  account: ThreadsAccountRecord,
  draftId: string,
): Promise<PostDraftRecord> {
  return db.transaction(async (tx) => {
    const [draft] = await lockDrafts(tx, account.id, [draftId]);
    if (!draft) throw new AppError("NOT_FOUND");
    const [mention] = await tx
      .select()
      .from(threadsPostMention)
      .where(eq(threadsPostMention.draftId, draftId))
      .for("update");
    if (!mention) throw new AppError("NOT_FOUND");
    if (mention.state !== "pending" || mention.publishRequestedAt)
      throw new AppError(THREADS_ERRORS.THREADS_MENTION_SENT);
    if (draft.status === "needs_review" || draft.status === "approved") {
      await tx.delete(threadsPostMention).where(eq(threadsPostMention.draftId, draftId));
      const [row] = await tx
        .update(threadsPostDraft)
        .set({ version: sql`${threadsPostDraft.version} + 1` })
        .where(eq(threadsPostDraft.id, draftId))
        .returning();
      return row ?? draft;
    }
    await tx
      .update(threadsPostMention)
      .set({ state: "canceled" })
      .where(eq(threadsPostMention.draftId, draftId));
    return draft;
  });
}

/**
 * 承認のときの返信の文（予定のものだけ）。
 * @param db DB
 * @param draftIds 案の ID
 * @returns 案の ID から返信の文へ
 */
export async function pendingMentionTexts(
  db: Executor,
  draftIds: readonly string[],
): Promise<Map<string, string>> {
  if (draftIds.length === 0) return new Map();
  const rows = await db
    .select({ draftId: threadsPostMention.draftId, text: threadsPostMention.text })
    .from(threadsPostMention)
    .where(
      and(
        inArray(threadsPostMention.draftId, [...draftIds]),
        eq(threadsPostMention.state, "pending"),
      ),
    );
  return new Map(rows.map((row) => [row.draftId, row.text]));
}

/**
 * 却下した案の、まだ出していない時間差のメンションを消す（却下・削除でメンションもなくなる）。
 * @param db DB
 * @param draftIds 案の ID
 */
export async function dropPendingMentions(
  db: Executor,
  draftIds: readonly string[],
): Promise<void> {
  if (draftIds.length === 0) return;
  await db
    .delete(threadsPostMention)
    .where(
      and(
        inArray(threadsPostMention.draftId, [...draftIds]),
        eq(threadsPostMention.state, "pending"),
        sql`${threadsPostMention.publishRequestedAt} IS NULL`,
      ),
    );
}
