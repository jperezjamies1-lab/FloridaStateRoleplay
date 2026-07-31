(function () {
  const escape = (value) => window.FSRP_UTILS?.escapeHTML?.(value) || String(value ?? "");

  function render() {
    const site = FSRP_STORE.get();
    document.documentElement.style.setProperty("--cyan", site.theme?.cyan || "#63cfff");
    document.documentElement.style.setProperty("--gold", site.theme?.gold || "#ffd467");

    const title = document.getElementById("hero-title");
    if (title) title.innerHTML = `${escape(site.hero.title1)}<span class="title-accent">${escape(site.hero.title2)}</span>`;
    const subtitle = document.getElementById("hero-subtitle");
    if (subtitle) subtitle.textContent = site.hero.subtitle || "";
    const primary = document.getElementById("hero-primary");
    if (primary) {
      primary.textContent = site.hero.primaryLabel || "Join Florida State Roleplay";
      primary.href = site.hero.primaryUrl || site.links.discord;
    }
    document.querySelectorAll("[data-link]").forEach((link) => {
      const url = site.links?.[link.dataset.link];
      if (url) link.href = url;
    });

    const notice = document.getElementById("site-notice");
    if (notice) notice.style.display = site.notice?.enabled ? "block" : "none";
    const noticeLabel = document.getElementById("notice-label");
    const noticeText = document.getElementById("notice-text");
    if (noticeLabel) noticeLabel.textContent = site.notice?.label || "Update";
    if (noticeText) noticeText.textContent = site.notice?.text || "";

    renderDepartments(document.getElementById("home-departments"), site, "all");
    renderDepartments(document.getElementById("departments-grid"), site, document.querySelector("[data-dept-filter].is-active")?.dataset.deptFilter || "all");

    const systems = document.getElementById("systems-grid");
    if (systems) systems.innerHTML = (site.systems || []).map((item) => `<article class="system-card"><span class="eyebrow">FSRP System</span><h3>${escape(item.title)}</h3><p>${escape(item.description)}</p></article>`).join("");
    const steps = document.getElementById("join-steps");
    if (steps) steps.innerHTML = (site.joinSteps || []).map((item, index) => `<article class="value-item"><b>0${index + 1}</b><div><h3>${escape(item.title)}</h3><p>${escape(item.description)}</p></div></article>`).join("");
    const faq = document.getElementById("faq-list");
    if (faq) faq.innerHTML = (site.faqs || []).map((item, index) => `<article class="faq-item"><button class="faq-question" data-faq="${index}">${escape(item.question)}<span>+</span></button><div class="faq-answer" hidden>${escape(item.answer)}</div></article>`).join("");
    const support = document.getElementById("support-grid");
    if (support) support.innerHTML = (site.support || []).map((item) => `<article class="support-card"><span class="eyebrow">Support</span><h3>${escape(item.title)}</h3><p>${escape(item.description)}</p><a class="btn btn-secondary btn-small" href="${escape(item.url)}" target="_blank" rel="noopener">Open Support</a></article>`).join("");

    renderAnnouncements(site);
    renderEvents(site);
    renderTimeline(site);
    renderGallery(site);
    renderRules(site);
    renderScene(site);
    renderMaintenance(site);
  }

  function renderDepartments(root, site, filter) {
    if (!root) return;
    root.innerHTML = (site.departments || [])
      .filter((department) => filter === "all" || department.category === filter)
      .map((department) => `<article class="dept-card" style="--dept-color:${escape(department.color)}"><div class="dept-code">${escape(department.short)}</div><span class="badge ${department.status === "Open" ? "is-live" : ""}">${escape(department.status)}</span><h3>${escape(department.name)}</h3><p>${escape(department.description)}</p><a class="btn btn-secondary btn-small" href="${escape(site.links.discord)}" target="_blank" rel="noopener">View in Discord</a></article>`)
      .join("");
  }

  function renderAnnouncements(site) {
    const root = document.getElementById("announcement-grid");
    if (root) root.innerHTML = (site.announcements || []).map((item) => `<article class="bento-card span-4"><span class="eyebrow">${escape(item.category || "Announcement")}</span><h3>${escape(item.title)}</h3><p>${escape(item.body)}</p><small>${escape(item.date || "")}</small></article>`).join("");
    const featured = (site.announcements || []).find((item) => item.featured) || (site.announcements || [])[0];
    if (featured) {
      document.getElementById("featured-announcement-title").textContent = featured.title;
      document.getElementById("featured-announcement-body").textContent = featured.body;
      document.getElementById("featured-announcement-date").textContent = featured.date || "";
    }
  }

  function renderEvents(site) {
    const root = document.getElementById("events-rail");
    if (root) root.innerHTML = (site.events || []).map((item) => `<article class="event-card"><span class="eyebrow">Event</span><h3>${escape(item.title)}</h3><p>${escape(item.description)}</p><strong>${escape(item.date)}</strong></article>`).join("") || '<p class="muted">No event is currently scheduled.</p>';
    const next = (site.events || [])[0];
    document.getElementById("next-event-title").textContent = next?.title || "No event scheduled";
    document.getElementById("next-event-description").textContent = next?.description || "Leadership can publish the next SSU, training, meeting, or community event from the Manager panel.";
    document.getElementById("next-event-date").textContent = next?.date || "Awaiting schedule";
    document.getElementById("next-event-short").textContent = next?.title || "Not scheduled";
  }

  function renderTimeline(site) {
    const root = document.getElementById("community-timeline");
    if (root) root.innerHTML = (site.timeline || []).map((item) => `<article class="timeline-item"><span class="eyebrow">${escape(item.date)}</span><h3>${escape(item.title)}</h3><p>${escape(item.description)}</p></article>`).join("");
  }

  function renderGallery(site) {
    const root = document.getElementById("media-gallery");
    if (!root) return;
    root.innerHTML = (site.gallery || []).map((item) => `<article class="media-item">${item.type === "video" ? `<video controls preload="metadata" src="${escape(item.url)}"></video>` : `<img loading="lazy" src="${escape(item.url)}" alt="${escape(item.title)}">`}<h3>${escape(item.title)}</h3></article>`).join("") || '<p class="muted">No public media has been published.</p>';
  }

  function renderRules(site) {
    const navigation = document.getElementById("rule-nav");
    const root = document.getElementById("rule-content");
    if (!navigation || !root) return;
    navigation.innerHTML = (site.rules || []).map((item, index) => `<button class="${index === 0 ? "is-active" : ""}" data-rule="${index}">${escape(item.title)}</button>`).join("");
    const show = (index) => {
      const rule = site.rules?.[index];
      if (!rule) return;
      root.innerHTML = `<article class="panel rule-category"><span class="eyebrow">Official Rules</span><h2>${escape(rule.title)}</h2><ol>${(rule.items || []).map((item) => `<li>${escape(item)}</li>`).join("")}</ol></article>`;
    };
    show(0);
    navigation.onclick = (event) => {
      const button = event.target.closest("[data-rule]");
      if (!button) return;
      navigation.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
      show(Number(button.dataset.rule));
    };
  }

  function renderScene(site) {
    const anchor = document.querySelector("#page-home .section-block.compact .container");
    if (!anchor) return;
    let section = document.getElementById("scene-week");
    if (!section) {
      section = document.createElement("article");
      section.id = "scene-week";
      section.className = "panel scene-week glass-card";
      anchor.append(section);
    }
    const scene = site.sceneOfWeek || {};
    section.innerHTML = `<div class="scene-week-media">${scene.imageUrl ? `<img src="${escape(scene.imageUrl)}" alt="${escape(scene.title)}">` : "ER:LC"}</div><div class="scene-week-copy"><span class="eyebrow">Community Feature</span><h3>${escape(scene.title)}</h3><p>${escape(scene.description)}</p><span class="badge">${escape(scene.date)}</span></div>`;
  }

  function renderMaintenance(site) {
    const maintenance = document.getElementById("maintenance-screen");
    if (!maintenance) return;
    const bypass = sessionStorage.getItem("fsrpMaintenanceBypass") === "1" || location.hash === "#manager";
    maintenance.hidden = !site.maintenance?.enabled || bypass;
    document.getElementById("maintenance-title").textContent = site.maintenance?.title || "Community Hub maintenance";
    document.getElementById("maintenance-message").textContent = site.maintenance?.message || "Florida State Roleplay is applying an official website update.";
    const musicButtons = maintenance.querySelectorAll("[data-waiting-music]");
    musicButtons.forEach((button) => { button.hidden = site.maintenance?.musicEnabled === false; });
    document.dispatchEvent(new CustomEvent("fsrp:maintenance", { detail: { visible: !maintenance.hidden } }));
  }

  function setCloudHealth(ok) {
    const degraded = document.getElementById("service-degraded");
    if (!degraded) return;
    degraded.hidden = ok;
    if (!ok) degraded.querySelector("[data-service-message]").textContent = navigator.onLine ? "Cloud updates are reconnecting. The public website is still available." : "Your device is offline. Cached website content is still available.";
  }

  document.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-dept-filter]");
    if (filter) {
      document.querySelectorAll("[data-dept-filter]").forEach((item) => item.classList.toggle("is-active", item === filter));
      render();
    }
    const question = event.target.closest("[data-faq]");
    if (question) question.nextElementSibling.hidden = !question.nextElementSibling.hidden;
    const tab = event.target.closest("[data-community-tab]");
    if (tab) {
      document.querySelectorAll("[data-community-tab]").forEach((item) => item.classList.toggle("is-active", item === tab));
      document.querySelectorAll("[data-community-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.communityPanel !== tab.dataset.communityTab;
        panel.classList.toggle("is-active", !panel.hidden);
      });
    }
    const jump = event.target.closest("[data-community-tab-jump]");
    if (jump) document.querySelector(`[data-community-tab="${jump.dataset.communityTabJump}"]`)?.click();
    if (event.target.closest("#mobile-toggle")) document.getElementById("mobile-drawer").classList.toggle("is-open");
    if (event.target.closest("#explore-trigger")) event.target.closest(".nav-menu").classList.toggle("is-open");
    if (event.target.closest("[data-scroll-top]")) window.scrollTo({ top: 0, behavior: "smooth" });
    if (event.target.closest("[data-retry-services]")) window.location.reload();
  });

  document.addEventListener("fsrp:state", render);
  document.addEventListener("fsrp:cloud", (event) => setCloudHealth(Boolean(event.detail?.ok)));
  window.addEventListener("offline", () => {
    const degraded = document.getElementById("service-degraded");
    if (degraded) {
      degraded.hidden = false;
      degraded.querySelector("[data-service-message]").textContent = "Your device is offline. Cached website content is still available.";
    }
  });
  window.addEventListener("online", () => FSRP_STORE.loadCloud());

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("footer-year").textContent = new Date().getFullYear();
    render();
    window.setTimeout(() => document.getElementById("app-loader")?.classList.add("is-hidden"), 140);
    const readyTimeout = window.setTimeout(() => document.dispatchEvent(new Event("fsrp:ready")), 900);
    FSRP_STORE.loadCloud().finally(() => {
      window.clearTimeout(readyTimeout);
      render();
      document.dispatchEvent(new Event("fsrp:ready"));
    });
  });
})();
