/**
 * 明信片英文题字库。
 * 标题 2–5 个词，Title Case；短句 6–12 个词，全小写，不加句号。
 * 每一组都指向画面中真实存在的东西，避免空泛的励志语。
 */
export const POSTCARD_COPY = {
  'mountain-green': {
    titles: ['Mountain Morning', 'Clouds Over the Ridge', 'The Quiet Summit', 'Pines in the Mist'],
    captions: [
      'soft light moving across the high ridge',
      'a line of pines fading into cloud',
      'morning mist resting between the peaks',
      'wind in the pines above the valley'
    ]
  },
  'lake-mirror': {
    titles: ['Still Water Morning', 'A Lake Without Wind', 'Reflections at Dusk', 'The Far Shore'],
    captions: [
      'a quiet lake before the wind rises',
      'clouds resting on the far shore at dusk',
      'a small boat drifting through still water',
      'the far hills softened by morning mist'
    ]
  },
  coast: {
    titles: ['Where the Tide Turns', 'Salt Air Afternoon', 'The Long Shoreline', 'Waves at First Light'],
    captions: [
      'waves folding slowly onto the pale sand',
      'salt air and a long empty shoreline',
      'the tide turning under a low grey sky',
      'gulls above the water at first light'
    ]
  },
  sunset: {
    titles: ['The Last Light', 'River of Evening', 'Gold on the Water', 'Before the Dark'],
    captions: [
      'the last light caught on the river',
      'a warm sky fading into quiet water',
      'one small boat before the dark',
      'gold light slipping behind the hills'
    ]
  },
  forest: {
    titles: ['A Path Through Pines', 'Green Silence', 'Morning in the Woods', 'The Quiet Grove'],
    captions: [
      'a narrow path under the tall pines',
      'green light falling through the leaves',
      'the woods holding their morning silence',
      'moss and shadow along the old trail'
    ]
  },
  grassland: {
    titles: ['Grass and Sky', 'The Wide Horizon', 'Wind on the Plain', 'A Summer Pasture'],
    captions: [
      'wind crossing the wide open plain',
      'clouds moving slowly over the grass',
      'one yurt under a pale summer sky',
      'a horse standing at the edge of the field'
    ]
  },
  snow: {
    titles: ['Snow on the Peaks', 'The White Silence', 'High Country Morning', 'Where Clouds Rest'],
    captions: [
      'fresh snow resting on the high peaks',
      'thin air and a pale blue sky',
      'the mountain path under deep snow',
      'prayer flags moving in the cold wind'
    ]
  },
  desert: {
    titles: ['Dunes at Dusk', 'The Long Sand Road', 'Wind Over the Desert', 'A Caravan at Sunset'],
    captions: [
      'dunes turning gold at the end of day',
      'a single caravan crossing the sand',
      'wind writing lines across the dunes',
      'the long road under a pale sun'
    ]
  },
  terraces: {
    titles: ['Steps of Green', 'The Hillside Fields', 'Rice Terraces at Dawn', 'Lines of Water'],
    captions: [
      'green steps following the shape of the hill',
      'water catching light between the fields',
      'a small house above the rice terraces',
      'morning mist lying along the valley'
    ]
  },
  canyon: {
    titles: ['Between the Cliffs', 'The Narrow Valley', 'River in the Gorge', 'Cool Water, Quiet Stone'],
    captions: [
      'a river turning between the high cliffs',
      'cool water moving over quiet stone',
      'light falling into the narrow gorge',
      'the path following the canyon wall'
    ]
  },
  'ancient-town': {
    titles: ['Roofs by the River', 'An Old Town Morning', 'Lanterns at Dusk', 'The Stone Bridge'],
    captions: [
      'roofs and lanterns along the old river',
      'a stone bridge holding the morning quiet',
      'one red lantern above the narrow street',
      'tiles and white walls after the rain'
    ]
  },
  city: {
    titles: ['City Before Night', 'Windows and Water', 'The Blue Hour', 'Skyline in the Mist'],
    captions: [
      'windows coming on across the water',
      'the skyline fading into blue evening',
      'lights moving along the long river',
      'a quiet hour above the busy streets'
    ]
  },
  flowers: {
    titles: ['A Field in Bloom', 'Spring on the Hill', 'Flowers After Rain', 'The Color of Morning'],
    captions: [
      'a field moving in the spring wind',
      'small flowers along the old stone wall',
      'white petals caught in the morning light',
      'bees moving through the open meadow'
    ]
  }
};

const FALLBACK = 'mountain-green';

export function buildPostcardCopy(sceneId = FALLBACK, seed = 0) {
  const key = POSTCARD_COPY[sceneId] ? sceneId : FALLBACK;
  const entry = POSTCARD_COPY[key];
  const index = Math.abs(Math.trunc(seed)) % entry.titles.length;
  return {
    title: entry.titles[index],
    caption: entry.captions[index],
    index,
    sceneId: key
  };
}

export function countEnglishWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function validatePostcardTitle(text) {
  const words = countEnglishWords(text);
  return {
    valid: words >= 2 && words <= 5,
    words,
    message: words < 2 ? '标题至少 2 个英文词' : words > 5 ? '标题最多 5 个英文词' : ''
  };
}

export function validatePostcardCaption(text) {
  const words = countEnglishWords(text);
  return {
    valid: words >= 6 && words <= 12,
    words,
    message: words < 6 ? '短句至少 6 个英文词' : words > 12 ? '短句最多 12 个英文词' : ''
  };
}

export function normalizePostcardText(text, maxLength = 80) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
