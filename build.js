/**
 * Сборка страниц отчёта из Markdown-источников.
 *
 * Отчёт — обычный Markdown, но у него есть повторяющиеся смысловые структуры,
 * которые стоит разметить явно: нумерованные разделы, годовые срезы хронологии,
 * датированные записи визитов, предупреждения ⚠️ и лабораторные таблицы.
 * Скрипт разбирает документ на токены и собирает из них семантический HTML,
 * после чего встраивает CSS и JS — на выходе самодостаточные файлы.
 *
 * Все страницы собираются одним и тем же кодом: полная хронология
 * (final_report.md → index.html), аналитическая часть (analysis.md →
 * analysis.html) и краткая сводка для врача на трёх языках (summary*.md →
 * summary*.html). Переключатель документов — в шапке оглавления, переключатель
 * языка — в шапке краткой сводки.
 *
 *   npm run build
 */

const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const ROOT = __dirname;

const css = fs.readFileSync(path.join(ROOT, "src", "style.css"), "utf8");
const js = fs.readFileSync(path.join(ROOT, "src", "app.js"), "utf8");

/**
 * Страницы сайта. Порядок задаёт порядок переключателя в оглавлении.
 * `profile` — показывать ли карточку пациента в шапке: она уместна на
 * титульной странице истории и сводке и избыточна на аналитической.
 * `lang` — язык страницы. Страницы с одинаковым `group` — переводы одного
 * документа: между ними работает переключатель языка, а в оглавлении
 * показывается только вариант на языке текущей страницы.
 */
const PAGES = [
  { src: "summary.md", out: "summary.html", nav: "Кратко для врача", profile: true, lang: "ru", group: "summary", compact: true },
  { src: "summary.pl.md", out: "summary-pl.html", nav: "Podsumowanie dla lekarza", profile: true, lang: "pl", group: "summary", compact: true },
  { src: "summary.en.md", out: "summary-en.html", nav: "Summary for the vet", profile: true, lang: "en", group: "summary", compact: true },
  { src: "final_report.md", out: "index.html", nav: "Полная хронология", profile: true, lang: "ru",
    navIn: { pl: "Pełna chronologia", en: "Full chronology" } },
  { src: "analysis.md", out: "analysis.html", nav: "Анализ", profile: false, lang: "ru",
    navIn: { pl: "Analiza", en: "Analysis" } },
];

/** Подписи интерфейса. Тексты документов живут в Markdown, здесь — только обвязка. */
const UI = {
  ru: {
    eyebrow: "Ветеринарный отчёт", docs: "Документы", sections: "Разделы",
    toc: "Оглавление", theme: "Сменить тему", top: "В начало", caption: "Варя",
    name: "Имя", nameValue: "Варя (Varia)", age: "Возраст", ageValue: "12 лет",
    born: "Дата рождения", chip: "Чип", owner: "Владелец", language: "Язык",
    ruOnly: "",
  },
  pl: {
    eyebrow: "Raport weterynaryjny", docs: "Dokumenty", sections: "Sekcje",
    toc: "Spis treści", theme: "Zmień motyw", top: "Na górę", caption: "Varia",
    name: "Imię", nameValue: "Varia (Waria)", age: "Wiek", ageValue: "12 lat",
    born: "Data urodzenia", chip: "Chip", owner: "Właściciel", language: "Język",
    ruOnly: " (RU)",
  },
  en: {
    eyebrow: "Veterinary report", docs: "Documents", sections: "Sections",
    toc: "Contents", theme: "Toggle theme", top: "Back to top", caption: "Varia",
    name: "Name", nameValue: "Varia", age: "Age", ageValue: "12 years",
    born: "Date of birth", chip: "Microchip", owner: "Owner", language: "Language",
    ruOnly: " (RU)",
  },
};

/* -------------------------------------------------------------------------
   Вспомогательное
   ------------------------------------------------------------------------- */

const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

const escape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const inline = (s) => marked.parseInline(s).trim();

/**
 * Помечает ⚠️-содержимое, чтобы оно читалось как предупреждение.
 * Исключение — легенда, объясняющая сам значок: она описывает обозначение,
 * а не сообщает о расхождении в документах.
 */
function markWarnings(html) {
  if (/Значком|Symbolem|The ⚠️ symbol/.test(html)) return html;
  return html
    .replace(/<tr>(?:(?!<\/tr>)[\s\S])*<\/tr>/g, (row) =>
      row.includes("⚠️") ? row.replace("<tr>", '<tr class="warn">') : row
    )
    .replace(/<li>(?:(?!<\/li>)[\s\S])*<\/li>/g, (item) =>
      item.includes("⚠️") ? item.replace("<li>", '<li class="warn">') : item
    )
    .replace(/^<p>(?=[\s\S]*⚠️)/, '<p class="warn">');
}

/** Стрелки ↑↓ у лабораторных значений — это отклонения, показываем цветом. */
function markArrows(html) {
  return html.replace(/([↑↓])\1?/g, (m) =>
    `<span class="arr ${m[0] === "↑" ? "up" : "down"}">${m}</span>`
  );
}

function render(token) {
  return markArrows(markWarnings(marked.parser([token]).trim()));
}

// Заголовок вида «13.04.2026, 16:00 — LoVet, dr Drewniak: консультация»:
// дата (возможно приблизительная или диапазоном) плюс необязательное описание.
// Шаблон требует полную дату, иначе под него попадают нумерованные подразделы («8.1.»).
const DATED = /^[~≈]?\s*(?:До\s+|С\s+)?\d{1,2}(?:[–—-]\d{1,2})?\.\d{2}\.\d{4}/u;

/* -------------------------------------------------------------------------
   Разбор одного Markdown-документа
   ------------------------------------------------------------------------- */

function buildPage(page) {
  const md = fs.readFileSync(path.join(ROOT, page.src), "utf8");

  // Идентификаторы уникальны в пределах страницы, поэтому счётчик свой на документ.
  const used = new Set();

  function slug(text) {
    const base =
      text
        .toLowerCase()
        .replace(/[а-яё]/g, (ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "section";

    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  }

  const anchor = (id) => `<a class="anchor" href="#${id}" aria-hidden="true">#</a>`;

  /* --- Шапка документа: заголовок, подзаголовок и курсивные строки-метаданные --- */

  const all = marked.lexer(md);
  const bodyStart = all.findIndex((t) => t.type === "heading" && t.depth === 2);
  const head = all.slice(0, bodyStart);
  const body = all.slice(bodyStart);

  const title = (head.find((t) => t.type === "heading" && t.depth === 1) || { text: "Отчёт" }).text;
  const lede = (head.find((t) => t.type === "heading" && t.depth === 3) || { text: "" }).text;
  const heroImageToken = head.flatMap((t) => t.tokens || []).find((t) => t.type === "image");

  function localImage(href) {
    if (!href) return "";
    const imagePath = path.resolve(ROOT, href);
    if (!imagePath.startsWith(ROOT + path.sep) || !fs.existsSync(imagePath)) return "";
    return href.replace(/\\/g, "/");
  }

  const heroImage = localImage(heroImageToken && heroImageToken.href);
  const heroImageAlt = (heroImageToken && heroImageToken.text) || "Варя";

  // Курсивные строки вида «*Период документов: …*» превращаем в карточки метаданных.
  const meta = head
    .filter((t) => t.type === "paragraph" && /^\*.+\*$/.test(t.raw.trim()))
    .map((t) => {
      const text = t.raw.trim().replace(/^\*|\*$/g, "");
      const at = text.indexOf(":");
      return at === -1
        ? { label: "Пациент", value: text }
        : { label: text.slice(0, at).trim(), value: text.slice(at + 1).trim() };
    });

  /* --- Разметка тела --- */

  // Завершающая заметка «О документе» — не часть нумерованных разделов.
  const lastHeading = body.reduce((at, t, i) => (t.type === "heading" ? i : at), -1);

  const out = [];
  const toc = [];
  let openSection = false;
  let openEntry = false;
  let openColophon = false;

  const closeEntry = () => {
    if (openEntry) out.push("</div>");
    openEntry = false;
  };

  const closeSection = () => {
    closeEntry();
    if (openSection) out.push("</section>");
    openSection = false;
  };

  const closeAll = () => {
    closeSection();
    if (openColophon) out.push("</footer>");
    openColophon = false;
  };

  for (const [index, token] of body.entries()) {
    if (token.type === "hr") continue; // разделители заменены отступами и линейками

    if (token.type === "heading" && token.depth === 2) {
      closeSection();

      const m = token.text.match(/^(\d+)\.\s*(.+)$/);
      const num = m ? m[1] : "";
      const text = m ? m[2] : token.text;
      const id = slug(text);

      // Вводное резюме идёт без номера и оформляется как отдельная карточка.
      const brief = num === "" && toc.length === 0;

      toc.push({ id, num, text, children: [] });
      out.push(`<section class="section${brief ? " section--brief" : ""}" id="${id}">`);
      out.push(
        `<h2>${num ? `<span class="num">${num}</span>` : ""}` +
          `<span>${inline(text)}</span>${anchor(id)}</h2>`
      );
      openSection = true;
      continue;
    }

    if (token.type === "heading" && token.depth === 3 && index === lastHeading) {
      closeAll();
      const id = slug(token.text);
      toc.push({ id, num: "", text: token.text, children: [] });
      out.push(`<footer class="colophon" id="${id}">`);
      out.push(`<h2>${inline(token.text)}${anchor(id)}</h2>`);
      openColophon = true;
      continue;
    }

    if (token.type === "heading" && token.depth === 3) {
      closeEntry();
      const id = slug(token.text);
      const year = /^\d{4}\s+год$/.test(token.text.trim());

      if (toc.length) toc[toc.length - 1].children.push({ id, text: token.text });

      out.push(
        year
          ? `<h3 class="year" id="${id}">${inline(token.text)}</h3>`
          : `<h3 id="${id}">${inline(token.text)}${anchor(id)}</h3>`
      );
      continue;
    }

    if (token.type === "heading" && token.depth === 4) {
      closeEntry();
      const id = slug(token.text);

      if (!DATED.test(token.text)) {
        out.push(`<h4 id="${id}">${inline(token.text)}${anchor(id)}</h4>`);
        continue;
      }

      // Первое « — » отделяет дату от описания визита.
      const at = token.text.indexOf(" — ");
      const date = at === -1 ? token.text : token.text.slice(0, at);
      const rest = at === -1 ? "" : token.text.slice(at + 3);

      out.push(`<div class="entry" id="${id}">`);
      out.push(
        `<h4 class="entry__head"><span class="entry__date">${inline(date)}</span>` +
          (rest ? `<span class="entry__title">${inline(rest)}</span>` : "") +
          `${anchor(id)}</h4>`
      );
      openEntry = true;
      continue;
    }

    if (token.type === "table") {
      let html = render(token);

      // Таблица-карточка «ключ → значение» задана без заголовков — пустую шапку убираем.
      if (token.header.every((cell) => !cell.text.trim())) {
        html = html.replace(/<thead>[\s\S]*?<\/thead>\s*/, "");
      }

      const cols = (html.match(/<th[\s>]/g) || []).length || token.header.length;
      out.push(
        `<div class="table-wrap"${cols >= 4 ? " data-wide" : ""} tabindex="0" role="group">${html}</div>`
      );
      continue;
    }

    // Дисклеймер о том, что документ не заменяет врача, — выносим во врезку.
    if (token.type === "paragraph" && /не заменяет осмотр|nie zastępuje badania|does not replace/.test(token.text)) {
      out.push(`<div class="notice">${render(token)}</div>`);
      continue;
    }

    out.push(render(token));
  }

  closeAll();

  return { page, title, lede, meta, heroImage, heroImageAlt, toc, body: out.join("\n") };
}

/* -------------------------------------------------------------------------
   Сборка страницы
   ------------------------------------------------------------------------- */

function renderPage(doc, docs) {
  const { page, title, lede, meta, heroImage, heroImageAlt, toc } = doc;
  const t = UI[page.lang];

  const tocHtml = toc
    .map((s) => {
      const kids = s.children.length
        ? `<ol class="toc__sublist">${s.children
            .map((c) => `<li><a href="#${c.id}">${escape(c.text)}</a></li>`)
            .join("")}</ol>`
        : "";
      return (
        `<li><a href="#${s.id}"><span class="num">${s.num}</span>` +
        `<span>${escape(s.text)}</span></a>${kids}</li>`
      );
    })
    .join("\n");

  // Переключатель документов: ссылки ведут на соседние страницы, поэтому
  // подсветка активного пункта оглавления (она работает по якорям) их не трогает.
  // Из группы переводов в оглавлении виден только вариант на языке страницы;
  // документы, существующие лишь по-русски, на других языках помечены «(RU)».
  const pagesHtml = docs
    .filter((d) => !d.page.group || d.page.lang === page.lang)
    .map((d) => {
      const current = d.page.out === page.out;
      const suffix = d.page.lang !== page.lang ? t.ruOnly : "";
      return (
        `<li><a href="${d.page.out}"${current ? ' class="is-current" aria-current="page"' : ""}>` +
        `${escape(((d.page.navIn || {})[page.lang] || d.page.nav) + suffix)}</a></li>`
      );
    })
    .join("\n");

  const langHtml = page.group
    ? `<nav class="lang" aria-label="${t.language}">${docs
        .filter((d) => d.page.group === page.group)
        .map((d) =>
          `<a href="${d.page.out}" hreflang="${d.page.lang}" lang="${d.page.lang}"` +
          `${d.page.out === page.out ? ' class="is-current" aria-current="page"' : ""}>` +
          `${d.page.lang.toUpperCase()}</a>`
        )
        .join("")}</nav>`
    : "";

  const owner = (meta.find((m) => /владелец|właściciel|owner/i.test(m.label)) || {}).value || "Karina Grakova";
  const ownerName = owner.split(",")[0].trim();
  const heroProfile = [
    [t.name, t.nameValue],
    [t.age, t.ageValue],
    [t.born, "25.08.2014"],
    [t.chip, "968000011873589"],
    [t.owner, ownerName],
  ];
  const heroProfileHtml = page.profile
    ? `<dl class="hero__profile">
${heroProfile
  .map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`)
  .join("\n")}
            </dl>`
    : "";

  const heroImageHtml = heroImage
    ? `<figure class="hero__portrait">
          <img src="${heroImage}" alt="${escape(heroImageAlt)}">
          <figcaption>${t.caption}</figcaption>
        </figure>`
    : "";

  const period = (meta.find((m) => /период|данные|dane|data/i.test(m.label)) || {}).value || "";

  return `<!doctype html>
<html lang="${page.lang}" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} — ${escape(lede.toLowerCase())}</title>
<meta name="description" content="${escape(lede)}. ${escape(period)}.">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%90%88%3C/text%3E%3C/svg%3E">
<style>
${css}
</style>
</head>
<body${page.compact ? ' class="page--compact"' : ""}>
<div id="progress" role="presentation"></div>
<div class="scrim" id="scrim"></div>

<div class="controls">
  <button class="btn" id="menu-btn" aria-label="${t.toc}" aria-expanded="false" aria-controls="toc">
    <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
  </button>
  <button class="btn" id="theme-btn" aria-label="${t.theme}">
    <svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
  </button>
  <button class="btn" id="top-btn" aria-label="${t.top}">
    <svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
  </button>
</div>

<div class="layout">
  <nav class="toc" id="toc" aria-label="${t.toc}">
    <p class="toc__brand">${escape(title.split(" ")[0])} <span>medical file</span></p>
    <p class="toc__sub">${escape(period)}</p>
    <p class="toc__label">${t.docs}</p>
    <ul class="toc__pages">
${pagesHtml}
    </ul>
    <p class="toc__label">${t.sections}</p>
    <ol>
${tocHtml}
    </ol>
  </nav>

  <main class="main">
    <div class="wrap">
      <header class="hero">
        <div class="hero__intro">
          ${heroImageHtml}
          <div class="hero__copy">
            <p class="hero__eyebrow">${t.eyebrow}</p>
            ${langHtml}
            <h1>${inline(title)}</h1>
            ${heroProfileHtml}
          </div>
        </div>
        <hr class="hero__divider">
        <p class="hero__lede">${inline(lede)}</p>
      </header>

${doc.body}
    </div>
  </main>
</div>

<script>
${js}
</script>
</body>
</html>
`;
}

/* -------------------------------------------------------------------------
   Запуск
   ------------------------------------------------------------------------- */

const docs = PAGES.map(buildPage);

for (const doc of docs) {
  const html = renderPage(doc, docs);
  fs.writeFileSync(path.join(ROOT, doc.page.out), html, "utf8");

  console.log(
    `${doc.page.out} — ${(Buffer.byteLength(html) / 1024).toFixed(0)} КБ, ` +
      `${doc.toc.length} разделов, ${(html.match(/class="entry"/g) || []).length} записей хронологии`
  );
}
