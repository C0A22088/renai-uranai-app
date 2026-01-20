import "./style.css";

const el = document.querySelector("#app");

function html(strings, ...values) {
  return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ""), "");
}
function $(sel) {
  return document.querySelector(sel);
}

/* ===== Date helpers (JST local date key) ===== */
function getLocalDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function formatJaDate(d = new Date()) {
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/* ===== Zodiac master ===== */
const ZODIAC = [
  { key: "aries", label: "牡羊座" },
  { key: "taurus", label: "牡牛座" },
  { key: "gemini", label: "双子座" },
  { key: "cancer", label: "蟹座" },
  { key: "leo", label: "獅子座" },
  { key: "virgo", label: "乙女座" },
  { key: "libra", label: "天秤座" },
  { key: "scorpio", label: "蠍座" },
  { key: "sagittarius", label: "射手座" },
  { key: "capricorn", label: "山羊座" },
  { key: "aquarius", label: "水瓶座" },
  { key: "pisces", label: "魚座" },
];

const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

/* ===== State ===== */
let statusText = "";
let statusKind = ""; // "ok" | "ng" | ""
let debugText = "";

let selectedSign = localStorage.getItem("selected_sign") || "aries";
let fortuneDateKey = getLocalDateKey();

let fortuneData = null;

/**
 * 単発課金（超簡易版）
 * - 決済成功URLに ?paid=1 を付けて戻す想定
 * - 当日分だけ localStorage 解放
 */
function getPaidKey(dateKey) {
  return `paid_${dateKey}`;
}
function isPaidToday(dateKey) {
  return localStorage.getItem(getPaidKey(dateKey)) === "1";
}
function markPaidToday(dateKey) {
  localStorage.setItem(getPaidKey(dateKey), "1");
}

// 決済成功で戻ってきた想定: ?paid=1
(function handlePaidReturn() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("paid") === "1") {
    markPaidToday(getLocalDateKey());
    url.searchParams.delete("paid");
    window.history.replaceState({}, "", url.toString());
  }
})();

function setStatus(msg, kind = "") {
  statusText = String(msg ?? "");
  statusKind = kind;
  const node = $("#status");
  if (node) {
    node.textContent = statusText;
    node.className = `alert ${statusKind}`.trim();
  }
}
function setDebug(msg) {
  debugText = String(msg ?? "");
  const node = $("#debug");
  if (node) node.textContent = debugText;
}

async function fetchFortune({ signKey, dateKey, paid }) {
  const r = await fetch("/api/fortune", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signKey, dateKey, paid }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t);
  }
  return await r.json();
}

function renderStarsRow(scores) {
  return html`
    <div class="stars-row">
      <div class="star-pill"><span>総合</span><b>${stars(scores.overall)}</b></div>
      <div class="star-pill"><span>恋愛</span><b>${stars(scores.love)}</b></div>
      <div class="star-pill"><span>仕事</span><b>${stars(scores.work)}</b></div>
      <div class="star-pill"><span>金運</span><b>${stars(scores.money)}</b></div>
    </div>
  `;
}

async function loadAndRender() {
  // 日付跨ぎに追従
  const todayKey = getLocalDateKey();
  if (fortuneDateKey !== todayKey) fortuneDateKey = todayKey;

  const signObj = ZODIAC.find((z) => z.key === selectedSign) || ZODIAC[0];
  const paid = isPaidToday(fortuneDateKey);

  try {
    setStatus("占い結果を取得中…");
    fortuneData = await fetchFortune({ signKey: signObj.key, dateKey: fortuneDateKey, paid });
    setStatus("表示しました。", "ok");
    setDebug(`date_key: ${fortuneDateKey}\nsign: ${selectedSign}\npaid: ${paid}`);
  } catch (e) {
    setStatus("取得に失敗しました。", "ng");
    setDebug(e?.message || String(e));
    fortuneData = null;
  }

  await render();
}

async function render() {
  const signObj = ZODIAC.find((z) => z.key === selectedSign) || ZODIAC[0];
  const paid = isPaidToday(fortuneDateKey);

  el.innerHTML = html`
    <header class="app-header">
      <div class="hero">
        <div class="hero-left">
          <div class="hero-badge">TODAY</div>
          <h1 class="app-title">今日の運勢</h1>
          <p class="app-sub">${formatJaDate(new Date())}</p>
        </div>
        <div class="hero-right">
          <div class="hero-mini">
            <div class="hero-mini-label">モード</div>
            <div class="hero-mini-value">${paid ? "全文：解放済み（単発）" : "無料：ダイジェスト"}</div>
          </div>
        </div>
      </div>
    </header>

    <div class="grid">
      <div id="status" class="alert ${statusKind}">${statusText}</div>

      <section class="card">
        <div class="topbar">
          <div>
            <h2 class="card-title">星座を選んでください</h2>
            <p class="app-sub" style="margin-top:6px;">選ぶと即表示。無料は短文＋ラッキー、解放で全文。</p>
          </div>
          <div class="topbar-right">
            <span class="badge">${paid ? "全文：解放済み" : "全文：ロック中"}</span>
            <button id="refresh" class="btn">更新</button>
          </div>
        </div>

        <div style="height:12px;"></div>

        <div class="zodiac-grid">
          ${ZODIAC.map((z) => {
            const active = z.key === selectedSign;
            return html`
              <button class="zodiac-card ${active ? "is-active" : ""}" data-sign="${z.key}">
                <div class="zodiac-name">${z.label}</div>
                <div class="zodiac-sub">${active ? "選択中" : "選ぶ"}</div>
              </button>
            `;
          }).join("")}
        </div>
      </section>

      <section class="card">
        <div class="fortune-head">
          <div>
            <h2 class="card-title">${fortuneData?.digest?.title ?? `${signObj.label}の今日の運勢`}</h2>
            <p class="app-sub" style="margin-top:6px;">${fortuneData?.digest?.theme ?? "読み込み中…"}</p>
          </div>
          <div class="fortune-actions">
            <span class="badge">無料：1〜2文＋ラッキー</span>
          </div>
        </div>

        <div style="height:12px;"></div>

        ${
          fortuneData
            ? html`
                <div class="fortune-digest">
                  <div class="fortune-one">${fortuneData.digest.oneLine}</div>
                  <div style="height:10px;"></div>
                  ${renderStarsRow(fortuneData.digest.scores)}
                  <div style="height:12px;"></div>

                  <div class="fortune-tips">
                    <div><b>今日の一手：</b>${fortuneData.digest.tips.action}</div>
                    <div><b>注意：</b>${fortuneData.digest.tips.caution}</div>
                    <div><b>ラッキー：</b>ラッキーカラー：${fortuneData.digest.tips.lucky.color}／ラッキーアイテム：${fortuneData.digest.tips.lucky.item}／ラッキータイム：${fortuneData.digest.tips.lucky.time}</div>
                  </div>
                </div>
              `
            : html`<p class="app-sub">読み込みに失敗しました。更新を押してください。</p>`
        }
      </section>

      <section class="card">
        <div class="lock-head">
          <h2 class="card-title">全文（詳細）</h2>
          <span class="badge">${paid ? "解放済み" : "ロック中"}</span>
        </div>

        <div style="height:12px;"></div>

        ${
          paid && fortuneData
            ? html`
                <div class="fortune-full">
                  <h4>総合</h4><p>${fortuneData.full.overall}</p>
                  <h4>恋愛</h4><p>${fortuneData.full.love}</p>
                  <h4>仕事・学業</h4><p>${fortuneData.full.work}</p>
                  <h4>金運</h4><p>${fortuneData.full.money}</p>
                </div>
              `
            : html`
                <div class="locked-box">
                  <div class="locked-blur">
                    <div class="fortune-full">
                      <h4>総合</h4><p>${fortuneData?.full?.overall ?? "（ここに全文が表示されます）"}</p>
                      <h4>恋愛</h4><p>${fortuneData?.full?.love ?? "（ここに全文が表示されます）"}</p>
                      <h4>仕事・学業</h4><p>${fortuneData?.full?.work ?? "（ここに全文が表示されます）"}</p>
                      <h4>金運</h4><p>${fortuneData?.full?.money ?? "（ここに全文が表示されます）"}</p>
                    </div>
                  </div>

                  <div class="locked-overlay">
                    <div class="lock-title">全文は単発課金で解放</div>
                    <div class="lock-sub">このセッション＋当日分だけ解放（最短運用）。</div>
                    <div style="height:12px;"></div>
                    <div class="row" style="justify-content:center; flex-wrap:wrap;">
                      <button id="buy" class="btn btn-primary">全文を見る（単発）</button>
                      <span class="badge">まずは導線検証</span>
                    </div>
                  </div>
                </div>
              `
        }
      </section>

      <section class="card">
        <h2 class="card-title">デバッグ（開発用）</h2>
        <div style="height:10px;"></div>
        <details class="details">
          <summary>ログを見る</summary>
          <div class="content">
            <pre id="debug">${debugText}</pre>
          </div>
        </details>
      </section>
    </div>
  `;

  // handlers
  $("#refresh").onclick = loadAndRender;

  document.querySelectorAll("[data-sign]").forEach((btn) => {
    btn.onclick = async () => {
      const key = btn.getAttribute("data-sign");
      if (!key) return;
      selectedSign = key;
      localStorage.setItem("selected_sign", selectedSign);
      await loadAndRender();
    };
  });

  const buyBtn = $("#buy");
  if (buyBtn) {
    buyBtn.onclick = () => {
      /**
       * Stripe最短：Payment Linkに飛ばす（ノーWebhook）
       * - Stripe側の success_url を「あなたのURL?paid=1」にする
       * - 例: https://your-app.vercel.app/?paid=1
       *
       * ここはあなたの Payment Link に置き換え
       */
      const PAYMENT_LINK_URL = "https://YOUR_STRIPE_PAYMENT_LINK";
      window.location.href = PAYMENT_LINK_URL;
    };
  }
}

setStatus("読み込み中…");
loadAndRender();
