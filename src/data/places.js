import { CORE_PLACES } from './places-core.js';
import { MORE_PLACES } from './places-more.js';

export const PLACES = [...CORE_PLACES, ...MORE_PLACES];
export const PLACE_MAP = Object.fromEntries(PLACES.map((p) => [p.id, p]));

export function placeById(id) {
  return PLACE_MAP[id] || null;
}

function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[·\s,，.。'’"“”\-_/]/g, '');
}

/**
 * 本地搜索：名称、省市、别名和拼音片段都能命中。
 * 排序权重：完全命中 > 开头命中 > 包含 > 省份/城市/别名。
 */
export function searchPlaces(query, limit = 8) {
  const q = normalize(query);
  if (!q) return PLACES.slice(0, limit);
  const scored = [];
  for (const place of PLACES) {
    const name = normalize(place.name);
    const aliases = (place.aliases || []).map(normalize);
    const region = normalize(`${place.province}${place.city}${place.subtitle}`);
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (aliases.some((a) => a === q)) score = 55;
    else if (aliases.some((a) => a.startsWith(q))) score = 45;
    else if (aliases.some((a) => a.includes(q))) score = 35;
    else if (region.includes(q)) score = 25;
    if (score > 0) scored.push({ place, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name, 'zh-Hans-CN'))
    .slice(0, limit)
    .map((x) => x.place);
}

export function placesInProvince(province) {
  return PLACES.filter((p) => p.province === province);
}

export const PROVINCES = [...new Set(PLACES.map((p) => p.province))];
