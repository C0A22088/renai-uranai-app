import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  try {
    // PKCE: ?code=... をセッションに交換して確定させる
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (error) throw error;
    }

    // 念のため: セッションがあるか確認（デバッグ用）
    await supabase.auth.getSession();

  } catch (e) {
    document.body.textContent = `ログイン処理エラー: ${e?.message || e}`;
    return;
  }

  // トップへ戻す
  window.location.replace("/");
}

run();
