/**
 * 方言声腔库。
 * 文字为方言风格的再创作，用于呈现「同一片山河，不同的乡音」；
 * 语音由浏览器 SpeechSynthesis 完成，是否可用取决于系统语音包。
 */
const shared = {
  sichuan: {
    id: 'sichuan',
    name: '四川话',
    short: '川渝',
    region: '川渝',
    locale: 'zh-CN',
    voiceHint: /四川|川渝|成都|重庆|sichuan|cq|chengdu/i,
    sample: '巴适得板',
    color: '#b8643f',
    note: '西南官话 · 川渝片',
    compose({ scene, place, poem }) {
      return [
        `来嘛，跟到我一起看一哈。${scene.visual}。${scene.light}。站到这塌，心头都松活惨了。`,
        `我们脚底下这塌塌，就是${place.name}。${place.intro}`,
        `要摆龙门阵，这地方的故事三天三夜都摆不完。${place.history}`,
        `老辈子还留下些讲究：${place.culture}${place.custom ? ` ${place.custom}` : ''}`,
        `有句老话说得好：“${poem.text}”。你品一哈，是不是这个味道。`,
        `莫慌到走嘛，再站一哈儿。${scene.opening}${scene.closing}`
      ];
    }
  },
  yue: {
    id: 'yue',
    name: '粤语',
    short: '粤语',
    region: '粤港澳',
    locale: 'zh-HK',
    voiceHint: /粤语|廣東話|广东话|香港|cantonese|yue|hk/i,
    sample: '好靓啊',
    color: '#40736b',
    note: '广府话 · 粤海片',
    compose({ scene, place, poem }) {
      return [
        `而家你睇到嘅，係${scene.name}。${scene.visual}。${scene.light}。企喺度，成个人都静晒。`,
        `我哋脚下呢笪地方，叫${place.name}。${place.intro}`,
        `讲起呢度嘅古仔，三日三夜都讲唔完。${place.history}`,
        `呢度嘅人情风物都好有味道。${place.culture}${place.custom ? ` ${place.custom}` : ''}`,
        `老前辈留低一句：“${poem.text}”。你细味一下。`,
        `唔好急住走，再企一阵，俾风吹散啲疲累。${scene.opening}${scene.closing}`
      ];
    }
  },
  northeast: {
    id: 'northeast',
    name: '东北话',
    short: '东北',
    region: '东北',
    locale: 'zh-CN',
    voiceHint: /东北|辽宁|吉林|黑龙江|northeast|shenyang|harbin/i,
    sample: '老敞亮了',
    color: '#5f7185',
    note: '东北官话 · 松辽片',
    compose({ scene, place, poem }) {
      return [
        `哎呀妈呀，你瞅瞅眼前这景儿！${scene.visual}。${scene.light}。往这儿一站，心里老敞亮了。`,
        `咱脚底下这疙瘩，就是${place.name}。${place.intro}`,
        `要唠这地方的故事，那可老鼻子了。${place.history}`,
        `这儿的讲究也不少。${place.culture}${place.custom ? ` ${place.custom}` : ''}`,
        `老话儿说得好：“${poem.text}”。你细品品，是不是这个味儿。`,
        `别急着走，再站一会儿。${scene.opening}${scene.closing}`
      ];
    }
  },
  wu: {
    id: 'wu',
    name: '吴语',
    short: '吴语',
    region: '苏沪浙',
    locale: 'zh-CN',
    voiceHint: /吴语|苏州|上海|吴|wuu|suzhou|shanghai/i,
    sample: '交关灵光',
    color: '#6c7f5a',
    note: '吴语 · 苏沪片（文字示意）',
    compose({ scene, place, poem }) {
      return [
        `倷看呀，眼前就是${scene.name}。${scene.visual}。${scene.light}。立勒此地，心也会得慢下来。`,
        `阿拉脚底下搿块地方，叫${place.name}。${place.intro}`,
        `讲起搿搭个故事，三日三夜也讲勿完。${place.history}`,
        `搿搭个人情风物，也老有味道个。${place.culture}${place.custom ? ` ${place.custom}` : ''}`,
        `老底子留下一句：“${poem.text}”。倷慢慢叫品味。`,
        `覅急勒走，再立一歇。${scene.opening}${scene.closing}`
      ];
    }
  },
  shaanxi: {
    id: 'shaanxi',
    name: '陕西话',
    short: '陕西',
    region: '关中',
    locale: 'zh-CN',
    voiceHint: /陕西|西安|关中|shaanxi|xian/i,
    sample: '嘹咋咧',
    color: '#9a6b3f',
    note: '中原官话 · 关中片',
    compose({ scene, place, poem }) {
      return [
        `你往这儿看，这就是${scene.name}。${scene.visual}。${scene.light}。往这一站，心里头嘹咋咧！`,
        `咱脚底下这地方，叫${place.name}。${place.intro}`,
        `要说这地方的故事，那可有年头咧。${place.history}`,
        `这搭的讲究也多得很。${place.culture}${place.custom ? ` ${place.custom}` : ''}`,
        `老先人留下话：“${poem.text}”。你细品，嫽不嫽？`,
        `甭急着走，再站一阵儿。${scene.opening}${scene.closing}`
      ];
    }
  }
};

export const DIALECTS = Object.values(shared);
export const DIALECT_MAP = Object.fromEntries(DIALECTS.map((d) => [d.id, d]));

export function dialectById(id) {
  return DIALECT_MAP[id] || DIALECT_MAP.sichuan;
}

export function recommendDialect(place) {
  const recommended = place && place.recommendedDialect;
  return recommended && DIALECT_MAP[recommended] ? recommended : 'sichuan';
}
