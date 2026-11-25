// Slides of the home page: real past events and well-known venues. None of them is
// sold here. Dates and numbers come from press reports, see the links. The photos
// are in assets/hero; their licenses require naming the author.
const CC_BY_SA = { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' }
const COMMONS = 'https://commons.wikimedia.org/wiki/File:'

export const SHOWCASE = [
  {
    // https://astanatimes.com/2026/08/kanye-west-concert-brings-11-million-to-kazakhstan-boosting-almatys-event-tourism/
    title: 'Ye (Kanye West)',
    place: 'Central Stadium, Almaty',
    date: '2026-08-15T12:00:00+05:00',
    fact: 'About {count} spectators',
    count: 31000,
    photo: 'central-stadium',
    venuePhoto: true,
    author: 'CD',
    source: `${COMMONS}Ortalyq-Almaty_2022e.jpg`,
    license: CC_BY_SA,
  },
  {
    // https://www.fisu.net/2017/01/29/2017-winter-universiade-in-almaty-opens-in-splendour/
    // https://astanatimes.com/2017/01/2017-winter-universiade-kicks-off-in-almaty/
    title: 'Winter Universiade opening',
    place: 'Almaty Arena, Almaty',
    date: '2017-01-29T12:00:00+05:00',
    fact: 'Teams from {count} countries',
    count: 57,
    photo: 'universiade',
    author: 'Yakov Fedorov',
    source: `${COMMONS}Universiade_2017._Opening_Ceremony.jpg`,
    license: CC_BY_SA,
  },
  {
    // https://astanatimes.com/2025/09/astana-fans-sing-in-unison-as-backstreet-boys-deliver-timeless-hits/
    title: 'Backstreet Boys',
    place: 'Astana Arena, Astana',
    date: '2025-09-21T12:00:00+05:00',
    fact: 'About {count} spectators',
    count: 30000,
    photo: 'astana-arena',
    venuePhoto: true,
    author: 'ChelseaFunNumberOne',
    source: `${COMMONS}FC_Astana_vs._Celtic_FC_UCL_2017.jpg`,
    license: CC_BY_SA,
  },
  {
    title: 'Astana Opera',
    place: 'Astana',
    fact: 'Open since {count}',
    count: 2013,
    photo: 'astana-opera',
    author: 'Шалкер Гам',
    source: `${COMMONS}${encodeURIComponent('Театр_Астана_Опера.jpg')}`,
    license: CC_BY_SA,
  },
  {
    title: 'Medeu',
    place: 'Almaty',
    fact: '{count} m above sea level',
    count: 1691,
    photo: 'medeu',
    author: 'Radosław Botev',
    source: `${COMMONS}Medeu_stadium.jpg`,
    license: { name: 'CC BY 3.0 PL', url: 'https://creativecommons.org/licenses/by/3.0/pl/deed.en' },
  },
  {
    title: 'Barys Arena',
    place: 'Astana',
    fact: 'Open since {count}',
    count: 2015,
    photo: 'barys-arena',
    author: 'ChelseaFunNumberOne',
    source: `${COMMONS}Barys_Arena_2017-09-17.jpg`,
    license: CC_BY_SA,
  },
]

// 31000 -> "31 000"; years stay "2013"
export function showcaseCount({ count }) {
  return count >= 10000 ? String(count).replace(/\B(?=(\d{3})+$)/g, ' ') : String(count)
}
