// 環境ごとの DB を権限で分ける（core-018）。本番とステージングは同じ Cloud SQL のサーバーの中の別の DB を使う（構成 B）。
// PostgreSQL の既定では、だれ（PUBLIC）でもほかの DB につなげ、Cloud SQL の API で作った DB の持ち主は cloudsqlsuperuser になる。
// そのままでは、ステージングの利用者が本番の DB につなぎ、public スキーマの持ち主として表を消せてしまう。
// DB の変更を当てる前に毎回（何度流しても同じ結果）、その DB につなげるのはその環境の利用者だけにし、DB と public スキーマの
// 持ち主をその利用者にする。Cloud SQL の API で作った利用者は cloudsqlsuperuser の一員なので、持ち主を替えられる。
import type pg from "pg";

/** 今の DB を、今の利用者だけのものにする SQL（current_database()・current_user から名前を作る）。 */
export const ISOLATE_DATABASE_SQL = `DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I', current_database(), current_user);
  EXECUTE format('ALTER DATABASE %I OWNER TO %I', current_database(), current_user);
  EXECUTE format('ALTER SCHEMA public OWNER TO %I', current_user);
  EXECUTE 'REVOKE CREATE ON SCHEMA public FROM PUBLIC';
END
$$;`;

/**
 * 今の DB を、今の利用者だけのものにする。
 * @param client つないだ DB（その環境の利用者）
 * @returns 終わったら終わる
 */
export async function isolateDatabase(client: pg.ClientBase): Promise<void> {
  await client.query(ISOLATE_DATABASE_SQL);
}
