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
  // загрузка своего фото для обложки Reels
  (function () {
    const cf = $("cover-file"); if (!cf) return;
    cf.onchange = async () => {
      const file = cf.files && cf.files[0]; if (!file) return;
      try { coverBg = await blobToDataURL(file); } catch (e) { return; }
      const prev = $("cover-prev"); if (prev) { prev.hidden = false; prev.style.backgroundImage = "url(" + coverBg + ")"; }
      const lbl = $("cover-up-label"); if (lbl) lbl.textContent = t("cover_change");
    };
  })();
  const TEXT_IDS = ["reels", "shorts", "tiktok", "youtube_long", "content_plan"];
  const VISUAL_IDS = ["carousel", "post", "stories", "reels_cover"];
  const VISUAL = { carousel: 1, post: 1, stories: 1, reels_cover: 1 };
  let coverBg = null;   // загруженное пользователем фото для обложки Reels
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
  $("tab-profile").onclick = () => { dismissHint(); show("profile"); };
  $("btn-back").onclick = () => show("app");

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
        c.onclick = () => { platform = id; renderPlatforms(); };
        grid.appendChild(c);
      });
      box.appendChild(grid);
    });
    updateCarouselPanel();
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
    st.textContent = t("gen_status");
    $("btn-gen").disabled = true;
    try {
      const res = await fetch(API + "/generate", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + token },
        body: JSON.stringify({ platform, topic, profile, lang: window.ZI18N.getLang(), user_text: userText, design: effectiveDesign() }),
      });
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

  function plabel(p) {
    switch (p) {
      case "reels": return t("p_reels") + " · Instagram";
      case "shorts": return t("p_shorts") + " · YouTube";
      case "tiktok": return "TikTok";
      case "youtube_long": return "YouTube · " + t("p_youtube_long_s");
      case "carousel": return t("p_carousel") + " · Instagram";
      case "post": return t("p_post") + " · Instagram";
      case "stories": return "Stories · Instagram";
      case "content_plan": return t("p_content_plan");
      default: return p;
    }
  }

  function savePdf(node, platform) {
    if (!window.html2pdf) { alert(t("pdf_loading")); return; }
    const date = new Date().toISOString().slice(0, 10);
    const opt = {
      margin: 10, filename: "zalihvat-" + platform + "-" + date + ".pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, backgroundColor: "#faf5ec", useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: ".rcard" },
    };
    const run = () => window.html2pdf().set(opt).from(node).save();
    (document.fonts && document.fonts.ready) ? document.fonts.ready.then(run) : run();
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
    if (["reels", "shorts", "tiktok"].includes(p)) {
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
      arr(d.frames).forEach((f, i) => { const r = row(t("r_frame") + " " + (i + 1) + " · " + f.visual, f.text); c.appendChild(r); });
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
    }
    box.appendChild(content);
    const actions = el("div", "result-actions");
    const pdfbtn = el("button", "pdfdl", t("pdf_dl"));
    pdfbtn.onclick = () => savePdf(content, p);
    const again = el("button", "againdl", t("again"));
    again.onclick = () => $("btn-gen").click();       // та же тема (из поля topic)
    const newtopic = el("button", "againdl", t("new_topic"));
    newtopic.onclick = () => {
      $("topic").value = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => $("topic").focus({ preventScroll: true }), 450);
    };
    actions.appendChild(pdfbtn); actions.appendChild(again); actions.appendChild(newtopic);
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
      const h = el("div", "h");
      const b = el("b", null, g.platform + " ");
      h.appendChild(b);
      const isVisual = (g.platform === "carousel" || g.platform === "post" || g.platform === "stories" || g.platform === "reels_cover");
      h.appendChild(document.createTextNode((g.topic || t("no_topic")) + " · " + new Date(g.created_at).toLocaleString(t("locale"))));
      if (isVisual) { const tag = el("span", "h-img", "🖼 " + t("h_open_images")); h.appendChild(tag); }
      h.onclick = () => {
        const out = { platform: g.platform, data: g.output };
        if (g.platform === "post") renderPost(out);
        else if (g.platform === "carousel" || g.platform === "stories") renderVisual(out, g.platform);
        else if (g.platform === "reels_cover") renderCover(out);
        else renderResult(out);
      };
      box.appendChild(h);
    });
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
  function decoInner(style, a, b) {
    if (style === "floral") return _flower(980, 155, 118, a, b) + _flower(875, 300, 76, a, b) + _leaf(1045, 255, 66, 30, b) + _flower(140, 1235, 92, a, b) + _leaf(235, 1250, 52, -30, b) + _dot(120, 250, 10, a) + _dot(205, 185, 7, b) + _dot(980, 1120, 9, a);
    if (style === "botanical") return _sprig(160, 250, 92, a) + _sprig(955, 1180, 92, a) + _leaf(1005, 230, 78, 20, b) + _leaf(95, 1170, 66, -20, b) + _dot(945, 320, 8, b) + _dot(135, 1110, 8, b);
    if (style === "arch") return '<path d="M120 660 A 420 420 0 0 1 960 660 L960 1250 L120 1250 Z" fill="' + b + '" opacity="0.16"/>' + _dot(150, 210, 12, a) + _dot(930, 175, 9, a) + _dot(1000, 255, 7, b) + _flower(958, 220, 68, a, b);
    if (style === "sparkle") return _spk(960, 160, 70, a) + _spk(1012, 300, 34, b) + _spk(120, 1180, 64, a) + _spk(205, 1245, 28, b) + _spk(150, 235, 38, b) + _dot(940, 1115, 8, a) + _dot(1000, 1180, 6, b);
    if (style === "scallop") { let sc = ""; for (let x = 40; x < 1080; x += 112) sc += '<path d="M' + x + ' 44 a56 56 0 0 0 112 0" fill="none" stroke="' + a + '" stroke-width="7"/>'; return sc + _flower(958, 1180, 90, a, b) + _leaf(1050, 1158, 58, 30, b) + _dot(120, 1200, 9, a); }
    if (style === "boho") { let r = ""; for (let i = 0; i < 12; i++) { const g = i * 30 * Math.PI / 180; r += '<line x1="' + (958 + Math.cos(g) * 62) + '" y1="' + (172 + Math.sin(g) * 62) + '" x2="' + (958 + Math.cos(g) * 112) + '" y2="' + (172 + Math.sin(g) * 112) + '" stroke="' + a + '" stroke-width="6"/>'; } return '<circle cx="958" cy="172" r="46" fill="none" stroke="' + a + '" stroke-width="6"/>' + r + _dot(150, 1180, 12, a) + _dot(215, 1120, 8, b) + _dot(120, 250, 9, b); }
    return "";
  }
  function decoSVG(id) {
    const d = CDEF[id]; if (!d) return "";
    return '<svg class="cs-deco" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">' + decoInner(d.style, d.a, d.b) + "</svg>";
  }
  function miniDecoSVG(id) {
    const d = CDEF[id]; if (!d) return "";
    let inner;
    if (d.style === "sparkle" || d.style === "boho") inner = _spk(40, 20, 18, d.a);
    else if (d.style === "botanical") inner = _leaf(42, 22, 18, 25, d.a);
    else inner = _flower(40, 22, 20, d.a, d.b);
    return '<svg class="cd-deco" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">' + inner + "</svg>";
  }
  const carState = { design: "my", myDesign: "coral", customBg: null, left: null, postLeft: null, storiesLeft: null, pro: false, email: "" };
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
  function updateCarouselPanel() {
    toggleCoverPanel();
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
  function fitSlide(node) {
    const title = node.querySelector(".cs-title");
    const text = node.querySelector(".cs-text");
    if (!title && !text) return;
    const cs = getComputedStyle(node);
    const pad = parseFloat(cs.paddingTop || 0) + parseFloat(cs.paddingBottom || 0);
    const limit = (node.clientHeight - pad) * 0.98;   // рабочая зона между номером и брендом
    const baseT = title ? parseFloat(getComputedStyle(title).fontSize) : 0;
    const baseX = text ? parseFloat(getComputedStyle(text).fontSize) : 0;
    const mb = title ? parseFloat(getComputedStyle(title).marginBottom || 0) : 0;
    const contentH = () => (title ? title.offsetHeight : 0) + (text ? text.offsetHeight : 0) + (title && text ? mb : 0);
    let scale = 1;
    for (let i = 0; i < 26 && contentH() > limit && scale > 0.4; i++) {
      scale -= 0.05;
      if (title) title.style.fontSize = (baseT * scale) + "px";
      if (text) text.style.fontSize = (baseX * scale) + "px";
    }
  }
  async function captureSlide(s, mode, idx, total, eff, useCustom) {
    const dim = DIMS[mode];
    const node = el("div", "cslide ct-" + eff + (dim.cls ? " " + dim.cls : "") + (s.cover ? " cover" : ""));
    const onPhoto = !!s.bg;   // обложка: фон - фото пользователя
    if (onPhoto) { node.style.backgroundImage = "url(" + s.bg + ")"; node.style.backgroundSize = "cover"; node.style.backgroundPosition = "center"; node.appendChild(el("div", "cs-ov")); }
    else if (useCustom && carState.customBg) { node.style.backgroundImage = "url(" + carState.customBg + ")"; node.appendChild(el("div", "cs-ov")); }
    else node.insertAdjacentHTML("afterbegin", decoSVG(eff));
    // без нашей брендировки - только дизайн и текст пользователя
    // заголовок и текст с фирменным шрифтом шаблона
    const fp = fontOf(eff);
    const title = el("div", "cs-title", s.title || "");
    title.style.fontFamily = fp.tf;
    title.style.textTransform = fp.up ? "uppercase" : "none";
    title.style.fontStyle = fp.ital ? "italic" : "normal";
    title.style.fontWeight = fp.wght || 700;
    if (onPhoto) title.style.color = "#ffffff";
    node.appendChild(title);
    if (s.text) { const tx = el("div", "cs-text", s.text); tx.style.fontFamily = fp.bf; if (onPhoto) tx.style.color = "#f3efe9"; node.appendChild(tx); }
    const stage = $("cs-stage"); stage.appendChild(node);
    fitSlide(node);
    let url = "";
    try {
      const canvas = await window.html2canvas(node, { width: dim.w, height: dim.h, scale: 1, backgroundColor: null, useCORS: true, logging: false });
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
    const token = data.session && data.session.access_token; if (!token) return null;
    const hasText = ("text" in slide) && slide.text != null;
    const res = await fetch(API + "/redo", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + token },
      body: JSON.stringify({ platform: mode, title: slide.title || "", text: slide.text || "",
        has_text: hasText, instruction, profile, lang: window.ZI18N.getLang() }),
    });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    return j && j.data;
  }
  async function buildVisualCell(slides, i, mode, eff, useCustom, urls, thumbs) {
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
    rb.onclick = () => { form.hidden = !form.hidden; if (!form.hidden) inp.focus(); };
    const submit = async () => {
      const instr = inp.value.trim(); if (!instr) return;
      go.disabled = true; inp.disabled = true; const old = go.textContent; go.textContent = t("redo_wait");
      try {
        const nd = await redoSlide(mode, slides[i], instr);
        if (nd && nd.title) {
          slides[i].title = nd.title;
          if (("text" in slides[i]) && nd.text != null) slides[i].text = nd.text;
          const nurl = await captureSlide(slides[i], mode, i, slides.length, eff, useCustom);
          if (nurl) { urls[i] = nurl; img.src = nurl; a.href = nurl; }
          form.hidden = true; inp.value = "";
        }
      } catch (e) {}
      go.disabled = false; inp.disabled = false; go.textContent = old;
    };
    go.onclick = submit;
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    form.appendChild(inp); form.appendChild(go); rw.appendChild(rb); rw.appendChild(form); thumb.appendChild(rw);
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
      arr(d.frames).forEach(f => slides.push({ cover: true, title: f.text || f.visual }));
    }
    const outBox = el("div", "cs-out");
    const urls = [], thumbs = [];
    for (let i = 0; i < slides.length; i++) {
      const cell = await buildVisualCell(slides, i, mode, eff, useCustom, urls, thumbs);
      if (rseq !== renderSeq) return;   // кликнули другую запись - бросаем устаревший рендер
      if (cell) outBox.appendChild(cell);
    }
    if (rseq !== renderSeq) return;
    box.appendChild(outBox);
    const actions = el("div", "result-actions");
    const all = el("button", "pdfdl", t("car_download_all"));
    all.onclick = () => zipDownload(urls, mode, all);
    const again = el("button", "againdl", t("again")); again.onclick = () => $("btn-gen").click();
    actions.appendChild(all); actions.appendChild(again);
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
    const cell = await buildVisualCell(slides, 0, "post", eff, useCustom, urls, thumbs);
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
    actions.appendChild(again); box.appendChild(actions);
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
    const cell = await buildVisualCell(slides, 0, "reels_cover", eff, false, urls, thumbs);
    if (rseq !== renderSeq) return;
    if (cell) outBox.appendChild(cell);
    box.appendChild(outBox);
    const actions = el("div", "result-actions");
    const again = el("button", "againdl", t("again")); again.onclick = () => $("btn-gen").click();
    actions.appendChild(again); box.appendChild(actions);
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
