import "./style.css";

/**
 * MVP方針：AIなし / APIなし
 * - 固定テンプレ + 日付seedで「毎日それっぽく変わる」占いを生成
 * - 無料：short + luckyColorのみ
 * - 有料：全文（各運勢/星/アドバイス等） -> 1pt消費で解放
 * - ポイント：localStorage（Stripe導入は後で差し替え）
 */

const el = document.querySelector("#app");

function html(strings, ...values) {
  return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ""), "");
}
function $(sel) {
  return document.querySelector(sel);
}

const ZODIACS = [
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

const STORAGE = {
  points: "ru_points",
  unlockedPrefix: "ru_unlock_", // ru_unlock_YYYY-MM-DD_zodiacKey
  selectedZodiac: "ru_selected_zodiac",
};

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateJP(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1);
  const dd = String(d.getDate());
  const w = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${yyyy}年${mm}月${dd}日(${w})`;
}

// ----- seed random (deterministic) -----
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function seededPick(arr, seedStr) {
  const h = hash32(seedStr);
  return arr[h % arr.length];
}
function seededInt(min, max, seedStr) {
  const h = hash32(seedStr);
  const n = h % (max - min + 1);
  return min + n;
}

// ----- fortune templates -----
const TPL = {
  short: [
    "背伸び不要。等身大のままで好転します。",
    "焦りは封印。丁寧に進めるほど味方が増えます。",
    "小さな幸運は“選び直し”の先にあります。",
    "今日は“言い切る”が鍵。迷いが消えます。",
    "余白を作るほど流れが整います。",
    "一歩引くと全体が見え、最短で進めます。",
    "気合より習慣。淡々と続けるほど強い日です。",
    "直感が冴える日。最初のひらめきを信じて。",
  ],
  love: [
    "言葉より態度が伝わります。小さな気遣いが最強。",
    "距離感を整えると関係が軽くなります。急がないで。",
    "相手の“本音”は行動に出ます。観察が吉。",
    "今日は甘え上手が勝ち。素直に頼ると進展。",
    "未読・既読に揺れない。あなたのペースを守って。",
  ],
  work: [
    "段取りが勝負。先にToDoを3つに絞ると速い。",
    "確認を一手間。ミスが減って信頼が積み上がる。",
    "今日は“話す”より“書く”が強い。メモで整理。",
    "小さな改善が大きな評価に。やり方を1つ変える。",
    "即レスより良レス。要点を短くまとめると刺さる。",
  ],
  money: [
    "買うより整える日。固定費の見直しで余裕が生まれます。",
    "迷ったら保留が正解。衝動買いは明日まで寝かせて。",
    "小さな投資が効く日。消耗品より“使い回せるもの”。",
    "出費は“未来の自分の時間”を買っているかで判断。",
    "ポイントは貯めどき。使うのは“効果が見えるもの”へ。",
  ],
  advice: [
    "今日の一手：睡眠・水分を最優先でコンディションを整える。",
    "今日の一手：予定を詰め込みすぎ注意。余白が運を呼びます。",
    "今日の一手：3分だけ片付ける。視界が整うと心も整います。",
    "今日の一手：LINEは短く温かく。結論→一言で好印象。",
    "今日の一手：深呼吸してから返事。言葉が柔らかくなります。",
  ],
  luckyColor: ["ホワイト", "ネイビー", "ラベンダー", "アイボリー", "ブラック", "ミント", "ボルドー", "シルバー"],
  luckyItem: ["リップクリーム", "イヤホン", "ハンドクリーム", "ミニノート", "ミントガム", "白い靴下", "香水", "ボールペン"],
  luckyTime: ["07:20", "09:10", "12:40", "15:20", "17:50", "19:05", "21:30", "23:00"],
};

function buildFortune(zodiacKey, dateStr) {
  const seedBase = `${dateStr}_${zodiacKey}`;

  const overall = seededInt(2, 5, `${seedBase}_overall`);
  const loveStars = seededInt(1, 5, `${seedBase}_loveStars`);
  const workStars = seededInt(1, 5, `${seedBase}_workStars`);
  const moneyStars = seededInt(1, 5, `${seedBase}_moneyStars`);

  return {
    date: dateStr,
    zodiacKey,
    title: "今日の運勢",
    short: seededPick(TPL.short, `${seedBase}_short`),
    luckyColor: seededPick(TPL.luckyColor, `${seedBase}_lc`),

    // paid-only fields
    summary: "人との会話が鍵。短いやり取りが運を開きます。",
    overall,
    loveStars,
    workStars,
    moneyStars,
    loveText: seededPick(TPL.love, `${seedBase}_love`),
    workText: seededPick(TPL.work, `${seedBase}_work`),
    moneyText: seededPick(TPL.money, `${seedBase}_money`),
    advice: seededPick(TPL.advice, `${seedBase}_advice`),
    luckyItem: seededPick(TPL.luckyItem, `${seedBase}_li`),
    luckyTime: seededPick(TPL.luckyTime, `${seedBase}_lt`),
  };
}

// ----- points / unlock -----
function getPoints() {
  return Number(localStorage.getItem(STORAGE.points) || "0");
}
function setPoints(n) {
  localStorage.setItem(STORAGE.points, String(Math.max(0, n)));
}
function addPoints(n) {
  setPoints(getPoints() + n);
}

function unlockKey(dateStr, zodiacKey) {
  return `${STORAGE.unlockedPrefix}${dateStr}_${zodiacKey}`;
}
function isUnlocked(dateStr, zodiacKey) {
  return localStorage.getItem(unlockKey(dateStr, zodiacKey)) === "1";
}
function setUnlocked(dateStr, zodiacKey) {
  localStorage.setItem(unlockKey(dateStr, zodiacKey), "1");
}

// 消費して解放（1pt）
function spendToUnlock(dateStr, zodiacKey, cost = 1) {
  const p = getPoints();
  if (isUnlocked(dateStr, zodiacKey)) return { ok: true, already: true };
  if (p < cost) return { ok: false, reason: "no_points" };
  setPoints(p - cost);
  setUnlocked(dateStr, zodiacKey);
  return { ok: true };
}

// ----- UI components -----
function starBar(n) {
  const on = Math.max(0, Math.min(5, Number(n) || 0));
  return html`
    <div class="starbar">
      ${Array.from({ length: 5 }).map(
        (_, i) => html`<span class="star ${i < on ? "is-on" : ""}"></span>`
      )}
      <span class="starbar-num">${on}/5</span>
    </div>
  `;
}

function lockedBlock({ title, sub, costLabel, onUnlock }) {
  return html`
    <div class="locked-box">
      <div class="locked-blur">
        <div class="locked-preview">
          <div class="preview-title">${title}</div>
          <div class="skeleton">
            <div class="sk-line" style="width: 84%"></div>
            <div class="sk-line" style="width: 66%"></div>
            <div class="sk-line" style="width: 72%"></div>
          </div>
        </div>
      </div>

      <div class="locked-overlay">
        <div class="lock-icon">🔒</div>
        <div class="lock-title">${title}はロック中</div>
        <div class="lock-sub">${sub}</div>
        <div class="lock-actions">
          <button class="btn primary" data-action="${onUnlock}">
            全文を見る（${costLabel}）
          </button>
          <button class="btn ghost" data-action="open-buy">
            ポイント購入
          </button>
        </div>
      </div>
    </div>
  `;
}

function zodiacWheel(selectedKey) {
  const idx = Math.max(0, ZODIACS.findIndex((z) => z.key === selectedKey));
  return html`
    <div class="zodiac-wheel-wrap">
      <div class="zodiac-wheel-title">星座を選んでください</div>
      <div class="zodiac-wheel-sub">左右にスライドして選択（中央が選択状態）</div>

      <div class="zodiac-wheel" id="zodiacWheel" aria-label="Zodiac wheel">
        <div class="zodiac-wheel-inner" id="zodiacWheelInner">
          ${ZODIACS.map((z) => {
            const active = z.key === selectedKey;
            return html`
              <button
                class="zodiac-pill ${active ? "is-active" : ""}"
                type="button"
                data-zodiac="${z.key}"
              >
                ${z.label}
              </button>
            `;
          }).join("")}
        </div>

        <div class="zodiac-wheel-center" aria-hidden="true"></div>
        <div class="zodiac-wheel-fade left" aria-hidden="true"></div>
        <div class="zodiac-wheel-fade right" aria-hidden="true"></div>
      </div>

      <div class="zodiac-wheel-selected">
        選択中：<b>${ZODIACS[idx]?.label ?? "-"}</b>
      </div>
    </div>
  `;
}

function buyModal(points) {
  return html`
    <div class="modal-backdrop" data-action="close-buy">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Buy points" onclick="event.stopPropagation()">
        <div class="modal-head">
          <div class="modal-title">ポイント購入</div>
          <button class="icon-btn" data-action="close-buy" aria-label="Close">✕</button>
        </div>

        <div class="modal-body">
          <div class="muted">現在のポイント：<b>${points}pt</b></div>

          <div class="buy-cards">
            <div class="buy-card">
              <div class="buy-name">テスト：+1pt</div>
              <div class="buy-sub">今は導線検証用（あとでStripeに差し替え）</div>
              <button class="btn primary" data-action="buy-1">+1pt 追加</button>
            </div>
            <div class="buy-card">
              <div class="buy-name">テスト：+10pt</div>
              <div class="buy-sub">まとめて解放したい人向け</div>
              <button class="btn primary" data-action="buy-10">+10pt 追加</button>
            </div>
          </div>

          <div class="note">
            <b>本番Stripeにする場合：</b><br/>
            このボタンを「Stripe Checkout / Payment Link」に差し替えるだけでOKです。<br/>
            まずは“買いたくなる導線”と“解放体験”を固めましょう。
          </div>
        </div>
      </div>
    </div>
  `;
}

function render(state) {
  const { dateStr, selectedZodiac, fortune, unlocked, points, showBuy } = state;
  const zodiacLabel = ZODIACS.find((z) => z.key === selectedZodiac)?.label ?? "";

  el.innerHTML = html`
    <div class="bg"></div>

    <div class="container">
      <header class="hero">
        <div class="hero-badge">TODAY</div>
        <div class="hero-title">今日の運勢</div>
        <div class="hero-sub">${formatDateJP(new Date())}</div>

        <div class="hero-right">
          <div class="pill">
            <span class="pill-k">モード</span>
            <span class="pill-v">無料：ダイジェスト</span>
          </div>
          <div class="pill">
            <span class="pill-k">ポイント</span>
            <span class="pill-v"><b>${points}pt</b></span>
            <button class="mini-btn" data-action="open-buy">購入</button>
          </div>
        </div>
      </header>

      <section class="panel">
        ${zodiacWheel(selectedZodiac)}

        <div class="panel-actions">
          <div class="panel-left">
            <span class="tag">選択：<b>${zodiacLabel}</b></span>
            <span class="tag">無料：運勢＋ラッキーカラー</span>
          </div>
          <div class="panel-right">
            <button class="btn ghost" data-action="refresh">更新</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${zodiacLabel}の${fortune.title}</div>
            <div class="card-sub">無料で見れるのは「短文」と「ラッキーカラー」だけです。</div>
          </div>
          <div class="kicker">無料：1〜2文 + ラッキー</div>
        </div>

        <div class="fortune-free">
          <div class="free-row">
            <div class="free-label">今日の運勢</div>
            <div class="free-text">${fortune.short}</div>
          </div>

          <div class="lucky-pill">
            <span>ラッキーカラー</span>
            <b>${fortune.luckyColor}</b>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="lock-head">
          <div>
            <div class="card-title">全文（詳細）</div>
            <div class="card-sub">恋愛/仕事/金運、星評価、アドバイス、ラッキーアイテムなど</div>
          </div>
          <div class="kicker">${unlocked ? "解放済み" : "ロック中"}</div>
        </div>

        ${
          unlocked
            ? html`
                <div class="fortune-paid">
                  <div class="paid-block">
                    <div class="paid-head">
                      <div class="paid-title">概要</div>
                      <div class="kicker">PAID</div>
                    </div>
                    <div class="paid-summary">${fortune.summary}</div>
                  </div>

                  <div class="paid-block">
                    <div class="paid-head">
                      <div class="paid-title">運勢（★）</div>
                      <div class="kicker">PAID</div>
                    </div>

                    <div class="paid-grid">
                      <div class="paid-card">
                        <div class="kicker">総合</div>
                        ${starBar(fortune.overall)}
                      </div>
                      <div class="paid-card">
                        <div class="kicker">恋愛</div>
                        ${starBar(fortune.loveStars)}
                        <div class="axis-text">${fortune.loveText}</div>
                      </div>
                      <div class="paid-card">
                        <div class="kicker">仕事</div>
                        ${starBar(fortune.workStars)}
                        <div class="axis-text">${fortune.workText}</div>
                      </div>
                      <div class="paid-card">
                        <div class="kicker">金運</div>
                        ${starBar(fortune.moneyStars)}
                        <div class="axis-text">${fortune.moneyText}</div>
                      </div>
                    </div>
                  </div>

                  <div class="paid-block">
                    <div class="paid-head">
                      <div class="paid-title">今日の一手</div>
                      <div class="kicker">PAID</div>
                    </div>
                    <div class="template-text">${fortune.advice}</div>
                  </div>

                  <div class="paid-lucky">
                    <div class="paid-head">
                      <div class="paid-title">ラッキー</div>
                      <div class="kicker">PAID</div>
                    </div>
                    <ul class="list">
                      <li><b>ラッキーアイテム：</b>${fortune.luckyItem}</li>
                      <li><b>ラッキータイム：</b>${fortune.luckyTime}</li>
                      <li><b>ラッキーカラー：</b>${fortune.luckyColor}</li>
                    </ul>
                  </div>
                </div>
              `
            : lockedBlock({
                title: "全文（詳細）",
                sub: "ポイントを使うと、この星座の“今日の全文”が解放されます（同じ日付は再課金なし）。",
                costLabel: "1pt",
                onUnlock: "unlock-full",
              })
        }
      </section>

      ${showBuy ? buyModal(points) : ""}
    </div>
  `;
}

function attachHandlers(state) {
  // wheel: scroll-snapで中央選択
  const wheel = $("#zodiacWheel");
  const inner = $("#zodiacWheelInner");
  if (wheel && inner) {
    // 初回：選択中を中央に寄せる
    const active = inner.querySelector(`.zodiac-pill.is-active`);
    if (active) {
      const left = active.offsetLeft - (wheel.clientWidth / 2 - active.clientWidth / 2);
      wheel.scrollLeft = Math.max(0, left);
    }

    let scrollTimer = null;
    wheel.addEventListener("scroll", () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        // 中央に近いpillを選択
        const centerX = wheel.scrollLeft + wheel.clientWidth / 2;
        const pills = Array.from(inner.querySelectorAll(".zodiac-pill"));
        let best = null;
        let bestDist = Infinity;
        for (const p of pills) {
          const px = p.offsetLeft + p.clientWidth / 2;
          const d = Math.abs(px - centerX);
          if (d < bestDist) {
            bestDist = d;
            best = p;
          }
        }
        if (best) {
          const k = best.dataset.zodiac;
          if (k && k !== state.selectedZodiac) {
            localStorage.setItem(STORAGE.selectedZodiac, k);
            boot(); // 再描画
          }
        }
      }, 120);
    });

    inner.addEventListener("click", (e) => {
      const btn = e.target.closest(".zodiac-pill");
      if (!btn) return;
      const k = btn.dataset.zodiac;
      if (!k) return;

      // タップしたpillを中央へ
      const left = btn.offsetLeft - (wheel.clientWidth / 2 - btn.clientWidth / 2);
      wheel.scrollTo({ left: Math.max(0, left), behavior: "smooth" });

      if (k !== state.selectedZodiac) {
        localStorage.setItem(STORAGE.selectedZodiac, k);
        setTimeout(() => boot(), 180);
      }
    });
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]");
    if (!a) return;
    const action = a.dataset.action;

    if (action === "refresh") {
      boot(true);
      return;
    }

    if (action === "open-buy") {
      boot(false, { showBuy: true });
      return;
    }
    if (action === "close-buy") {
      boot(false, { showBuy: false });
      return;
    }

    if (action === "buy-1") {
      addPoints(1);
      boot(false, { showBuy: false });
      return;
    }
    if (action === "buy-10") {
      addPoints(10);
      boot(false, { showBuy: false });
      return;
    }

    if (action === "unlock-full") {
      const res = spendToUnlock(state.dateStr, state.selectedZodiac, 1);
      if (!res.ok) {
        boot(false, { showBuy: true });
        return;
      }
      boot();
      return;
    }
  });
}

// ----- boot -----
function boot(forceReroll = false, patch = {}) {
  const dateStr = todayStr();
  const selectedZodiac = localStorage.getItem(STORAGE.selectedZodiac) || "aries";

  // テンプレ生成（毎日固定）
  // forceRerollは将来「時間帯」等で変化させる場合の余地。今は同じ結果でOK
  const fortune = buildFortune(selectedZodiac, dateStr);
  const points = getPoints();
  const unlocked = isUnlocked(dateStr, selectedZodiac);

  const state = {
    dateStr,
    selectedZodiac,
    fortune,
    unlocked,
    points,
    showBuy: false,
    ...patch,
  };

  render(state);
  attachHandlers(state);
}

boot();
