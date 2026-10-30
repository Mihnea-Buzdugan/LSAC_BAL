import { useEffect, useState } from "react";
import "./App.css";

// Put your images in /public: the hero photo and one portrait per couple (4:5 ratio works best).
const HERO_IMAGE = "/banner.jpeg";

// `id` is what gets stored in MongoDB. It must match COUPLE_IDS in server/index.js.
const COUPLES = [
  { id: "couple-1", name: "Couple 1", image: "/couples/couple-1.jpeg" },
  { id: "couple-2", name: "Couple 2", image: "/couples/couple-2.jpeg" },
  { id: "couple-3", name: "Couple 3", image: "/couples/couple-3.jpeg" },
  { id: "couple-4", name: "Couple 4", image: "/couples/couple-4.jpeg" },
  { id: "couple-5", name: "Couple 5", image: "/couples/couple-5.jpeg" },
];

const API_URL = `${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}/api/votes`;
const STORAGE_KEY = "hollywood-poll-choice";
const REFRESH_MS = 5000;

// Remembers this browser's vote so a page refresh doesn't allow a second one.
function getSavedIndex() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return COUPLES.findIndex((c) => c.id === id); // -1 when nothing saved
  } catch {
    return -1;
  }
}

export default function App() {
  const [initialIndex] = useState(getSavedIndex);
  const [votes, setVotes] = useState({}); // { "couple-1": 3, ... }
  const [selected, setSelected] = useState(initialIndex === -1 ? null : initialIndex);
  const [hasVoted, setHasVoted] = useState(initialIndex !== -1);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState("");

  // Load results now, then refresh every few seconds so everyone sees live numbers.
  useEffect(() => {
    let cancelled = false;

    const loadVotes = async () => {
      try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error("Request failed");
        const data = await res.json();
        if (!cancelled) setVotes(data.votes);
      } catch {
        // Keep showing the last known results.
      }
    };

    loadVotes();
    const timer = setInterval(loadVotes, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const countFor = (couple) => votes[couple.id] ?? 0;
  const total = COUPLES.reduce((sum, c) => sum + countFor(c), 0);
  const percent = (n) => (total === 0 ? 0 : Math.round((n / total) * 100));

  const castVote = async () => {
    if (hasVoted || submitting) return;
    if (selected === null) {
      setHint("Pick a couple before you vote.");
      return;
    }

    const coupleId = COUPLES[selected].id;
    setSubmitting(true);
    setHint("");

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupleId }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setVotes(data.votes);
      setHasVoted(true);
      try {
        localStorage.setItem(STORAGE_KEY, coupleId);
      } catch {
        // Storage unavailable; the vote is still saved on the server.
      }
    } catch {
      setHint("Your vote wasn't saved. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      {/* HERO */}
      <header className="hero" style={{ "--hero-image": `url(${HERO_IMAGE})` }}>
        <div className="hero__inner">
          <p className="eyebrow eyebrow--cream">The spotlight is yours</p>
          <h1 className="hero__title">Hollywood, your call.</h1>
          <span className="hero__rule" aria-hidden="true" />
          <p className="hero__text">
            The curtain is up. Tell us which couple deserves the brightest
            spotlight.
          </p>
        </div>
      </header>

      {/* POLL */}
      <main className="poll">
        <div className="poll__grid">
          <section className="vote">
            <p className="eyebrow">The audience decides</p>
            <h2 className="vote__title">Which couple steals the scene?</h2>
            <p className="vote__text">
              Five couples. One spotlight. Pick the pair that won you over.
            </p>

            <fieldset className="options" disabled={hasVoted || submitting}>
              <legend className="options__legend">Choose your favorite couple</legend>
              <div className="options__grid">
                {COUPLES.map((couple, i) => (
                  <label
                    key={couple.id}
                    className={`option${selected === i ? " is-selected" : ""}`}
                    style={{ "--photo": `url(${couple.image})` }}
                  >
                    <input
                      type="radio"
                      name="couple"
                      value={i}
                      checked={selected === i}
                      onChange={() => {
                        setSelected(i);
                        setHint("");
                      }}
                    />
                    <span className="option__caption">
                      <span className="option__radio" aria-hidden="true" />
                      <span className="option__label">{couple.name}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <button
              type="button"
              className="btn"
              onClick={castVote}
              disabled={hasVoted || submitting}
            >
              {hasVoted ? "Vote cast" : submitting ? "Sending…" : "Cast your vote"}
            </button>
            <p className="hint" role="status">
              {hint}
            </p>
          </section>

          <aside className="results" aria-live="polite">
            <p className="eyebrow">The current verdict</p>
            <h2 className="results__title">Audience favorites</h2>

            <ul className="results__list">
              {COUPLES.map((couple) => {
                const count = countFor(couple);
                return (
                  <li key={couple.id} className="result">
                    <div className="result__head">
                      <span className="result__name">{couple.name}</span>
                      <span className="result__value">
                        {count}&thinsp;·&thinsp;{percent(count)}%
                      </span>
                    </div>
                    <div className="result__track">
                      <div
                        className="result__bar"
                        style={{ width: `${percent(count)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="results__meta">
              <span className="results__count">
                {total} {total === 1 ? "vote" : "votes"} cast
              </span>
              <br />
              Results update as the audience votes.
            </p>
          </aside>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        Hollywood Poll · Every opinion gets its moment
      </footer>
    </div>
  );
}