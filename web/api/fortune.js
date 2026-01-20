// Vercel Serverless Function (Node.js)
export const config = { runtime: "nodejs" };

const ZODIAC = new Set([
  "aries","taurus","gemini","cancer","leo","virgo",
  "libra","scorpio","sagittarius","capricorn","aquarius","pisces",
]);

function isValidDateKey(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function bad(res, msg, status = 400) {
  res.status(status).json({ ok: false, error: msg });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return bad(res, "POST only", 405);

    const { signKey, dateKey, paid } = req.body || {};
    if (!ZODIAC.has(signKey)) return bad(res, "invalid signKey");
    if (!isValidDateKey(dateKey)) return bad(res, "invalid dateKey");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return bad(res, "Missing OPENAI_API_KEY on server", 500);

    // モデルは env で差し替え可能（まずは軽量でOK）
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    // paid=false の場合は full.* を「短く/空寄り」にさせる（UI側でロック表示）
    const paidFlag = !!paid;

    const system = `
あなたは日本語の占い師。文章はやさしく、断定しすぎず、前向きで行動に落ちる助言をする。
出力は必ず指定JSONスキーマに厳密準拠。
NG: 不安を煽る、病気/投資などの断定、過度にスピリチュアル断言。
`.trim();

    const user = `
条件:
- 日付: ${dateKey}
- 星座キー: ${signKey}
- 有料解放: ${paidFlag ? "true" : "false"}

要件:
- digest.oneLine は1〜2文で刺さる。
- digest.theme は短い（〜の日 など）。
- scores は1〜5。
- tips.action / tips.caution は具体的。
- lucky は color/item/time を埋める。
- 有料解放=false のときは full は「要点だけ短め」にする（UIでロックする前提）。
`.trim();

    // JSON Schema（strict）で強制
    const schema = {
      name: "fortune",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean" },
          dateKey: { type: "string" },
          signKey: { type: "string" },
          digest: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              theme: { type: "string" },
              oneLine: { type: "string" },
              scores: {
                type: "object",
                additionalProperties: false,
                properties: {
                  overall: { type: "integer", minimum: 1, maximum: 5 },
                  love: { type: "integer", minimum: 1, maximum: 5 },
                  work: { type: "integer", minimum: 1, maximum: 5 },
                  money: { type: "integer", minimum: 1, maximum: 5 }
                },
                required: ["overall","love","work","money"]
              },
              tips: {
                type: "object",
                additionalProperties: false,
                properties: {
                  action: { type: "string" },
                  caution: { type: "string" },
                  lucky: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      color: { type: "string" },
                      item: { type: "string" },
                      time: { type: "string" }
                    },
                    required: ["color","item","time"]
                  }
                },
                required: ["action","caution","lucky"]
              }
            },
            required: ["title","theme","oneLine","scores","tips"]
          },
          full: {
            type: "object",
            additionalProperties: false,
            properties: {
              overall: { type: "string" },
              love: { type: "string" },
              work: { type: "string" },
              money: { type: "string" }
            },
            required: ["overall","love","work","money"]
          }
        },
        required: ["ok","dateKey","signKey","digest","full"]
      }
    };

    const payload = {
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.9,
      text: {
        format: { type: "json_schema", strict: true, schema }
      }
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const t = await r.text();
      return bad(res, `OpenAI error: ${t}`, 502);
    }

    const data = await r.json();

    // Responses API の出力テキスト(JSON) を拾う
    const outText =
      data?.output?.[0]?.content?.find?.((c) => c.type === "output_text")?.text
      ?? data?.output?.[0]?.content?.[0]?.text;

    if (!outText) return bad(res, "No output_text from OpenAI", 502);

    const parsed = JSON.parse(outText);
    parsed.ok = true;
    parsed.dateKey = dateKey;
    parsed.signKey = signKey;

    return res.status(200).json(parsed);
  } catch (e) {
    return bad(res, e?.message || String(e), 500);
  }
}
