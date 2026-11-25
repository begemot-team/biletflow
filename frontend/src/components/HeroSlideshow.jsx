import { useRef, useState } from 'react'
import { useI18n } from '../i18n/i18n.js'
import { formatDayMonth } from '../i18n/translate.js'
import { SHOWCASE, showcaseCount } from '../utils/showcase'

const photos = import.meta.glob('../assets/hero/*.webp', { eager: true, query: '?url', import: 'default' })
const photoUrl = (name) => photos[`../assets/hero/${name}.webp`]

const ICONS = {
  previous: 'M10 3L5 8l5 5',
  next: 'M6 3l5 5-5 5',
  pause: 'M5 3v10M11 3v10',
  play: 'M5 3l8 5-8 5z',
}

function ControlButton({ label, icon, onClick }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/50 text-white transition-colors hover:bg-white hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun-400">
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICONS[icon]} />
      </svg>
    </button>
  )
}

// The ticket over the photo. Its barcode fills up while the slide is shown, and the
// end of that animation is what turns the page (onDone), so there is no timer.
function ShowcaseTicket({ slide, running, onDone }) {
  const { t, language } = useI18n()
  const stub = slide.date && formatDayMonth(language, slide.date)

  return (
    <div className="animate-ticket-in motion-reduce:animate-none">
      <div className="ticket-notches flex min-h-40 rounded-xl bg-white text-brand-900 [--stub:6rem]">
        <p className="flex w-24 shrink-0 flex-col items-center justify-center border-r-2 border-dashed p-2 text-center">
          {stub ? (
            <>
              <span className="text-4xl leading-none font-bold">{stub.day}</span>
              <span className="mt-1 text-sm">{stub.month}</span>
              <span className="text-sm font-semibold">{new Date(slide.date).getFullYear()}</span>
            </>
          ) : (
            <svg viewBox="0 0 24 24" className="h-11 w-11 text-brand-600" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
            </svg>
          )}
        </p>
        <div className="flex min-w-0 flex-1 flex-col p-5">
          <p className="text-sm text-brand-600">{slide.date ? t('Past event') : t('Venue')}</p>
          <p className="text-xl leading-tight font-bold text-balance">{t(slide.title)}</p>
          <p className="mt-1 text-sm">{t(slide.place)}</p>
          <p className="text-sm text-gray-600">{t(slide.fact, { count: showcaseCount(slide) })}</p>
          <div className="relative mt-auto h-6" aria-hidden="true">
            <div className="barcode absolute inset-0 text-brand-100" />
            <div className="barcode absolute inset-0 animate-barcode text-brand-800"
              style={{ animationPlayState: running ? 'running' : 'paused' }} onAnimationEnd={onDone} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Main screen of the home page: photos of past events and venues behind the headline (children).
export default function HeroSlideshow({ children }) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [held, setHeld] = useState(false) // the visitor is reading the ticket
  const [firstLoaded, setFirstLoaded] = useState(false)
  const tilt = useRef(null)
  const touchX = useRef(null)

  const slide = SHOWCASE[index]
  const running = playing && !held && firstLoaded
  const turn = (step) => setIndex((now) => (now + step + SHOWCASE.length) % SHOWCASE.length)

  // The ticket leans a little towards the pointer.
  function lean(event) {
    if (event.pointerType !== 'mouse') return
    const box = event.currentTarget.getBoundingClientRect()
    tilt.current.style.setProperty('--lean-y', `${((event.clientX - box.left) / box.width - 0.5) * 14}deg`)
    tilt.current.style.setProperty('--lean-x', `${(0.5 - (event.clientY - box.top) / box.height) * 10}deg`)
  }

  function swipe(event) {
    if (touchX.current === null) return
    const distance = event.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (Math.abs(distance) > 50) turn(distance < 0 ? 1 : -1)
  }

  return (
    <section aria-roledescription="carousel" aria-label={t('Events and venues of Kazakhstan')}
      className="relative isolate overflow-hidden bg-brand-900 text-white"
      onPointerMove={lean}
      onTouchStart={(event) => { touchX.current = event.touches[0].clientX }} onTouchEnd={swipe}>
      {/* Other photos wait until the first one is on screen */}
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {SHOWCASE.map(({ photo }, i) => (i === index || firstLoaded) && (
          <div key={photo} className={`absolute inset-0 transition-opacity duration-1000 motion-reduce:transition-none ${i === index ? 'opacity-100' : 'opacity-0'}`}>
            <img src={photoUrl(photo)} alt="" onLoad={() => setFirstLoaded(true)} onError={() => setFirstLoaded(true)}
              className={`h-full w-full object-cover saturate-75 transition-transform ease-out motion-reduce:transition-none motion-reduce:scale-100 ${i === index ? 'scale-106 duration-[9s] starting:scale-100' : 'scale-100 delay-1000 duration-0'}`} />
          </div>
        ))}
        <div className="absolute inset-0 bg-linear-to-t from-brand-900/90 via-brand-900/75 to-brand-900/65 lg:bg-linear-to-r lg:from-brand-900/95 lg:via-brand-900/75 lg:via-40% lg:to-brand-900/10" />
        {/* Keeps the photo credit readable */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-brand-900/85 to-transparent" />
      </div>

      <div className="mx-auto flex min-h-[min(44rem,calc(100svh-5rem))] max-w-7xl flex-col justify-between gap-10 px-6 pt-14 pb-5 lg:pt-20">
        <div className="animate-rise motion-reduce:animate-none">{children}</div>

        <div>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex items-center gap-2">
              <ControlButton label={t('Previous slide')} icon="previous" onClick={() => turn(-1)} />
              <ControlButton label={playing ? t('Pause slideshow') : t('Play slideshow')} icon={playing ? 'pause' : 'play'} onClick={() => setPlaying(!playing)} />
              <ControlButton label={t('Next slide')} icon="next" onClick={() => turn(1)} />
              <div className="ml-2 flex">
                {SHOWCASE.map(({ photo }, i) => (
                  <button key={photo} type="button" onClick={() => setIndex(i)} aria-current={i === index}
                    aria-label={t('Slide {n} of {total}', { n: i + 1, total: SHOWCASE.length })}
                    className="group flex h-8 w-6 items-center justify-center focus-visible:outline-2 focus-visible:outline-sun-400">
                    <span className={`w-1 rounded-full transition-all ${i === index ? 'h-6 bg-sun-400' : 'h-3 bg-white/60 group-hover:h-5 group-hover:bg-white'}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full perspective-distant sm:w-100" aria-live={running ? 'off' : 'polite'}
              onPointerEnter={(event) => setHeld(event.pointerType === 'mouse')} onPointerLeave={() => setHeld(false)}>
              <div ref={tilt} className="transition-transform duration-300 ease-out motion-safe:transform-[rotateX(var(--lean-x,0deg))_rotateY(var(--lean-y,0deg))]">
                <ShowcaseTicket key={slide.photo} slide={slide} running={running} onDone={() => turn(1)} />
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-white/80 sm:text-right">
            <a href={slide.source} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {slide.venuePhoto ? t('Photo of the venue: {author}', { author: slide.author }) : t('Photo: {author}', { author: slide.author })}
            </a>
            {', '}
            <a href={slide.license.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{slide.license.name}</a>
          </p>
        </div>
      </div>
    </section>
  )
}
