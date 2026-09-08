(function () {
  "use strict";

  var root = document.documentElement;
  var STORE = "varia-theme";

  /* --- Тема --------------------------------------------------------- */

  function apply(theme) {
    if (theme === "dark" || theme === "light") root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
  }

  function current() {
    var saved = null;
    try { saved = localStorage.getItem(STORE); } catch (e) {}
    if (saved) return saved;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  apply(current());

  var themeBtn = document.getElementById("theme-btn");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      apply(next);
      try { localStorage.setItem(STORE, next); } catch (e) {}
      themeBtn.setAttribute("aria-label", next === "dark" ? "Светлая тема" : "Тёмная тема");
    });
  }

  /* --- Мобильное меню ----------------------------------------------- */

  var toc = document.getElementById("toc");
  var scrim = document.getElementById("scrim");
  var menuBtn = document.getElementById("menu-btn");

  function setMenu(open) {
    if (!toc || !scrim) return;
    toc.classList.toggle("is-open", open);
    scrim.classList.toggle("is-open", open);
    if (menuBtn) menuBtn.setAttribute("aria-expanded", String(open));
  }

  if (menuBtn) menuBtn.addEventListener("click", function () { setMenu(!toc.classList.contains("is-open")); });
  if (scrim) scrim.addEventListener("click", function () { setMenu(false); });
  if (toc) toc.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

  /* --- Прогресс чтения ---------------------------------------------- */

  var bar = document.getElementById("progress");
  var links = Array.prototype.slice.call(document.querySelectorAll(".toc a[href^='#']"));
  var targets = links
    .map(function (a) { return document.getElementById(decodeURIComponent(a.hash.slice(1))); })
    .filter(Boolean);
  var activeLink = null;
  var ticking = false;

  function update() {
    ticking = false;

    if (bar) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (max > 0 ? Math.min(1, window.scrollY / max) * 100 : 0) + "%";
    }

    // Активный пункт оглавления — последний заголовок выше линии чтения.
    var line = window.scrollY + window.innerHeight * 0.28;
    var found = null;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].getBoundingClientRect().top + window.scrollY <= line) found = links[i];
      else break;
    }
    if (!found && links.length) found = links[0];

    if (found !== activeLink) {
      if (activeLink) activeLink.classList.remove("is-active");
      if (found) {
        found.classList.add("is-active");
        if (toc && window.innerWidth > 1000) {
          var box = found.getBoundingClientRect();
          var view = toc.getBoundingClientRect();
          if (box.top < view.top + 40 || box.bottom > view.bottom - 40) {
            found.scrollIntoView({ block: "center" });
          }
        }
      }
      activeLink = found;
    }
  }

  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();

  /* --- Наверх -------------------------------------------------------- */

  var topBtn = document.getElementById("top-btn");
  if (topBtn) {
    topBtn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
})();
