import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import { useI18n } from "../i18n/i18n.js";

function Home() {
  const { t } = useI18n();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGet("/events?page=1")
      .then((data) => setEvents(data.results))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main>
      <section className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="max-w-3xl text-5xl font-bold tracking-tight">
          {t("Discover events in Kazakhstan")}
        </h2>

        <p className="mt-6 max-w-2xl text-lg text-gray-600">
          {t("Find events, get your digital tickets, and enjoy your experience.")}
        </p>

        <div className="mt-8 flex gap-4">
          <button className="rounded-lg bg-black px-6 py-3 font-medium text-white">
            {t("Explore events")}
          </button>

          <Link
            to="/organizer/events/new"
            className="rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium"
          >
            {t("Create an event")}
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20">
        <h3 className="text-2xl font-semibold">{t("Upcoming events")}</h3>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {error && <p role="alert">{t("Could not load events: {error}", { error: t(error) })}</p>}

          {events === null && !error && <p>{t("Loading…")}</p>}

          {events?.length === 0 && <p>{t("No events yet.")}</p>}

          {events?.map((event) => (
            <Link
              to={`/events/${event.id}`}
              className="rounded-xl border bg-white p-6 hover:shadow"
              key={event.id}
            >
              <h4 className="text-xl font-semibold">{event.title}</h4>
              <p className="mt-2 text-gray-600">{event.venue}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

export default Home;