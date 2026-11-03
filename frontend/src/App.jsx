
import { useState } from "react";
import "./App.css";

// Put your images in /public.
const HERO_IMAGE = "/banner.jpeg";

// IDs must match COUPLE_IDS in server/index.js.
const COUPLES = [
  { id: "couple-1", name: "Couple 1", image: "/couples/couple-1.jpeg" },
  { id: "couple-2", name: "Couple 2", image: "/couples/couple-2.jpeg" },
  { id: "couple-3", name: "Couple 3", image: "/couples/couple-3.jpeg" },
  { id: "couple-4", name: "Couple 4", image: "/couples/couple-4.jpeg" },
  { id: "couple-5", name: "Couple 5", image: "/couples/couple-5.jpeg" },
];

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");

const API_URL = `${API_BASE_URL}/api/votes`;

const STORAGE_KEY = "hollywood-poll-used-tickets";

// Normalize ticket numbers without converting them to numbers.
// This preserves leading zeros.
function normalizeTicket(ticketNumber) {
  return String(ticketNumber ?? "").trim();
}

// Read locally saved ticket numbers.
function getUsedTickets() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) return [];

    const parsed = JSON.parse(stored);

    if (!Array.isArray(parsed)) return [];

    return [
      ...new Set(
        parsed
          .filter((ticket) => typeof ticket === "string")
          .map(normalizeTicket)
          .filter(Boolean)
      ),
    ];
  } catch (error) {
    console.error("Could not read used tickets from localStorage:", error);
    return [];
  }
}

// Check whether a ticket has already voted on this browser.
function hasTicketVoted(ticketNumber) {
  const normalizedTicket = normalizeTicket(ticketNumber);

  if (!normalizedTicket) return false;

  return getUsedTickets().includes(normalizedTicket);
}

// Save a ticket locally after a successful vote.
// Returns true if the ticket was successfully saved and verified.
function saveUsedTicket(ticketNumber) {
  const normalizedTicket = normalizeTicket(ticketNumber);

  if (!normalizedTicket) return false;

  try {
    const tickets = getUsedTickets();

    if (!tickets.includes(normalizedTicket)) {
      tickets.push(normalizedTicket);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));

    // Verify that the ticket was actually saved.
    const savedTickets = getUsedTickets();

    return savedTickets.includes(normalizedTicket);
  } catch (error) {
    console.error("Could not save used ticket to localStorage:", error);
    return false;
  }
}

export default function App() {
  const [selected, setSelected] = useState(null);
  const [ticketNumber, setTicketNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState("");

  // Remember successful votes during the current session too.
  // This works even if browser localStorage is unavailable.
  const [sessionUsedTickets, setSessionUsedTickets] = useState([]);

  const normalizedTicket = normalizeTicket(ticketNumber);

  // Local storage is a convenience check.
  // The backend still verifies every ticket before accepting a vote.
  const hasVoted =
    normalizedTicket.length > 0 &&
    (
      hasTicketVoted(normalizedTicket) ||
      sessionUsedTickets.includes(normalizedTicket)
    );

  // Handle ticket number changes.
  const handleTicketChange = (event) => {
    const value = event.target.value;

    setTicketNumber(value);

    const normalized = normalizeTicket(value);

    const alreadyUsed =
      normalized.length > 0 &&
      (
        hasTicketVoted(normalized) ||
        sessionUsedTickets.includes(normalized)
      );

    setHint(
      alreadyUsed
        ? "This ticket has already been used to vote."
        : ""
    );
  };

  // Cast vote.
  const castVote = async () => {
    if (hasVoted || submitting) return;

    // Validate ticket number.
    if (!normalizedTicket) {
      setHint("Please enter your ticket number.");
      return;
    }

    // Validate selected couple.
    if (selected === null) {
      setHint("Pick a couple before you vote.");
      return;
    }

    // Check local storage.
    if (hasTicketVoted(normalizedTicket)) {
      setHint("This ticket has already been used to vote.");
      return;
    }

    const coupleId = COUPLES[selected].id;

    setSubmitting(true);
    setHint("");

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coupleId,
          ticketNumber: normalizedTicket,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // If the server confirms this ticket was already used,
        // remember that information locally as well.
        if (
          res.status === 409 &&
          data.error?.toLowerCase().includes("already")
        ) {
          saveUsedTicket(normalizedTicket);

          setSessionUsedTickets((previous) =>
            previous.includes(normalizedTicket)
              ? previous
              : [...previous, normalizedTicket]
          );
        }

        throw new Error(
          data.message ||
            data.error ||
            data.detail ||
            "Invalid ticket number or ticket already used."
        );
      }

      // The server successfully registered the vote.
      // Save a local copy for future visits.
      const savedLocally = saveUsedTicket(normalizedTicket);

      // Also remember the ticket in React state.
      setSessionUsedTickets((previous) =>
        previous.includes(normalizedTicket)
          ? previous
          : [...previous, normalizedTicket]
      );

      if (savedLocally) {
        setHint("Your vote has been successfully recorded!");
      } else {
        setHint(
          "Your vote was recorded successfully, but this browser could not save the ticket locally."
        );
      }

    } catch (error) {
      setHint(
        error.message ||
          "Your vote wasn't saved. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">

      {/* HERO */}
      <header
        className="hero"
        style={{ "--hero-image": `url(${HERO_IMAGE})` }}
      >
        <div className="hero__inner">
          <p className="eyebrow eyebrow--cream">
            The spotlight is yours
          </p>

          <h1 className="hero__title">
            Hollywood, your call.
          </h1>

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

            <p className="eyebrow">
              The audience decides
            </p>

            <h2 className="vote__title">
              Which couple steals the scene?
            </h2>

            <p className="vote__text">
              Five couples. One spotlight. Pick the pair that won you over.
            </p>

            {/* TICKET NUMBER */}
            <div className="ticket-field">
              <label htmlFor="ticketNumber">
                Enter your ticket number
              </label>

              <input
                id="ticketNumber"
                type="text"
                placeholder="e.g. 001234"
                value={ticketNumber}
                onChange={handleTicketChange}
                disabled={submitting}
                autoComplete="off"
                maxLength={50}
                aria-describedby="voteHint"
              />
            </div>

            {/* COUPLE SELECTION */}
            <fieldset
              className="options"
              disabled={hasVoted || submitting}
            >
              <legend className="options__legend">
                Choose your favorite couple
              </legend>

              <div className="options__grid">
                {COUPLES.map((couple, index) => (
                  <label
                    key={couple.id}
                    className={`option${
                      selected === index ? " is-selected" : ""
                    }`}
                    style={{ "--photo": `url(${couple.image})` }}
                  >
                    <input
                      type="radio"
                      name="couple"
                      value={index}
                      checked={selected === index}
                      onChange={() => {
                        setSelected(index);
                        setHint("");
                      }}
                    />

                    <span className="option__caption">
                      <span
                        className="option__radio"
                        aria-hidden="true"
                      />

                      <span className="option__label">
                        {couple.name}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* SUBMIT BUTTON */}
            <button
              type="button"
              className="btn"
              onClick={castVote}
              disabled={hasVoted || submitting}
            >
              {hasVoted
                ? "Vote cast"
                : submitting
                  ? "Sending..."
                  : "Cast your vote"}
            </button>

            {/* STATUS / ERROR MESSAGE */}
            <p
              className="hint"
              id="voteHint"
              role="status"
              aria-live="polite"
            >
              {hint}
            </p>

          </section>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        Hollywood Poll · Every opinion gets its moment
      </footer>

    </div>
  );
}
