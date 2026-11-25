import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import EventCard from "../components/EventCard.jsx";
import HeroSlideshow from "../components/HeroSlideshow.jsx";
import { useI18n } from "../i18n/i18n.js";
import { categoryKey } from "../utils/categoryColors";

function Home() {
  const { t } = useI18n();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState(null); // null = every category
  const upcoming = useRef(null);

  useEffect(() => {
    apiGet("/events?page=1")
      .then((data) => setEvents(data.results))
      .catch((err) => setError(err.message));
  }, []);

  const categories = [...new Set((events ?? []).map((event) => categoryKey(event.category)))].filter(Boolean);
  const shown = events?.filter((event) => category === null || categoryKey(event.category) === category);

  function showEvents() {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    upcoming.current.scrollIntoView({ behavior: calm ? "auto" : "smooth" });
  }

  return (
    <main>
      <HeroSlideshow>
        <h2 className="max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
          {t("Discover events in Kazakhstan")}
        </h2>

        <p className="mt-5 max-w-xl text-lg text-brand-100">
          {t("Find events, get your digital tickets, and enjoy your experience.")}
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <button type="button" onClick={showEvents}
            className="rounded-lg bg-sun-400 px-6 py-3 font-medium text-brand-900 transition hover:bg-sun-300 motion-safe:hover:-translate-y-0.5">
            {t("Explore events")}
          </button>

          <Link
            to="/organizer/events/new"
            className="rounded-lg border border-white/60 px-6 py-3 font-medium transition hover:bg-white hover:text-brand-900 motion-safe:hover:-translate-y-0.5"
          >
            {t("Create an event")}
          </Link>
        </div>
      </HeroSlideshow>

      <section ref={upcoming} className="mx-auto max-w-7xl px-6 py-14">
        <h3 className="text-2xl font-semibold">{t("Upcoming events")}</h3>

        {categories.length > 1 && (
          <div role="group" aria-label={t("Filter by category")} className="mt-4 flex flex-wrap gap-2">
            {[null, ...categories].map((name) => (
              <button key={name ?? ""} type="button" aria-pressed={category === name} onClick={() => setCategory(name)}
                className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${category === name ? "border-brand-600 bg-brand-600 text-white" : "bg-white hover:border-brand-600 hover:text-brand-700"}`}>
                {name === null ? t("All") : t(name)}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {error && <p role="alert">{t("Could not load events: {error}", { error: t(error) })}</p>}

          {events === null && !error && <p>{t("Loading…")}</p>}

          {events?.length === 0 && <p>{t("No events yet.")}</p>}

          {shown?.map((event, order) => (
            <EventCard event={event} order={order} key={event.id} />
          ))}
        </div>
      </section>
    </main>
  );
}

export default Home;
