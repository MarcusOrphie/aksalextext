/* Кабинет контент-машины «Залихват». Supabase auth + наш /api для генерации. */
(function () {
  const cfg = window.ZCFG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const API = cfg.API_BASE || "/api";

  const t = window.t || ((k) => k);
  const PLATFORM_IDS = ["reels", "shorts", "tiktok", "youtube_long", "carousel", "post", "stories", "content_plan"];
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
  $("btn-register").onclick = async () => {
    if (!consentOk()) return;
    const email = $("email").value.trim(), password = $("password").value;
    if (!email || !password) return authNote(t("note_need_creds_reg"));
    if (password.length < 6) return authNote(t("note_pass_short"));
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
    if (!password || password.length < 6) { note.hidden = false; note.textContent = t("note_recover_short"); return; }
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
    PLATFORM_IDS.forEach((id) => {
      const c = el("div", "pf" + (id === platform ? " on" : ""));
      c.appendChild(el("div", null, t("p_" + id)));
      c.appendChild(el("small", null, t("p_" + id + "_s")));
      c.onclick = () => { platform = id; renderPlatforms(); };
      box.appendChild(c);
    });
  }

  // ---------- GENERATE ----------
  $("btn-gen").onclick = async () => {
    const { data } = await sb.auth.getSession();
    const token = data.session && data.session.access_token;
    if (!token) return refresh();
    const topic = $("topic").value.trim();
    const st = $("gen-status"); st.hidden = false;
    st.textContent = t("gen_status");
    $("btn-gen").disabled = true;
    try {
      const res = await fetch(API + "/generate", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + token },
        body: JSON.stringify({ platform, topic, profile, lang: window.ZI18N.getLang() }),
      });
      if (res.status === 402) { st.hidden = true; showPaywall(); return; }
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || e.error || res.status); }
      const out = await res.json();
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
      h.appendChild(document.createTextNode((g.topic || t("no_topic")) + " · " + new Date(g.created_at).toLocaleString(t("locale"))));
      h.onclick = () => renderResult({ platform: g.platform, data: g.output });
      box.appendChild(h);
    });
  }

  async function loadMe() {
    const box = $("usage");
    try {
      const { data } = await sb.auth.getSession();
      const token = data.session && data.session.access_token;
      if (!token) { box.hidden = true; return; }
      const res = await fetch(API + "/me", { headers: { authorization: "Bearer " + token } });
      if (!res.ok) { box.hidden = true; return; }
      const m = await res.json();
      box.hidden = false;
      if (m.unlimited) box.innerHTML = t("usage_unlim") + "<b>" + m.used + "</b>" + t("usage_unlim2");
      else box.innerHTML = t("usage_left") + "<b>" + m.used + "</b>" + t("usage_left2") + "<b>" + m.remaining + "</b>";
    } catch (e) { box.hidden = true; }
  }

  renderPlatforms();
  refresh();
})();
