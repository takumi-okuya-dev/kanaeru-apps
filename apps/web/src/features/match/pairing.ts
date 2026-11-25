// 試合の組み方（PRD 試合表アプリ FR-M8・addendum.md の1〜2章。構成の決めごと AD-29）。画面の側に置く、状態を持たない関数。
// くじは種（seed）から作る決まった乱数で引き、同じ名簿・同じ種なら同じ表になる。説明は planGames の docstring に書く。

/** 組む人（呼び名は持たない。ID とレベルの段だけ）。 */
export type PairingPlayer = {
  /** 名簿の人の ID */
  id: string;
  /** レベルの段（上級 0・中級 1・初級 2・入門 3。分けないときに1試合の差を比べる） */
  level: number;
};

/** planGames が受け取るもの。 */
export type PairingInput = {
  /** これからの試合に出られる人（来なかった人・まだ来ていない人は入れない）。並びは名簿の順 */
  players: readonly PairingPlayer[];
  /** 1試合に入る人数（ダブルスは4・シングルスは2） */
  playersPerGame: number;
  /** これから組む試合の数 */
  gameCount: number;
  /** くじの種（32ビットの整数） */
  seed: number;
  /** 終わった試合（そのまま残す。古い順。今は出られない人を含んでよい） */
  history?: readonly (readonly string[])[];
  /** 1試合の中のレベルの差の上限（段。分けないときだけ 2 を渡す。なければ比べない） */
  maxLevelSpread?: number;
};

/** 周の残りから選ぶ前に、くじで絞る人数の上限（addendum.md 1章の4）。 */
export const CANDIDATE_POOL_LIMIT = 12;

/**
 * 種から、決まった並びの乱数を作る（mulberry32。0 以上 1 未満）。
 * @param seed 種（32ビットの整数）
 * @returns 呼ぶたびに次の乱数を返す関数
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 種と文字から、別の種を作る（組ごと・組み直しごとに別のくじにするため。FNV-1a）。
 * @param seed もとの種
 * @param salt 混ぜる文字（組の key など）
 * @returns 32ビットの整数の種
 */
export function deriveSeed(seed: number, salt: string): number {
  let hash = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
  for (const char of salt) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash | 0;
}

/**
 * 2人の組の鍵（並びによらない）。
 * @param a 1人目の ID
 * @param b 2人目の ID
 * @returns 鍵
 */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/**
 * 並びから、くじで最大 limit 人を選ぶ（並びの順は保つ。limit 以下ならそのまま）。
 * @param items 並び
 * @param limit 上限
 * @param random 乱数
 * @returns 選んだ並び
 */
function sample<T>(items: readonly T[], limit: number, random: () => number): T[] {
  if (items.length <= limit) return [...items];
  const indexes = items.map((_, index) => index);
  for (let i = 0; i < limit; i += 1) {
    const j = i + Math.floor(random() * (indexes.length - i));
    [indexes[i], indexes[j]] = [indexes[j] as number, indexes[i] as number];
  }
  return indexes
    .slice(0, limit)
    .sort((a, b) => a - b)
    .map((index) => items[index] as T);
}

/**
 * 並びから size 人の組み合わせを、すべて順に渡す。
 * @param items 並び
 * @param size 選ぶ人数
 * @param visit 組み合わせを受け取る関数
 */
function forEachCombination<T>(items: readonly T[], size: number, visit: (combo: T[]) => void) {
  const combo: T[] = [];
  const walk = (start: number) => {
    if (combo.length === size) {
      visit([...combo]);
      return;
    }
    for (let i = start; i <= items.length - (size - combo.length); i += 1) {
      combo.push(items[i] as T);
      walk(i + 1);
      combo.pop();
    }
  };
  walk(0);
}

/**
 * 並びをくじで混ぜる（Fisher–Yates。もとの並びは変えない）。
 * @param items 並び
 * @param random 乱数
 * @returns 混ぜた並び
 */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/**
 * 1つの組（レベルの分け方で分けた組）の試合を組む。ダブルスは1試合に入る4人、シングルスは2人を決める
 * （ペアは決めない。ペアはコートに入るときに2と2に分ける。FR-M9）。
 *
 * ## 流れ（addendum.md 1章）
 *
 * 1試合ずつ、古い順に決める。
 *
 * 1. **周**：組の全員を「この周でまだ出ていない人」の入れ物に入れ、1試合ごとに入れ物から人を選んで出す。入れ物が空になったら、
 *    次の周として全員を入れ直す。これで全員が1回ずつ出るまで、同じ人は2回出ない（12人のダブルスなら 12C4 → 8C4 → 4C4）。
 *    実装では入れ物を持たず、「出た数（下の「数えなおした出た数」）がいちばん少ない人」を入れ物の中身とみなす（同じ意味になる）。
 * 2. **周の残りからの選び方**：入れ物の中の人の組み合わせのうち、「これまで同じ試合に入った回数」の2乗の合計がいちばん小さい
 *    組み合わせを選ぶ（まだ一緒になっていない人どうしを選び、顔ぶれを散らす）。
 * 3. **周の変わり目**：入れ物に1試合分の人数がいないときは、残りの人を必ず入れ、足りない分を次の周の人（入れ物の外の人）から選ぶ。
 *    選ばれた人は、次の周ではもう1回出たことになる（次の周の入れ物から外れる）。このとき、直前の試合に出た人はなるべく選ばない。
 * 4. **候補が多いとき**：入れ物（または次の周の人）が12人より多いときは、くじで選んだ12人の中から組み合わせを選ぶ
 *    （組み合わせの数を抑えるため）。
 *
 * ## 守る決まりの順（上ほど先。FR-M8。持ち主が決めた）
 *
 * 1. 全員が1回ずつ出たら次の周に入る（試合の数の差を1回以内にする）。これは選ぶ前の「入れ物」で必ず守る。
 * 2. （分けないときだけ）1試合の中のレベルの差を `maxLevelSpread` 段以内にする（FR-M6。分けないときは 2 段）。
 *    周の残りが1試合分以下になる選び方では、残りの人は次の試合に必ず入るので、残りの人の差も足して比べる（1つ先を見る）。
 * 3. 顔ぶれを散らす（同じ試合に入った回数の2乗の合計が小さいもの）。
 * 4. 直前の試合に出た人を続けて入れない（3 と両立しないときは 3 を先にする。持ち主が決めた）。
 * 5. ここまでで同じ点の組み合わせが複数あれば、くじで選ぶ。
 *
 * 選んだ人の並び（表の列の順）も、くじで混ぜる（同じ人がいつも左に出ないように）。
 *
 * ## くじの種
 *
 * くじは `seed` から作る決まった乱数（mulberry32）で引く。同じ名簿（人の並び・レベル）・同じ終わった試合・同じ試合の数・同じ種なら、
 * いつも同じ表になる（画面の再描画・端末の違いで表が変わらない）。「別の組み合わせにする」は種を変える。組ごと・組み直しごとに
 * 別のくじにしたいときは、呼ぶ側が `deriveSeed` で種を作る。
 *
 * ## 当日の組み直し（addendum.md 2章）
 *
 * 終わった試合を `history` に渡すと、それをそのまま前提にして続きを組む（返すのは新しい試合だけ。終わった試合は変えない）。
 * 「同じ試合に入った回数」「出た数」「直前の試合」は、終わった試合から数えなおす。`players` にいない人（来なかった・帰った）は
 * これからの試合に入らない。数えなおした出た数は「出られる人の出た数の最大 − 1」より下げない：遅れて来た人は、来るまでの試合を
 * 数えず、今の周の入れ物に入る（試合の数の差を、いた間の数で1回以内にする）。
 *
 * ## 守れない場合
 *
 * - 出られる人が1試合の人数より少ないとき：その組の試合は組めない。組めたところまで（0試合のこともある）を返す。
 *   呼ぶ側は「一緒にする分け方をすすめる」を出す（PRD FR-M6）。
 * - 5〜7人のダブルスのように休む人が少ないとき：決まり4（続けて出ない）は守れず、2回続けて出る人が出る（決まり3を先にするため）。
 * - レベルの差：差が上限以内の組み合わせがないとき（例：残りが上級と入門だけ）は、差のいちばん小さいものを選ぶ。
 *   12人に絞ったくじによっては、絞る前にはあった上限以内の組み合わせを逃すことがある。
 * - 顔ぶれ：人数に対して試合が多いと、同じ人と何度も同じ試合に入るのは避けられない（2乗の合計で、偏りだけを小さくする）。
 *
 * @param input 組む人・1試合の人数・試合の数・くじの種・終わった試合・レベルの差の上限
 * @returns 新しく組んだ試合（古い順。1試合は入る人の ID の並び）。組めないときは短い（空のこともある）
 */
export function planGames(input: PairingInput): string[][] {
  const { players, playersPerGame: size, gameCount, seed, history = [], maxLevelSpread } = input;
  const random = createRandom(seed);
  const levelOf = new Map(players.map((player) => [player.id, player.level]));
  const together = new Map<string, number>();
  const played = new Map<string, number>();
  let previous = new Set<string>();

  /**
   * 試合を数に足す（同じ試合に入った回数・出た数・直前の試合）。
   * @param game 試合に入った人
   */
  const record = (game: readonly string[]) => {
    for (const id of game) played.set(id, (played.get(id) ?? 0) + 1);
    for (let i = 0; i < game.length; i += 1) {
      for (let j = i + 1; j < game.length; j += 1) {
        const key = pairKey(game[i] as string, game[j] as string);
        together.set(key, (together.get(key) ?? 0) + 1);
      }
    }
    previous = new Set(game);
  };
  for (const game of history) record(game);

  const ids = [...new Set(players.map((player) => player.id))];
  if (ids.length < size || size < 1) return [];
  // 遅れて来た人を今の周に入れる（出た数を「最大 − 1」より下げない。周の入れ物＝出た数がいちばん少ない人）
  const top = Math.max(0, ...ids.map((id) => played.get(id) ?? 0));
  const count = new Map(ids.map((id) => [id, Math.max(played.get(id) ?? 0, top - 1)]));

  /**
   * 人の並びのレベルの差が、上限を何段超えるか（上限がなければ 0）。
   * @param members 人の並び
   * @returns 超えた段の数
   */
  const spreadExcess = (members: readonly string[]): number => {
    if (maxLevelSpread === undefined || members.length === 0) return 0;
    const levels = members.map((id) => levelOf.get(id) ?? 0);
    return Math.max(0, Math.max(...levels) - Math.min(...levels) - maxLevelSpread);
  };

  /**
   * 組み合わせの点（小さいほどよい。前の欄ほど先に比べる）。
   * @param game 組み合わせ
   * @param pool 今の周の入れ物（1つ先を見るため）
   * @returns 点の並び（レベルの差の超え〈1つ先の残りの分も足す〉・同じ試合に入った回数の2乗の合計・直前の試合に出た人の数）
   */
  const scoreOf = (game: readonly string[], pool: readonly string[]): [number, number, number] => {
    let spread = spreadExcess(game);
    if (maxLevelSpread !== undefined) {
      // 1つ先を見る：周の残りが1試合分以下になるなら、残りの人は次の試合に必ず入るので、残りの差も数える
      const rest = pool.filter((id) => !game.includes(id));
      if (rest.length <= size) spread += spreadExcess(rest);
    }
    let squares = 0;
    for (let i = 0; i < game.length; i += 1) {
      for (let j = i + 1; j < game.length; j += 1) {
        const times = together.get(pairKey(game[i] as string, game[j] as string)) ?? 0;
        squares += times * times;
      }
    }
    const repeats = game.filter((id) => previous.has(id)).length;
    return [spread, squares, repeats];
  };

  const games: string[][] = [];
  for (let n = 0; n < gameCount; n += 1) {
    const least = Math.min(...ids.map((id) => count.get(id) ?? 0));
    const pool = ids.filter((id) => count.get(id) === least);
    const fixed = pool.length >= size ? [] : pool;
    const choices =
      pool.length >= size
        ? sample(pool, CANDIDATE_POOL_LIMIT, random)
        : sample(
            ids.filter((id) => count.get(id) !== least),
            CANDIDATE_POOL_LIMIT,
            random,
          );
    let best: string[] = [];
    let bestScore: [number, number, number] | undefined;
    let ties = 0;
    forEachCombination(choices, size - fixed.length, (picked) => {
      const game = [...fixed, ...picked];
      const score = scoreOf(game, pool);
      const order = bestScore ? compareScores(score, bestScore) : -1;
      if (order < 0) {
        best = game;
        bestScore = score;
        ties = 1;
      } else if (order === 0) {
        // 同じ点はくじ（見た順によらず、どれも同じ確からしさで選ばれる）
        ties += 1;
        if (random() * ties < 1) best = game;
      }
    });
    for (const id of best) count.set(id, (count.get(id) ?? 0) + 1);
    record(best);
    games.push(shuffle(best, random));
  }
  return games;
}

/**
 * 点の並びを前の欄から比べる。
 * @param a 1つ目
 * @param b 2つ目
 * @returns a が小さければ負、同じなら 0、大きければ正
 */
function compareScores(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
