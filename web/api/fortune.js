// web/api/fortune.js
function hashSeed(str) {
  // 簡易ハッシュ（安定した疑似乱数用）
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}
function pick(arr, seed) {
  return arr[seed % arr.length];
}
function clampScore(n) {
  return Math.max(1, Math.min(5, n));
}

const THEMES = [
  "今日は“整える”がテーマ。余白を作るほど運が乗ります。",
  "小さな選択が流れを変える日。直感を信じてOK。",
  "焦らず丁寧に。積み上げたものが評価されやすい日。",
  "人との会話が鍵。短いやり取りが運を開きます。",
  "やる気の波が来ます。先に環境を整えると一気に進みます。",
];

const ONE_LINES = [
  "言葉にした瞬間、運が動きます。先に一言伝えるのが吉。",
  "今日は“軽さ”が最強。抱え込まず、手放すほど整います。",
  "迷ったら王道へ。基本に戻すほど結果が出ます。",
  "チャンスは小さく来ます。見逃さず拾えたら勝ち。",
  "背伸び不要。等身大のままで好転します。",
];

const ACTIONS = [
  "連絡を後回しにしない。5分で返す。",
  "机まわりを1箇所だけ片付ける。",
  "いつもより10分早く行動を開始。",
  "“やらないこと”を1つ決める。",
  "睡眠・水分を優先してコンディションを整える。",
];

const CAUTIONS = [
  "勢いで即決しすぎ注意。30秒だけ確認。",
  "他人のペースに巻き込まれ注意。自分の基準で。",
  "言い方が強くなりやすい日。語尾を柔らかく。",
  "先延ばし癖が出やすい。小さく着手で回避。",
  "予定を詰め込みすぎ注意。余白が運を呼びます。",
];

const LUCKY_COLORS = ["ネイビー", "ホワイト", "ラベンダー", "ブラック", "ゴールド", "グリーン"];
const LUCKY_ITEMS = ["イヤホン", "ハンドクリーム", "メモ帳", "小さな鏡", "温かい飲み物", "リップクリーム"];
const LUCKY_TIMES = ["07:30", "10:15", "12:40", "15:20", "18:05", "21:10"];

const FULL = {
  overall: [
    "全体運は上向き。今日は“整える→動く”の順が勝ちパターンです。小さな準備が後半の伸びを作ります。",
    "全体運は安定。大勝負よりも、普段のやり方を丁寧に続けるほど運が味方します。",
    "全体運は変化運。予定変更が起きやすいですが、柔軟に合わせるほど好転します。",
  ],
  love: [
    "恋愛運は会話運。短いやり取りでも温度が上がります。言い過ぎより“ひと言”が効きます。",
    "恋愛運は様子見が吉。相手を試すより、安心感を増やす言葉が刺さります。",
    "恋愛運は追い風。迷っていた連絡は今日がタイミング。軽い一言が流れを作ります。",
  ],
  work: [
    "仕事運は段取りで決まる日。最初の10分でタスクの順番を整えると集中が続きます。",
    "仕事運は評価運。地味な作業ほど見られています。基本を丁寧に仕上げるほど信頼が増します。",
    "仕事運はスピード運。完璧より提出。60点で出して改善が正解です。",
  ],
  money: [
    "金運は守りが強い日。衝動買いを避けるほど、必要なものが良い条件で入ります。",
    "金運は情報運。比較してから決めると当たりを引けます。レビューを一つ見るだけで変わります。",
    "金運は小さなご褒美が吉。使うなら“体験”に投資すると満足度が高い日。",
  ],
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  try {
    const { signKey = "aries", dateKey = "1970-01-01", paid = false } = req.body || {};
    const seed = hashSeed(`${signKey}|${dateKey}`);

    // スコアは安定した疑似乱数で 1〜5 を作る
    const scores = {
      overall: clampScore(((seed >>> 0) % 5) + 1),
      love: clampScore((((seed >>> 3) >>> 0) % 5) + 1),
      work: clampScore((((seed >>> 6) >>> 0) % 5) + 1),
      money: clampScore((((seed >>> 9) >>> 0) % 5) + 1),
    };

    const digest = {
      title: "今日の運勢",
      theme: pick(THEMES, seed),
      oneLine: pick(ONE_LINES, seed + 11),
      scores,
      tips: {
        action: pick(ACTIONS, seed + 21),
        caution: pick(CAUTIONS, seed + 31),
        lucky: {
          color: pick(LUCKY_COLORS, seed + 41),
          item: pick(LUCKY_ITEMS, seed + 51),
          time: pick(LUCKY_TIMES, seed + 61),
        },
      },
    };

    const full = {
      overall: pick(FULL.overall, seed + 101),
      love: pick(FULL.love, seed + 111),
      work: pick(FULL.work, seed + 121),
      money: pick(FULL.money, seed + 131),
    };

    // paid=false のときも main.js は full を参照するので、返してOK（UI側でぼかされる）
    return res.status(200).json({ ok: true, signKey, dateKey, paid: !!paid, digest, full });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
