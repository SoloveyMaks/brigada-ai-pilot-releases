/*
 * Лендинг пилота: переключение языка, метаданные, заявка.
 *
 * Никакой отправки на сервер здесь нет. Заявка собирается в браузере:
 * копируется, скачивается или открывается в почте/Telegram, если организатор
 * подключил контакт в config.js.
 */
(function () {
  "use strict";

  var SUPPORTED = ["ru", "be", "en"];
  var DEFAULT_LANG = "ru";
  var STORAGE_KEY = "brigada.pilot.lang";
  var dict = window.BRIGADA_I18N || { ru: {} };
  var config = window.PILOT_CONFIG || {};
  var current = DEFAULT_LANG;
  var statusTimer = null;

  function isLang(value) {
    return SUPPORTED.indexOf(value) !== -1;
  }

  function getLangFromHash() {
    var hash = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
    if (!hash) return null;
    if (hash.indexOf("lang=") === 0) {
      var value = hash.slice(5);
      return isLang(value) ? value : null;
    }
    return isLang(hash) ? hash : null;
  }

  function getLangFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      var queryLang = String(params.get("lang") || "").toLowerCase();
      if (isLang(queryLang)) return queryLang;
    } catch (error) {
      /* Старый браузер без URLSearchParams — ниже попробуем hash. */
    }
    return getLangFromHash();
  }

  function getStoredLang() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return isLang(value) ? value : null;
    } catch (error) {
      return null;
    }
  }

  function getBrowserLang() {
    var list = navigator.languages || [navigator.language || ""];
    for (var i = 0; i < list.length; i += 1) {
      var code = String(list[i] || "").toLowerCase();
      if (code.indexOf("be") === 0) return "be";
      if (code.indexOf("en") === 0) return "en";
      if (code.indexOf("ru") === 0) return "ru";
    }
    return null;
  }

  function detectLang() {
    return getLangFromUrl() || getStoredLang() || getBrowserLang() || DEFAULT_LANG;
  }

  function t(key, vars) {
    var pack = dict[current] || {};
    var value = pack[key];
    if (typeof value !== "string") {
      value = (dict[DEFAULT_LANG] || {})[key];
    }
    if (typeof value !== "string") return key;
    if (vars) {
      value = value.replace(/\{(\w+)\}/g, function (_, name) {
        return vars[name] != null ? String(vars[name]) : "";
      });
    }
    return value;
  }

  function setMeta(id, content) {
    var el = document.getElementById(id);
    if (el) el.setAttribute("content", content);
  }

  function isLangHash(hash) {
    var value = String(hash || "").replace(/^#/, "").toLowerCase();
    if (value.indexOf("lang=") === 0) return isLang(value.slice(5));
    return isLang(value);
  }

  function updateUrl(lang) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set("lang", lang);
      if (isLangHash(url.hash)) url.hash = "";
      window.history.replaceState(null, "", url.toString());
    } catch (error) {
      /* file:// или старый браузер: язык всё равно уже применён. */
    }
  }

  function applyTranslations() {
    document.documentElement.lang = current;
    document.documentElement.setAttribute("data-lang", current);
    document.title = t("meta.title");

    setMeta("meta-description", t("meta.description"));
    setMeta("og-title", t("meta.title"));
    setMeta("og-description", t("meta.description"));
    setMeta("og-locale", current === "be" ? "be_BY" : current === "en" ? "en_US" : "ru_RU");

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });

    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });

    document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
      el.setAttribute("alt", t(el.getAttribute("data-i18n-alt")));
    });

    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });

    document.querySelectorAll("button[data-lang]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-lang") === current));
    });

    renderContact();
    renderSendActions();
    updatePreview();
  }

  function normalizeEmail(value) {
    var email = String(value || "").trim();
    if (!email || email.length > 254) return null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }

  function normalizeTelegram(value) {
    var raw = String(value || "").trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) {
      try {
        var url = new URL(raw);
        if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
      } catch (error) {
        return null;
      }
      return null;
    }
    var handle = raw.replace(/^@/, "");
    if (!/^[A-Za-z0-9_]{3,32}$/.test(handle)) return null;
    return "https://t.me/" + handle;
  }

  function normalizeHttpUrl(value) {
    var raw = String(value || "").trim();
    if (!raw) return null;
    try {
      var url = new URL(raw, window.location.href);
      if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
    } catch (error) {
      return null;
    }
    return null;
  }

  function makeLink(href, text, className, external) {
    var link = document.createElement("a");
    link.href = href;
    link.textContent = text;
    link.className = className;
    if (external) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    return link;
  }

  function renderContact() {
    var actions = document.getElementById("contact-actions");
    var fallback = document.getElementById("contact-fallback");
    var nameEl = document.getElementById("organizer-name");
    if (!actions) return;

    var email = normalizeEmail(config.email);
    var telegram = normalizeTelegram(config.telegram);
    var apk = normalizeHttpUrl(config.apkUrl);
    var name = String(config.organizerName || "").trim();

    actions.textContent = "";
    if (nameEl) {
      nameEl.textContent = name;
      nameEl.hidden = !name;
    }

    if (email) {
      actions.appendChild(makeLink("mailto:" + email, t("cta.emailCta"), "btn btn-primary"));
    }
    if (telegram) {
      actions.appendChild(makeLink(telegram, t("cta.telegramCta"), "btn btn-secondary", true));
    }
    if (apk) {
      actions.appendChild(makeLink(apk, t("cta.apkCta"), "btn btn-secondary", true));
      var note = document.createElement("p");
      note.className = "contact-note";
      note.textContent = t("cta.apkNote");
      actions.appendChild(note);
    }
    if (fallback) fallback.hidden = Boolean(email || telegram);
  }

  function renderSendActions() {
    var container = document.getElementById("send-actions");
    if (!container) return;

    var email = normalizeEmail(config.email);
    var telegram = normalizeTelegram(config.telegram);
    container.textContent = "";

    if (email) {
      var emailButton = document.createElement("button");
      emailButton.type = "button";
      emailButton.className = "btn btn-secondary";
      emailButton.textContent = t("form.sendEmail");
      emailButton.addEventListener("click", function () {
        var subject = encodeURIComponent(t("form.emailSubject"));
        var body = encodeURIComponent(buildApplication());
        window.location.href = "mailto:" + email + "?subject=" + subject + "&body=" + body;
      });
      container.appendChild(emailButton);
    }

    if (telegram) {
      var telegramButton = document.createElement("button");
      telegramButton.type = "button";
      telegramButton.className = "btn btn-secondary";
      telegramButton.textContent = t("form.sendTelegram");
      telegramButton.addEventListener("click", function () {
        var text = encodeURIComponent(buildApplication());
        var separator = telegram.indexOf("?") === -1 ? "?" : "&";
        window.open(telegram + separator + "text=" + text, "_blank", "noopener,noreferrer");
      });
      container.appendChild(telegramButton);
    }
  }

  function fieldValue(id) {
    var el = document.getElementById(id);
    var value = el ? String(el.value || "").trim() : "";
    return value || t("form.empty");
  }

  function buildApplication() {
    return t("form.template", {
      name: fieldValue("app-name"),
      city: fieldValue("app-city"),
      crew: fieldValue("app-crew"),
      object: fieldValue("app-object"),
      contact: fieldValue("app-contact")
    });
  }

  function updatePreview() {
    var preview = document.getElementById("request-preview");
    if (preview) preview.textContent = buildApplication();
  }

  function showStatus(key, isError) {
    var el = document.getElementById("form-status");
    if (!el) return;
    el.textContent = t(key);
    el.classList.toggle("is-error", Boolean(isError));
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(function () {
      el.textContent = "";
      el.classList.remove("is-error");
    }, 5000);
  }

  function clearStatus() {
    var el = document.getElementById("form-status");
    if (!el) return;
    el.textContent = "";
    el.classList.remove("is-error");
    window.clearTimeout(statusTimer);
  }

  function copyApplication() {
    var text = buildApplication();
    var copied = false;

    function fallbackCopy() {
      try {
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.top = "-1000px";
        area.style.left = "-1000px";
        document.body.appendChild(area);
        area.focus();
        area.select();
        area.setSelectionRange(0, area.value.length);
        copied = document.execCommand("copy");
        document.body.removeChild(area);
      } catch (error) {
        copied = false;
      }
      showStatus(copied ? "form.statusCopied" : "form.statusCopyFailed", !copied);
    }

    if (navigator.clipboard && window.isSecureContext) {
      try {
        navigator.clipboard.writeText(text).then(function () {
          showStatus("form.statusCopied", false);
        }).catch(fallbackCopy);
        return;
      } catch (error) {
        /* Некоторые webview кидают синхронно — уходим в textarea. */
      }
    }
    fallbackCopy();
  }

  function downloadApplication() {
    var text = buildApplication();
    var blob = new Blob(["\ufeff" + text], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "brigada-pilot-request-" + current + ".txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    showStatus("form.statusDownloaded", false);
  }

  function setLang(lang, persist) {
    current = isLang(lang) ? lang : DEFAULT_LANG;
    if (persist) {
      try {
        window.localStorage.setItem(STORAGE_KEY, current);
      } catch (error) {
        /* Приватный режим: язык просто не запомнится. */
      }
    }
    clearStatus();
    applyTranslations();
    updateUrl(current);
  }

  function bind() {
    document.querySelectorAll("button[data-lang]").forEach(function (button) {
      button.addEventListener("click", function () {
        var lang = button.getAttribute("data-lang");
        if (isLang(lang)) setLang(lang, true);
      });
    });

    var form = document.getElementById("apply-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
      });
      form.addEventListener("input", updatePreview);
    }

    var copyButton = document.getElementById("copy-request");
    if (copyButton) copyButton.addEventListener("click", copyApplication);

    var downloadButton = document.getElementById("download-request");
    if (downloadButton) downloadButton.addEventListener("click", downloadApplication);

    window.addEventListener("hashchange", function () {
      var lang = getLangFromHash();
      if (lang && lang !== current) setLang(lang, true);
    });
  }

  function init() {
    bind();
    current = detectLang();
    applyTranslations();
    updateUrl(current);

    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
