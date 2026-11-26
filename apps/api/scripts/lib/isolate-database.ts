// 環境ごとの DB を権限で分ける（core-018）。本番とステージングは同じ Cloud SQL のサーバーの中の別の DB を使う（構成 B）。
// PostgreSQL の既定では、だれ（PUBLIC）でもほかの DB につなげ、Cloud SQL の API で作った DB の持ち主は cloudsqlsuperuser になる。
// そのままでは、ステージングの利用者が本番の DB につなぎ、public スキーマの持ち主として表を消せてしまう。
// DB の変更を当てる前に毎回（何度流しても同じ結果）、その DB につなげるのはその環境の利用者だけにし、DB と public スキーマの
// 持ち主をその利用者にする。Cloud SQL の API で作った利用者は cloudsqlsuperuser の一員なので、持ち主を替えられる。
// 持ち主を替えたあと、その利用者を cloudsqlsuperuser から外す（2026-11-26 の権限の確かめ D1）。一員のままだと、
// ステージングの利用者が本番の利用者の権限を自分に付けたり（GRANT kanaeru TO kanaeru_stg）、本番の利用者のパスワードを
// 変えたりできてしまう。外すのは一員のときだけ（手元の DB には cloudsqlsuperuser がない）。外したあとも、持ち主なので
// 次の回の持ち主の替え直しは通る。外すと戻せない（戻すには Cloud SQL の API で利用者を作り直す）。
import type pg from "pg";

/** 今の DB を、今の利用者だけのものにし、利用者を cloudsqlsuperuser から外す SQL（current_database()・current_user から名前を作る）。 */
export const ISOLATE_DATABASE_SQL = `DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I', current_database(), current_user);
  EXECUTE format('ALTER DATABASE %I OWNER TO %I', current_database(), current_user);
  EXECUTE format('ALTER SCHEMA public OWNER TO %I', current_user);
  EXECUTE 'REVOKE CREATE ON SCHEMA public FROM PUBLIC';
  IF EXISTS (
    SELECT 1 FROM pg_auth_members m
      JOIN pg_roles r ON r.oid = m.roleid
      JOIN pg_roles u ON u.oid = m.member
     WHERE r.rolname = 'cloudsqlsuperuser' AND u.rolname = current_user
  ) THEN
    EXECUTE format('REVOKE cloudsqlsuperuser FROM %I', current_user);
    -- 外れたことを確かめる（外せなかったのに黙って進むと、権限が分かれないまま DB の変更を当ててしまう）
    IF pg_has_role(current_user, 'cloudsqlsuperuser', 'MEMBER') THEN
      RAISE EXCEPTION '利用者 % を cloudsqlsuperuser から外せませんでした', current_user;
    END IF;
  END IF;
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
