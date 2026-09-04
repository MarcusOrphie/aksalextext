/* Кабинет контент-машины «Залихват». Supabase auth + наш /api для генерации. */
(function () {
  const cfg = window.ZCFG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const API = cfg.API_BASE || "/api";

  const PLATFORMS = [
    ["reels", "Reels", "Instagram"], ["shorts", "Shorts", "YouTube"], ["tiktok", "TikTok", "коротко"],
    ["youtube_long", "YouTube", "длинное видео"], ["carousel", "Карусель", "Instagram"],
    ["post", "Пост", "Instagram"], ["stories", "Stories", "Instagram"],
  ];
  let platform = "reels";
  let profile = {};
  let recovering = false;

  const $ = (id) => document.getElementById(id);
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function show(view) { ["auth", "recover", "app", "profile"].forEach(v => $("view-" + v).hidden = (v !== view)); }

  // ---------- AUTH ----------
  async function refresh() {
    const { data } = await sb.auth.getSession();
    const s = data.session;
    if (s) {
      $("userbox").hidden = false;
      $("usermail").textContent = s.user.email || s.user.phone || "профиль";
      show("app");
      await loadProfile(); await loadHistory(); await loadMe();
    } else {
      $("userbox").hidden = true; show("auth");
      if (window.__authErr) { authNote("Ссылка устарела или уже использована - запроси новую через «Забыли пароль?». (" + window.__authErr + ")"); window.__authErr = null; }
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
      recovering = true; $("userbox").hidden = true; show("recover"); return;
    }
    if (recovering) return;  // не выкидывать из экрана «новый пароль»
    refresh();
  });

  function authNote(msg) { $("email-note").hidden = false; $("email-note").textContent = msg; }
  function ruErr(m) {
    m = m || "";
    const map = [
      [/invalid login credentials/i, "Неверная почта или пароль"],
      [/email not confirmed/i, "Почта ещё не подтверждена"],
      [/already registered/i, "Эта почта уже зарегистрирована"],
      [/password should be at least/i, "Пароль минимум 6 символов"],
      [/should be different from the old/i, "Новый пароль должен отличаться от старого"],
      [/unable to validate email|invalid format/i, "Некорректный формат почты"],
      [/email rate limit exceeded/i, "Слишком много писем - попробуй позже"],
      [/for security purposes.*after|only request this after/i, "Слишком часто - попробуй чуть позже"],
      [/token has expired|invalid.*token|otp_expired/i, "Ссылка устарела или недействительна"],
      [/signups? (not allowed|is disabled)/i, "Регистрация временно отключена"],
      [/failed to fetch|networkerror|load failed/i, "Нет связи с сервером - проверь интернет"],
    ];
    for (const [re, ru] of map) if (re.test(m)) return ru;
    return m;
  }
  $("btn-email").onclick = async () => {
    const email = $("email").value.trim(), password = $("password").value;
    if (!email || !password) return authNote("Введи почту и пароль.");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) authNote(ruErr(error.message));
  };
  $("btn-register").onclick = async () => {
    const email = $("email").value.trim(), password = $("password").value;
    if (!email || !password) return authNote("Введи почту и пароль (минимум 6 символов).");
    if (password.length < 6) return authNote("Пароль минимум 6 символов.");
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return authNote(ruErr(error.message));
    if (!data.session) authNote("Аккаунт создан. Подтверди почту и войди.");
  };
  $("btn-forgot").onclick = async () => {
    const email = $("email").value.trim();
    if (!email) return authNote("Впиши почту - пришлём ссылку для сброса пароля.");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    authNote(error ? ruErr(error.message) : ("Письмо со ссылкой для сброса отправлено на " + email + "."));
  };
  $("btn-setpass").onclick = async () => {
    const password = $("newpass").value;
    const note = $("recover-note");
    if (!password || password.length < 6) { note.hidden = false; note.textContent = "Пароль минимум 6 символов."; return; }
    const { error } = await sb.auth.updateUser({ password });
    note.hidden = false;
    if (error) { note.textContent = ruErr(error.message); return; }
    note.textContent = "Пароль обновлён, входим...";
    recovering = false;
    location.replace("/");
  };
  $("btn-yandex").onclick = () => { location.href = API + "/auth/yandex/start"; };
  $("logout").onclick = async () => {
    try { await sb.auth.signOut(); } catch (e) {}
    location.href = "/";
  };
  $("tab-profile").onclick = () => show("profile");
  $("btn-back").onclick = () => show("app");

  function showPaywall() { $("paywall").hidden = false; }
  $("paywall-close").onclick = () => { $("paywall").hidden = true; };
  $("paywall").onclick = (e) => { if (e.target === $("paywall")) $("paywall").hidden = true; };

  // ---------- PLATFORM PICKER ----------
  function renderPlatforms() {
    const box = $("platforms"); box.textContent = "";
    PLATFORMS.forEach(([id, name, sub]) => {
      const c = el("div", "pf" + (id === platform ? " on" : ""));
      c.appendChild(el("div", null, name));
      c.appendChild(el("small", null, sub));
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
    const st = $("gen-status"); st.hidden = false; st.textContent = "Генерю, это займёт несколько секунд...";
    $("btn-gen").disabled = true;
    try {
      const res = await fetch(API + "/generate", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + token },
        body: JSON.stringify({ platform, topic, profile }),
      });
      if (res.status === 402) { st.hidden = true; showPaywall(); return; }
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || e.error || res.status); }
      const out = await res.json();
      renderResult(out);
      st.hidden = true;
      await loadHistory(); await loadMe();
    } catch (e) {
      st.textContent = "Не вышло: " + e.message;
    } finally {
      $("btn-gen").disabled = false;
    }
  };

  function copyBtn(getText) { const b = el("button", "copy", "копировать"); b.onclick = () => navigator.clipboard.writeText(getText()); return b; }
  function row(k, v, cls) { const r = el("div", "rrow"); r.appendChild(el("div", "rk", k)); r.appendChild(el("div", cls || null, v)); return r; }

  const PLABEL = { reels: "Reels · Instagram", shorts: "Shorts · YouTube", tiktok: "TikTok", youtube_long: "YouTube · длинное", carousel: "Карусель · Instagram", post: "Пост · Instagram", stories: "Stories · Instagram" };

  function savePdf(node, platform) {
    if (!window.html2pdf) return;
    const date = new Date().toISOString().slice(0, 10);
    window.html2pdf().set({
      margin: 8, filename: "zalihvat-" + platform + "-" + date + ".pdf",
      image: { type: "jpeg", quality: 0.96 },
      html2canvas: { scale: 2, backgroundColor: "#faf5ec", useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy", "avoid-all"] },
    }).from(node).save();
  }

  function renderResult(out) {
    const box = $("result"); box.textContent = "";
    const d = out.data || {};
    const p = out.platform;
    const content = el("div", "pdf-content");
    const title = el("div", "pdf-title");
    title.appendChild(el("b", null, "Контент-машина Залихват"));
    title.appendChild(el("span", null, "  ·  " + (PLABEL[p] || p)));
    content.appendChild(title);
    if (["reels", "shorts", "tiktok"].includes(p)) {
      (d.ideas || []).forEach((it, i) => {
        const c = el("div", "rcard");
        c.appendChild(el("span", "viral", (it.virality || 0) + "%"));
        c.appendChild(el("h3", null, (i + 1) + ". " + it.idea));
        c.appendChild(row("Хук", it.hook, "hook"));
        c.appendChild(row("Сценарий", it.scenario));
        c.appendChild(row("Визуал", it.visual));
        c.appendChild(el("div", "why", "Почему " + (it.virality || 0) + "%: " + (it.virality_reason || "")));
        c.appendChild(copyBtn(() => it.hook + "\n\n" + it.scenario));
        content.appendChild(c);
      });
    } else if (p === "youtube_long") {
      const c = el("div", "rcard");
      c.appendChild(el("span", "viral", (d.virality || 0) + "%"));
      c.appendChild(el("h3", null, d.title || "Сценарий"));
      c.appendChild(row("Хук", d.hook, "hook"));
      (d.sections || []).forEach(s => { c.appendChild(row(s.h, s.points)); });
      c.appendChild(row("Финал", d.outro));
      content.appendChild(c);
    } else if (p === "carousel") {
      const c = el("div", "rcard");
      c.appendChild(el("span", "viral", (d.virality || 0) + "%"));
      c.appendChild(row("Слайд-крючок", d.hook_slide, "hook"));
      (d.slides || []).forEach((s, i) => c.appendChild(row("Слайд " + (i + 2) + " · " + s.title, s.text)));
      c.appendChild(row("Финальный слайд", d.cta_slide));
      content.appendChild(c);
    } else if (p === "post") {
      const c = el("div", "rcard");
      c.appendChild(el("span", "viral", (d.virality || 0) + "%"));
      c.appendChild(row("Хук", d.hook, "hook"));
      c.appendChild(row("Текст", d.body));
      c.appendChild(row("Призыв", d.cta));
      c.appendChild(copyBtn(() => d.hook + "\n\n" + d.body + "\n\n" + d.cta));
      content.appendChild(c);
    } else if (p === "stories") {
      const c = el("div", "rcard");
      c.appendChild(el("span", "viral", (d.virality || 0) + "%"));
      (d.frames || []).forEach((f, i) => { const r = row("Кадр " + (i + 1) + " · " + f.visual, f.text); c.appendChild(r); });
      content.appendChild(c);
    }
    const pdfbar = el("div", "pdfbar");
    const pdfbtn = el("button", "pdfdl", "⬇ Скачать PDF");
    pdfbtn.onclick = () => savePdf(content, p);
    pdfbar.appendChild(pdfbtn);
    box.appendChild(pdfbar);
    box.appendChild(content);
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
    $("save-note").hidden = false; $("save-note").textContent = error ? ("Ошибка: " + error.message) : "Сохранено.";
  };
  $("p-file").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const { data: u } = await sb.auth.getUser(); if (!u.user) return;
    if (f.size > 15 * 1024 * 1024) { alert("Файл больше 15 МБ"); return; }
    const path = u.user.id + "/" + Date.now() + "_" + f.name.replace(/[^\w.\-]/g, "_");
    const { error } = await sb.storage.from("uploads").upload(path, f);
    if (error) alert("Ошибка загрузки: " + error.message); else loadUploads();
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
      h.appendChild(document.createTextNode((g.topic || "без темы") + " · " + new Date(g.created_at).toLocaleString("ru")));
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
      if (m.unlimited) box.innerHTML = "Генераций сделано: <b>" + m.used + "</b> · безлимит";
      else box.innerHTML = "Генераций сделано: <b>" + m.used + "</b> · осталось бесплатных: <b>" + m.remaining + "</b>";
    } catch (e) { box.hidden = true; }
  }

  renderPlatforms();
  refresh();
})();
