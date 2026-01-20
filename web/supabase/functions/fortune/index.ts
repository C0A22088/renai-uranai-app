// supabase/functions/fortune/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AccessLevel = "free" | "paid";

type FortuneInput = {
  schema_version: "1.1";
  date_key: string; // YYYY-MM-DD
  sign_key: string; // e.g. "aries"
  sign_label: string; // e.g. "牡羊座"
  access_level: AccessLevel; // client hint (server will enforce)
  user_context?: string; // optional
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function clampStars(n: unknown) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(5, Math.trunc(v)));
}

function getEnv(name: string) {
  return Deno.env.get(name) ?? "";
}

function requireEnv(name: string) {
  const v = getEnv(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// service role key は環境によって名前が違うことがあるので両対応
function getServiceRoleKey(): string {
  return (
    getEnv("SERVICE_ROLE_KEY") ||
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    ""
  );
}

function isYmd(s: unknown): s is string {
  if (typeof s !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const SIGN_LABEL_BY_KEY: Record<string, string> = {
  aries: "牡羊座",
  taurus: "牡牛座",
  gemini: "双子座",
  cancer: "蟹座",
  leo: "獅子座",
  virgo: "乙女座",
  libra: "天秤座",
  scorpio: "蠍座",
  sagittarius: "射手座",
  capricorn: "山羊座",
  aquarius: "水瓶座",
  pisces: "魚座",
};

function normalizeSignLabel(signKey: string, signLabel?: unknown) {
  const labelFromKey = SIGN_LABEL_BY_KEY[signKey] ?? "";
  const label =
    typeof signLabel === "string" && signLabel.trim()
      ? signLabel.trim()
      : labelFromKey;
  return label;
}

function readBearer(headers: Headers): string {
  const authHeader =
    headers.get("Authorization") ?? headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

/** Defense-in-depth minimal validation */
function normalizeOutput(raw: any, level: AccessLevel) {
  if (!raw || typeof raw !== "object") throw new Error("Output is not an object");
  if (raw.schema_version !== "1.1") throw new Error("schema_version mismatch");
  if (!raw.meta || typeof raw.meta !== "object") throw new Error("meta missing");

  if (level === "free") {
    const oneLine = raw.free?.one_line;
    const color = raw.free?.lucky?.color;
    const item = raw.free?.lucky?.item;
    if (!oneLine) throw new Error("free.one_line missing");
    if (!color || !item) throw new Error("free.lucky missing");

    return {
      schema_version: "1.1",
      meta: raw.meta,
      free: {
        one_line: String(oneLine),
        lucky: { color: String(color), item: String(item) },
      },
    };
  }

  const paid = raw.paid;
  if (!paid?.overall || !paid?.love || !paid?.work || !paid?.money || !paid?.lucky) {
    throw new Error("paid fields missing");
  }

  paid.overall.stars_5 = clampStars(paid.overall.stars_5);
  paid.love.stars_5 = clampStars(paid.love.stars_5);
  paid.work.stars_5 = clampStars(paid.work.stars_5);
  paid.money.stars_5 = clampStars(paid.money.stars_5);

  if (!paid.lucky.color || !paid.lucky.item) throw new Error("paid.lucky missing");

  // Ensure we never leak mixed keys
  delete raw.free;

  return raw;
}

/** JSON Schema for FREE */
const schemaFree = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "meta", "free"],
  properties: {
    schema_version: { type: "string", const: "1.1" },
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["date_key", "sign_key", "sign_label", "access_level", "locale", "tone"],
      properties: {
        date_key: { type: "string" },
        sign_key: { type: "string" },
        sign_label: { type: "string" },
        access_level: { type: "string", const: "free" },
        locale: { type: "string", const: "ja-JP" },
        tone: { type: "string", const: "A" },
      },
    },
    free: {
      type: "object",
      additionalProperties: false,
      required: ["one_line", "lucky"],
      properties: {
        one_line: { type: "string", minLength: 10, maxLength: 140 },
        lucky: {
          type: "object",
          additionalProperties: false,
          required: ["color", "item"],
          properties: {
            color: { type: "string", minLength: 1, maxLength: 30 },
            item: { type: "string", minLength: 1, maxLength: 30 },
          },
        },
      },
    },
  },
} as const;

/** JSON Schema for PAID */
const schemaPaidCategoryBase = {
  type: "object",
  additionalProperties: false,
  required: ["stars_5", "axis", "summary", "do", "dont", "if_then", "why"],
  properties: {
    stars_5: { type: "integer", minimum: 0, maximum: 5 },
    axis: { type: "string", minLength: 4, maxLength: 60 },
    summary: { type: "string", minLength: 8, maxLength: 140 },
    do: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string", minLength: 2, maxLength: 90 },
    },
    dont: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "string", minLength: 2, maxLength: 90 },
    },
    if_then: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["if", "then"],
        properties: {
          if: { type: "string", minLength: 4, maxLength: 90 },
          then: { type: "string", minLength: 4, maxLength: 110 },
        },
      },
    },
    why: { type: "string", minLength: 6, maxLength: 180 },
    template: { type: "string", minLength: 4, maxLength: 90 },
  },
} as const;

const schemaPaid = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "meta", "paid"],
  properties: {
    schema_version: { type: "string", const: "1.1" },
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["date_key", "sign_key", "sign_label", "access_level", "locale", "tone"],
      properties: {
        date_key: { type: "string" },
        sign_key: { type: "string" },
        sign_label: { type: "string" },
        access_level: { type: "string", const: "paid" },
        locale: { type: "string", const: "ja-JP" },
        tone: { type: "string", const: "A" },
      },
    },
    paid: {
      type: "object",
      additionalProperties: false,
      required: ["overall", "love", "work", "money", "lucky"],
      properties: {
        overall: schemaPaidCategoryBase,
        love: {
          ...schemaPaidCategoryBase,
          required: [...schemaPaidCategoryBase.required, "template"],
        },
        work: {
          ...schemaPaidCategoryBase,
          required: [...schemaPaidCategoryBase.required, "template"],
        },
        money: schemaPaidCategoryBase,
        lucky: {
          type: "object",
          additionalProperties: false,
          required: ["color", "item"],
          properties: {
            color: { type: "string", minLength: 1, maxLength: 30 },
            item: { type: "string", minLength: 1, maxLength: 30 },
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `
あなたは「上品でロジカル」な占い生成AI。出力は必ずJSONのみ（コードブロック禁止）。恐怖訴求・不安煽りは禁止。断言しすぎず「〜しやすい」「〜が吉」程度。

【出力の制約】
- access_level="free"：free.one_line と free.lucky(color,item) のみ。
- access_level="paid"：paid(4カテゴリ＋lucky) のみ。
- time_hint等の追加は禁止。本文に星(★)文字も入れない。
- 余計なキー追加は禁止。スキーマに完全準拠。

【stars_5（0〜5）の整合ルール】
- 数値が低いほど「守り・整える・減らす」、高いほど「推進・決断・攻め」。
- 0〜1でも価値が落ちないよう、代替案・テンプレ・整理手順を必ず出す。

【安全】
医療・法律・投資の断定助言は禁止。ユーザーが提供していない個人情報の推測は禁止。
`.trim();

async function callOpenAI(level: AccessLevel, input: FortuneInput) {
  const openaiKey = requireEnv("OPENAI_API_KEY");
  const model = getEnv("OPENAI_MODEL") || "gpt-4o-mini";
  const schema = level === "free" ? schemaFree : schemaPaid;

  const payload = {
    model,
    instructions: SYSTEM,
    temperature: 0.9,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify(input) }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        strict: true,
        schema,
      },
    },
  };

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI error: ${r.status} ${t}`);
  }

  const data = await r.json();

  const textOut =
    data?.output?.[0]?.content?.find((c: any) => c?.type === "output_text")?.text ??
    data?.output_text;

  if (!textOut) throw new Error("No output_text from OpenAI");

  let obj: any;
  try {
    obj = JSON.parse(textOut);
  } catch {
    throw new Error("OpenAI output is not valid JSON");
  }
  return obj;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Partial<FortuneInput>;

    if (!isYmd(body?.date_key) || typeof body?.sign_key !== "string") {
      return json({ error: "Missing/invalid required fields: date_key/sign_key" }, 400);
    }

    const signKey = String(body.sign_key);
    const signLabel = normalizeSignLabel(signKey, body.sign_label);

    // JWTはあれば使う（なければfreeにダウングレード）
    const jwt = readBearer(req.headers);

    // Supabase URL/ANON は環境によって自動注入されることもあるが、無ければエラーにする
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");

    // client hint
    const desired: AccessLevel = body.access_level === "paid" ? "paid" : "free";

    // まずはfreeとして進める（paid条件を満たしたら後で上げる）
    let level: AccessLevel = "free";

    // userId取得（JWTがある場合のみ）
    let userId: string | null = null;
    if (jwt) {
      const supaAuth = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data, error } = await supaAuth.auth.getUser();
      if (!error && data?.user?.id) userId = data.user.id;
    }

    // paid eligibility（desired=paid かつ userIdあり かつ service role keyあり の時だけ判定）
    if (desired === "paid" && userId) {
      const serviceKey = getServiceRoleKey();
      if (serviceKey) {
        const supaSrv = createClient(supabaseUrl, serviceKey);
        const { data: prof, error: profErr } = await supaSrv
          .from("profiles")
          .select("overall_unlocked")
          .eq("id", userId)
          .single();

        if (profErr) throw profErr;

        if (prof?.overall_unlocked) {
          level = "paid";
        }
      } else {
        // service role key が無いなら安全にfreeのまま
        level = "free";
      }
    }

    const input: FortuneInput = {
      schema_version: "1.1",
      date_key: String(body.date_key),
      sign_key: signKey,
      sign_label: signLabel,
      access_level: level,
      user_context: typeof body.user_context === "string" ? body.user_context : "",
    };

    const raw = await callOpenAI(level, input);
    const normalized = normalizeOutput(raw, level);

    (normalized as any).meta = {
      date_key: input.date_key,
      sign_key: input.sign_key,
      sign_label: input.sign_label,
      access_level: level,
      locale: "ja-JP",
      tone: "A",
    };

    if (level === "free") delete (normalized as any).paid;
    else delete (normalized as any).free;

    return json(normalized, 200);
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
