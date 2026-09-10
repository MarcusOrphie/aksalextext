/* Кабинет контент-машины «Залихват». Supabase auth + наш /api для генерации. */
(function () {
  const cfg = window.ZCFG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const API = cfg.API_BASE || "/api";

  const t = window.t || ((k) => k);
  // Ссылки оплаты Продамус
  const PAY = {
    start: cfg.PAY_START || "https://link.payform.ru/?paymentLinkId=8481493b-b36e-40cd-98df-890d7a19f6c6",
    pro: cfg.PAY_PRO || "https://link.payform.ru/?paymentLinkId=70cf4fc6-f875-4959-a847-fa400d1ad640",
  };
  function setPayLinks(email) {
    const em = email ? "&customer_email=" + encodeURIComponent(email) : "";
    [["pay-start", PAY.start], ["pw-pay-start", PAY.start], ["pay-pro", PAY.pro], ["pw-pay-pro", PAY.pro]]
      .forEach(([id, url]) => { const a = $(id); if (a) a.href = url + em; });
  }
  // на любой кнопке оплаты (payform.ru) подставляем известный email пользователя - чтобы на платёжной странице он был уже заполнен
  let knownEmail = "";
  document.addEventListener("click", function (ev) {
    const a = ev.target && ev.target.closest && ev.target.closest('a[href*="payform.ru"]');
    if (!a || !knownEmail) return;
    try {
      const u = new URL(a.href);
      if (!u.searchParams.get("customer_email")) { u.searchParams.set("customer_email", knownEmail); a.href = u.toString(); }
    } catch (e) {}
  }, true);
  // загрузка своего фото для обложки Reels ($ ещё не объявлен здесь - берём напрямую)
  (function () {
    const cf = document.getElementById("cover-file"); if (!cf) return;
    cf.onchange = async () => {
      const file = cf.files && cf.files[0]; if (!file) return;
      try { coverBg = await blobToDataURL(file); } catch (e) { return; }
      const prev = $("cover-prev"); if (prev) { prev.hidden = false; prev.style.backgroundImage = "url(" + coverBg + ")"; }
      const lbl = $("cover-up-label"); if (lbl) lbl.textContent = t("cover_change");
    };
  })();
  const TEXT_IDS = ["audience", "reels", "shorts", "tiktok", "youtube_long", "content_plan", "scriptcheck"];
  const VISUAL_IDS = ["carousel", "post", "stories", "reels_cover"];
  const VISUAL = { carousel: 1, post: 1, stories: 1, reels_cover: 1 };
  let coverBg = null;   // загруженное пользователем фото для обложки Reels
  // фейк-ризонинг: забавные фразы, пока идёт генерация
  const THINK = {
    ru: ["Думаю над идеей...", "Копаю свежие тренды...", "Ищу в бинокль виральные приёмы...",
         "Лью смыслы в текст...", "Кручу-верчу формулировки...", "Точу хук поострее...",
         "Роюсь в актуалочке...", "Сверяюсь с фактами...", "Отжимаю воду...", "Собираю пакет..."],
    en: ["Thinking up the idea...", "Digging through fresh trends...", "Scanning for viral moves...",
         "Pouring meaning into words...", "Tuning the phrasing...", "Sharpening the hook...",
         "Rummaging for what's hot...", "Fact-checking...", "Wringing out the fluff...", "Packing it up..."],
  };
  function startThinking(st) {
    const lang = (window.ZI18N.getLang && window.ZI18N.getLang() || "ru").startsWith("en") ? "en" : "ru";
    const arr = THINK[lang] || THINK.ru;
    let i = Math.floor(Math.random() * arr.length);
    st.textContent = arr[i];
    const timer = setInterval(() => { i = (i + 1) % arr.length; st.textContent = arr[i]; }, 2200);
    return () => clearInterval(timer);
  }
  let platform = "reels";
  let profile = {};
  let recovering = false;
  let signedIn = false;   // уже показали кабинет для этой сессии
  let lastOut = null;     // последняя выдача - чтобы перерисовать при смене языка

  const $ = (id) => document.getElementById(id);
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function show(view) { ["auth", "recover", "app", "profile"].forEach(v => $("view-" + v).hidden = (v !== view)); }
  function setAuthUI(on) { document.querySelectorAll(".authonly").forEach(e => { e.hidden = !on; }); }

  // ---------- AUTH ----------
  async function refresh() {
    if (recovering) return;                 // не перерисовывать экран сброса пароля кабинетом
    const { data } = await sb.auth.getSession();
    if (recovering) return;                 // событие сброса могло прийти во время await
    const s = data.session;
    if (s) {
      signedIn = true;
      setAuthUI(true);
      $("usermail").textContent = s.user.email || s.user.phone || "профиль";
      show("app");
      loadMe(); await loadProfile(); maybeShowHint(); await loadHistory();
    } else {
      signedIn = false;
      setAuthUI(false); show("auth");
      if (window.__authErr) { authNote(t("note_link_expired") + window.__authErr + ")"); window.__authErr = null; }
    }
  }
  // Ссылка из письма: пометить режим восстановления / поймать ошибку (устаревшая ссылка)
  (function () {
    const hp = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    const qp = new URLSearchParams(location.search || "");
    if ((hp.get("type") || qp.get("type")) === "recovery") recovering = true;
    const err = hp.get("error_description") || hp.get("error") || qp.get("error_description") || qp.get("error");
    if (err) window.__authErr = decodeURIComponent(err.replace(/\+/g, " "));
  })();

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" || (recovering && session)) {
      recovering = true; setAuthUI(false); show("recover"); return;
    }
    if (recovering) return;  // не выкидывать из экрана «новый пароль»
    // Перерисовываем/переключаем вид только на реальных переходах входа-выхода.
    // TOKEN_REFRESHED и повторный SIGNED_IN (при возврате на вкладку) не трогают текущий экран,
    // иначе пользователя выкидывает из «Мои данные» обратно в кабинет.
    if (event === "SIGNED_OUT" || !session) { signedIn = false; refresh(); return; }
    if (event === "SIGNED_IN" && !signedIn) { refresh(); return; }
  });

  function authNote(msg) { $("email-note").hidden = false; $("email-note").textContent = msg; }
  function ruErr(m) {
    m = m || "";
    const map = [
      [/invalid login credentials/i, "err_bad_creds"],
      [/email not confirmed/i, "err_not_confirmed"],
      [/already registered/i, "err_registered"],
      [/password should be at least/i, "err_pass_min"],
      [/should be different from the old/i, "err_pass_diff"],
      [/unable to validate email|invalid format/i, "err_email_fmt"],
      [/email rate limit exceeded/i, "err_rate"],
      [/for security purposes.*after|only request this after/i, "err_too_often"],
      [/token has expired|invalid.*token|otp_expired/i, "err_token"],
      [/signups? (not allowed|is disabled)/i, "err_signup_off"],
      [/failed to fetch|networkerror|load failed/i, "err_network"],
    ];
    for (const [re, key] of map) if (re.test(m)) return t(key);
    return m;
  }
  function consentOk() {
    const c = $("consent");
    if (c && c.checked) return true;
    authNote(t("note_consent"));
    return false;
  }
  $("btn-email").onclick = async () => {
    const email = $("email").value.trim(), password = $("password").value;
    if (!email || !password) return authNote(t("note_need_creds"));
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) authNote(ruErr(error.message));
  };
  // требования к паролю: минимум 6, только латиница/цифры/символы, заглавная буква и цифра
  function passIssue(pw) {
    if (!pw || pw.length < 6) return "note_pass_short";
    if (/[^\x21-\x7E]/.test(pw)) return "note_pass_rules";     // кириллица/пробелы/не-ASCII запрещены
    if (!/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) return "note_pass_rules";
    return null;
  }
  $("btn-register").onclick = async () => {
    if (!consentOk()) return;
    const email = $("email").value.trim(), password = $("password").value;
    if (!email || !password) return authNote(t("note_need_creds_reg"));
    const pi = passIssue(password);
    if (pi) return authNote(t(pi));
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return authNote(ruErr(error.message));
    if (!data.session) authNote(t("note_account_created"));
  };
  $("btn-forgot").onclick = async () => {
    const email = $("email").value.trim();
    if (!email) return authNote(t("note_forgot_empty"));
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    authNote(error ? ruErr(error.message) : (t("note_forgot_sent") + email + "."));
  };
  $("btn-setpass").onclick = async () => {
    const password = $("newpass").value;
    const note = $("recover-note");
    const rpi = passIssue(password);
    if (rpi) { note.hidden = false; note.textContent = t(rpi === "note_pass_short" ? "note_recover_short" : "note_pass_rules"); return; }
    const { error } = await sb.auth.updateUser({ password });
    note.hidden = false;
    if (error) { note.textContent = ruErr(error.message); return; }
    note.textContent = t("note_recover_ok");
    recovering = false;
    location.replace("/");
  };
  $("btn-yandex").onclick = () => { location.href = API + "/auth/yandex/start"; };

  function setAuthMode(mode) {
    const login = mode !== "register";
    $("tab-login").classList.toggle("on", login);
    $("tab-reg").classList.toggle("on", !login);
    $("btn-email").hidden = !login;
    $("btn-forgot").hidden = !login;
    $("btn-register").hidden = login;
    $("consent-row").hidden = login;
    $("auth-title").textContent = login ? t("auth_title_login") : t("auth_title_reg");
    $("auth-lead").textContent = login ? t("auth_lead_login") : t("auth_lead_reg");
    $("password").setAttribute("autocomplete", login ? "current-password" : "new-password");
    $("email-note").hidden = true;
  }
  $("tab-login").onclick = () => setAuthMode("login");
  $("tab-reg").onclick = () => setAuthMode("register");

  // ---------- i18n ----------
  function applyI18n() { if (window.ZI18N) window.ZI18N.apply(); }
  function currentAuthMode() { return $("tab-reg").classList.contains("on") ? "register" : "login"; }
  function switchLang(l) {
    window.ZI18N.setLang(l);
    applyI18n();
    setAuthMode(currentAuthMode());
    renderPlatforms();
    renderProfileDesigns();
    if (signedIn) { loadMe(); loadHistory(); }
    if (lastOut) renderResult(lastOut);
  }
  document.querySelectorAll(".langsw a").forEach(a => {
    a.onclick = (e) => { e.preventDefault(); switchLang(a.getAttribute("data-lang")); };
  });
  applyI18n();
  setAuthMode("login");
  $("logout").onclick = async () => {
    try { await sb.auth.signOut(); } catch (e) {}
    location.href = "/";
  };
  function dismissHint() { try { localStorage.setItem("zh_hint_profile", "1"); } catch (e) {} const h = $("profile-hint"); if (h) h.hidden = true; }
  function maybeShowHint() {
    try { if (localStorage.getItem("zh_hint_profile")) return; } catch (e) { return; }
    if (profile && (profile.niche || profile.audience || profile.personality)) return;
    const h = $("profile-hint"); if (h) h.hidden = false;
  }
  $("hint-x").onclick = (e) => { e.stopPropagation(); dismissHint(); };
  $("tab-profile").onclick = () => { dismissHint(); show("profile"); refreshTgStatus(); };
  $("btn-back").onclick = () => show("app");

  // ---------- статус привязки телеграма в профиле ----------
  async function refreshTgStatus() {
    const st = $("tg-state"), btn = $("btn-tg-connect");
    if (!st || !btn) return;
    st.textContent = t("tg_checking"); st.classList.remove("on"); btn.hidden = true;
    try {
      const { data } = await sb.auth.getSession();
      const token = data.session && data.session.access_token; if (!token) return;
      const res = await fetch(API + "/tg/status", { headers: { authorization: "Bearer " + token } });
      const j = await res.json();
      if (j.linked) { st.textContent = t("tg_linked"); st.classList.add("on"); btn.hidden = true; }
      else { st.textContent = t("tg_not_linked"); btn.hidden = false; }
    } catch (e) { st.textContent = t("tg_not_linked"); btn.hidden = false; }
  }
  const _tgc = $("btn-tg-connect");
  if (_tgc) _tgc.onclick = async () => {
    try {
      const { data } = await sb.auth.getSession();
      const token = data.session && data.session.access_token; if (!token) return;
      const res = await fetch(API + "/tg/connect", { method: "POST", headers: { authorization: "Bearer " + token } });
      const j = await res.json();
      if (j.deep_link) window.open(j.deep_link, "_blank");
    } catch (e) {}
  };

  function showPaywall() { $("paywall").hidden = false; }
  $("paywall-close").onclick = () => { $("paywall").hidden = true; };
  $("paywall").onclick = (e) => { if (e.target === $("paywall")) $("paywall").hidden = true; };

  // ---------- PLATFORM PICKER ----------
  function renderPlatforms() {
    const box = $("platforms"); box.textContent = "";
    [["grp_text", TEXT_IDS, false], ["grp_visual", VISUAL_IDS, true]].forEach(([hk, ids, visual]) => {
      const head = el("div", "pgroup" + (visual ? " visual" : ""));
      head.appendChild(el("span", "pg-title", t(hk)));
      if (meState) {
        if (!visual) {
          const txt = meState.text_unlimited
            ? (t("u_made") + (meState.text_used || 0) + " · " + t("u_unlim"))
            : (t("u_made") + (meState.text_used || 0) + " · " + t("u_left") + (meState.text_left != null ? meState.text_left : 0));
          head.appendChild(el("span", "pg-usage", txt));
        }
      }
      box.appendChild(head);
      if (visual && meState) {
        const row = el("div", "pg-usage-vis");
        const unlim = !!meState.visual_unlimited;
        const item = (label, made, limit) => {
          const s = el("span", "pg-uv");
          if (unlim) s.innerHTML = "<b>" + label + "</b> " + t("u_unlim");
          else s.innerHTML = "<b>" + label + "</b> " + t("u_made") + made + " · " + t("u_left") + Math.max(0, limit - made);
          return s;
        };
        const cLim = meState.carousel_limit || 0, vLim = meState.visual_monthly || 0;
        row.appendChild(item(t("p_carousel"), cLim - (meState.carousel_left || 0), cLim));
        row.appendChild(item(t("p_post"), vLim - (meState.post_left || 0), vLim));
        row.appendChild(item(t("p_stories"), vLim - (meState.stories_left || 0), vLim));
        row.appendChild(item(t("p_reels_cover"), vLim - (meState.cover_left || 0), vLim));
        box.appendChild(row);
      }
      const grid = el("div", "platforms");
      ids.forEach((id) => {
        const c = el("div", "pf" + (id === platform ? " on" : ""));
        c.appendChild(el("div", null, t("p_" + id)));
        c.appendChild(el("small", null, t("p_" + id + "_s")));
        if (visual) c.appendChild(el("span", "pf-pro", "PRO"));
        c.onclick = () => { platform = id; const rb = $("result"); if (rb) rb.textContent = ""; const gs = $("gen-status"); if (gs) gs.hidden = true; renderPlatforms(); };
        grid.appendChild(c);
      });
      box.appendChild(grid);
    });
    updateCarouselPanel();
    applyPlatformFields();
  }
  // для «Обложек Reels» - одно поле «Заголовок» (без «тема» и «твой текст»)
  function applyPlatformFields() {
    const lbl = $("topic-lbl"), uf = $("usertext-fld"), ti = $("topic");
    const us = uf && uf.querySelector("span");
    if (us) us.textContent = t("lbl_usertext");   // дефолтная подпись поля «твой текст» (сбрасываем перед override)
    const scf = $("stories-count-fld"); if (scf) scf.hidden = (platform !== "stories");
    const rbf = $("reels-brief-fld"); if (rbf) rbf.hidden = (platform !== "reels");
    if (platform === "reels_cover") {
      if (uf) uf.hidden = true;
      if (lbl) lbl.textContent = t("cover_title_lbl");
      if (ti) ti.placeholder = t("cover_title_ph");
    } else if (platform === "audience") {
      if (uf) uf.hidden = true;
      if (lbl) lbl.textContent = t("au_topic_lbl");
      if (ti) ti.placeholder = t("au_topic_ph");
    } else if (platform === "scriptcheck") {
      if (uf) uf.hidden = false;
      if (us) us.textContent = t("sc_text_lbl");   // тут поле «твой текст» - главный ввод (сценарий/пост)
      if (ti) { ti.placeholder = t("sc_topic_ph"); }
      if (lbl) lbl.textContent = t("sc_topic_lbl");
    } else {
      if (uf) uf.hidden = false;
      if (lbl) lbl.textContent = t("lbl_topic");
      if (ti) ti.placeholder = t("ph_topic");
    }
  }

  // бриф ролика (только reels) - собираем значения полей формы
  function reelsBrief() {
    const v = (id) => (($(id) || {}).value || "").trim();
    return { b_audience: v("rb-audience"), b_goal: v("rb-goal"), b_promo: v("rb-promo"),
             b_idea: v("rb-idea"), b_style: v("rb-style"), b_format: v("rb-format"), b_length: v("rb-length") };
  }

  // ---------- GENERATE ----------
  $("btn-gen").onclick = async () => {
    const { data } = await sb.auth.getSession();
    const token = data.session && data.session.access_token;
    if (!token) return refresh();
    const topic = $("topic").value.trim();
    const utEl = $("usertext"); const userText = utEl ? utEl.value.trim().slice(0, 6000) : "";
    const st = $("gen-status"); st.hidden = false;
    if (VISUAL[platform] && !carState.pro) { st.textContent = t("visual_pro_msg"); showPaywall(); return; }
    if (platform === "reels_cover" && !coverBg) { st.textContent = t("cover_need"); return; }
    $("btn-gen").disabled = true;
    const stopThink = startThinking(st);
    try {
      const res = await fetch(API + "/generate", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + token },
        body: JSON.stringify(Object.assign({ platform, topic, profile, lang: window.ZI18N.getLang(), user_text: userText, design: effectiveDesign(), count: (platform === "stories" ? parseInt(($("stories-count") || {}).value || "0", 10) : 0) }, platform === "reels" ? reelsBrief() : {})),
      });
      stopThink();
      if (res.status === 402) {
        const e = await res.json().catch(() => ({}));
        if (e.reason === "carousel_weekly") { st.textContent = t("car_weekly_msg"); return; }
        if (e.reason === "visual_monthly") { st.textContent = t("visual_monthly_msg"); return; }
        if (e.reason === "visual_pro" || e.reason === "carousel_pro") { st.textContent = t("visual_pro_msg"); showPaywall(); return; }
        if (e.reason === "text_daily") { st.textContent = t("text_daily_msg").replace("{n}", e.limit != null ? e.limit : ""); return; }
        st.hidden = true; showPaywall(); return;
      }
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || e.error || res.status); }
      const out = await res.json();
      if (platform === "carousel") { await renderVisual(out, "carousel"); return; }
      if (platform === "stories") { await renderVisual(out, "stories"); return; }
      if (platform === "post") { await renderPost(out); return; }
      if (platform === "reels_cover") { await renderCover(out); return; }
      renderResult(out);
      st.hidden = true;
      await loadHistory(); await loadMe();
    } catch (e) {
      st.textContent = t("gen_fail") + e.message;
    } finally {
      stopThink();
      $("btn-gen").disabled = false;
    }
  };

  function copyBtn(getText, label) {
    label = label || t("copy");
    const b = el("button", "copy", label);
    b.onclick = () => {
      try { navigator.clipboard.writeText(getText()); } catch (e) {}
      b.textContent = t("copied"); b.classList.add("copied");
      setTimeout(() => { b.textContent = label; b.classList.remove("copied"); }, 1500);
    };
    return b;
  }
  // ---------- ОТПРАВИТЬ В ТЕЛЕГРАМ (через бота @zalihvat_bot) ----------
  const TG_PLANE = '<svg viewBox="0 0 24 24" width="15" height="15" style="vertical-align:-3px" aria-hidden="true"><path fill="currentColor" d="M21.9 4.3 2.9 11.7c-1 .4-1 1.3-.1 1.6l4.8 1.5 1.8 5.7c.2.5.4.6.8.6.4 0 .6-.2.9-.5l2.2-2.1 4.7 3.5c.9.5 1.5.2 1.7-.9l3-14.2c.3-1.2-.4-1.7-1.4-1.3ZM18.6 7.4l-8.3 7.6-.3 3.7-1.7-5.2 10.3-6.1z"/></svg>';
  async function tgSend(text, images) {
    const { data } = await sb.auth.getSession();
    const token = data.session && data.session.access_token; if (!token) return "err";
    let res;
    try {
      res = await fetch(API + "/tg/send", { method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ text: text || "", images: (images || []).filter(Boolean) }) });
    } catch (e) { return "err"; }
    if (res.status === 409) { const e = await res.json().catch(() => ({})); if (e.deep_link) window.open(e.deep_link, "_blank"); return "not_linked"; }
    return res.ok ? "ok" : "err";
  }
  function tgBtn(getText, getImages) {
    const b = el("button", "tgbtn"); b.type = "button";
    b.innerHTML = TG_PLANE + "<span> " + t("tg_send") + "</span>";
    const setLabel = (s) => { b.querySelector("span").textContent = " " + s; };
    b.onclick = async () => {
      b.disabled = true; setLabel(t("tg_sending"));
      let r; try { r = await tgSend(getText ? getText() : "", getImages ? getImages() : []); } catch (e) { r = "err"; }
      b.disabled = false;
      setLabel(r === "ok" ? t("tg_sent") : r === "not_linked" ? t("tg_connect") : t("tg_fail"));
      if (r === "ok") b.classList.add("ok");
      setTimeout(() => { setLabel(t("tg_send")); b.classList.remove("ok"); }, 2600);
    };
    return b;
  }
  function copyPack(it) {
    const tags = arr(it.hashtags).map(t => "#" + String(t).replace(/^#/, "")).join(" ");
    const parts = [];
    if (it.caption) parts.push(it.caption);
    if (tags) parts.push(tags);
    if (it.first_comment) parts.push(t("r_first_comment") + ": " + it.first_comment);
    const b = copyBtn(() => parts.join("\n\n"), t("copy_pack"));
    b.classList.add("copypack");
    return b;
  }
  async function sendVote(plat, item, vote) {
    try {
      const { data } = await sb.auth.getSession();
      const token = data.session && data.session.access_token;
      if (!token) return;
      await fetch(API + "/feedback", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + token },
        body: JSON.stringify({ platform: plat, item: String(item || "").slice(0, 300), vote }),
      });
    } catch (e) {}
  }
  function voteBtns(plat, item) {
    const wrap = el("div", "votes");
    wrap.appendChild(el("span", "voteq", t("vote_q")));
    const up = el("button", "vote", "👍");
    const down = el("button", "vote", "👎");
    up.title = t("vote_up"); down.title = t("vote_down");
    up.onclick = () => { sendVote(plat, item, "up"); up.classList.add("on"); down.classList.remove("on"); };
    down.onclick = () => { sendVote(plat, item, "down"); down.classList.add("on"); up.classList.remove("on"); };
    wrap.appendChild(up); wrap.appendChild(down);
    return wrap;
  }
  function row(k, v, cls) { const r = el("div", "rrow"); r.appendChild(el("div", "rk", k)); r.appendChild(el("div", cls || null, v)); return r; }
  function arr(v) { if (Array.isArray(v)) return v; if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; } } return []; }
  // подписи reels: список или строка из нескольких строк -> массив
  function capList(v) { return Array.isArray(v) ? v : (v ? String(v).split(/\n+/).map(s => s.trim()).filter(Boolean) : []); }

  function plabel(p) {
    switch (p) {
      case "reels": return t("p_reels") + " · " + t("ig");
      case "shorts": return t("p_shorts") + " · YouTube";
      case "tiktok": return "TikTok";
      case "youtube_long": return "YouTube · " + t("p_youtube_long_s");
      case "carousel": return t("p_carousel") + " · " + t("ig");
      case "post": return t("p_post") + " · " + t("ig");
      case "stories": return "Stories · " + t("ig");
      case "content_plan": return t("p_content_plan");
      case "audience": return t("p_audience");
      case "scriptcheck": return t("p_scriptcheck");
      default: return p;
    }
  }

  function savePdf(node, platform) {
    if (!window.html2pdf) { alert(t("pdf_loading")); return Promise.resolve(); }
    const date = new Date().toISOString().slice(0, 10);
    const opt = {
      margin: 10, filename: "zalihvat-" + platform + "-" + date + ".pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, backgroundColor: "#faf5ec", useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: ".rcard" },
    };
    const run = () => window.html2pdf().set(opt).from(node).save();
    return (document.fonts && document.fonts.ready) ? document.fonts.ready.then(run) : Promise.resolve().then(run);
  }

  function renderResult(out) {
    lastOut = out;
    const box = $("result"); box.textContent = "";
    const d = out.data || {};
    const p = out.platform;
    const content = el("div", "pdf-content");
    const title = el("div", "pdf-title");
    title.appendChild(el("b", null, t("pdf_title")));
    title.appendChild(el("span", null, "  ·  " + plabel(p)));
    content.appendChild(title);
    if (["shorts", "tiktok"].includes(p) || (p === "reels" && arr(d.ideas).length)) {
      arr(d.ideas).forEach((it, i) => {
        const c = el("div", "rcard");
        c.appendChild(el("h3", null, (i + 1) + ". " + it.idea));
        c.appendChild(row(t("r_hook"), it.hook, "hook"));
        const alt = arr(it.hooks_alt);
        if (alt.length) {
          const wrap = el("div", "rrow");
          wrap.appendChild(el("div", "rk", t("r_abhooks")));
          const box2 = el("div", null);
          alt.forEach(h => box2.appendChild(el("div", "abhook", "• " + h)));
          wrap.appendChild(box2); c.appendChild(wrap);
        }
        c.appendChild(row(t("r_scenario"), it.scenario));
        const shots = arr(it.shot_list);
        if (shots.length) {
          const wrap = el("div", "rrow");
          wrap.appendChild(el("div", "rk", t("r_shotlist")));
          const ol = el("ol", "shotlist");
          shots.forEach(s => ol.appendChild(el("li", null, s)));
          wrap.appendChild(ol); c.appendChild(wrap);
        }
        const ost = arr(it.on_screen_text);
        if (ost.length) c.appendChild(row(t("r_onscreen"), ost.join(" · ")));
        if (it.teleprompter) {
          const wrap = el("div", "rrow");
          wrap.appendChild(el("div", "rk", t("r_teleprompter")));
          const tp = el("div", "teleprompter", it.teleprompter);
          wrap.appendChild(tp); c.appendChild(wrap);
          c.appendChild(copyBtn(() => it.teleprompter));
        }
        if (it.caption) {
          const wrap = el("div", "rrow");
          wrap.appendChild(el("div", "rk", t("r_caption")));
          wrap.appendChild(el("div", "caption", it.caption));
          c.appendChild(wrap);
        }
        const tags = arr(it.hashtags);
        if (tags.length) c.appendChild(row(t("r_hashtags"), tags.map(x => "#" + String(x).replace(/^#/, "")).join(" "), "hashtags"));
        if (it.first_comment) c.appendChild(row(t("r_first_comment"), it.first_comment));
        if (it.length_rec) c.appendChild(row(t("r_length"), it.length_rec));
        const refs = arr(it.references);
        if (refs.length) {
          const wrap = el("div", "rrow");
          wrap.appendChild(el("div", "rk", t("r_references")));
          const ul = el("ul", "refs");
          refs.forEach(r => ul.appendChild(el("li", null, r)));
          wrap.appendChild(ul); c.appendChild(wrap);
        }
        if (it.fact_check) {
          const fc = el("div", "factcheck");
          fc.appendChild(el("span", "fclabel", t("r_factcheck")));
          fc.appendChild(el("div", null, it.fact_check));
          c.appendChild(fc);
        }
        const bar = el("div", "cardbar");
        bar.appendChild(copyPack(it));
        bar.appendChild(voteBtns(p, it.idea || it.hook));
        c.appendChild(bar);
        content.appendChild(c);
      });
    } else if (p === "reels") {
      const c = el("div", "rcard");
      if (d.analysis) { const fc = el("div", "factcheck"); fc.appendChild(el("span", "fclabel", t("rb_r_analysis"))); fc.appendChild(el("div", null, d.analysis)); c.appendChild(fc); }
      c.appendChild(row("🔥 " + t("rb_r_hook"), d.hook, "hook"));
      c.appendChild(row("🧠 " + t("rb_r_dev"), d.development));
      c.appendChild(row("⚡ " + t("rb_r_amp"), d.amplification));
      c.appendChild(row("🎯 " + t("rb_r_finale"), d.finale));
      if (d.how_to_shoot) c.appendChild(row("🎬 " + t("rb_r_shoot"), d.how_to_shoot));
      const caps = capList(d.captions);
      if (caps.length) {
        const wrap = el("div", "rrow"); wrap.appendChild(el("div", "rk", "📝 " + t("rb_r_captions")));
        const box2 = el("div", null); caps.forEach(x => box2.appendChild(el("div", "caption", x))); wrap.appendChild(box2); c.appendChild(wrap);
      }
      if (d.why_works) c.appendChild(row("🚀 " + t("rb_r_why"), d.why_works));
      const alts = arr(d.alternatives);
      if (alts.length) {
        const wrap = el("div", "rrow"); wrap.appendChild(el("div", "rk", "🔁 " + t("rb_r_alts")));
        const box2 = el("div", null);
        alts.forEach(a => {
          const it2 = el("div", "planitem");
          if (a.format) { const hh = el("div", "planhead"); hh.appendChild(el("span", "planfmt", a.format)); it2.appendChild(hh); }
          if (a.angle) it2.appendChild(el("div", "planidea", a.angle));
          if (a.hook) it2.appendChild(el("div", "abhook", "• " + a.hook));
          box2.appendChild(it2);
        });
        wrap.appendChild(box2); c.appendChild(wrap);
      }
      const bar = el("div", "cardbar");
      bar.appendChild(copyBtn(() => [d.hook, d.development, d.amplification, d.finale].filter(Boolean).join("\n\n"), t("rb_r_copy")));
      bar.appendChild(voteBtns(p, d.hook || "reels"));
      c.appendChild(bar);
      content.appendChild(c);
    } else if (p === "youtube_long") {
      const c = el("div", "rcard");
      c.appendChild(el("h3", null, d.title || t("r_scenario")));
      c.appendChild(row(t("r_hook"), d.hook, "hook"));
      arr(d.sections).forEach(s => { c.appendChild(row(s.h, s.points)); });
      c.appendChild(row(t("r_outro"), d.outro));
      if (d.fact_check) {
        const fc = el("div", "factcheck");
        fc.appendChild(el("span", "fclabel", t("r_factcheck")));
        fc.appendChild(el("div", null, d.fact_check));
        c.appendChild(fc);
      }
      c.appendChild(voteBtns(p, d.title || d.hook));
      content.appendChild(c);
    } else if (p === "carousel") {
      const c = el("div", "rcard");
      c.appendChild(row(t("r_hookslide"), d.hook_slide, "hook"));
      arr(d.slides).forEach((s, i) => c.appendChild(row(t("r_slide") + " " + (i + 2) + " · " + s.title, s.text)));
      c.appendChild(row(t("r_finalslide"), d.cta_slide));
      c.appendChild(voteBtns(p, d.hook_slide));
      content.appendChild(c);
    } else if (p === "post") {
      const c = el("div", "rcard");
      c.appendChild(row(t("r_hook"), d.hook, "hook"));
      const alt = arr(d.hooks_alt);
      if (alt.length) {
        const wrap = el("div", "rrow");
        wrap.appendChild(el("div", "rk", t("r_abhooks")));
        const box2 = el("div", null);
        alt.forEach(h => box2.appendChild(el("div", "abhook", "• " + h)));
        wrap.appendChild(box2); c.appendChild(wrap);
      }
      c.appendChild(row(t("r_body"), d.body));
      c.appendChild(row(t("r_cta"), d.cta));
      const tags = arr(d.hashtags);
      if (tags.length) c.appendChild(row(t("r_hashtags"), tags.map(x => "#" + String(x).replace(/^#/, "")).join(" "), "hashtags"));
      if (d.first_comment) c.appendChild(row(t("r_first_comment"), d.first_comment));
      if (d.fact_check) {
        const fc = el("div", "factcheck");
        fc.appendChild(el("span", "fclabel", t("r_factcheck")));
        fc.appendChild(el("div", null, d.fact_check));
        c.appendChild(fc);
      }
      const pbar = el("div", "cardbar");
      pbar.appendChild(copyBtn(() => {
        const tg = tags.map(x => "#" + String(x).replace(/^#/, "")).join(" ");
        return [d.hook, d.body, d.cta, tg].filter(Boolean).join("\n\n");
      }, t("copy_post")));
      pbar.appendChild(voteBtns(p, d.hook));
      c.appendChild(pbar);
      content.appendChild(c);
    } else if (p === "stories") {
      const c = el("div", "rcard");
      arr(d.frames).forEach((f, i) => { const r = row(t("r_frame") + " " + (i + 1) + (f.title ? " · " + f.title : (f.visual ? " · " + f.visual : "")), f.text); c.appendChild(r); });
      const fr = arr(d.frames)[0];
      c.appendChild(voteBtns(p, fr && fr.text || "stories"));
      content.appendChild(c);
    } else if (p === "content_plan") {
      const rub = arr(d.rubrics);
      if (rub.length) {
        const rc = el("div", "rcard");
        rc.appendChild(el("h3", null, t("r_rubrics")));
        rub.forEach(r => rc.appendChild(row(r.name, r.idea)));
        content.appendChild(rc);
      }
      const pc = el("div", "rcard");
      pc.appendChild(el("h3", null, t("r_plan")));
      arr(d.plan).forEach((it) => {
        const item = el("div", "planitem");
        const head = el("div", "planhead");
        head.appendChild(el("span", "planday", it.day || ""));
        if (it.format) head.appendChild(el("span", "planfmt", it.format));
        if (it.goal) head.appendChild(el("span", "plangoal", it.goal));
        item.appendChild(head);
        item.appendChild(el("div", "planidea", (it.rubric ? it.rubric + ": " : "") + (it.idea || "")));
        if (it.hook) item.appendChild(el("div", "planhook", t("r_planhook") + it.hook));
        pc.appendChild(item);
      });
      const rub0 = arr(d.rubrics)[0];
      pc.appendChild(voteBtns(p, rub0 && rub0.name || "content_plan"));
      content.appendChild(pc);
    } else if (p === "audience") {
      const listRow = (card, label, items) => {
        const a = arr(items); if (!a.length) return;
        const wrap = el("div", "rrow"); wrap.appendChild(el("div", "rk", label));
        const ul = el("ul", "refs"); a.forEach(x => ul.appendChild(el("li", null, x)));
        wrap.appendChild(ul); card.appendChild(wrap);
      };
      arr(d.segments).forEach((seg, i) => {
        const c = el("div", "rcard");
        c.appendChild(el("h3", null, (i + 1) + ". " + (seg.name || t("au_segment"))));
        if (seg.portrait) c.appendChild(row(t("au_portrait"), seg.portrait));
        if (seg.jtbd) c.appendChild(row(t("au_jtbd"), seg.jtbd));
        listRow(c, t("au_pains"), seg.pains);
        listRow(c, t("au_desires"), seg.desires);
        listRow(c, t("au_objections"), seg.objections);
        listRow(c, t("au_words"), seg.their_words);
        content.appendChild(c);
      });
      if (d.awareness) {
        const ac = el("div", "rcard"); ac.appendChild(el("h3", null, t("au_awareness")));
        [["unaware", "au_aw_unaware"], ["problem", "au_aw_problem"], ["solution", "au_aw_solution"], ["product", "au_aw_product"], ["most", "au_aw_most"]]
          .forEach(pair => { if (d.awareness[pair[0]]) ac.appendChild(row(t(pair[1]), d.awareness[pair[0]])); });
        content.appendChild(ac);
      }
      const cm = arr(d.content_map);
      if (cm.length) {
        const mc = el("div", "rcard"); mc.appendChild(el("h3", null, t("au_contentmap")));
        cm.forEach(it => {
          const item = el("div", "planitem");
          const head = el("div", "planhead");
          if (it.format) head.appendChild(el("span", "planfmt", it.format));
          item.appendChild(head);
          item.appendChild(el("div", "planidea", "🎯 " + (it.pain || "")));
          if (it.angle) item.appendChild(el("div", "planhook", t("au_angle") + it.angle));
          arr(it.hooks).forEach(h => item.appendChild(el("div", "abhook", "• " + h)));
          mc.appendChild(item);
        });
        const seg0 = arr(d.segments)[0];
        mc.appendChild(voteBtns(p, seg0 && seg0.name || "audience"));
        content.appendChild(mc);
      }
    } else if (p === "scriptcheck") {
      const known = ["verified", "doubtful", "false", "unverifiable"];
      const vc = el("div", "rcard");
      vc.appendChild(el("h3", null, t("sc_verdict")));
      if (d.verdict) vc.appendChild(el("div", "sc-verdict", d.verdict));
      content.appendChild(vc);
      const facts = arr(d.facts);
      if (facts.length) {
        const fcard = el("div", "rcard");
        fcard.appendChild(el("h3", null, t("sc_facts")));
        facts.forEach(f => {
          const item = el("div", "sc-fact");
          const st = known.includes(String(f.status || "").toLowerCase()) ? String(f.status).toLowerCase() : "unverifiable";
          const head = el("div", "sc-fact-h");
          head.appendChild(el("span", "sc-badge sc-" + st, t("sc_st_" + st)));
          head.appendChild(el("span", "sc-claim", f.claim || ""));
          item.appendChild(head);
          if (f.comment) item.appendChild(el("div", "sc-comment", f.comment));
          if (f.fix) item.appendChild(row(t("sc_fix"), f.fix));
          fcard.appendChild(item);
        });
        content.appendChild(fcard);
      }
      if (d.hook) {
        const hc = el("div", "rcard");
        hc.appendChild(el("h3", null, t("sc_hook")));
        if (d.hook.assessment) hc.appendChild(row(t("sc_hook_assess"), d.hook.assessment));
        const opts = arr(d.hook.options);
        if (opts.length) {
          const wrap = el("div", "rrow");
          wrap.appendChild(el("div", "rk", t("sc_hook_opts")));
          const box2 = el("div", null);
          opts.forEach(h => box2.appendChild(el("div", "abhook", "• " + h)));
          wrap.appendChild(box2); hc.appendChild(wrap);
        }
        content.appendChild(hc);
      }
      const dv = arr(d.delivery);
      if (dv.length) {
        const dc = el("div", "rcard");
        dc.appendChild(el("h3", null, t("sc_delivery")));
        const ul = el("ul", "refs");
        dv.forEach(x => ul.appendChild(el("li", null, x)));
        dc.appendChild(ul);
        content.appendChild(dc);
      }
      if (d.enriched) {
        const ec = el("div", "rcard");
        ec.appendChild(el("h3", null, t("sc_enriched")));
        ec.appendChild(el("div", "sc-enriched", d.enriched));
        const bar = el("div", "cardbar");
        bar.appendChild(copyBtn(() => d.enriched, t("sc_copy_enriched")));
        bar.appendChild(voteBtns(p, (d.verdict || "scriptcheck").slice(0, 60)));
        ec.appendChild(bar);
        content.appendChild(ec);
      }
    }
    box.appendChild(content);
    const actions = el("div", "result-actions");
    const pdfbtn = el("button", "pdfdl", t("pdf_dl"));
    pdfbtn.onclick = async () => {
      const old = pdfbtn.textContent; pdfbtn.disabled = true; pdfbtn.classList.add("zbtn-loading"); pdfbtn.textContent = t("pdf_making");
      try { await savePdf(content, p); } catch (e) {}
      pdfbtn.disabled = false; pdfbtn.classList.remove("zbtn-loading"); pdfbtn.textContent = old;
    };
    const again = el("button", "againdl", t("again"));
    again.onclick = () => $("btn-gen").click();       // та же тема (из поля topic)
    const newtopic = el("button", "againdl", t("new_topic"));
    newtopic.onclick = () => {
      $("topic").value = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => $("topic").focus({ preventScroll: true }), 450);
    };
    actions.appendChild(pdfbtn); actions.appendChild(tgBtn(() => content.innerText.trim(), null)); actions.appendChild(again); actions.appendChild(newtopic);
    box.appendChild(actions);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- PROFILE ----------
  async function loadProfile() {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const { data } = await sb.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
    profile = data || {};
    $("p-niche").value = profile.niche || ""; $("p-audience").value = profile.audience || "";
    $("p-tone").value = profile.tone || ""; $("p-personality").value = profile.personality || "";
    $("p-languages").value = profile.languages || ""; $("p-brand").value = profile.brand_notes || "";
    try { profile.gender = profile.gender || localStorage.getItem("zh_gender") || ""; } catch (e) {}
    { const pg = document.getElementById("p-gender"); if (pg) pg.value = profile.gender || ""; }
    await loadUploads();
    await carPrefsRead(); renderProfileDesigns();
  }
  $("btn-save").onclick = async () => {
    const { data: u } = await sb.auth.getUser(); if (!u.user) return;
    profile = {
      id: u.user.id, niche: $("p-niche").value.trim(), audience: $("p-audience").value.trim(),
      tone: $("p-tone").value.trim(), personality: $("p-personality").value.trim(),
      languages: $("p-languages").value.trim(), brand_notes: $("p-brand").value.trim(), updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("profiles").upsert(profile);
    try {
      const _g = (document.getElementById("p-gender") || {}).value || "";
      profile.gender = _g; try { localStorage.setItem("zh_gender", _g); } catch (e2) {}
      try { await sb.from("profiles").update({ gender: _g }).eq("id", u.user.id); } catch (e3) {}   // синхрон в БД, если есть колонка gender
    } catch (e) {}
    $("save-note").hidden = false; $("save-note").textContent = error ? (t("save_err") + error.message) : t("save_note");
  };
  $("p-file").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const { data: u } = await sb.auth.getUser(); if (!u.user) return;
    if (f.size > 15 * 1024 * 1024) { alert(t("file_too_big")); return; }
    const path = u.user.id + "/" + Date.now() + "_" + f.name.replace(/[^\w.\-]/g, "_");
    const { error } = await sb.storage.from("uploads").upload(path, f);
    if (error) alert(t("upload_err") + error.message); else loadUploads();
  };
  async function loadUploads() {
    const { data: u } = await sb.auth.getUser(); if (!u.user) return;
    const { data } = await sb.storage.from("uploads").list(u.user.id + "/");
    const box = $("uploads"); box.textContent = "";
    (data || []).forEach(f => box.appendChild(el("div", null, "• " + f.name)));
  }

  // ---------- HISTORY ----------
  async function loadHistory() {
    const { data } = await sb.from("generations").select("*").order("created_at", { ascending: false }).limit(15);
    const box = $("history"); box.textContent = "";
    (data || []).forEach(g => {
      const item = el("div", "h-item");
      const h = el("div", "h");
      const left = el("span", "h-left");
      const arrow = el("span", "h-arrow", "▸");
      left.appendChild(arrow);
      left.appendChild(el("b", null, plabel(g.platform) + " "));
      left.appendChild(document.createTextNode((g.topic || t("no_topic")) + " · " + new Date(g.created_at).toLocaleString(t("locale"))));
      const openBtn = el("button", "h-open", t("h_open"));
      h.appendChild(left); h.appendChild(openBtn);
      const det = el("div", "h-detail"); det.hidden = true;
      const isVis = (g.platform === "carousel" || g.platform === "post" || g.platform === "stories" || g.platform === "reels_cover");
      let built = false;
      const toggle = async () => {
        if (!built) {
          built = true;
          if (isVis) { openBtn.disabled = true; openBtn.classList.add("zbtn-loading"); openBtn.textContent = t("h_opening"); }   // визуалы рендерятся 3-5с
          try {
            if (isVis) await renderHistoryVisuals(det, g.platform, g.output || {}, g.id);
            else det.appendChild(buildHistoryDetail(g.platform, g.output || {}));
          } catch (e) { built = false; }
          if (isVis) { openBtn.classList.remove("zbtn-loading"); openBtn.disabled = false; }
        }
        det.hidden = !det.hidden;
        item.classList.toggle("open", !det.hidden);
        arrow.textContent = det.hidden ? "▸" : "▾";
        openBtn.textContent = det.hidden ? t("h_open") : t("h_close");
      };
      h.onclick = toggle;
      openBtn.onclick = (e) => { e.stopPropagation(); toggle(); };   // клик по кнопке не должен дублировать клик по строке
      item.appendChild(h); item.appendChild(det);
      box.appendChild(item);
    });
  }
  // раскрытие исторических данных инлайн (текст, без ре-рендера картинок)
  function buildHistoryDetail(p, d) {
    const wrap = el("div", "h-dbody");
    const add = (k, v) => { if (v == null || v === "") return; const r = el("div", "h-drow"); if (k) r.appendChild(el("span", "h-dk", k)); r.appendChild(el("span", "h-dv", String(v))); wrap.appendChild(r); };
    const head = (txt) => wrap.appendChild(el("div", "h-dhead", txt));
    if (["shorts", "tiktok"].includes(p) || (p === "reels" && arr(d.ideas).length)) {
      arr(d.ideas).forEach((it, i) => { head((i + 1) + ". " + (it.idea || "")); add(t("r_hook"), it.hook); add("Сценарий", it.scenario); add("Подпись", it.caption); });
    } else if (p === "reels") {
      const b = d._brief;
      if (b && typeof b === "object") {
        head("📋 " + t("rb_brief_h"));
        add(t("rb_audience_lbl"), b.audience); add(t("rb_goal_lbl"), b.goal); add(t("rb_promo_lbl"), b.promo);
        add(t("rb_idea_lbl"), b.idea); add(t("rb_style_lbl"), b.style); add(t("rb_format_lbl"), b.format); add(t("rb_length_lbl"), b.length);
      }
      add(t("rb_r_analysis"), d.analysis);
      head("🔥 " + t("rb_r_hook")); add("", d.hook);
      head("🧠 " + t("rb_r_dev")); add("", d.development);
      head("⚡ " + t("rb_r_amp")); add("", d.amplification);
      head("🎯 " + t("rb_r_finale")); add("", d.finale);
      if (d.how_to_shoot) { head("🎬 " + t("rb_r_shoot")); add("", d.how_to_shoot); }
      const caps = capList(d.captions);
      if (caps.length) { head("📝 " + t("rb_r_captions")); caps.forEach(x => add("", x)); }
      if (d.why_works) { head("🚀 " + t("rb_r_why")); add("", d.why_works); }
      if (arr(d.alternatives).length) { head("🔁 " + t("rb_r_alts")); arr(d.alternatives).forEach(a => add((a.format ? "[" + a.format + "] " : "") + (a.angle || ""), a.hook)); }
    } else if (p === "youtube_long") {
      if (d.title) head(d.title); add(t("r_hook"), d.hook); arr(d.sections).forEach(s => { head(s.h || ""); add("", s.points); }); add("Финал", d.outro);
    } else if (p === "carousel") {
      add("1", d.hook_slide); arr(d.slides).forEach((s, i) => add(String(i + 2), (s.title ? s.title + " — " : "") + (s.text || ""))); add("CTA", d.cta_slide);
    } else if (p === "post") {
      add(t("r_hook"), d.hook); add("", d.body); add("CTA", d.cta); const tg = arr(d.hashtags).map(x => "#" + String(x).replace(/^#/, "")).join(" "); add("", tg);
    } else if (p === "stories") {
      arr(d.frames).forEach((f, i) => add(String(i + 1) + (f.title ? " · " + f.title : ""), f.text || f.visual));
    } else if (p === "reels_cover") {
      add("", d.title); add("", d.subtitle);
    } else if (p === "content_plan") {
      arr(d.plan).forEach(x => add(x.day || "", (x.format ? "[" + x.format + "] " : "") + (x.idea || "")));
    } else if (p === "audience") {
      arr(d.segments).forEach((s, i) => {
        head((i + 1) + ". " + (s.name || ""));
        add(t("au_portrait"), s.portrait);
        add(t("au_jtbd"), s.jtbd);
        add(t("au_pains"), arr(s.pains).join("; "));
        add(t("au_desires"), arr(s.desires).join("; "));
        add(t("au_objections"), arr(s.objections).join("; "));
        add(t("au_words"), arr(s.their_words).join("; "));
      });
      if (d.awareness) {
        head(t("au_awareness"));
        add(t("au_aw_unaware"), d.awareness.unaware);
        add(t("au_aw_problem"), d.awareness.problem);
        add(t("au_aw_solution"), d.awareness.solution);
        add(t("au_aw_product"), d.awareness.product);
        add(t("au_aw_most"), d.awareness.most);
      }
      if (arr(d.content_map).length) {
        head(t("au_contentmap"));
        arr(d.content_map).forEach(m => add("🎯 " + (m.pain || ""), (m.angle ? m.angle + " " : "") + (arr(m.hooks).length ? "· " + arr(m.hooks).join(" / ") : "") + (m.format ? " [" + m.format + "]" : "")));
      }
    } else if (p === "scriptcheck") {
      add(t("sc_verdict"), d.verdict);
      const facts = arr(d.facts);
      if (facts.length) { head(t("sc_facts")); facts.forEach(f => add((f.status || "") + " · " + (f.claim || ""), [f.comment, f.fix].filter(Boolean).join(" — "))); }
      if (d.hook) { head(t("sc_hook")); add(t("sc_hook_assess"), d.hook.assessment); arr(d.hook.options).forEach(o => add("", "• " + o)); }
      if (arr(d.delivery).length) { head(t("sc_delivery")); arr(d.delivery).forEach(x => add("", "• " + x)); }
      if (d.enriched) { head(t("sc_enriched")); add("", d.enriched); }
    }
    if (!wrap.children.length) add("", t("no_topic"));
    return wrap;
  }
  // раскрыть картинки визуала прямо в истории (перерисовка из сохранённых данных, #result не трогаем)
  async function renderHistoryVisuals(container, mode, d, genId) {
    container.textContent = "";
    if (!window.html2canvas) { container.appendChild(el("div", "h-drow", "html2canvas не загрузился, обнови страницу")); return; }
    container.appendChild(el("div", "h-drow", t("car_rendering")));
    try {
      const FAM = ["Oswald","Nunito","Fraunces","Cormorant Garamond","Space Grotesk","Poppins","Archivo","Manrope"];
      await Promise.all(FAM.map(f => document.fonts.load("700 60px '" + f + "'").catch(() => {})));
    } catch (e) {}
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    let eff = d._design || "coral"; if (eff === "custom") eff = "coral";
    const slides = [];
    if (mode === "carousel") {
      if (d.hook_slide) slides.push({ cover: true, title: d.hook_slide });
      arr(d.slides).forEach(s => slides.push({ title: s.title, text: s.text }));
      if (d.cta_slide) slides.push({ cover: true, title: d.cta_slide });
    } else if (mode === "stories") {
      arr(d.frames).forEach(f => slides.push({ title: f.title || "", text: f.text || f.visual || "" }));
    } else if (mode === "post") {
      slides.push({ cover: true, title: d.hook });
    } else if (mode === "reels_cover") {
      slides.push({ cover: true, title: d.title, text: d.subtitle || "" });
    }
    // восстановить сохранённые правки пользователя (фото-стикеры + параметры)
    const eds = (d && d._edits && typeof d._edits === "object") ? d._edits : null;
    if (eds) {
      for (const k in eds) {
        const idx = +k, e = eds[k]; if (!slides[idx] || !e) continue;
        if (e.fontScale != null) slides[idx].fontScale = e.fontScale;
        if (e.alignV) slides[idx].alignV = e.alignV;
        if (e.alignH) slides[idx].alignH = e.alignH;
        if (e.shape != null) slides[idx].stickerShape = e.shape;
        if (e.rot != null) slides[idx].stickerRot = e.rot;
        if (e.shape2 != null) slides[idx].stickerShape2 = e.shape2;
        if (e.rot2 != null) slides[idx].stickerRot2 = e.rot2;
        if (e.sticker) { try { const { data: b } = await sb.storage.from("uploads").download(e.sticker); if (b) slides[idx].sticker = await blobToDataURL(b); } catch (x) {} }
        if (e.sticker2) { try { const { data: b2 } = await sb.storage.from("uploads").download(e.sticker2); if (b2) slides[idx].sticker2 = await blobToDataURL(b2); } catch (x) {} }
      }
    }
    container.textContent = "";
    const outBox = el("div", "cs-out");
    const urls = [], thumbs = [];
    for (let i = 0; i < slides.length; i++) {
      const cell = await buildVisualCell(slides, i, mode, eff, false, urls, thumbs, genId || null);
      if (cell) outBox.appendChild(cell);
    }
    container.appendChild(outBox);
    if (slides.length > 1) {
      const actions = el("div", "result-actions");
      const all = el("button", "pdfdl", t("car_download_all"));
      all.onclick = () => zipDownload(urls, mode, all);
      actions.appendChild(all); actions.appendChild(tgBtn(null, () => urls.filter(Boolean)));
      container.appendChild(actions);
    }
  }

  function showPlans(free) { const cp = $("cab-plans"); if (cp) cp.hidden = !free; }
  async function loadMe() {
    const box = $("usage");
    try {
      const { data } = await sb.auth.getSession();
      const token = data.session && data.session.access_token;
      if (!token) { box.hidden = true; showPlans(false); return; }
      const res = await fetch(API + "/me", { headers: { authorization: "Bearer " + token } });
      if (!res.ok) { box.hidden = true; showPlans(false); return; }
      const m = await res.json();
      box.hidden = true;         // счётчики теперь в карточках блоков (Текст / Картинки)
      setPayLinks(m.email);      // подставить почту регистрации в ссылку оплаты
      showPlans(!m.unlimited);   // тарифы в кабинете для тех, у кого нет платного доступа
      carState.left = m.carousel_left; carState.postLeft = m.post_left; carState.storiesLeft = m.stories_left; carState.coverLeft = m.cover_left;
      carState.pro = !!m.visual_pro; carState.visualUnlim = !!m.visual_unlimited; carState.email = m.email || ""; knownEmail = m.email || ""; meState = m;
      updateCarouselPanel(); renderPlatforms();
    } catch (e) { box.hidden = true; showPlans(false); }
  }

  // ---------- CAROUSEL (визуальный генератор) ----------
  const CTEMPLATES = ["blush", "rose", "berry", "peach", "coral", "honey", "butter", "sand",
    "cream", "mocha", "terra", "sage", "mint", "ocean", "sky", "lavender", "plum", "noir", "ink", "linen"];
  // Шрифтовые пары шаблонов: tf - заголовок, bf - текст, up - капс, ital - курсив, wght - жирность
  const FPAIR = {
    oswald:    { tf: "Oswald,'Arial Black',sans-serif", bf: "Nunito,sans-serif", up: 1, wght: 700 },
    fraunces:  { tf: "Fraunces,Georgia,serif", bf: "Manrope,sans-serif", up: 0, wght: 600 },
    cormorant: { tf: "'Cormorant Garamond',Georgia,serif", bf: "Manrope,sans-serif", up: 0, ital: 1, wght: 600 },
    poppins:   { tf: "Poppins,sans-serif", bf: "Poppins,sans-serif", up: 0, wght: 800 },
    space:     { tf: "'Space Grotesk',sans-serif", bf: "'Space Grotesk',sans-serif", up: 0, wght: 700 },
    archivo:   { tf: "Archivo,sans-serif", bf: "Archivo,sans-serif", up: 0, wght: 800 },
  };
  const CFONT = {
    blush: "fraunces", rose: "cormorant", berry: "poppins", peach: "oswald", coral: "oswald",
    honey: "poppins", butter: "archivo", sand: "fraunces", cream: "cormorant", mocha: "fraunces",
    terra: "oswald", sage: "cormorant", mint: "poppins", ocean: "archivo", sky: "space",
    lavender: "poppins", plum: "cormorant", noir: "space", ink: "space", linen: "fraunces",
    custom: "oswald",
  };
  function fontOf(id) { return FPAIR[CFONT[id] || "oswald"] || FPAIR.oswald; }
  function markSVG(acc, title) {
    return '<svg class="cs-logo" viewBox="14 16 116 68" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M86 34 L112 50 L86 66" fill="none" stroke="' + title + '" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<g transform="translate(50,50) rotate(-90) scale(0.62)"><path d="M0,40 C -22,15 -44,2 -44,-16 C -44,-34 -22,-40 -8,-26 C -3,-21 0,-15 0,-10 C 0,-15 3,-21 8,-26 C 22,-40 44,-34 44,-16 C 44,2 22,15 0,40 Z" fill="' + acc + '" stroke="' + title + '" stroke-width="4" stroke-linejoin="round"/></g></svg>';
  }
  // декор для каждого шаблона: стиль орнамента + 2 цвета
  const CDEF = {
    blush:    { style: "floral",    a: "#e6a996", b: "#c98b7a" },
    rose:     { style: "scallop",   a: "#c98a92", b: "#b56b74" },
    berry:    { style: "scallop",   a: "#c67a92", b: "#b0526f" },
    peach:    { style: "arch",      a: "#eaa877", b: "#e08a54" },
    coral:    { style: "floral",    a: "#ffd9c6", b: "#ffb99a" },
    honey:    { style: "floral",    a: "#e6bd5a", b: "#d9a341" },
    butter:   { style: "floral",    a: "#e6c766", b: "#d9b74e" },
    sand:     { style: "arch",      a: "#cdb488", b: "#c2a878" },
    cream:    { style: "botanical", a: "#cdb27a", b: "#c9a86a" },
    mocha:    { style: "botanical", a: "#b08a5f", b: "#8a6540" },
    terra:    { style: "boho",      a: "#c07a52", b: "#a85f38" },
    sage:     { style: "botanical", a: "#8fae87", b: "#6e8a66" },
    mint:     { style: "botanical", a: "#79c1a2", b: "#5cae8e" },
    ocean:    { style: "botanical", a: "#6fb0aa", b: "#4f9c96" },
    sky:      { style: "sparkle",   a: "#8fb0d8", b: "#6f96c4" },
    lavender: { style: "sparkle",   a: "#b3a1d8", b: "#9884c0" },
    plum:     { style: "sparkle",   a: "#c98fb0", b: "#e0aecb" },
    noir:     { style: "sparkle",   a: "#d8b25a", b: "#e6c877" },
    ink:      { style: "sparkle",   a: "#ff7f50", b: "#e85f2c" },
    linen:    { style: "botanical", a: "#c8a56a", b: "#b98a54" },
  };
  function _flower(cx, cy, s, petal, center) {
    let p = ""; for (let i = 0; i < 5; i++) p += '<ellipse cx="' + cx + '" cy="' + (cy - s * 0.6) + '" rx="' + (s * 0.34) + '" ry="' + (s * 0.6) + '" fill="' + petal + '" transform="rotate(' + (i * 72) + ' ' + cx + ' ' + cy + ')"/>';
    return "<g>" + p + '<circle cx="' + cx + '" cy="' + cy + '" r="' + (s * 0.34) + '" fill="' + center + '"/></g>';
  }
  function _leaf(cx, cy, s, rot, c) { return '<path d="M' + cx + ' ' + (cy - s) + ' Q ' + (cx + s * 0.7) + ' ' + cy + ' ' + cx + ' ' + (cy + s) + ' Q ' + (cx - s * 0.7) + ' ' + cy + ' ' + cx + ' ' + (cy - s) + ' Z" fill="' + c + '" transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')"/>'; }
  function _spk(cx, cy, s, c) { const k = s * 0.18; return '<path d="M' + cx + ' ' + (cy - s) + ' C ' + (cx + k) + ' ' + (cy - k) + ' ' + (cx + k) + ' ' + (cy - k) + ' ' + (cx + s) + ' ' + cy + ' C ' + (cx + k) + ' ' + (cy + k) + ' ' + (cx + k) + ' ' + (cy + k) + ' ' + cx + ' ' + (cy + s) + ' C ' + (cx - k) + ' ' + (cy + k) + ' ' + (cx - k) + ' ' + (cy + k) + ' ' + (cx - s) + ' ' + cy + ' C ' + (cx - k) + ' ' + (cy - k) + ' ' + (cx - k) + ' ' + (cy - k) + ' ' + cx + ' ' + (cy - s) + ' Z" fill="' + c + '"/>'; }
  function _dot(cx, cy, r, c) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + c + '"/>'; }
  function _sprig(cx, cy, s, c) { let g = '<path d="M' + cx + ' ' + cy + ' q 0 -' + s + ' 0 -' + (s * 2) + '" stroke="' + c + '" stroke-width="4" fill="none"/>'; for (let i = 0; i < 4; i++) { const yy = cy - s * 0.4 - i * s * 0.42; g += _leaf(cx + (i % 2 ? 1 : -1) * s * 0.32, yy, s * 0.26, (i % 2 ? 40 : -40), c); } return "<g>" + g + "</g>"; }
  function decoInner(style, a, b, H) {
    H = H || 1350;
    const bY = (y) => H - (1350 - y);   // низовые элементы держим на том же отступе от нижнего края слайда
    if (style === "floral") return _flower(980, 155, 118, a, b) + _flower(875, 300, 76, a, b) + _leaf(1045, 255, 66, 30, b) + _flower(140, bY(1235), 92, a, b) + _leaf(235, bY(1250), 52, -30, b) + _dot(120, 250, 10, a) + _dot(205, 185, 7, b) + _dot(980, bY(1120), 9, a);
    if (style === "botanical") return _sprig(160, 250, 92, a) + _sprig(955, bY(1180), 92, a) + _leaf(1005, 230, 78, 20, b) + _leaf(95, bY(1170), 66, -20, b) + _dot(945, 320, 8, b) + _dot(135, bY(1110), 8, b);
    if (style === "arch") return '<path d="M120 660 A 420 420 0 0 1 960 660 L960 ' + bY(1250) + ' L120 ' + bY(1250) + ' Z" fill="' + b + '" opacity="0.16"/>' + _dot(150, 210, 12, a) + _dot(930, 175, 9, a) + _dot(1000, 255, 7, b) + _flower(958, 220, 68, a, b);
    if (style === "sparkle") return _spk(960, 160, 70, a) + _spk(1012, 300, 34, b) + _spk(120, bY(1180), 64, a) + _spk(205, bY(1245), 28, b) + _spk(150, 235, 38, b) + _dot(940, bY(1115), 8, a) + _dot(1000, bY(1180), 6, b);
    if (style === "scallop") { let sc = ""; for (let x = 40; x < 1080; x += 112) sc += '<path d="M' + x + ' 44 a56 56 0 0 0 112 0" fill="none" stroke="' + a + '" stroke-width="7"/>'; return sc + _flower(958, bY(1180), 90, a, b) + _leaf(1050, bY(1158), 58, 30, b) + _dot(120, bY(1200), 9, a); }
    if (style === "boho") { let r = ""; for (let i = 0; i < 12; i++) { const g = i * 30 * Math.PI / 180; r += '<line x1="' + (958 + Math.cos(g) * 62) + '" y1="' + (172 + Math.sin(g) * 62) + '" x2="' + (958 + Math.cos(g) * 112) + '" y2="' + (172 + Math.sin(g) * 112) + '" stroke="' + a + '" stroke-width="6"/>'; } return '<circle cx="958" cy="172" r="46" fill="none" stroke="' + a + '" stroke-width="6"/>' + r + _dot(150, bY(1180), 12, a) + _dot(215, bY(1120), 8, b) + _dot(120, 250, 9, b); }
    return "";
  }
  function decoSVG(id, h) {
    const d = CDEF[id]; if (!d) return "";
    h = h || 1350;
    return '<svg class="cs-deco" viewBox="0 0 1080 ' + h + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">' + decoInner(d.style, d.a, d.b, h) + "</svg>";
  }
  function miniDecoSVG(id) {
    const d = CDEF[id]; if (!d) return "";
    let inner;
    if (d.style === "sparkle" || d.style === "boho") inner = _spk(40, 20, 18, d.a);
    else if (d.style === "botanical") inner = _leaf(42, 22, 18, 25, d.a);
    else inner = _flower(40, 22, 20, d.a, d.b);
    return '<svg class="cd-deco" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">' + inner + "</svg>";
  }
  const carState = { design: "my", myDesign: "coral", customBg: null, left: null, postLeft: null, storiesLeft: null, pro: false, email: "", carSize: "45" };
  try { const s = localStorage.getItem("zh_car_size"); if (s === "34" || s === "45") carState.carSize = s; } catch (e) {}
  let meState = null;
  let renderSeq = 0;   // защита от гонки: актуален только последний запуск рендера визуалов
  try { const s = localStorage.getItem("zh_car_mydesign"); if (s) carState.myDesign = s; } catch (e) {}

  function blobToDataURL(blob) { return new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); }); }

  async function carPrefsRead() {
    try {
      const { data: u } = await sb.auth.getUser(); if (!u.user) return;
      const { data } = await sb.storage.from("uploads").download(u.user.id + "/_carousel.json");
      if (!data) return;
      const j = JSON.parse(await data.text());
      if (j.myDesign) { carState.myDesign = j.myDesign; try { localStorage.setItem("zh_car_mydesign", j.myDesign); } catch (e) {} }
      if (j.bg) { try { const { data: b } = await sb.storage.from("uploads").download(j.bg); if (b) carState.customBg = await blobToDataURL(b); } catch (e) {} }
    } catch (e) {}
  }
  async function carPrefsWrite(patch) {
    try {
      const { data: u } = await sb.auth.getUser(); if (!u.user) return;
      let cur = {};
      try { const { data } = await sb.storage.from("uploads").download(u.user.id + "/_carousel.json"); if (data) cur = JSON.parse(await data.text()); } catch (e) {}
      const next = Object.assign(cur, patch);
      await sb.storage.from("uploads").upload(u.user.id + "/_carousel.json",
        new Blob([JSON.stringify(next)], { type: "application/json" }), { upsert: true });
    } catch (e) {}
  }

  function chipMini(cls, custom) {
    const mini = el("div", "cd-mini " + cls);
    if (custom && carState.customBg) mini.style.backgroundImage = "url(" + carState.customBg + ")";
    const id = cls.replace("ct-", "");
    const fp = fontOf(id);
    // образец шрифта заголовка в цвете шаблона (без брендинга)
    const m1 = el("div", "m1", "Аа");
    m1.style.fontFamily = fp.tf; m1.style.textTransform = fp.up ? "uppercase" : "none";
    m1.style.fontStyle = fp.ital ? "italic" : "normal"; m1.style.fontWeight = fp.wght || 700;
    mini.appendChild(m1); mini.appendChild(el("div", "m2"));
    if (!custom && CDEF[id]) mini.insertAdjacentHTML("beforeend", miniDecoSVG(id));
    return mini;
  }
  function renderChips(box, list, current, onPick) {
    box.textContent = "";
    list.forEach(tpl => {
      const chip = el("div", "cdchip" + (current === tpl.id ? " on" : ""));
      chip.dataset.id = tpl.id;
      chip.appendChild(chipMini(tpl.cls, tpl.custom || (tpl.id === "my" && carState.myDesign === "custom")));
      chip.appendChild(el("div", "cd-name", t("cd_" + (tpl.id === "my" ? "custom" : tpl.id))));
      chip.onclick = () => { box.querySelectorAll(".cdchip").forEach(c => c.classList.toggle("on", c.dataset.id === tpl.id)); onPick(tpl.id); };
      box.appendChild(chip);
    });
  }
  function genChipList() {
    const md = carState.myDesign;
    const myCls = "ct-" + (md === "custom" ? "custom" : md);
    return CTEMPLATES.map(id => ({ id, cls: "ct-" + id }))
      .concat([{ id: "my", cls: myCls }]);
  }
  function profChipList() {
    return CTEMPLATES.map(id => ({ id, cls: "ct-" + id })).concat([{ id: "custom", cls: "ct-custom", custom: true }]);
  }
  function toggleCoverPanel() {
    const p = $("cover-panel"); if (p) p.hidden = !(platform === "reels_cover" && carState.pro);
  }
  function renderCarSize() {
    const box = $("car-size"); if (!box) return;
    if (platform !== "carousel" || !carState.pro) { box.hidden = true; box.textContent = ""; return; }
    box.hidden = false; box.textContent = "";
    box.appendChild(el("span", "car-size-lbl", t("car_size_lbl")));
    [["45", "4:5"], ["34", "3:4"]].forEach(([val, label]) => {
      const b = el("button", "car-size-b" + (carState.carSize === val ? " on" : ""), label);
      b.onclick = () => { carState.carSize = val; try { localStorage.setItem("zh_car_size", val); } catch (e) {} renderCarSize(); };
      box.appendChild(b);
    });
  }
  function updateCarouselPanel() {
    toggleCoverPanel();
    renderCarSize();
    const p = $("carousel-panel"); if (!p) return;
    const on = !!VISUAL[platform];
    p.hidden = !on;
    if (!on) return;
    const box = $("car-designs"), left = $("car-left");
    if (!carState.pro) {
      left.textContent = "";
      box.textContent = "";
      const lock = el("div", "car-lock");
      lock.appendChild(el("div", "car-lock-t", "🔒 " + t("visual_pro_only")));
      lock.appendChild(el("div", "car-lock-m", t("visual_pro_msg")));
      const btn = el("a", "btn btn-primary", t("car_pro_cta"));
      btn.href = PAY.pro + (carState.email ? "&customer_email=" + encodeURIComponent(carState.email) : "");
      btn.target = "_blank"; btn.rel = "noopener";
      lock.appendChild(btn);
      box.appendChild(lock);
      return;
    }
    renderChips(box, genChipList(), carState.design, (id) => { carState.design = id; });
    if (carState.visualUnlim) left.textContent = t("u_unlim");
    else if (platform === "carousel" && carState.left != null) left.textContent = t("car_left_lbl") + carState.left + "/3";
    else if (platform === "post" && carState.postLeft != null) left.textContent = t("car_month_lbl") + carState.postLeft + "/30";
    else if (platform === "stories" && carState.storiesLeft != null) left.textContent = t("car_month_lbl") + carState.storiesLeft + "/30";
    else if (platform === "reels_cover" && carState.coverLeft != null) left.textContent = t("car_month_lbl") + carState.coverLeft + "/30";
    else left.textContent = "";
  }

  function effectiveDesign() {
    let eff = carState.design;
    if (eff === "my") eff = carState.myDesign || "coral";
    return eff;
  }

  const DIMS = { carousel: { w: 1080, h: 1350, cls: "" }, post: { w: 1080, h: 1080, cls: "sq" }, stories: { w: 1080, h: 1920, cls: "st" }, reels_cover: { w: 1080, h: 1920, cls: "st cover-slide" } };
  // Ужимаем шрифт заголовка/текста, пока весь контент не влезет в слайд (не режется по краям)
  function fitSlide(node, fontScale, fillFrac) {
    const title = node.querySelector(".cs-title");
    const text = node.querySelector(".cs-text");
    if (!title && !text) return;
    const manual = Math.max(0.5, Math.min(1.7, fontScale || 1));   // ручной масштаб (кнопка «шрифт больше/меньше»)
    const cs = getComputedStyle(node);
    const pad = parseFloat(cs.paddingTop || 0) + parseFloat(cs.paddingBottom || 0);
    const limit = (node.clientHeight - pad) * (fillFrac || 0.96);   // рабочая зона слайда (для сторис - меньше, чтобы шрифт был спокойнее)
    const baseT = title ? parseFloat(getComputedStyle(title).fontSize) : 0;
    const baseX = text ? parseFloat(getComputedStyle(text).fontSize) : 0;
    const mb = title ? parseFloat(getComputedStyle(title).marginBottom || 0) : 0;
    const contentH = () => (title ? title.offsetHeight : 0) + (text ? text.offsetHeight : 0) + (title && text ? mb : 0);
    // горизонтальное переполнение (длинное слово шире колонки) - чтобы текст не обрезался по краю
    const overW = () => (title && title.scrollWidth > title.clientWidth + 1) || (text && text.scrollWidth > text.clientWidth + 1);
    const apply = (k) => {
      if (title) title.style.fontSize = (baseT * k) + "px";
      if (text) text.style.fontSize = (baseX * k) + "px";
    };
    // 1) АВТО-ЗАПОЛНЕНИЕ: растим шрифт, пока контент не заполнит рабочую зону слайда (чтобы не был мелким/растянутым)
    apply(1);
    let k = 1;
    for (let i = 0; i < 40 && k < 2.2 && contentH() <= limit && !overW(); i++) { k += 0.06; apply(k); }
    // 2) если перелетели край по высоте или ширине (длинное слово) - ужимаем, пока не влезет
    for (let i = 0; i < 40 && k > 0.4 && (contentH() > limit || overW()); i++) { k -= 0.05; apply(k); }
    // 3) ручной масштаб автора поверх авто-заполнения, со страховкой от переполнения
    if (manual !== 1) {
      let km = Math.max(0.4, Math.min(2.4, k * manual));
      apply(km);
      for (let i = 0; i < 30 && km > 0.4 && (contentH() > limit || overW()); i++) { km -= 0.05; apply(km); }
    }
  }
  // типографика слайда: числа с пробелом-разделителем не рвём (11 000), новое предложение - с новой строки
  function slideText(v) {
    let s = String(v == null ? "" : v);
    s = s.replace(/(\d)[ \u202f\u00a0](?=\d)/g, "$1\u00a0");
    s = s.replace(/([.!?…]+)[ \t]+(?=[«"'(\[A-ZА-ЯЁ])/g, "$1\n");
    return s.trim();
  }
  // ставим фото-стикеры (1-2) в свободную от текста зону, чтобы не заезжали на текст и друг на друга
  function placeSticker(node) {
    const els = Array.prototype.slice.call(node.querySelectorAll(".cs-sticker"));
    if (!els.length) return;
    const H = node.clientHeight, W = node.clientWidth, margin = 48;
    const title = node.querySelector(".cs-title"), text = node.querySelector(".cs-text");
    let top = H, bottom = 0;
    [title, text].forEach(elm => { if (elm) { top = Math.min(top, elm.offsetTop); bottom = Math.max(bottom, elm.offsetTop + elm.offsetHeight); } });
    if (top > bottom) { top = 0; bottom = H; }
    const topBand = top, botBand = H - bottom, largerBottom = botBand >= topBand;
    els.forEach((st, idx) => {
      const SW = st.offsetWidth || 340, SH = st.offsetHeight || 340;
      // один стикер - в бОльшую зону; два - первый в бОльшую, второй в противоположную
      const useBottom = (els.length > 1) ? (idx === 0 ? largerBottom : !largerBottom) : largerBottom;
      let y = useBottom ? bottom + (botBand - SH) / 2 : (top - SH) / 2;
      y = Math.max(margin, Math.min(H - SH - margin, y));
      const x = (idx % 2 === 0) ? (W - SW - margin) : margin;   // первый справа, второй слева
      st.style.top = Math.round(y) + "px"; st.style.left = Math.round(Math.max(margin, Math.min(W - SW - margin, x))) + "px";
    });
  }
  // визуальные правки слайда по кнопке «Переделать» (без модели): шрифт больше/меньше, текст выше/ниже/влево/вправо
  function tweakLayout(instr, s) {
    const q = (instr || "").toLowerCase();
    let hit = false;
    if (s.fontScale == null) s.fontScale = 1;
    if (/(больше|крупн|увелич|bigger|larger)/.test(q)) { s.fontScale = Math.min(1.7, s.fontScale + 0.15); hit = true; }
    if (/(меньше|мельче|уменьш|smaller)/.test(q)) { s.fontScale = Math.max(0.5, s.fontScale - 0.15); hit = true; }
    if (/(выше|вверх|повыше|higher|\bup\b|наверх)/.test(q)) { s.alignV = "top"; hit = true; }
    if (/(ниже|вниз|пониже|lower|\bdown\b)/.test(q)) { s.alignV = "bottom"; hit = true; }
    if (/(влево|левее|слева|\bleft\b)/.test(q)) { s.alignH = "left"; hit = true; }
    if (/(вправо|правее|справа|\bright\b)/.test(q)) { s.alignH = "right"; hit = true; }
    if (/(по\s?центру|посередине|середин|center|middle|центрируй)/.test(q)) { s.alignH = "center"; hit = true; }
    return hit;
  }
  async function captureSlide(s, mode, idx, total, eff, useCustom) {
    const dim = DIMS[mode];
    let dimH = dim.h, extraCls = dim.cls;
    if (mode === "carousel" && carState.carSize === "34") { dimH = 1440; extraCls = "r34"; }
    const node = el("div", "cslide ct-" + eff + (extraCls ? " " + extraCls : "") + (s.cover ? " cover" : ""));
    const onPhoto = !!s.bg;   // обложка: фон - фото пользователя
    if (onPhoto) { node.style.backgroundImage = "url(" + s.bg + ")"; node.style.backgroundSize = "cover"; node.style.backgroundPosition = "center"; node.appendChild(el("div", "cs-ov")); }
    else if (useCustom && carState.customBg) { node.style.backgroundImage = "url(" + carState.customBg + ")"; node.appendChild(el("div", "cs-ov")); }
    else node.insertAdjacentHTML("afterbegin", decoSVG(eff, dimH));
    // фото-стикеры пользователя (до 2 шт; форма/поворот; позицию ставим ПОСЛЕ вёрстки - в свободную от текста зону)
    [[s.sticker, s.stickerShape, s.stickerRot], [s.sticker2, s.stickerShape2, s.stickerRot2]].forEach(function (p) {
      if (!p[0]) return;
      const st = el("div", "cs-sticker");
      st.style.backgroundImage = "url(" + p[0] + ")";
      st.style.borderRadius = (p[1] == null ? 24 : p[1]) + "%";
      st.style.transform = "rotate(" + (p[2] || 0) + "deg)";
      node.appendChild(st);
    });
    // без нашей брендировки - только дизайн и текст пользователя
    // заголовок и текст с фирменным шрифтом шаблона
    const fp = fontOf(eff);
    const titleTxt = slideText(s.title || "");
    let title = null;
    if (titleTxt) {   // заголовок только если он есть (у дословных сторис его нет - тогда рендерим один текст)
      title = el("div", "cs-title", titleTxt);
      title.style.fontFamily = fp.tf;
      title.style.textTransform = fp.up ? "uppercase" : "none";
      title.style.fontStyle = fp.ital ? "italic" : "normal";
      title.style.fontWeight = fp.wght || 700;
      if (onPhoto) title.style.color = "#ffffff";
      node.appendChild(title);
    }
    if (s.text) { const tx = el("div", "cs-text", slideText(s.text)); tx.style.fontFamily = fp.bf; if (onPhoto) tx.style.color = "#f3efe9"; node.appendChild(tx); }
    // ручные правки положения текста (кнопка «Переделать»: выше/ниже/влево/вправо)
    if (s.alignV) node.style.justifyContent = s.alignV === "top" ? "flex-start" : s.alignV === "bottom" ? "flex-end" : "center";
    if (s.alignH) {
      node.style.alignItems = s.alignH === "right" ? "flex-end" : s.alignH === "center" ? "center" : "flex-start";
      const ta = s.alignH === "right" ? "right" : s.alignH === "center" ? "center" : "left";
      if (title) title.style.textAlign = ta; const txEl = node.querySelector(".cs-text"); if (txEl) txEl.style.textAlign = ta;
    }
    const stage = $("cs-stage"); stage.appendChild(node);
    fitSlide(node, s.fontScale, mode === "stories" ? 0.62 : 0.96);   // сторис 9:16 - не заполняем весь высокий кадр, шрифт спокойнее (как в карусели)
    if (s.sticker || s.sticker2) placeSticker(node);
    let url = "";
    try {
      const canvas = await window.html2canvas(node, { width: dim.w, height: dimH, scale: 1, backgroundColor: null, useCORS: true, logging: false });
      url = canvas.toDataURL("image/png");
    } catch (e) { console.error("capture", e); }
    stage.removeChild(node);
    return url;
  }
  function thumbFor(url, name) {
    const thumb = el("div", "cs-thumb");
    const img = new Image(); img.src = url; thumb.appendChild(img);
    const a = el("a", null, "⬇ " + t("car_download")); a.href = url; a.download = name; thumb.appendChild(a);
    return thumb;
  }
  // ---------- ЛАЙТБОКС (полноразмер по клику, закрытие, пролистывание) ----------
  const LBX = { urls: [], i: 0, el: null, imgEl: null, cEl: null };
  function lbxRender() { if (!LBX.imgEl) return; LBX.imgEl.src = LBX.urls[LBX.i]; if (LBX.cEl) LBX.cEl.textContent = (LBX.i + 1) + " / " + LBX.urls.length; }
  function lbxClose() { if (LBX.el) { LBX.el.remove(); LBX.el = null; document.removeEventListener("keydown", lbxKey); } }
  function lbxGo(delta) { if (!LBX.urls.length) return; LBX.i = (LBX.i + delta + LBX.urls.length) % LBX.urls.length; lbxRender(); }
  function lbxKey(e) { if (e.key === "Escape") lbxClose(); else if (e.key === "ArrowRight") lbxGo(1); else if (e.key === "ArrowLeft") lbxGo(-1); }
  function openLightbox(urls, i) {
    if (!urls || !urls.length) return;
    lbxClose();
    LBX.urls = urls; LBX.i = i || 0;
    const ov = el("div", "lbx");
    const img = el("img"); img.alt = ""; LBX.imgEl = img;
    const close = el("button", "lbx-close", "×"); close.setAttribute("aria-label", "Закрыть"); close.onclick = lbxClose;
    ov.appendChild(img); ov.appendChild(close);
    if (urls.length > 1) {
      const prev = el("button", "lbx-nav lbx-prev", "‹"); prev.onclick = (e) => { e.stopPropagation(); lbxGo(-1); };
      const next = el("button", "lbx-nav lbx-next", "›"); next.onclick = (e) => { e.stopPropagation(); lbxGo(1); };
      const cnt = el("div", "lbx-count"); LBX.cEl = cnt;
      ov.appendChild(prev); ov.appendChild(next); ov.appendChild(cnt);
    } else LBX.cEl = null;
    ov.onclick = (e) => { if (e.target === ov) lbxClose(); };
    let sx = 0;
    img.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
    img.addEventListener("touchend", (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) lbxGo(dx < 0 ? 1 : -1); }, { passive: true });
    document.body.appendChild(ov); LBX.el = ov; document.addEventListener("keydown", lbxKey);
    lbxRender();
  }
  // ---------- ПЕРЕДЕЛАТЬ отдельную картинку ----------
  async function redoSlide(mode, slide, instruction) {
    const { data } = await sb.auth.getSession();
    const token = data.session && data.session.access_token; if (!token) return { err: "fail" };
    const hasText = ("text" in slide) && slide.text != null;
    let res;
    try {
      res = await fetch(API + "/redo", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + token },
        body: JSON.stringify({ platform: mode, title: slide.title || "", text: slide.text || "",
          has_text: hasText, instruction, profile, lang: window.ZI18N.getLang() }),
      });
    } catch (e) { return { err: "fail" }; }
    if (!res.ok) return { err: res.status === 402 ? "pro" : "fail" };
    const j = await res.json().catch(() => null);
    return (j && j.data) ? { data: j.data } : { err: "fail" };
  }
  async function saveEdit(genId, i, s) {
    if (!genId) return;
    try {
      const { data } = await sb.auth.getSession();
      const token = data.session && data.session.access_token; if (!token) return;
      await fetch(API + "/carousel-edits", {
        method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ generation_id: genId, index: i, shape: s.stickerShape, rot: s.stickerRot,
          fontScale: s.fontScale, alignV: s.alignV, alignH: s.alignH, photo: s.sticker || null,
          shape2: s.stickerShape2, rot2: s.stickerRot2, photo2: s.sticker2 || null }),
      });
    } catch (e) {}
  }
  async function buildVisualCell(slides, i, mode, eff, useCustom, urls, thumbs, genId) {
    const url = await captureSlide(slides[i], mode, i, slides.length, eff, useCustom);
    if (!url) return null;
    urls[i] = url;
    const thumb = el("div", "cs-thumb");
    const img = new Image(); img.src = url; img.onclick = () => openLightbox(urls, i);
    thumb.appendChild(img); thumbs[i] = img;
    const a = el("a", "cs-dl", "⬇ " + t("car_download")); a.href = url; a.download = mode + "-" + (i + 1) + ".png"; thumb.appendChild(a);
    const rw = el("div", "cs-redo");
    const rb = el("button", "cs-redo-btn", "↻ " + t("redo_btn"));
    const form = el("div", "cs-redo-form"); form.hidden = true;
    const inp = document.createElement("input"); inp.className = "cs-redo-inp"; inp.placeholder = t("redo_ph"); inp.maxLength = 500;
    const go = el("button", "cs-redo-go", t("redo_go"));
    const errline = el("div", "cs-redo-err"); errline.hidden = true;
    rb.onclick = () => { form.hidden = !form.hidden; if (!form.hidden) inp.focus(); };
    const submit = async () => {
      const instr = inp.value.trim(); if (!instr) return;
      errline.hidden = true;
      // сперва пробуем визуальную правку (шрифт/положение) - локально, без модели
      if (tweakLayout(instr, slides[i])) {
        go.disabled = true; const old0 = go.textContent; go.textContent = t("redo_wait");
        const nurl = await captureSlide(slides[i], mode, i, slides.length, eff, useCustom);
        if (nurl) { urls[i] = nurl; img.src = nurl; a.href = nurl; }
        saveEdit(genId, i, slides[i]);
        go.disabled = false; go.textContent = old0; form.hidden = true; inp.value = "";
        return;
      }
      go.disabled = true; inp.disabled = true; const old = go.textContent; go.textContent = t("redo_wait");
      try {
        const r = await redoSlide(mode, slides[i], instr);
        const nd = r && r.data;
        if (nd && nd.title) {
          slides[i].title = nd.title;
          if (("text" in slides[i]) && nd.text != null) slides[i].text = nd.text;
          const nurl = await captureSlide(slides[i], mode, i, slides.length, eff, useCustom);
          if (nurl) { urls[i] = nurl; img.src = nurl; a.href = nurl; }
          form.hidden = true; inp.value = "";
        } else {
          errline.textContent = (r && r.err === "pro") ? t("redo_pro") : t("redo_fail"); errline.hidden = false;
        }
      } catch (e) { errline.textContent = t("redo_fail"); errline.hidden = false; }
      go.disabled = false; inp.disabled = false; go.textContent = old;
    };
    go.onclick = submit;
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    form.appendChild(inp); form.appendChild(go); rw.appendChild(rb); rw.appendChild(form); rw.appendChild(errline); thumb.appendChild(rw);
    // свои фото-стикеры на слайд (до 2, карусель/пост/сториз): случайная форма/зона, текст остаётся поверх
    if (mode === "carousel" || mode === "post" || mode === "stories") {
      const SH = [50, 20, 40, 12];
      const mkPhoto = (slot) => {
        const dataK = slot === 2 ? "sticker2" : "sticker";
        const shapeK = slot === 2 ? "stickerShape2" : "stickerShape";
        const rotK = slot === 2 ? "stickerRot2" : "stickerRot";
        const addTxt = slot === 2 ? t("sticker2_btn") : t("sticker_btn");
        const chgTxt = slot === 2 ? t("sticker2_change") : t("sticker_change");
        const pw = el("div", "cs-photo");
        const btn = el("button", "cs-photo-btn"); btn.type = "button";
        const txt = el("span", "cs-photo-txt", "📷 " + (slides[i][dataK] ? chgTxt : addTxt));
        btn.appendChild(txt);
        const pin = document.createElement("input"); pin.type = "file"; pin.accept = "image/*"; pin.className = "cs-photo-in";
        const rm = el("button", "cs-photo-rm", "✕"); rm.type = "button"; rm.title = t("sticker_remove"); rm.hidden = !slides[i][dataK];
        btn.onclick = () => { try { pin.value = ""; } catch (e) {} pin.click(); };
        pin.onchange = async () => {
          const f = pin.files && pin.files[0]; if (!f) return;
          let durl; try { durl = await blobToDataURL(f); } catch (e) { return; }
          slides[i][dataK] = durl;
          slides[i][shapeK] = SH[Math.floor(Math.random() * SH.length)];
          slides[i][rotK] = Math.floor(Math.random() * 16 - 8);
          txt.textContent = "…"; btn.disabled = true;
          const nurl = await captureSlide(slides[i], mode, i, slides.length, eff, useCustom);
          if (nurl) { urls[i] = nurl; img.src = nurl; a.href = nurl; }
          txt.textContent = "📷 " + chgTxt; btn.disabled = false; rm.hidden = false;
          saveEdit(genId, i, slides[i]);
        };
        rm.onclick = async () => {
          slides[i][dataK] = null; try { pin.value = ""; } catch (e) {}
          const nurl = await captureSlide(slides[i], mode, i, slides.length, eff, useCustom);
          if (nurl) { urls[i] = nurl; img.src = nurl; a.href = nurl; }
          rm.hidden = true; txt.textContent = "📷 " + addTxt;
          saveEdit(genId, i, slides[i]);
        };
        pw.appendChild(btn); pw.appendChild(rm); pw.appendChild(pin);
        return pw;
      };
      thumb.appendChild(mkPhoto(1)); thumb.appendChild(mkPhoto(2));
    }
    return thumb;
  }
  async function zipDownload(urls, mode, btn) {
    const names = urls.map((u, i) => mode + "-" + (i + 1) + ".png");
    if (!window.JSZip) { document.querySelectorAll("#result .cs-thumb a.cs-dl").forEach((a, idx) => setTimeout(() => a.click(), idx * 400)); return; }
    const old = btn.textContent; btn.disabled = true; btn.textContent = t("car_zipping");
    try {
      const zip = new JSZip();
      urls.forEach((u, idx) => { if (u) { const b64 = u.split(",")[1]; if (b64) zip.file(names[idx], b64, { base64: true }); } });
      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = mode + "-slides.zip";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 3000);
    } catch (e) { document.querySelectorAll("#result .cs-thumb a.cs-dl").forEach((a, idx) => setTimeout(() => a.click(), idx * 400)); }
    btn.disabled = false; btn.textContent = old;
  }
  async function renderVisual(out, mode) {
    const rseq = ++renderSeq;
    const d = out.data || {};
    const box = $("result"); box.textContent = "";
    const st = $("gen-status"); st.hidden = false; st.textContent = t("car_rendering");
    if (!window.html2canvas) { st.textContent = "html2canvas не загрузился, обнови страницу"; return; }
    try {
      const FAM = ["Oswald","Nunito","Fraunces","Cormorant Garamond","Space Grotesk","Poppins","Archivo","Manrope"];
      await Promise.all(FAM.map(f => document.fonts.load("700 60px '" + f + "'").catch(() => {})));
    } catch (e) {}
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    if (rseq !== renderSeq) return;   // пока грузились шрифты, кликнули другую запись
    const eff = d._design || effectiveDesign(), useCustom = (eff === "custom");
    const slides = [];
    if (mode === "carousel") {
      if (d.hook_slide) slides.push({ cover: true, title: d.hook_slide });
      arr(d.slides).forEach(s => slides.push({ title: s.title, text: s.text }));
      if (d.cta_slide) slides.push({ cover: true, title: d.cta_slide });
    } else if (mode === "stories") {
      arr(d.frames).forEach(f => slides.push({ title: f.title || "", text: f.text || f.visual || "" }));
    }
    const outBox = el("div", "cs-out");
    const urls = [], thumbs = [];
    for (let i = 0; i < slides.length; i++) {
      const cell = await buildVisualCell(slides, i, mode, eff, useCustom, urls, thumbs, out.generation_id || null);
      if (rseq !== renderSeq) return;   // кликнули другую запись - бросаем устаревший рендер
      if (cell) outBox.appendChild(cell);
    }
    if (rseq !== renderSeq) return;
    box.appendChild(outBox);
    const actions = el("div", "result-actions");
    const all = el("button", "pdfdl", t("car_download_all"));
    all.onclick = () => zipDownload(urls, mode, all);
    const again = el("button", "againdl", t("again")); again.onclick = () => $("btn-gen").click();
    actions.appendChild(all); actions.appendChild(tgBtn(null, () => urls.filter(Boolean))); actions.appendChild(again);
    box.appendChild(actions);
    st.hidden = true; await loadHistory(); await loadMe();
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function renderPost(out) {
    const rseq = ++renderSeq;
    const d = out.data || {};
    const box = $("result"); box.textContent = "";
    const st = $("gen-status"); st.hidden = false; st.textContent = t("car_rendering");
    if (!window.html2canvas) { st.textContent = "html2canvas не загрузился, обнови страницу"; return; }
    try {
      const FAM = ["Oswald","Nunito","Fraunces","Cormorant Garamond","Space Grotesk","Poppins","Archivo","Manrope"];
      await Promise.all(FAM.map(f => document.fonts.load("700 60px '" + f + "'").catch(() => {})));
    } catch (e) {}
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    if (rseq !== renderSeq) return;
    const eff = d._design || effectiveDesign(), useCustom = (eff === "custom");
    const slides = [{ cover: true, title: d.hook }];
    const outBox = el("div", "cs-out");
    const urls = [], thumbs = [];
    const cell = await buildVisualCell(slides, 0, "post", eff, useCustom, urls, thumbs, out.generation_id || null);
    if (rseq !== renderSeq) return;
    if (cell) outBox.appendChild(cell);
    box.appendChild(outBox);
    const tags = arr(d.hashtags).map(x => "#" + String(x).replace(/^#/, "")).join(" ");
    const capText = [d.body, d.cta, tags].filter(Boolean).join("\n\n");
    if (capText) {
      const wrap = el("div", "rcard");
      wrap.appendChild(el("div", "rk", t("post_caption_h")));
      wrap.appendChild(el("div", "caption", capText));
      if (d.first_comment) wrap.appendChild(row(t("r_first_comment"), d.first_comment));
      wrap.appendChild(copyBtn(() => capText + (d.first_comment ? "\n\n" + t("r_first_comment") + ": " + d.first_comment : ""), t("copy_post")));
      box.appendChild(wrap);
    }
    const actions = el("div", "result-actions");
    const again = el("button", "againdl", t("again")); again.onclick = () => $("btn-gen").click();
    actions.appendChild(tgBtn(() => capText, () => urls.filter(Boolean))); actions.appendChild(again); box.appendChild(actions);
    st.hidden = true; await loadHistory(); await loadMe();
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function renderCover(out) {
    const rseq = ++renderSeq;
    const d = out.data || {};
    const box = $("result"); box.textContent = "";
    const st = $("gen-status"); st.hidden = false; st.textContent = t("car_rendering");
    if (!window.html2canvas) { st.textContent = "html2canvas не загрузился, обнови страницу"; return; }
    try {
      const FAM = ["Oswald","Nunito","Fraunces","Cormorant Garamond","Space Grotesk","Poppins","Archivo","Manrope"];
      await Promise.all(FAM.map(f => document.fonts.load("700 60px '" + f + "'").catch(() => {})));
    } catch (e) {}
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    if (rseq !== renderSeq) return;
    const eff = d._design || effectiveDesign();
    const slides = [{ cover: true, title: d.title, text: d.subtitle || "", bg: coverBg }];
    const outBox = el("div", "cs-out");
    const urls = [], thumbs = [];
    const cell = await buildVisualCell(slides, 0, "reels_cover", eff, false, urls, thumbs, out.generation_id || null);
    if (rseq !== renderSeq) return;
    if (cell) outBox.appendChild(cell);
    box.appendChild(outBox);
    const actions = el("div", "result-actions");
    const again = el("button", "againdl", t("again")); again.onclick = () => $("btn-gen").click();
    actions.appendChild(tgBtn(null, () => urls.filter(Boolean))); actions.appendChild(again); box.appendChild(actions);
    st.hidden = true; await loadHistory(); await loadMe();
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // профиль: галерея дизайнов + загрузка фона
  function renderProfileDesigns() {
    const box = $("car-designs-prof"); if (!box) return;
    renderChips(box, profChipList(), carState.myDesign, (id) => {
      carState.myDesign = id;
      try { localStorage.setItem("zh_car_mydesign", id); } catch (e) {}
      carPrefsWrite({ myDesign: id });
    });
  }
  if ($("car-bg-file")) $("car-bg-file").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const { data: u } = await sb.auth.getUser(); if (!u.user) return;
    if (f.size > 8 * 1024 * 1024) { alert(t("file_too_big")); return; }
    const status = $("car-bg-status"); status.textContent = t("car_bg_uploading");
    const ext = (f.name.split(".").pop() || "jpg").replace(/[^\w]/g, "").slice(0, 5);
    const path = u.user.id + "/carousel_bg." + ext;
    const { error } = await sb.storage.from("uploads").upload(path, f, { upsert: true });
    if (error) { status.textContent = t("upload_err") + error.message; return; }
    carState.customBg = await blobToDataURL(f);
    carState.myDesign = "custom";
    try { localStorage.setItem("zh_car_mydesign", "custom"); } catch (e2) {}
    await carPrefsWrite({ myDesign: "custom", bg: path });
    status.textContent = t("car_bg_saved");
    renderProfileDesigns();
  };
  window.__carHooks = { carPrefsRead, renderProfileDesigns, updateCarouselPanel };

  setPayLinks("");
  renderPlatforms();
  refresh();
})();
