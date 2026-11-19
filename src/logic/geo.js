import { PLACES } from '../data/places.js';

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

/** 两点球面距离（公里） */
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 从 a 指向 b 的方位角（0° 为正北） */
export function bearingDegrees(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function compassDirection(bearing) {
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return dirs[Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
}

export function formatDistance(km) {
  if (!Number.isFinite(km)) return '未知';
  if (km < 1) return `${Math.max(10, Math.round(km * 1000))} 米`;
  if (km < 10) return `${km.toFixed(1)} 公里`;
  return `${Math.round(km)} 公里`;
}

export function formatCoords(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${ns} · ${Math.abs(lon).toFixed(4)}°${ew}`;
}

/**
 * 找出离坐标最近的地方志条目。
 * 返回全部候选，是否采用由调用方根据距离和叙事诚实性决定。
 */
export function nearbyPlaces(lat, lon, limit = 4) {
  const here = { lat, lon };
  return PLACES.map((place) => {
    const distanceKm = haversineKm(here, place);
    const bearing = bearingDegrees(here, place);
    return {
      place,
      distanceKm,
      bearing,
      direction: compassDirection(bearing)
    };
  })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

/**
 * 根据定位结果决定叙事地点。
 * - exact：60 公里内，视作就在此地
 * - nearby：400 公里内，明确告知「距你约 N 公里」
 * - none：附近没有收录，返回 null
 */
export function resolvePlaceAt(lat, lon) {
  const candidates = nearbyPlaces(lat, lon, 4);
  const first = candidates[0];
  if (!first) return { match: 'none', place: null, candidates, distanceKm: null };
  if (first.distanceKm <= 25) {
    return { match: 'exact', place: first.place, candidates, distanceKm: first.distanceKm };
  }
  if (first.distanceKm <= 400) {
    return { match: 'nearby', place: first.place, candidates, distanceKm: first.distanceKm };
  }
  return { match: 'none', place: null, candidates, distanceKm: first.distanceKm };
}

/** 坐标兜底：不假装知道具体地名，只生成诚实的地理叙事 */
export function coordinatePlace(lat, lon, nearest) {
  const coords = formatCoords(lat, lon);
  const near = nearest
    ? `这里距离${nearest.place.name}约 ${formatDistance(nearest.distanceKm)}，方向偏${nearest.direction}。`
    : '附近的地方志尚未收录。';
  return {
    id: 'coordinate',
    name: '此刻所在',
    subtitle: `${coords} · 坐标叙事`,
    province: '',
    city: '',
    lat,
    lon,
    aliases: [],
    kinds: ['坐标'],
    sceneAffinity: [],
    recommendedDialect: null,
    tagline: '你站的地方，就是故事的起点',
    intro: `你正站在 ${coords} 附近。${near} 这一带的山川与人间，我们先从眼前的光影说起。`,
    history:
      '每一片土地都有自己的年轮：地壳抬升、河流改道、人群迁徙、村落兴衰。即使没有名胜的注脚，脚下的土层、路边的老树和远处的山形，也都保存着时间的痕迹。',
    culture:
      '地方文化往往藏在日常里：一句口音、一碗吃食、一座小庙、一场节庆。若你愿意多停一会儿，问问路边的人，这片土地会给出比攻略更生动的答案。',
    poem: { text: '此心安处是吾乡。', title: '《定风波·南海归赠王定国侍人寓娘》', author: '苏轼' },
    food: '当地时令小食',
    custom: '尊重当地人的生活习惯，轻声慢行。',
    season: '四季各有风物',
    isCoordinate: true
  };
}

/** 粗略地区：只用于失败时给用户一个可操作的提示，不用于捏造地点 */
export function regionHint(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '中国';
  if (lat > 49 && lon < 135) return '东北';
  if (lat > 40 && lon < 98) return '西北';
  if (lat > 40 && lon >= 98) return '华北';
  if (lat > 31 && lon < 105) return '西南';
  if (lat > 31) return '华东';
  if (lon < 105) return '西南';
  if (lon < 114) return '华中';
  return '华南';
}
