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
      auth_lead_login: "Заходи - и собери первый готовый пост, пока малыш спит.",
      auth_lead_reg: "Зарегистрируйся - и получи первый готовый пост за 5 минут.",
      lbl_email: "Email", lbl_password: "Пароль", ph_password: "мин. 6 символов, заглавная и цифра, латиница",
      consent_html: 'Согласен(а) на <a href="https://aksalex.com/consent.html" target="_blank" rel="noopener">обработку персональных данных</a> и принимаю <a href="https://aksalex.com/offer.pdf" target="_blank" rel="noopener">оферту</a>',
      btn_login: "Войти", btn_register: "Создать аккаунт", btn_forgot: "Забыли пароль?",
      or: "или", btn_yandex: "Войти через Яндекс ID",
      // recover
      recover_eyebrow: "Сброс пароля", recover_h_html: "Новый <em>пароль</em>",
      recover_lead: "Придумай новый пароль для входа в кабинет.",
      lbl_newpass: "Новый пароль", btn_setpass: "Сохранить пароль",
      // dashboard
      dash_eyebrow: "Что генерим", dash_h_html: "Выбери <em>платформу</em>",
      cab_tip_html: "💡 <b>Ритм для роста в Instagram:</b> в день - 1 видео, 1 пост или карусель и 1 короткое видео в пробные Reels.",
      lbl_topic: "Тема (можно не придумывать - возьму из твоего блога)",
      ph_topic: "напр. киноляпы, которые видно в кадре",
      lbl_usertext: "Твой текст (необязательно - если есть, соберу контент на его основе)",
      ph_usertext: "вставь свой черновик, заметки или готовый текст - переработаю под формат",
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
      cab_plans_h: "Тарифы", cab_plans_lead: "У тебя пробный доступ. Оформи тариф - и собирай контент без ограничений, пока малыш спит.",
      car_design_h: "Дизайн карусели", car_prof_h: "Дизайн карусели по умолчанию (для «Мой дизайн»)",
      car_upload: "Загрузить свой фон для карусели (картинка)", car_download: "Скачать", car_download_all: "⬇ Скачать все слайды",
      car_rendering: "Рисую слайды...", car_slide: "Слайд", car_left_lbl: "Осталось на неделе: ",
      car_weekly_msg: "Лимит каруселей на неделю исчерпан (3). Попробуй на следующей неделе.",
      car_pro_only: "Карусель - в тарифе Pro", car_pro_msg: "Визуальные карусели-картинки доступны на тарифе Pro: до 3 каруселей в неделю в любом из 10 дизайнов или своём. Оформи Pro - и забирай готовые слайды.",
      grp_text: "Текст и сценарии", grp_visual: "Картинки (Pro)",
      u_made: "сделано ", u_left: "осталось ", u_unlim: "безлимит",
      car_month_lbl: "Осталось в этом месяце: ",
      visual_pro_only: "Генерация картинок - в тарифе Pro", visual_pro_msg: "Карусели, посты и сториз в виде готовых картинок с дизайном - на тарифе Pro. Оформи Pro и забирай визуалы: остаётся только выложить.",
      visual_monthly_msg: "Лимит картинок на этот месяц исчерпан (30). Попробуй в следующем месяце.",
      post_caption_h: "Подпись к посту (копируй в Instagram)",
      cd_mocha: "Мокко", cd_sky: "Небо", cd_honey: "Мёд", cd_mint: "Мята", cd_berry: "Ягода", cd_sand: "Песок", cd_ocean: "Океан", cd_plum: "Слива",
      car_bg_saved: "Фон сохранён", car_bg_uploading: "Загружаю фон...", car_saved: "Сохранено",
      cd_blush: "Пудра", cd_rose: "Роза", cd_sage: "Шалфей", cd_peach: "Персик", cd_lavender: "Лаванда",
      cd_terra: "Терракота", cd_butter: "Ваниль", cd_cream: "Крем", cd_noir: "Нуар", cd_coral: "Коралл",
      cd_ink: "Графит", cd_linen: "Лён", cd_custom: "Мой дизайн",
      // dynamic (app.js)
      gen_status: "Думаю: смотрю свежие тренды и собираю пакет. Первый раз по теме - до полминуты, дальше быстрее...",
      gen_fail: "Не вышло: ",
      note_need_creds: "Введи почту и пароль.",
      note_need_creds_reg: "Введи почту и пароль.",
      note_pass_short: "Пароль минимум 6 символов.",
      note_pass_rules: "Пароль: только английские буквы и цифры, минимум одна заглавная буква и одна цифра.",
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
      auth_lead_login: "Log in - and put together your first ready post while the baby naps.",
      auth_lead_reg: "Sign up - and get your first ready post in 5 minutes.",
      lbl_email: "Email", lbl_password: "Password", ph_password: "min 6 chars, uppercase & digit, Latin only",
      consent_html: 'I agree to the <a href="https://aksalex.com/consent.html" target="_blank" rel="noopener">processing of personal data</a> and accept the <a href="https://aksalex.com/offer.pdf" target="_blank" rel="noopener">offer</a>',
      btn_login: "Log in", btn_register: "Create account", btn_forgot: "Forgot password?",
      or: "or", btn_yandex: "Sign in with Yandex ID",
      recover_eyebrow: "Password reset", recover_h_html: "New <em>password</em>",
      recover_lead: "Set a new password to log in.",
      lbl_newpass: "New password", btn_setpass: "Save password",
      dash_eyebrow: "What we generate", dash_h_html: "Pick a <em>platform</em>",
      cab_tip_html: "💡 <b>Rhythm for Instagram growth:</b> per day - 1 video, 1 post or carousel, and 1 short test Reel.",
      lbl_topic: "Topic (no need to think it up - I'll take it from your blog)",
      ph_topic: "e.g. movie mistakes you can spot on screen",
      lbl_usertext: "Your text (optional - if you have one, I'll build the content from it)",
      ph_usertext: "paste your draft, notes or ready text - I'll rework it for the format",
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
      foot_tag_html: 'Zalihvat · <b style="color:var(--coral-deep)">Alex Aksenov</b>. AI and automation for your blog, work and life.',
      foot_legal: "Aleksandr Aksenov · INN 773102096413",
      foot_site: "To the site", foot_offer: "Public offer", foot_help: "Help",
      pw_eyebrow: "Free generation used", pw_h_html: "Continue on a <em>subscription</em>?",
      pw_lead: "You've tried the machine. Next - full access to content for every platform.",
      pw_start_name: "Start", pw_start_price_html: '$9.99 <span class="per">/ mo</span>',
      pw_start_sub: "up to 5 generations per day", pw_start_cta: "Get Start",
      pw_pro_name: "Pro", pw_pro_price_html: '$24.99 <span class="per">/ mo</span>',
      pw_pro_sub: "up to 30 generations per day + everything included", pw_pro_cta: "Get Pro",
      cab_plans_h: "Plans", cab_plans_lead: "You're on a trial. Get a plan and create content without limits, while the baby naps.",
      car_design_h: "Carousel design", car_prof_h: "Default carousel design (for 'My design')",
      car_upload: "Upload your own carousel background (image)", car_download: "Download", car_download_all: "⬇ Download all slides",
      car_rendering: "Rendering slides...", car_slide: "Slide", car_left_lbl: "Left this week: ",
      car_weekly_msg: "Weekly carousel limit reached (3). Try again next week.",
      car_pro_only: "Carousel is a Pro feature", car_pro_msg: "Visual carousel images are available on the Pro plan: up to 3 carousels a week in any of 10 designs or your own. Get Pro and grab ready-made slides.",
      grp_text: "Text & scripts", grp_visual: "Images (Pro)",
      u_made: "made ", u_left: "left ", u_unlim: "unlimited",
      car_month_lbl: "Left this month: ",
      visual_pro_only: "Image generation is a Pro feature", visual_pro_msg: "Carousels, posts and stories as ready-made designed images are on the Pro plan. Get Pro and grab the visuals - all that's left is to post.",
      visual_monthly_msg: "Monthly image limit reached (30). Try next month.",
      post_caption_h: "Post caption (copy to Instagram)",
      cd_mocha: "Mocha", cd_sky: "Sky", cd_honey: "Honey", cd_mint: "Mint", cd_berry: "Berry", cd_sand: "Sand", cd_ocean: "Ocean", cd_plum: "Plum",
      car_bg_saved: "Background saved", car_bg_uploading: "Uploading background...", car_saved: "Saved",
      cd_blush: "Blush", cd_rose: "Rose", cd_sage: "Sage", cd_peach: "Peach", cd_lavender: "Lavender",
      cd_terra: "Terracotta", cd_butter: "Vanilla", cd_cream: "Cream", cd_noir: "Noir", cd_coral: "Coral",
      cd_ink: "Graphite", cd_linen: "Linen", cd_custom: "My design",
      gen_status: "Thinking: checking fresh trends and building the package. First time on a topic - up to 30 sec, faster after that...",
      gen_fail: "Didn't work: ",
      note_need_creds: "Enter your email and password.",
      note_need_creds_reg: "Enter your email and password.",
      note_pass_rules: "Password: English letters and digits only, at least one uppercase letter and one digit.",
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
