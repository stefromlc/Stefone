/*
  stefone.com — tiny portfolio engine (no build tools, no frameworks)

  ✅ Edit `projects.json` to add/remove projects.
  ✅ Each project page lives at `/<slug>/index.html`

  This script supports BOTH:
  - Hosting online (normal) ✅
  - Previewing locally ✅ (best with the included start-local.bat)
*/

(function(){
  function getSiteRoot(){
    const meta = document.querySelector('meta[name="site-root"]');
    let root = (meta && meta.content ? meta.content.trim() : "./");
    if (!root) root = "./";
    if (!root.endsWith("/")) root += "/";
    return root;
  }

  const SITE_ROOT = getSiteRoot(); // "./" on home, "../" on /projects/
  const PLACEHOLDER_THUMB = SITE_ROOT + "assets/thumbs/placeholder.svg";

  function isExternal(url){
    return /^https?:\/\//i.test(url);
  }

  function normalizeProject(p){
    return {
      title: String(p.title || "").trim(),
      slug: String(p.slug || "").trim(),
      description: String(p.description || "").trim(),
      thumbnail: String(p.thumbnail || "").trim(),
      tags: Array.isArray(p.tags) ? p.tags.map(t => String(t).trim()).filter(Boolean) : [],
      category: String(p.category || "Other").trim() || "Other",
      featured: !!p.featured,
      date: String(p.date || "").trim(),
      link: p.link ? String(p.link).trim() : ""
    };
  }

  function resolveAssetPath(path){
    if (!path) return PLACEHOLDER_THUMB;
    if (isExternal(path) || path.startsWith("data:")) return path;
    // allow either "assets/..." or "/assets/..."
    const clean = path.replace(/^\//, "");
    return SITE_ROOT + clean;
  }

  function projectsJsonUrl(){
    return SITE_ROOT + "projects.json";
  }

  async function loadProjects() {
    const res = await fetch(projectsJsonUrl(), { cache: "no-store" });
    if (!res.ok) throw new Error("Couldn't load projects.json");
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map(normalizeProject).filter(p => p.title && p.slug);
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).filter(Boolean).forEach(ch => {
      if (typeof ch === "string") node.appendChild(document.createTextNode(ch));
      else node.appendChild(ch);
    });
    return node;
  }

  function projectHref(p){
    if (p.link && isExternal(p.link)) return p.link;
    return SITE_ROOT + encodeURIComponent(p.slug) + "/";
  }

  function projectCard(p) {
    const href = projectHref(p);

    const img = el("img", {
      src: resolveAssetPath(p.thumbnail),
      alt: `${p.title} thumbnail`,
      loading: "lazy"
    });
    img.addEventListener("error", () => {
      img.src = PLACEHOLDER_THUMB;
    });

    const card = el("a", {
      class: "card project",
      href,
      "aria-label": `View project ${p.title}`
    }, [
      el("div", { class: "thumb" }, img),
      el("div", { class: "project-body" }, [
        el("div", { class: "project-title" }, [
          el("strong", {}, p.title),
          el("span", { class: "cat" }, p.category)
        ]),
        el("p", { class: "project-desc" }, p.description),
        el("div", { class: "tags" }, (p.tags || []).slice(0, 6).map(t => el("span", { class: "tag" }, t)))
      ])
    ]);

    if (isExternal(href)) {
      card.setAttribute("target", "_blank");
      card.setAttribute("rel", "noreferrer");
    }
    return card;
  }

  function uniqueSorted(arr){
    return [...new Set(arr.filter(Boolean))].sort((a,b) => a.localeCompare(b));
  }

  function normalizeText(s){
    return String(s || "").toLowerCase();
  }

  function matches(project, query){
    const q = normalizeText(query).trim();
    if (!q) return true;
    const hay = [
      project.title,
      project.description,
      project.category,
      ...(project.tags || [])
    ].map(normalizeText).join(" ");
    return hay.includes(q);
  }

  function renderProjectsList({ rootId = "projectsRoot" } = {}){
    const root = document.getElementById(rootId);
    if (!root) return;

    const searchInput = document.getElementById("searchInput");
    const categorySelect = document.getElementById("categorySelect");
    const tagsWrap = document.getElementById("tagsWrap");
    const clearBtn = document.getElementById("clearBtn");
    const countEl = document.getElementById("countEl");

    let allProjects = [];
    let activeTag = "All";

    function applyFilters(){
      const q = searchInput ? searchInput.value : "";
      const cat = categorySelect ? categorySelect.value : "All";
      const filtered = allProjects.filter(p => {
        const catOk = (cat === "All") || (p.category === cat);
        const tagOk = (activeTag === "All") || (p.tags || []).includes(activeTag);
        return catOk && tagOk && matches(p, q);
      });

      root.innerHTML = "";
      filtered.forEach(p => root.appendChild(projectCard(p)));

      if (countEl) countEl.textContent = `${filtered.length} / ${allProjects.length}`;
    }

    function setActiveTag(tag){
      activeTag = tag;
      if (!tagsWrap) return;
      [...tagsWrap.querySelectorAll("button")].forEach(b => {
        b.dataset.active = (b.dataset.tag === tag) ? "true" : "false";
        b.style.borderColor = b.dataset.active === "true" ? "rgba(110,231,255,.35)" : "var(--border)";
        b.style.background = b.dataset.active === "true" ? "rgba(110,231,255,.10)" : "rgba(255,255,255,.04)";
      });
      applyFilters();
    }

    loadProjects().then(projects => {
      allProjects = [...projects].sort((a,b) => {
        if (a.date && b.date) return b.date.localeCompare(a.date);
        if (a.date) return -1;
        if (b.date) return 1;
        return a.title.localeCompare(b.title);
      });

      const categories = uniqueSorted(allProjects.map(p => p.category));
      if (categorySelect) {
        categorySelect.innerHTML = "";
        categorySelect.appendChild(el("option", { value: "All" }, "All categories"));
        categories.forEach(c => categorySelect.appendChild(el("option", { value: c }, c)));
      }

      const tags = uniqueSorted(allProjects.flatMap(p => p.tags || []));
      if (tagsWrap) {
        tagsWrap.innerHTML = "";
        const mkBtn = (tag) => {
          const b = el("button", { class: "btn", type: "button", "data-tag": tag }, tag);
          b.addEventListener("click", () => setActiveTag(tag));
          return b;
        };
        tagsWrap.appendChild(mkBtn("All"));
        tags.forEach(t => tagsWrap.appendChild(mkBtn(t)));
        setActiveTag("All");
      }

      if (searchInput) searchInput.addEventListener("input", applyFilters);
      if (categorySelect) categorySelect.addEventListener("change", applyFilters);
      if (clearBtn) clearBtn.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (categorySelect) categorySelect.value = "All";
        setActiveTag("All");
        applyFilters();
      });

      applyFilters();
    }).catch(err => {
      root.innerHTML = "";
      root.appendChild(el("div", { class: "notice" }, [
        "Projects couldn’t load. If you’re previewing by double-clicking the HTML files, use ",
        el("strong", {}, "start-local.bat"),
        " in this folder, then open ",
        el("strong", {}, "http://localhost:8000"),
        " in your browser. ",
        el("div", { style: "margin-top:10px; color: rgba(233,236,241,.9)" }, `Error: ${err.message}`)
      ]));
    });
  }

  function renderFeatured({ rootId = "featuredRoot", limit = 6 } = {}){
    const root = document.getElementById(rootId);
    if (!root) return;

    loadProjects().then(projects => {
      const featured = projects.filter(p => p.featured).slice(0, limit);
      const list = (featured.length ? featured : projects.slice(0, limit));
      root.innerHTML = "";
      list.forEach(p => root.appendChild(projectCard(p)));
    }).catch(() => {});
  }

  window.StefoneSite = {
    loadProjects,
    renderProjectsList,
    renderFeatured
  };
})();

