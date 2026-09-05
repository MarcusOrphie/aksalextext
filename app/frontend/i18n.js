/* Локализация кабинета Залихват (RU/EN). Статика через data-i18n, динамика через window.t(). */
(function () {
  var DICT = {
    ru: {
      // header
      profile_btn: "Мои данные", home_btn: "В кабинет", logout_btn: "Выйти", close: "Закрыть",
      profile_hint: "Заполни информацию о себе, чтобы результат был лучше",
      // auth
      tab_login: "Вход", tab_reg: "Регистрация",
      auth_title_login: "С возвращением!", auth_title_reg: "Создать аккаунт",
      auth_lead_login: "Заходи и получай контент под любую платформу за секунды.",
      auth_lead_reg: "Зарегистрируйся, расскажи о себе - и получай готовый контент за секунды.",
      lbl_email: "Email", lbl_password: "Пароль", ph_password: "минимум 6 символов",
      consent_html: 'Согласен(а) на <a href="https://aksalex.com/consent.html" target="_blank" rel="noopener">обработку персональных данных</a> и принимаю <a href="https://aksalex.com/offer.pdf" target="_blank" rel="noopener">оферту</a>',
      btn_login: "Войти", btn_register: "Создать аккаунт", btn_forgot: "Забыли пароль?",
      or: "или", btn_yandex: "Войти через Яндекс ID",
      // recover
      recover_eyebrow: "Сброс пароля", recover_h_html: "Новый <em>пароль</em>",
      recover_lead: "Придумай новый пароль для входа в кабинет.",
      lbl_newpass: "Новый пароль", btn_setpass: "Сохранить пароль",
      // dashboard
      dash_eyebrow: "Что генерим", dash_h_html: "Выбери <em>платформу</em>",
      lbl_topic: "Тема или запрос (можно пусто - возьму твою нишу)",
      ph_topic: "напр. киноляпы, которые видно в кадре",
      btn_gen: "Сгенерировать", hist_eyebrow: "История", hist_h_html: "Что <em>уже сделали</em>",
      // profile
      prof_eyebrow: "Личные данные", prof_h_html: "Расскажи <em>о себе</em>",
      lbl_niche: "Ниша", ph_niche: "факты про кино и слова",
      lbl_audience: "Аудитория", ph_audience: "молодёжь, любители кино",
      lbl_tone: "Тон", ph_tone: "живой, с юмором",
      lbl_personality: "Личность автора (для Stories и голоса)", ph_personality: "как рассказываешь, что любишь, твоя манера",
      lbl_languages: "Языки", ph_languages: "русский",
      lbl_brand: "Бренд/заметки", ph_brand: "цвета, ссылки, что важно",
      lbl_file: "Загрузить материалы для голоса (расшифровки, посты, субтитры .txt/.srt) - генерация будет писать твоим голосом",
      btn_save: "Сохранить", btn_back: "Назад", save_note: "Сохранено.",
      // footer
      foot_tag_html: 'Залихват · <b style="color:var(--coral-deep)">Саша Аксенов</b>. Нейросети и автоматизация для блога, работы и жизни.',
      foot_legal: "Аксенов Александр Андреевич · ИНН 773102096413",
      foot_site: "На сайт", foot_offer: "Публичная оферта", foot_help: "Помощь",
      // paywall
      pw_eyebrow: "Бесплатная генерация использована", pw_h_html: "Продолжим на <em>подписке</em>?",
      pw_lead: "Ты уже попробовал(а) машину. Дальше - полный доступ к контенту под все платформы.",
      pw_start_name: "Старт", pw_start_price_html: '999 <span class="per">₽ / мес</span>',
      pw_start_sub: "до 5 генераций в день", pw_start_cta: "Оформить Старт",
      pw_pro_name: "Pro", pw_pro_price_html: '2499 <span class="per">₽ / мес</span>',
      pw_pro_sub: "до 30 генераций в день + всё включено", pw_pro_cta: "Оформить Pro",
      // dynamic (app.js)
      gen_status: "Генерю: смотрю свежие тренды и собираю пакет. Первый раз по теме - до полминуты, дальше быстрее...",
      gen_fail: "Не вышло: ",
      note_need_creds: "Введи почту и пароль.",
      note_need_creds_reg: "Введи почту и пароль (минимум 6 символов).",
      note_pass_short: "Пароль минимум 6 символов.",
      note_consent: "Отметь согласие на обработку персональных данных.",
      note_account_created: "Аккаунт создан. Подтверди почту и войди.",
      note_forgot_empty: "Впиши почту - пришлём ссылку для сброса пароля.",
      note_forgot_sent: "Письмо со ссылкой для сброса отправлено на ",
      note_recover_short: "Пароль минимум 6 символов.",
      note_recover_ok: "Пароль обновлён, входим...",
      note_link_expired: "Ссылка устарела или уже использована - запроси новую через «Забыли пароль?». (",
      copy: "Копировать", copied: "Скопировано!", copy_pack: "Копировать пакет", copy_post: "Копировать пост",
      pdf_dl: "⬇ Скачать PDF", again: "↻ Ещё", new_topic: "✎ Новая тема",
      pdf_loading: "PDF ещё грузится, попробуй через секунду",
      file_too_big: "Файл больше 15 МБ",
      upload_err: "Ошибка загрузки: ", save_err: "Ошибка: ",
      // result labels
      r_hook: "Хук", r_abhooks: "A/B хуки", r_scenario: "Сценарий", r_shotlist: "Шот-лист",
      r_onscreen: "Текст на экране", r_teleprompter: "Телесуфлёр", r_caption: "Подпись",
      r_hashtags: "Хэштеги", r_first_comment: "Первый коммент", r_length: "Длина",
      r_references: "Похожее залетало", r_factcheck: "✓ Фактчек — проверь перед публикацией",
      r_why: "Почему ", r_body: "Текст", r_cta: "Призыв", r_outro: "Финал",
      r_hookslide: "Слайд-крючок", r_slide: "Слайд", r_finalslide: "Финальный слайд",
      r_frame: "Кадр", r_rubrics: "Постоянные рубрики", r_plan: "План публикаций", r_planhook: "Хук: ",
      vote_q: "Как тебе?", vote_up: "Нравится - хочу такое ещё", vote_down: "Не заходит - меньше такого",
      pdf_title: "Контент-машина Залихват",
      usage_unlim: "Генераций сделано: ", usage_unlim2: " · безлимит",
      usage_left: "Генераций сделано: ", usage_left2: " · осталось бесплатных: ",
      no_topic: "без темы",
      // errors
      err_bad_creds: "Неверная почта или пароль", err_not_confirmed: "Почта ещё не подтверждена",
      err_registered: "Эта почта уже зарегистрирована", err_pass_min: "Пароль минимум 6 символов",
      err_pass_diff: "Новый пароль должен отличаться от старого", err_email_fmt: "Некорректный формат почты",
      err_rate: "Слишком много писем - попробуй позже", err_too_often: "Слишком часто - попробуй чуть позже",
      err_token: "Ссылка устарела или недействительна", err_signup_off: "Регистрация временно отключена",
      err_network: "Нет связи с сервером - проверь интернет",
      // platform picker: [name, sub]
      p_reels: "Reels", p_reels_s: "Instagram", p_shorts: "Shorts", p_shorts_s: "YouTube",
      p_tiktok: "TikTok", p_tiktok_s: "коротко", p_youtube_long: "YouTube", p_youtube_long_s: "длинное видео",
      p_carousel: "Карусель", p_carousel_s: "Instagram", p_post: "Пост", p_post_s: "Instagram",
      p_stories: "Stories", p_stories_s: "Instagram", p_content_plan: "Контент-план", p_content_plan_s: "неделя/две",
      locale: "ru"
    },
    en: {
      profile_btn: "My profile", home_btn: "Dashboard", logout_btn: "Log out", close: "Close",
      profile_hint: "Tell us about yourself so the results get better",
      tab_login: "Log in", tab_reg: "Sign up",
      auth_title_login: "Welcome back!", auth_title_reg: "Create account",
      auth_lead_login: "Log in and get content for any platform in seconds.",
      auth_lead_reg: "Sign up, tell us about yourself - and get ready content in seconds.",
      lbl_email: "Email", lbl_password: "Password", ph_password: "at least 6 characters",
      consent_html: 'I agree to the <a href="https://aksalex.com/consent.html" target="_blank" rel="noopener">processing of personal data</a> and accept the <a href="https://aksalex.com/offer.pdf" target="_blank" rel="noopener">offer</a>',
      btn_login: "Log in", btn_register: "Create account", btn_forgot: "Forgot password?",
      or: "or", btn_yandex: "Sign in with Yandex ID",
      recover_eyebrow: "Password reset", recover_h_html: "New <em>password</em>",
      recover_lead: "Set a new password to log in.",
      lbl_newpass: "New password", btn_setpass: "Save password",
      dash_eyebrow: "What we generate", dash_h_html: "Pick a <em>platform</em>",
      lbl_topic: "Topic or request (leave empty - I'll use your niche)",
      ph_topic: "e.g. movie mistakes you can spot on screen",
      btn_gen: "Generate", hist_eyebrow: "History", hist_h_html: "What we've <em>already made</em>",
      prof_eyebrow: "Your details", prof_h_html: "Tell us <em>about yourself</em>",
      lbl_niche: "Niche", ph_niche: "facts about movies and words",
      lbl_audience: "Audience", ph_audience: "young people, movie fans",
      lbl_tone: "Tone", ph_tone: "lively, with humor",
      lbl_personality: "Author's personality (for Stories and voice)", ph_personality: "how you talk, what you love, your manner",
      lbl_languages: "Languages", ph_languages: "English",
      lbl_brand: "Brand/notes", ph_brand: "colors, links, what matters",
      lbl_file: "Upload voice materials (transcripts, posts, subtitles .txt/.srt) - generation will write in your voice",
      btn_save: "Save", btn_back: "Back", save_note: "Saved.",
      foot_tag_html: 'Zalihvat · <b style="color:var(--coral-deep)">Sasha Aksenov</b>. AI and automation for your blog, work and life.',
      foot_legal: "Aleksandr Aksenov · INN 773102096413",
      foot_site: "To the site", foot_offer: "Public offer", foot_help: "Help",
      pw_eyebrow: "Free generation used", pw_h_html: "Continue on a <em>subscription</em>?",
      pw_lead: "You've tried the machine. Next - full access to content for every platform.",
      pw_start_name: "Start", pw_start_price_html: '$9.99 <span class="per">/ mo</span>',
      pw_start_sub: "up to 5 generations per day", pw_start_cta: "Get Start",
      pw_pro_name: "Pro", pw_pro_price_html: '$24.99 <span class="per">/ mo</span>',
      pw_pro_sub: "up to 30 generations per day + everything included", pw_pro_cta: "Get Pro",
      gen_status: "Generating: checking fresh trends and building the package. First time on a topic - up to 30 sec, faster after that...",
      gen_fail: "Didn't work: ",
      note_need_creds: "Enter your email and password.",
      note_need_creds_reg: "Enter your email and password (at least 6 characters).",
      note_pass_short: "Password must be at least 6 characters.",
      note_consent: "Please tick consent to personal data processing.",
      note_account_created: "Account created. Confirm your email and log in.",
      note_forgot_empty: "Enter your email - we'll send a reset link.",
      note_forgot_sent: "A password reset link has been sent to ",
      note_recover_short: "Password must be at least 6 characters.",
      note_recover_ok: "Password updated, logging you in...",
      note_link_expired: "The link expired or was already used - request a new one via 'Forgot password?'. (",
      copy: "Copy", copied: "Copied!", copy_pack: "Copy package", copy_post: "Copy post",
      pdf_dl: "⬇ Download PDF", again: "↻ More", new_topic: "✎ New topic",
      pdf_loading: "PDF is still loading, try again in a second",
      file_too_big: "File is larger than 15 MB",
      upload_err: "Upload error: ", save_err: "Error: ",
      r_hook: "Hook", r_abhooks: "A/B hooks", r_scenario: "Scenario", r_shotlist: "Shot list",
      r_onscreen: "On-screen text", r_teleprompter: "Teleprompter", r_caption: "Caption",
      r_hashtags: "Hashtags", r_first_comment: "First comment", r_length: "Length",
      r_references: "Similar went viral", r_factcheck: "✓ Fact-check — verify before posting",
      r_why: "Why ", r_body: "Body", r_cta: "Call to action", r_outro: "Outro",
      r_hookslide: "Hook slide", r_slide: "Slide", r_finalslide: "Final slide",
      r_frame: "Frame", r_rubrics: "Recurring rubrics", r_plan: "Publishing plan", r_planhook: "Hook: ",
      vote_q: "How is it?", vote_up: "Like it - want more like this", vote_down: "Not for me - less of this",
      pdf_title: "Zalihvat content machine",
      usage_unlim: "Generations made: ", usage_unlim2: " · unlimited",
      usage_left: "Generations made: ", usage_left2: " · free left: ",
      no_topic: "no topic",
      err_bad_creds: "Wrong email or password", err_not_confirmed: "Email not confirmed yet",
      err_registered: "This email is already registered", err_pass_min: "Password must be at least 6 characters",
      err_pass_diff: "New password must differ from the old one", err_email_fmt: "Invalid email format",
      err_rate: "Too many emails - try later", err_too_often: "Too often - try again in a moment",
      err_token: "The link is expired or invalid", err_signup_off: "Sign-up is temporarily disabled",
      err_network: "No connection to the server - check your internet",
      p_reels: "Reels", p_reels_s: "Instagram", p_shorts: "Shorts", p_shorts_s: "YouTube",
      p_tiktok: "TikTok", p_tiktok_s: "short", p_youtube_long: "YouTube", p_youtube_long_s: "long video",
      p_carousel: "Carousel", p_carousel_s: "Instagram", p_post: "Post", p_post_s: "Instagram",
      p_stories: "Stories", p_stories_s: "Instagram", p_content_plan: "Content plan", p_content_plan_s: "week/two",
      locale: "en"
    }
  };

  function detect() {
    try { var s = localStorage.getItem("zh_lang"); if (s === "ru" || s === "en") return s; } catch (e) {}
    var q = new URLSearchParams(location.search || "").get("lang");
    if (q && q.toLowerCase().indexOf("en") === 0) return "en";
    if (q && q.toLowerCase().indexOf("ru") === 0) return "ru";
    try { var nl = (navigator.language || "").toLowerCase(); if (nl.indexOf("ru") === 0) return "ru"; if (nl.indexOf("en") === 0) return "en"; } catch (e) {}
    return "ru";
  }

  var LANG = detect();
  function t(key, lang) { var d = DICT[lang || LANG] || DICT.ru; return (key in d) ? d[key] : (DICT.ru[key] != null ? DICT.ru[key] : key); }
  function getLang() { return LANG; }
  function setLang(l) { LANG = (l === "en") ? "en" : "ru"; try { localStorage.setItem("zh_lang", LANG); } catch (e) {} }

  function apply(root) {
    root = root || document;
    var d = DICT[LANG] || DICT.ru;
    root.querySelectorAll("[data-i18n]").forEach(function (el) { var k = el.getAttribute("data-i18n"); if (k in d) el.textContent = d[k]; });
    root.querySelectorAll("[data-i18n-html]").forEach(function (el) { var k = el.getAttribute("data-i18n-html"); if (k in d) el.innerHTML = d[k]; });
    root.querySelectorAll("[data-i18n-ph]").forEach(function (el) { var k = el.getAttribute("data-i18n-ph"); if (k in d) el.setAttribute("placeholder", d[k]); });
    root.querySelectorAll("[data-i18n-title]").forEach(function (el) { var k = el.getAttribute("data-i18n-title"); if (k in d) { el.setAttribute("title", d[k]); el.setAttribute("aria-label", d[k]); } });
    document.documentElement.setAttribute("lang", LANG);
    document.querySelectorAll(".langsw a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-lang") === LANG); });
  }

  window.ZI18N = { t: t, getLang: getLang, setLang: setLang, apply: apply, dict: DICT };
  window.t = t;
})();
