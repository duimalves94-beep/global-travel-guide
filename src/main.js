import Globe from 'globe.gl';
import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;
const asset = (path) => `${BASE}${path.replace(/^\//, '')}`;

const HOME = { lat: 25, lng: 100, altitude: 1.9 };
const QUICK = ['CN', 'JP', 'FR', 'IT', 'IS', 'EG', 'US', 'NZ'];
const SHORT = { KP: '朝鲜', TF: '法属南极', CYN: '北塞浦路斯' };
const CONTINENT = {
  Asia: '亚洲',
  Europe: '欧洲',
  Africa: '非洲',
  'North America': '北美洲',
  'South America': '南美洲',
  Oceania: '大洋洲',
  Antarctica: '南极洲',
  'Seven seas (open ocean)': '远洋',
};

const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const $ = (id) => document.getElementById(id);

const els = {
  globe: $('globe'),
  chips: $('chips'),
  dockLabel: $('dock-label'),
  panel: $('panel'),
  search: $('q'),
  form: $('search-form'),
  results: $('results'),
  rotate: $('rotate'),
  reset: $('reset'),
  loader: $('loader'),
  loaderTitle: $('loader-title'),
  loaderSub: $('loader-sub'),
  retry: $('retry'),
  live: $('live'),
};

const state = {
  hoverId: null,
  active: null,
  rotating: !motion.matches,
  cursor: -1,
  results: [],
  composing: false,
};

let globe;
let features = [];
let guides = [];
const byIso2 = new Map();
const byIso3 = new Map();
let searchItems = [];
let cloudsMesh = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function norm(value) {
  return String(value ?? '').toLowerCase().replace(/[\s·・,，.。\-—'’]/g, '');
}

function flyMs() {
  return motion.matches ? 0 : 1300;
}

function featureId(feature) {
  const p = feature.properties;
  return p.iso3 || p.iso2 || p.nameEn;
}

function findGuide(feature) {
  const p = feature.properties;
  return byIso2.get(p.iso2) || byIso3.get(p.iso3) || null;
}

function displayName(feature) {
  const guide = findGuide(feature);
  if (guide) return guide.name;
  const code = feature.properties.iso2 || feature.properties.iso3;
  return SHORT[code] || feature.properties.nameZh || feature.properties.nameEn;
}

function continentOf(feature) {
  return CONTINENT[feature.properties.continent] || feature.properties.continent || '';
}

function isActiveFeature(feature) {
  if (!state.active) return false;
  const p = feature.properties;
  return (state.active.iso2 && p.iso2 === state.active.iso2)
    || (state.active.iso3 && p.iso3 === state.active.iso3);
}

function capColor(feature) {
  if (isActiveFeature(feature)) return 'rgba(214, 150, 48, 0.5)';
  if (featureId(feature) === state.hoverId) return 'rgba(255, 210, 130, 0.42)';
  if (findGuide(feature)) return 'rgba(212, 160, 64, 0.2)';
  return 'rgba(255, 255, 255, 0.025)';
}

function strokeColor(feature) {
  if (isActiveFeature(feature) || featureId(feature) === state.hoverId) return 'rgba(255, 244, 220, 0.95)';
  if (findGuide(feature)) return 'rgba(255, 214, 140, 0.9)';
  return 'rgba(255, 255, 255, 0.38)';
}

function capAltitude(feature) {
  if (isActiveFeature(feature)) return 0.014;
  if (featureId(feature) === state.hoverId) return 0.01;
  if (findGuide(feature)) return 0.004;
  return 0.001;
}

function paint() {
  globe
    .polygonCapColor(capColor)
    .polygonStrokeColor(strokeColor)
    .polygonAltitude(capAltitude);
}

function stopRotate() {
  state.rotating = false;
  globe.controls().autoRotate = false;
  syncRotate();
}

function syncRotate() {
  els.rotate.classList.toggle('is-on', state.rotating);
  els.rotate.setAttribute('aria-pressed', String(state.rotating));
  els.rotate.title = state.rotating ? '暂停地球自转' : '开始地球自转';
}

function layout() {
  if (!globe) return;
  globe.width(window.innerWidth);
  globe.height(window.innerHeight);
  const open = document.body.classList.contains('has-panel');
  if (!open) {
    globe.globeOffset([0, 0]);
    return;
  }
  if (window.innerWidth <= 860) {
    const headerBlock = 168;
    const panelTop = window.innerHeight * 0.34;
    const visibleMid = headerBlock + Math.max(0, panelTop - headerBlock) / 2;
    const shift = Math.round(window.innerHeight / 2 - visibleMid);
    globe.globeOffset([0, -shift]);
  } else {
    globe.globeOffset([-210, 0]);
  }
}

function announce(text) {
  els.live.textContent = text;
}

function syncHash() {
  if (!state.active) {
    if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);
    document.title = '全球旅行指南';
    return;
  }
  const parts = [state.active.iso2 || state.active.iso3];
  if (state.active.guide && state.active.cityId) parts.push(state.active.cityId);
  if (state.active.attractionId) parts.push(state.active.attractionId);
  const hash = `#${parts.join('/')}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  document.title = `${state.active.name} · 全球旅行指南`;
}

function currentCity(guide = state.active?.guide) {
  if (!guide) return null;
  return guide.cities.find((city) => city.id === state.active.cityId) || guide.cities[0];
}

function flyTo(coords) {
  const mobile = window.innerWidth <= 860;
  globe.pointOfView({
    lat: coords.lat,
    lng: coords.lng,
    altitude: coords.altitude + (mobile ? 0.28 : 0),
  }, flyMs());
}

function featureCenter(feature) {
  const coords = [];
  const walk = (node) => {
    if (typeof node?.[0] === 'number') coords.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
  };
  walk(feature.geometry?.coordinates);
  if (!coords.length) return null;
  const step = Math.max(1, Math.floor(coords.length / 60));
  let lat = 0;
  let lng = 0;
  let count = 0;
  for (let i = 0; i < coords.length; i += step) {
    lng += coords[i][0];
    lat += coords[i][1];
    count += 1;
  }
  return { lat: lat / count, lng: lng / count, altitude: 1.45 };
}

function markerData() {
  if (!state.active?.guide) {
    return guides.map((guide) => {
      const city = guide.cities[0];
      return {
        kind: 'city',
        name: city.name,
        label: `[ ${city.name} ]`,
        lat: city.lat,
        lng: city.lng,
        guide,
        city,
        showLabel: false,
        active: false,
      };
    });
  }
  const guide = state.active.guide;
  const list = [];
  guide.cities.forEach((city) => {
    const cityActive = city.id === state.active.cityId && !state.active.attractionId;
    list.push({
      kind: 'city',
      name: city.name,
      label: `[ ${city.name} ]`,
      lat: city.lat,
      lng: city.lng,
      guide,
      city,
      showLabel: true,
      active: cityActive,
    });
    if (city.id !== state.active.cityId) return;
    city.attractions.forEach((attraction) => {
      list.push({
        kind: 'attraction',
        name: attraction.name,
        label: attraction.name,
        lat: attraction.lat,
        lng: attraction.lng,
        guide,
        city,
        attraction,
        showLabel: false,
        active: attraction.id === state.active.attractionId,
      });
    });
  });
  return list;
}

function syncMarkers() {
  globe.htmlElementsData(markerData());
}

function syncRings() {
  if (motion.matches) {
    globe.ringsData([]);
    return;
  }
  const guide = state.active?.guide;
  if (!guide) {
    const click = state.active?.click;
    globe.ringsData(click ? [{ lat: click.lat, lng: click.lng }] : []);
    return;
  }
  const city = currentCity(guide);
  const attraction = city?.attractions.find((item) => item.id === state.active.attractionId);
  const point = attraction || city;
  globe.ringsData(point ? [{ lat: point.lat, lng: point.lng }] : []);
}

function highlightChips() {
  document.querySelectorAll('.chip').forEach((button) => {
    const on = state.active?.guide?.iso2 === button.dataset.iso;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
    if (on) button.scrollIntoView({ inline: 'center', block: 'nearest', behavior: motion.matches ? 'auto' : 'smooth' });
  });
}

function guideHtml(active) {
  const guide = active.guide;
  const city = currentCity(guide);
  const sights = city.attractions.map((attraction, index) => `
    <li>
      <button type="button" class="sight ${attraction.id === active.attractionId ? 'is-on' : ''}" data-action="sight" data-city="${esc(city.id)}" data-sight="${esc(attraction.id)}">
        <span class="num">${String(index + 1).padStart(2, '0')}</span>
        <span>
          <strong>${esc(attraction.name)}</strong>
          <em>${esc(attraction.nameEn)}</em>
          <span class="desc">${esc(attraction.desc)}</span>
        </span>
      </button>
    </li>
  `).join('');
  const tabs = guide.cities.map((item) => `
    <button type="button" class="city-tab" role="tab" data-action="city" data-city="${esc(item.id)}" aria-selected="${item.id === city.id}">${esc(item.name)}</button>
  `).join('');
  const tips = guide.tips.map((tip) => `<li>${esc(tip)}</li>`).join('');
  return `
    <div class="panel-head">
      <button type="button" class="close" data-action="close" aria-label="关闭指南">×</button>
      <p class="eyebrow">${esc(guide.continent)} · 建议停留 ${esc(guide.stay)}</p>
      <h2 id="panel-title">${esc(guide.name)}</h2>
      <p class="en">${esc(guide.nameEn)}</p>
      <p class="tagline">${esc(guide.tagline)}</p>
    </div>
    <div class="panel-body">
      <p class="summary">${esc(guide.summary)}</p>
      <dl class="facts">
        <dt>最佳时节</dt><dd>${esc(guide.bestTime)}</dd>
        <dt>建议停留</dt><dd>${esc(guide.stay)}</dd>
      </dl>
      <h3>推荐城市</h3>
      <div class="city-tabs" role="tablist">${tabs}</div>
      <p class="blurb">${esc(city.blurb)}</p>
      ${city.bestTime ? `<p class="city-time">这一站的时节：${esc(city.bestTime)}</p>` : ''}
      <h3>景点</h3>
      <ol class="sights">${sights}</ol>
      <h3>旅行贴士</h3>
      <ul class="tips">${tips}</ul>
      <p class="fine">开放时间、预约和票价会变，出发前再核对官方信息。</p>
    </div>
  `;
}

function soonHtml(active) {
  const same = guides.filter((guide) => guide.continent === active.continent);
  const picks = (same.length ? same : guides).slice(0, 4);
  const links = picks.map((guide) => `
    <button type="button" data-action="open" data-iso="${esc(guide.iso2)}">${esc(guide.name)}</button>
  `).join('');
  const lead = same.length
    ? `${esc(active.name)}的城市、景点和出行贴士还在整理。可以先看看同在${esc(active.continent)}、已经写好的目的地。`
    : `${esc(active.name)}的指南还在整理。可以先从这些已经上线的目的地看起。`;
  return `
    <div class="panel-head">
      <button type="button" class="close" data-action="close" aria-label="关闭">×</button>
      <p class="eyebrow">${esc(active.continent || '世界')}</p>
      <h2 id="panel-title">${esc(active.name)}</h2>
      <p class="en">${esc(active.nameEn || '')}</p>
    </div>
    <div class="panel-body soon">
      <p class="soon-mark">指南即将上线</p>
      <p>${lead}</p>
      <div class="soon-links">${links}</div>
    </div>
  `;
}

function renderPanel({ keepScroll = false } = {}) {
  const previous = els.panel.querySelector('.panel-body');
  const top = keepScroll ? previous?.scrollTop || 0 : 0;
  els.panel.innerHTML = state.active.guide ? guideHtml(state.active) : soonHtml(state.active);
  els.panel.classList.add('open');
  els.panel.inert = false;
  els.panel.setAttribute('aria-hidden', 'false');
  const body = els.panel.querySelector('.panel-body');
  if (body) body.scrollTop = top;
}

function openGuide(guide, { cityId, attractionId, fly = 'country' } = {}) {
  const city = guide.cities.find((item) => item.id === cityId) || guide.cities[0];
  const attraction = city.attractions.find((item) => item.id === attractionId) || null;
  const previous = state.active;
  const keep = previous?.guide?.iso2 === guide.iso2 && previous?.cityId === city.id;
  state.active = {
    iso2: guide.iso2,
    iso3: guide.iso3,
    guide,
    cityId: city.id,
    attractionId: attraction?.id || null,
    name: guide.name,
    nameEn: guide.nameEn,
    continent: guide.continent,
  };
  stopRotate();
  document.body.classList.add('has-panel');
  layout();
  renderPanel({ keepScroll: keep });
  syncMarkers();
  syncRings();
  paint();
  highlightChips();
  syncHash();
  announce(`已打开${guide.name}的旅行指南`);
  if (fly === 'sight' && attraction) flyTo({ lat: attraction.lat, lng: attraction.lng, altitude: 0.46 });
  else if (fly === 'city') flyTo({ lat: city.lat, lng: city.lng, altitude: 0.72 });
  else flyTo({ ...guide.camera });
}

function openSoon(feature, coords) {
  state.active = {
    iso2: feature.properties.iso2,
    iso3: feature.properties.iso3,
    guide: null,
    name: displayName(feature),
    nameEn: feature.properties.nameEn,
    continent: continentOf(feature),
    click: coords,
  };
  stopRotate();
  document.body.classList.add('has-panel');
  layout();
  renderPanel();
  syncMarkers();
  syncRings();
  paint();
  highlightChips();
  syncHash();
  announce(`已打开${state.active.name}，指南即将上线`);
  const target = coords
    ? { lat: coords.lat, lng: coords.lng, altitude: 1.42 }
    : featureCenter(feature);
  if (target) flyTo(target);
}

function closePanel({ flyHome = false } = {}) {
  state.active = null;
  document.body.classList.remove('has-panel');
  els.panel.classList.remove('open');
  els.panel.inert = true;
  els.panel.setAttribute('aria-hidden', 'true');
  layout();
  syncMarkers();
  syncRings();
  paint();
  highlightChips();
  syncHash();
  announce('已关闭指南');
  if (flyHome) flyTo(HOME);
}

function buildSearch() {
  const items = [];
  guides.forEach((guide) => {
    items.push({
      type: '国家',
      title: guide.name,
      titleEn: guide.nameEn,
      subtitle: guide.continent,
      hay: [guide.name, guide.nameEn, ...(guide.aliases || []), guide.tagline].join(' '),
      guide,
    });
    guide.cities.forEach((city) => {
      items.push({
        type: '城市',
        title: city.name,
        titleEn: city.nameEn,
        subtitle: `${guide.name} · ${guide.continent}`,
        hay: [city.name, city.nameEn, ...(city.aliases || []), guide.name, guide.nameEn].join(' '),
        guide,
        city,
      });
      city.attractions.forEach((attraction) => {
        items.push({
          type: '景点',
          title: attraction.name,
          titleEn: attraction.nameEn,
          subtitle: `${city.name} · ${guide.name}`,
          hay: [attraction.name, attraction.nameEn, ...(attraction.aliases || []), city.name, guide.name].join(' '),
          guide,
          city,
          attraction,
        });
      });
    });
  });
  searchItems = items;
}

function score(item, query) {
  const q = norm(query);
  if (!q) return 1;
  const title = norm(item.title);
  const en = norm(item.titleEn);
  const hay = norm(item.hay);
  if (title === q || en === q) return 100;
  if (title.startsWith(q) || en.startsWith(q)) return 80;
  if (title.includes(q) || en.includes(q)) return 60;
  if (hay.includes(q)) return 40;
  return 0;
}

function canSearch(query) {
  const q = norm(query);
  if (!q) return false;
  return /[\u3400-\u9fff]/.test(query) ? q.length >= 1 : q.length >= 2;
}

function updateSearch() {
  const query = els.search.value.trim();
  let results;
  if (!query) {
    results = QUICK.map((iso) => searchItems.find((item) => item.type === '国家' && item.guide.iso2 === iso)).filter(Boolean);
  } else if (!canSearch(query)) {
    results = [];
  } else {
    results = searchItems
      .map((item) => ({ item, score: score(item, query) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((row) => row.item);
  }
  state.results = results;
  state.cursor = results.length ? 0 : -1;
  renderSearch(query);
}

function renderSearch(query) {
  const open = document.activeElement === els.search || !els.results.hidden;
  if (!open && !query) {
    closeSearch();
    return;
  }
  els.results.hidden = false;
  els.search.setAttribute('aria-expanded', 'true');
  if (!query && !state.results.length) {
    els.results.innerHTML = '<li class="result-hint">输入国家、城市或景点</li>';
    return;
  }
  if (query && !state.results.length) {
    els.results.innerHTML = `<li class="result-empty">没有找到「${esc(query)}」。试试「京都」「冰岛」或「泰姬陵」。</li>`;
    return;
  }
  const hint = query ? '' : '<li class="result-hint">已上线目的地，继续输入可搜城市和景点</li>';
  els.results.innerHTML = hint + state.results.map((item, index) => `
    <li>
      <button type="button" class="result ${index === state.cursor ? 'is-active' : ''}" role="option" data-index="${index}" aria-selected="${index === state.cursor}">
        <span class="kind">${esc(item.type)}</span>
        <strong>${esc(item.title)}</strong>
        <small>${esc(item.subtitle)}${item.titleEn ? ` · ${esc(item.titleEn)}` : ''}</small>
      </button>
    </li>
  `).join('');
}

function closeSearch() {
  els.results.hidden = true;
  els.results.innerHTML = '';
  els.search.setAttribute('aria-expanded', 'false');
  state.cursor = -1;
}

function choose(item) {
  closeSearch();
  els.search.blur();
  if (item.attraction) openGuide(item.guide, { cityId: item.city.id, attractionId: item.attraction.id, fly: 'sight' });
  else if (item.city) openGuide(item.guide, { cityId: item.city.id, fly: 'city' });
  else openGuide(item.guide, { fly: 'country' });
}

function applyHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!raw) return;
  const [iso, cityId, attractionId] = raw.split('/');
  const key = iso.toUpperCase();
  const guide = byIso2.get(key) || byIso3.get(key);
  if (!guide) {
    const feature = features.find((item) => item.properties.iso2 === key || item.properties.iso3 === key);
    if (feature) openSoon(feature, null);
    return;
  }
  const city = guide.cities.find((item) => item.id === cityId);
  const attraction = city?.attractions.find((item) => item.id === attractionId);
  openGuide(guide, {
    cityId: city?.id,
    attractionId: attraction?.id,
    fly: attraction ? 'sight' : city ? 'city' : 'country',
  });
}

function markerElement(d) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `marker ${d.kind}${d.showLabel ? ' show-label' : ''}${d.active ? ' is-active' : ''}`;
  button.setAttribute('aria-label', `${d.name}，${d.guide.name}`);
  button.innerHTML = `<span class="dot"></span><span class="name">${esc(d.label)}</span>`;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (d.attraction) openGuide(d.guide, { cityId: d.city.id, attractionId: d.attraction.id, fly: 'sight' });
    else openGuide(d.guide, { cityId: d.city.id, fly: 'city' });
  });
  return button;
}

function revealLoader() {
  els.loader.classList.add('is-hidden');
}

function showFatal(message) {
  els.loaderTitle.textContent = '地球没有展开';
  els.loaderSub.textContent = message;
  els.retry.hidden = false;
  els.loader.classList.remove('is-hidden');
}

function addClouds() {
  const loader = new THREE.TextureLoader();
  loader.load(asset('textures/earth-clouds.png'), (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    const radius = globe.getGlobeRadius() * 1.012;
    cloudsMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 64, 64),
      new THREE.MeshPhongMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.78,
      }),
    );
    cloudsMesh.renderOrder = 2;
    globe.scene().add(cloudsMesh);
  });
}

function spinClouds() {
  if (cloudsMesh && !motion.matches) cloudsMesh.rotation.y += 0.00032;
  requestAnimationFrame(spinClouds);
}

function tuneLights() {
  globe.lights().forEach((light) => {
    if (light.isAmbientLight) light.intensity = Math.PI * 1.25;
    if (light.isDirectionalLight) {
      light.intensity = Math.PI * 0.42;
      light.position.set(1.5, 0.55, 1.15);
    }
  });
  const material = globe.globeMaterial();
  const maxAniso = globe.renderer().capabilities.getMaxAnisotropy();
  if (material.bumpScale !== undefined) material.bumpScale = 5;
  if (material.shininess !== undefined) material.shininess = 6;
  if (material.map) material.map.anisotropy = maxAniso;
  if (material.bumpMap) material.bumpMap.anisotropy = maxAniso;
}

function renderChips() {
  els.dockLabel.textContent = `${guides.length} 国已上线`;
  els.chips.innerHTML = guides.map((guide) => `
    <button type="button" class="chip" data-iso="${esc(guide.iso2)}" aria-pressed="false">${esc(guide.name)}</button>
  `).join('');
}

function bindUi() {
  els.chips.addEventListener('click', (event) => {
    const button = event.target.closest('.chip');
    if (!button) return;
    const guide = byIso2.get(button.dataset.iso);
    if (guide) openGuide(guide, { fly: 'country' });
  });

  els.panel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, city, sight, iso } = button.dataset;
    if (action === 'close') closePanel();
    if (action === 'city') openGuide(state.active.guide, { cityId: city, fly: 'city' });
    if (action === 'sight') openGuide(state.active.guide, { cityId: city, attractionId: sight, fly: 'sight' });
    if (action === 'open') {
      const guide = byIso2.get(iso);
      if (guide) openGuide(guide, { fly: 'country' });
    }
  });

  els.rotate.addEventListener('click', () => {
    state.rotating = !state.rotating;
    globe.controls().autoRotate = state.rotating;
    syncRotate();
  });
  els.reset.addEventListener('click', () => closePanel({ flyHome: true }));
  els.retry.addEventListener('click', () => location.reload());

  els.globe.addEventListener('pointerdown', () => {
    if (state.rotating) stopRotate();
  });

  els.search.addEventListener('focus', updateSearch);
  els.search.addEventListener('input', () => {
    if (!state.composing) updateSearch();
  });
  els.search.addEventListener('compositionstart', () => { state.composing = true; });
  els.search.addEventListener('compositionend', () => {
    state.composing = false;
    updateSearch();
  });
  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const item = state.results[Math.max(state.cursor, 0)];
    if (item) choose(item);
  });
  els.search.addEventListener('keydown', (event) => {
    if (els.results.hidden || !state.results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      state.cursor = (state.cursor + 1) % state.results.length;
      renderSearch(els.search.value.trim());
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      state.cursor = (state.cursor - 1 + state.results.length) % state.results.length;
      renderSearch(els.search.value.trim());
    } else if (event.key === 'Enter' && state.results[state.cursor]) {
      event.preventDefault();
      choose(state.results[state.cursor]);
    }
  });
  els.results.addEventListener('mousedown', (event) => event.preventDefault());
  els.results.addEventListener('click', (event) => {
    const button = event.target.closest('[data-index]');
    if (!button) return;
    choose(state.results[Number(button.dataset.index)]);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!els.form.contains(event.target)) closeSearch();
  });
  window.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName;
    if (event.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
      event.preventDefault();
      els.search.focus();
    } else if (event.key === 'Escape') {
      if (!els.results.hidden) closeSearch();
      else if (state.active) closePanel();
    }
  });
  window.addEventListener('resize', layout);
  window.addEventListener('hashchange', () => {
    const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!raw) {
      if (state.active) closePanel();
      return;
    }
    const [iso, cityId = '', attractionId = ''] = raw.split('/');
    const key = iso.toUpperCase();
    const current = (state.active?.iso2 || state.active?.iso3 || '').toUpperCase();
    const same = current === key
      && (state.active?.cityId || '') === cityId
      && (state.active?.attractionId || '') === attractionId;
    if (!same) applyHash();
  });
}

function setupGlobe() {
  globe = new Globe(els.globe, {
    animateIn: false,
    rendererConfig: {
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    },
  })
    .globeImageUrl(asset('textures/earth-day.jpg'))
    .bumpImageUrl(asset('textures/earth-topology.png'))
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor('#d7e8f2')
    .atmosphereAltitude(0.22)
    .polygonsData(features)
    .polygonCapCurvatureResolution(4)
    .polygonSideColor(() => 'rgba(120, 84, 32, 0.28)')
    .polygonsTransitionDuration(motion.matches ? 0 : 280)
    .polygonLabel((feature) => {
      const guide = findGuide(feature);
      const name = displayName(feature);
      const sub = guide ? '查看旅行指南' : '指南即将上线';
      return `<div class="tip"><strong>${esc(name)}</strong><span>${sub}</span></div>`;
    })
    .onPolygonHover((feature) => {
      const next = feature ? featureId(feature) : null;
      if (next === state.hoverId) return;
      state.hoverId = next;
      paint();
    })
    .onPolygonClick((feature, _event, coords) => {
      const guide = findGuide(feature);
      if (guide) openGuide(guide, { fly: 'country' });
      else openSoon(feature, coords);
    })
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(0.012)
    .htmlTransitionDuration(0)
    .htmlElement(markerElement)
    .htmlElementVisibilityModifier((el, visible) => {
      el.style.opacity = visible ? '1' : '0';
      el.style.pointerEvents = visible ? 'auto' : 'none';
    })
    .ringsData([])
    .ringLat('lat')
    .ringLng('lng')
    .ringAltitude(0.003)
    .ringColor(() => ['rgba(196, 132, 42, 0.65)', 'rgba(196, 132, 42, 0)'])
    .ringMaxRadius(2.4)
    .ringPropagationSpeed(1.5)
    .ringRepeatPeriod(1500)
    .onGlobeReady(() => {
      tuneLights();
      revealLoader();
    });

  const controls = globe.controls();
  controls.autoRotate = state.rotating;
  controls.autoRotateSpeed = 0.28;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = globe.getGlobeRadius() * 1.2;
  controls.maxDistance = globe.getGlobeRadius() * 3.9;
  controls.zoomSpeed = 0.55;
  controls.rotateSpeed = 0.48;
  globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  layout();
  paint();
  syncMarkers();
  flyTo(HOME);
  addClouds();
  spinClouds();
  setTimeout(revealLoader, 8000);
}

async function main() {
  bindUi();
  syncRotate();
  try {
    const [geoRes, guideRes] = await Promise.all([
      fetch(asset('data/countries.geojson')),
      fetch(asset('data/guides.json')),
    ]);
    if (!geoRes.ok || !guideRes.ok) throw new Error('bad status');
    const geo = await geoRes.json();
    const guideData = await guideRes.json();
    features = geo.features || [];
    guides = guideData.countries || [];
    guides.forEach((guide) => {
      byIso2.set(guide.iso2, guide);
      byIso3.set(guide.iso3, guide);
    });
    buildSearch();
    renderChips();
    setupGlobe();
    applyHash();
  } catch (error) {
    console.error(error);
    showFatal('指南数据没有载入。请通过本地服务器打开这个站点，然后重试。');
  }
}

main();
