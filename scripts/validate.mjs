import { readFileSync } from 'node:fs';

const guides = JSON.parse(readFileSync(new URL('../public/data/guides.json', import.meta.url), 'utf8'));
const geo = JSON.parse(readFileSync(new URL('../public/data/countries.geojson', import.meta.url), 'utf8'));

const iso2 = new Set(geo.features.map((feature) => feature.properties.iso2).filter(Boolean));
const iso3 = new Set(geo.features.map((feature) => feature.properties.iso3).filter(Boolean));
const errors = [];

if (!Array.isArray(guides.countries) || guides.countries.length < 20) {
  errors.push(`需要至少 20 个国家，当前 ${guides.countries?.length || 0}`);
}

const seen = new Set();
for (const country of guides.countries) {
  for (const key of ['iso2', 'iso3', 'name', 'nameEn', 'continent', 'summary', 'bestTime', 'stay', 'tips', 'camera', 'cities']) {
    if (country[key] == null || country[key] === '') errors.push(`${country.iso2 || country.name} 缺少 ${key}`);
  }
  if (!iso2.has(country.iso2)) errors.push(`${country.name} 的 iso2 ${country.iso2} 不在国界数据里`);
  if (!iso3.has(country.iso3)) errors.push(`${country.name} 的 iso3 ${country.iso3} 不在国界数据里`);
  if (seen.has(country.iso2)) errors.push(`重复的 iso2 ${country.iso2}`);
  seen.add(country.iso2);
  if (!Array.isArray(country.tips) || country.tips.length < 3) errors.push(`${country.name} 的贴士太少`);
  if (country.cities.length < 2 || country.cities.length > 4) {
    errors.push(`${country.name} 应有 2–4 个城市，当前 ${country.cities.length}`);
  }
  for (const city of country.cities) {
    if (!Number.isFinite(city.lat) || city.lat < -90 || city.lat > 90) errors.push(`${city.name} 纬度无效`);
    if (!Number.isFinite(city.lng) || city.lng < -180 || city.lng > 180) errors.push(`${city.name} 经度无效`);
    if (!city.blurb || !city.name || !city.id) errors.push(`${country.name} / ${city.name || city.id} 缺少城市字段`);
    if (!Array.isArray(city.attractions) || city.attractions.length < 2) {
      errors.push(`${city.name} 至少需要 2 个景点`);
    }
    for (const sight of city.attractions || []) {
      if (!sight.name || !sight.desc || !sight.id) errors.push(`${city.name} 的景点字段不完整`);
      if (!Number.isFinite(sight.lat) || !Number.isFinite(sight.lng)) errors.push(`${sight.name} 坐标无效`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`OK ${guides.countries.length} 个国家，国界 ${geo.features.length} 条`);
