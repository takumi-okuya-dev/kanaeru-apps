# 置き場所の構成図（docs/images/infra-architecture.svg）を作る台本。
# 構成（infra/）を変えたら、この台本の箱・アイコン・線を直して作り直し、同じ PR で SVG も直す（docs/rules/documents.md 3章）。
#
# 使い方（リポジトリのルートで。Python 3 だけで動く）：
#   1. Google Cloud 公式のアイコン（以前の画面のアイコン）を取って広げる（リポジトリには入れない）：
#        https://cloud.google.com/icons の「Legacy console icons」（google-cloud-legacy-icons.zip）
#   2. python3 docs/images/infra-architecture.py <広げたフォルダ> docs/images/infra-architecture.svg
#
# アイコンは Google Cloud 公式のものだけを使う。ほかの会社（Cloudflare・LINE・Meta・GitHub）はロゴを使わず名前だけで表す
# （各社の商標の決まりで、ロゴは許可が要ることがある）。
import base64, sys, html
if len(sys.argv) != 3:
    sys.exit("使い方：python3 docs/images/infra-architecture.py <Google Cloud のアイコンを広げたフォルダ> <書き出す SVG>")
ICON_DIR = sys.argv[1]
OUT = sys.argv[2]
def icon(name):
    data = open(f"{ICON_DIR}/{name}/{name}.svg", "rb").read()
    return "data:image/svg+xml;base64," + base64.b64encode(data).decode()
W, H = 1560, 1090
FONT = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP','Yu Gothic',sans-serif"
o = []
def add(s): o.append(s)
def text(x, y, s, size=13, weight="normal", color="#202124", anchor="middle"):
    add(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{html.escape(s)}</text>')
def lines(x, y, rows, size=12.5, gap=17, first_bold=True, color="#202124"):
    for i, r in enumerate(rows):
        text(x, y + i * gap, r, size=size if i else size + 0.5, weight="bold" if (i == 0 and first_bold) else "normal", color=color)
def box(x, y, w, h, stroke, fill, dash=None, rx=6, sw=1.5):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')
def label(x, y, s, color, size=14, icon_name=None):
    if icon_name:
        add(f'<image href="{icon(icon_name)}" x="{x}" y="{y-17}" width="22" height="22"/>')
        x += 28
    text(x, y, s, size=size, weight="bold", color=color, anchor="start")
def img(name, cx, cy, size=60):
    add(f'<image href="{icon(name)}" x="{cx-size/2}" y="{cy-size/2}" width="{size}" height="{size}"/>')
def node(name, cx, cy, rows, size=56):
    img(name, cx, cy, size)
    lines(cx, cy + size / 2 + 20, rows)
def arrow(points, label_text=None, lx=None, ly=None, dash=None, color="#5f6368", width=1.6, anchor="middle"):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    pts = " ".join(f"{x},{y}" for x, y in points)
    add(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{width}"{d} marker-end="url(#arrow)"/>')
    if label_text:
        for i, row in enumerate(label_text.split("\n")):
            w = max(len(row) * 12.5 + 10, 30)
            bx = lx - w / 2 if anchor == "middle" else lx - 4
            add(f'<rect x="{bx}" y="{ly - 13 + i*17}" width="{w}" height="17" rx="3" fill="#ffffff" fill-opacity="0.92"/>')
            text(lx, ly + i * 17, row, size=12, color="#3c4043", anchor=anchor)
def person(cx, cy):
    add(f'<circle cx="{cx}" cy="{cy-10}" r="9" fill="none" stroke="#3c4043" stroke-width="2"/>')
    add(f'<path d="M{cx-16},{cy+16} Q{cx},{cy-6} {cx+16},{cy+16}" fill="none" stroke="#3c4043" stroke-width="2"/>')
    add(f'<circle cx="{cx-22}" cy="{cy-4}" r="7" fill="none" stroke="#3c4043" stroke-width="1.6"/>')
    add(f'<path d="M{cx-34},{cy+16} Q{cx-22},{cy+1} {cx-12},{cy+10}" fill="none" stroke="#3c4043" stroke-width="1.6"/>')
    add(f'<circle cx="{cx+22}" cy="{cy-4}" r="7" fill="none" stroke="#3c4043" stroke-width="1.6"/>')
    add(f'<path d="M{cx+34},{cy+16} Q{cx+22},{cy+1} {cx+12},{cy+10}" fill="none" stroke="#3c4043" stroke-width="1.6"/>')

add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="{FONT}">')
add('<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5f6368"/></marker></defs>')
add(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')

# 外の人・サービス（上）
box(80, 22, 210, 78, "#9aa0a6", "#f8f9fa")
lines(185, 52, ["GitHub Actions", "develop → ステージング", "main → 本番"])
person(640, 50)
text(640, 92, "利用者（参加者・受付係・主催者）", size=13, weight="bold")
box(860, 22, 300, 78, "#f29900", "#fef7e0", dash="6 4")
lines(1010, 48, ["Cloudflare（公開のときに足す）", "独自ドメイン・CDN・WAF・圧縮"], color="#7a4100")

# Google Cloud のプロジェクト
box(40, 140, 1180, 915, "#4285f4", "#ffffff", sw=2)
label(58, 166, "Google Cloud（1つのプロジェクト）", "#1a73e8", size=15)
text(345, 166, "（請求の予算：月2,000円で知らせる）", size=12, color="#5f6368", anchor="start")
node("workload_identity_pool", 185, 210, ["Workload Identity Federation", "鍵なしで入る（main・develop だけ）"], size=46)

# リージョン
box(70, 300, 1120, 735, "#4285f4", "#f8fbff", dash="7 5")
label(240, 325, "リージョン：asia-northeast1（東京）", "#1a73e8")

# 左の列
node("artifact_registry", 185, 380, ["Artifact Registry（環境ごと）", "kanaeru・kanaeru-stg"])
node("secret_manager", 185, 565, ["Secret Manager", "DB の接続先・鍵の束・合言葉など", "（環境ごと）"])
node("cloud_scheduler", 185, 810, ["Cloud Scheduler", "DB：0時に止める・8時に動かす", "jobs-tick：8〜23時台・5分ごと", "（環境ごと・Threads か予約が入）"])

# Cloud Run
box(390, 345, 770, 245, "#1a73e8", "#e8f0fe")
label(425, 370, "Cloud Run（使われないと0台）", "#1a73e8")
node("cloud_run", 500, 430, ["kanaeru（本番）", "画面＋/api・最大2台"])
node("cloud_run", 760, 430, ["kanaeru-stg（ステージング）", "画面＋/api・最大1台"])
node("cloud_run", 1020, 430, ["DB の変更を当てる job", "kanaeru-migrate・kanaeru-stg-migrate"])

# VPC
box(390, 645, 770, 130, "#188038", "#e6f4ea")
label(408, 670, "VPC：kanaeru-vpc", "#188038", icon_name="virtual_private_cloud")
box(640, 690, 270, 64, "#188038", "#ffffff", rx=4)
lines(775, 716, ["サブネット：kanaeru-run", "Direct VPC egress の出口"])

# Google の管理するネットワーク
box(390, 825, 770, 190, "#9334e6", "#f3e8fd", dash="5 4")
label(408, 850, "Google の管理するネットワーク", "#7627bb")
text(408, 870, "（プライベート サービス アクセス）", size=12, color="#7627bb", anchor="start")
node("cloud_sql", 775, 905, ["Cloud SQL for PostgreSQL 18", "db-f1-micro・内部の IP だけ", "DB：kanaeru・kanaeru_stg"])

# 外のサービス（右）
box(1250, 360, 290, 230, "#9aa0a6", "#ffffff", dash="4 3")
text(1268, 385, "外のサービス", size=14, weight="bold", color="#5f6368", anchor="start")
box(1268, 405, 254, 70, "#06c755", "#f1fbf4")
lines(1395, 433, ["LINE", "ログイン・ミニアプリ・公式アカウント"])
box(1268, 495, 254, 70, "#5f6368", "#f8f9fa")
lines(1395, 523, ["Meta（Threads の API）", "投稿・反応の取りこみ"])

# 線
arrow([(185, 100), (185, 180)], "① OIDC", 222, 145, anchor="start")
arrow([(185, 272), (185, 350)], "② その環境のデプロイの身分で、その環境の置き場所にイメージを押し込む", 200, 290, anchor="start")
arrow([(215, 384), (390, 384)], "③ DB の変更 → ④ 新しい版\n（digest で指定）", 305, 358)
arrow([(215, 550), (390, 550)], "秘密の値", 300, 542, dash="5 4")
arrow([(215, 795), (340, 795), (340, 500), (390, 500)], "POST /api/v1/jobs/tick", 348, 620, anchor="start")
arrow([(215, 840), (360, 840), (360, 905), (740, 905)], "Cloud SQL Admin API で止める・動かす", 560, 897, dash="5 4")
arrow([(640, 102), (640, 345)], "https（今は run.app の URL）", 650, 250, anchor="start")
arrow([(782, 64), (860, 64)], "公開のあと", 821, 56, dash="6 4")
arrow([(1010, 100), (1010, 345)], "中継（CDN）", 1020, 250, dash="6 4", anchor="start")
arrow([(775, 590), (775, 690)], "内部の宛先だけ", 785, 640, anchor="start")
arrow([(775, 754), (775, 870)], "TCP 5432・暗号つき", 785, 812, color="#202124", width=2.4, anchor="start")
arrow([(1160, 455), (1250, 455)], "確かめ・知らせ\n投稿・反応", 1205, 430)
arrow([(1250, 540), (1160, 540)], "Webhook", 1205, 532)

text(W - 20, H - 14, "アイコン：Google Cloud 公式（cloud.google.com/icons）。Cloudflare・LINE・Meta・GitHub は名前だけで表す（各社の商標の決まり）", size=11, color="#80868b", anchor="end")
add("</svg>")
open(OUT, "w", encoding="utf-8").write("\n".join(o))
