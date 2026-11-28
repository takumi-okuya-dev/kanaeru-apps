// 人物メモの検索（POST /api/v1/person/notes/search。specs/person/001-notes/research.md R6・AD-31）。
// 持ち主の行だけを DB で探す。言葉は search_text に LIKE（% と _ と \ を逃がし、ESCAPE '\'）で当て、会った場の名前は
// person_meeting.name_key に同じ形で当てて組の表で結ぶ。タグはそろえた形で tag_keys に当てる。言葉とタグを両方送ると AND。
// 当たった所の前後の文は、もとの文の中の位置（findMatches）で作る（画面はもう一度探さない）。言葉とタグはログに出さない。
import {
  PERSON_SEARCH_MAX,
  escapeLike,
  findMatches,
  normalizeForSearch,
  normalizeMeetingName,
  normalizeTag,
} from "@workspace/contracts/person";
import type {
  NoteSearchInput,
  PersonMatchField,
  SearchMatch,
  SearchMatchRange,
  SearchResult,
} from "@workspace/contracts/person";
import type { SQL } from "drizzle-orm";
import { and, arrayContains, desc, eq, exists, inArray, or, sql } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { toSummary } from "./repository.ts";
import { personMeeting, personNote, personNoteMeeting } from "./schema.ts";

/** 当たった所の前後に出す字数（コードポイント）。 */
export const SNIPPET_CONTEXT = 20;

/**
 * もとの文の当たった所と、前後の文を切り出す（字はコードポイントで数え、絵文字を割らない）。
 * @param field 当たった欄
 * @param original もとの文
 * @param range 当たった位置
 * @returns 当たった所
 */
function snippet(field: PersonMatchField, original: string, range: SearchMatchRange): SearchMatch {
  return {
    field,
    before: [...original.slice(0, range.start)].slice(-SNIPPET_CONTEXT).join(""),
    hit: original.slice(range.start, range.end),
    after: [...original.slice(range.end)].slice(0, SNIPPET_CONTEXT).join(""),
  };
}

/**
 * 1つの欄の、最初に当たった所（当たらなければ undefined）。
 * @param field 欄
 * @param original もとの文（なければ null）
 * @param query 探す言葉
 * @returns 当たった所
 */
function firstMatch(
  field: PersonMatchField,
  original: string | null,
  query: string,
): SearchMatch | undefined {
  if (!original) return undefined;
  const [range] = findMatches(original, query);
  return range ? snippet(field, original, range) : undefined;
}

/**
 * 探す（持ち主の行だけ。最後に保存した順に最大100人。より多いときは truncated）。
 * @param db DB
 * @param ownerAccountId 持ち主
 * @param input 探す言葉とタグ（どちらか。空の文字は送らなかったもの）
 * @returns 当たった人と、当たった所
 */
export async function searchNotes(
  db: Executor,
  ownerAccountId: string,
  input: NoteSearchInput,
): Promise<SearchResult> {
  const query = input.query ?? "";
  const tag = input.tag ?? "";
  const meetingPattern = `%${escapeLike(normalizeMeetingName(query))}%`;
  const conditions: (SQL | undefined)[] = [eq(personNote.ownerAccountId, ownerAccountId)];
  if (query !== "") {
    const pattern = `%${escapeLike(normalizeForSearch(query))}%`;
    conditions.push(
      or(
        sql`${personNote.searchText} like ${pattern} escape '\\'`,
        exists(
          db
            .select({ one: sql`1` })
            .from(personNoteMeeting)
            .innerJoin(personMeeting, eq(personMeeting.id, personNoteMeeting.meetingId))
            .where(
              and(
                eq(personNoteMeeting.noteId, personNote.id),
                sql`${personMeeting.nameKey} like ${meetingPattern} escape '\\'`,
              ),
            ),
        ),
      ),
    );
  }
  if (tag !== "") conditions.push(arrayContains(personNote.tagKeys, [normalizeTag(tag)]));
  const rows = await db
    .select()
    .from(personNote)
    .where(and(...conditions))
    .orderBy(desc(personNote.updatedAt), desc(personNote.id))
    .limit(PERSON_SEARCH_MAX + 1);
  const shown = rows.slice(0, PERSON_SEARCH_MAX);
  // 会った場の名前で当たった所（言葉があるときだけ。返す人の分をまとめて1回で読む）
  const meetingHits = new Map<string, string[]>();
  if (query !== "" && shown.length > 0) {
    const hits = await db
      .select({ noteId: personNoteMeeting.noteId, name: personMeeting.name })
      .from(personNoteMeeting)
      .innerJoin(personMeeting, eq(personMeeting.id, personNoteMeeting.meetingId))
      .where(
        and(
          inArray(
            personNoteMeeting.noteId,
            shown.map((row) => row.id),
          ),
          sql`${personMeeting.nameKey} like ${meetingPattern} escape '\\'`,
        ),
      )
      .orderBy(desc(personMeeting.metOn), desc(personMeeting.createdAt));
    for (const hit of hits) {
      meetingHits.set(hit.noteId, [...(meetingHits.get(hit.noteId) ?? []), hit.name]);
    }
  }
  return {
    items: shown.map((row) => {
      const matches: SearchMatch[] = [];
      if (query !== "") {
        const fields: [PersonMatchField, string | null][] = [
          ["fullName", row.fullName],
          ["reading", row.reading],
          ["lineName", row.lineName],
          ["appearance", row.appearance],
          ["talk", row.talk],
          ["nextTopic", row.nextTopic],
        ];
        for (const [field, value] of fields) {
          const match = firstMatch(field, value, query);
          if (match) matches.push(match);
        }
        const tagMatch = row.tags
          .map((value) => firstMatch("tags", value, query))
          .find((match) => match !== undefined);
        if (tagMatch) matches.push(tagMatch);
        for (const name of meetingHits.get(row.id) ?? []) {
          // 空白の数だけが違う名前は位置で当たらないので、名前全体を当たった所にする
          matches.push(
            firstMatch("meeting", name, query) ?? {
              field: "meeting",
              before: "",
              hit: name,
              after: "",
            },
          );
        }
      }
      return { note: toSummary(row), matches };
    }),
    truncated: rows.length > PERSON_SEARCH_MAX,
  };
}
