/**
 * 朋友圈文案生成：四种语气，全部基于画面识别结果与地方志字段。
 * 同一个 seed 输出稳定，便于测试；点「换一换」递增 seed 即可。
 */
export const MOMENT_STYLES = [
  { id: 'literary', name: '文艺', icon: 'feather', hint: '像写给自己的短句' },
  { id: 'relaxed', name: '松弛', icon: 'sun', hint: '轻一点，像周末' },
  { id: 'classic', name: '古风', icon: 'scroll', hint: '借一句古诗入景' },
  { id: 'guide', name: '攻略', icon: 'map', hint: '好看也好用' }
];

const hash = (text) => {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

function pick(list, seed) {
  return list[seed % list.length];
}

function tagsFor(scene, place) {
  const base = [`#${place.name.replace(/[·\s]/g, '')}`, ...(scene.tags || []).map((t) => `#${t}`)];
  const extra = ['#山河有声', '#旅行日记', '#治愈系风景'];
  return [...new Set([...base, ...extra])].slice(0, 7);
}

function shortPlace(place) {
  return place.name === '此刻所在' ? '此刻脚下' : place.name;
}

export function buildMoment({ scene, place, style = 'literary', seed = 0 }) {
  const mood = pick(scene.moment, seed);
  const tags = tagsFor(scene, place);
  const placeName = shortPlace(place);
  const keyword = pick(scene.keywords, seed + 1);
  const food = place.food || '当地小食';
  const season = place.season || '四季各有风物';
  const poem = place.poem || { text: '', author: '' };
  const name = MOMENT_STYLES.find((s) => s.id === style) || MOMENT_STYLES[0];

  let text = '';
  switch (style) {
    case 'relaxed':
      text = [
        mood,
        `在${placeName}，风把日程表吹乱了，正好。`,
        `看点：${keyword}。什么都不做，也算正经事。`,
        `📍${placeName}`
      ].join('\n\n');
      break;
    case 'classic':
      text = [
        poem.text ? `「${poem.text}」` : '「此心安处是吾乡。」',
        poem.author ? `—— ${poem.author}` : '',
        `${scene.name}一程，${placeName}一梦。${scene.visual.replace(/。$/, '')}，古人的句子忽然就有了着落。`
      ]
        .filter(Boolean)
        .join('\n\n');
      break;
    case 'guide':
      text = [
        `📍${placeName}｜${scene.name}`,
        `✨ 看点：${keyword}，${scene.summary.replace(/。$/, '')}`,
        `📷 机位：${cameraTip(scene, seed)}`,
        `🍜 吃什么：${food}`,
        `⏰ 最佳：${season}`,
        `💡 ${scene.tip}`
      ].join('\n');
      break;
    case 'literary':
    default:
      text = [
        mood,
        `在${placeName}，${scene.visual.replace(/。$/, '')}。${place.tagline ? `忽然懂了「${place.tagline}」。` : ''}`,
        scene.closing.replace(/^愿你/, '愿我们')
      ].join('\n\n');
      break;
  }

  return {
    style: name.id,
    styleName: name.name,
    text,
    tags,
    full: `${text}\n\n${tags.join(' ')}`,
    chars: [...text.replace(/\s/g, '')].length
  };
}

function cameraTip(scene, seed) {
  const tips = {
    'mountain-green': ['低机位带上前景松枝，等云走到山脊再按快门', '用长焦压缩山脊层次，留一点天光'],
    'lake-mirror': ['无风时拍倒影，把地平线放在画面上三分之一', '蹲低靠近水面，让天空和山一起入镜'],
    coast: ['把地平线放平，等浪花退去的一瞬间', '逆光拍剪影，留一半海面给晚霞'],
    sunset: ['提前 20 分钟找好机位，日落后的蓝调更耐看', '用人物或树枝做前景，画面更有故事'],
    forest: ['找一束穿过树冠的光，曝光稍微压暗', '仰拍树冠，让光斑变成星星'],
    grassland: ['用公路或河流做引导线，画面会更辽阔', '等云影落在草原上，层次立刻出来'],
    snow: ['雪景加一点曝光补偿，白才不会发灰', '用经幡或人物做比例尺，显出雪山之大'],
    desert: ['日落前 1 小时进沙山，侧光最能表现沙脊', '保护镜头，风沙大的时候别换镜头'],
    terraces: ['清晨等雾散一半，梯田的线条最清楚', '用长焦截取局部曲线，像大地的指纹'],
    canyon: ['慢门拍水流，记得带小脚架', '把岩壁和溪流一起构图，表现峡谷的收束'],
    'ancient-town': ['清晨拍巷子，等一扇门打开、一束光落下', '雨天青石板反光，是古镇最好的滤镜'],
    city: ['蓝调时刻拍天际线，灯光和天空都有颜色', '找水面或玻璃反射，城市会多一层'],
    flowers: ['低机位把花放在前景，人退远一点', '逆光拍花瓣，会有透明的质感']
  };
  const list = tips[scene.id] || ['留一点前景，画面会更有纵深'];
  return pick(list, seed);
}

export function buildMomentSet({ scene, place, seed = 0 }) {
  return MOMENT_STYLES.map((style) => buildMoment({ scene, place, style: style.id, seed }));
}
