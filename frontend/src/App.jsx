import { useEffect, useRef, useState } from "react";
import "./App.css"; // ← the Walk of Fame styles.css goes here (plus the ticket-field snippet)

/* ------------------------------------------------------------------
   Data
   ------------------------------------------------------------------ */

// Put your images in /public.
const HERO_IMAGE = "/header.jpeg";

// IDs must match COUPLE_IDS in server/index.js.
const COUPLES = [
  {
    id: "couple-1",
    name: "Couple 1",
    title: "La La Land (2016)",
    image: "/couples/couple-1.jpeg",
    h: 1285,
    alt: "Couple 1 dancing at dusk on a hilltop overlook beside a street lamp, the city lights glowing below.",
  },
  {
    id: "couple-2",
    name: "Couple 2",
    title: "Grease (1978)",
    image: "/couples/couple-2.jpeg",
    h: 1259,
    alt: "Couple 2 in leather jackets on a rain-soaked lot at night, a red convertible and a neon diner behind them.",
  },
  {
    id: "couple-3",
    name: "Couple 3",
    title: "Teen Beach Movie (2013)",
    image: "/couples/couple-3.jpeg",
    h: 1272,
    alt: "Couple 3 on a sunny beach under palm trees, surfboards leaning against a bamboo hut.",
  },
  {
    id: "couple-4",
    name: "Couple 4",
    title: "Romeo & Julieta",
    image: "/couples/couple-4.jpeg",
    h: 1286,
    alt: "Couple 4 in a lamplit stone courtyard beneath a balcony, sharing a single red rose.",
  },
  {
    id: "couple-5",
    name: "Couple 5",
    title: "Back to Black (2024)",
    image: "/couples/couple-5.jpeg",
    h: 1295,
    alt: "Couple 5 standing back to back in black outfits inside a dim, brass-lit bar with a billiard table.",
  },
];

const pad = (n) => String(n).padStart(2, "0");

/* ------------------------------------------------------------------
   Backend + ticket helpers (unchanged)
   ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------
   Animation helpers
   ------------------------------------------------------------------ */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => 1 - Math.pow(1 - clamp(t), 3); // easeOutCubic

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------
   Component
   ------------------------------------------------------------------ */
export default function App() {
  /* ---------- Design refs/state ---------- */
  const rootRef = useRef(null);
  const heroRef = useRef(null);
  const heroImgRef = useRef(null);
  const heroTextRef = useRef(null);
  const heroCueRef = useRef(null);
  const [topbarOn, setTopbarOn] = useState(false);

  /* ---------- Voting state (unchanged) ---------- */
  const [selected, setSelected] = useState(null);
  const [ticketNumber, setTicketNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState("");
  // Only used to colour the status line ("ok" / "error").
  const [hintKind, setHintKind] = useState("");

  // Remember successful votes during the current session too.
  // This works even if browser localStorage is unavailable.
  const [sessionUsedTickets, setSessionUsedTickets] = useState([]);

  const normalizedTicket = normalizeTicket(ticketNumber);

  // Local storage is a convenience check.
  // The backend still verifies every ticket before accepting a vote.
  const hasVoted =
    normalizedTicket.length > 0 &&
    (hasTicketVoted(normalizedTicket) ||
      sessionUsedTickets.includes(normalizedTicket));

  const showHint = (msg, kind = "") => {
    setHint(msg);
    setHintKind(kind);
  };

  /* "js" class on <html>, which the stylesheet uses for progressive enhancement.
     Also glide (instead of jump) when a nav link like "Vote" is clicked. */
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("js");
    if (!prefersReducedMotion()) html.style.scrollBehavior = "smooth";
    return () => {
      html.style.scrollBehavior = "";
    };
  }, []);

  /* ------------------------------------------------------------------
     Hero: the banner recedes and fades out completely, the text rises in.

     Smoothness:
       - The animation doesn't jump straight to the scroll position.
         It eases toward it every frame (SMOOTHING), which removes the
         stutter from mouse-wheel steps and trackpad bursts.
       - Layout is measured only on load/resize, never during scroll.
       - The top bar only re-renders React when it actually flips.

     Banner hiding:
       - The banner fades to 0 (not 8% like before) and is set to
         visibility: hidden once it's gone, so it can't show through
         behind the text or the sections below. It comes back when you
         scroll up again.
     ------------------------------------------------------------------ */
  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
    const hero = heroRef.current;
    const heroImg = heroImgRef.current;
    const heroText = heroTextRef.current;
    const heroCue = heroCueRef.current;
    if (!hero || !heroImg || !heroText || !heroCue) return;

    const SMOOTHING = 0.14; // 0..1 — lower = silkier but laggier
    const FADE_END = 0.55; // banner fully gone at 55% of the hero scroll

    let heroTop = 0;
    let heroHeight = 0;
    let range = 0;
    let target = 0;
    let current = 0;
    let frame = 0;
    let running = false;
    let topbarState = null;

    // The sticky stage is 100svh tall. Measuring it (instead of window.innerHeight)
    // keeps the animation from jumping when the phone's address bar shows or hides.
    const stage = heroImg.parentElement;
    let stageHeight = 0;

    const measure = () => {
      heroTop = hero.getBoundingClientRect().top + window.scrollY;
      heroHeight = hero.offsetHeight;
      stageHeight = stage.offsetHeight || window.innerHeight;
      range = heroHeight - stageHeight;
    };

    const progress = () =>
      range > 0 ? clamp((window.scrollY - heroTop) / range) : 1;

    const apply = (p) => {
      const recede = ease(p / 0.7);
      const fade = ease((p - 0.1) / (FADE_END - 0.1));
      const rise = ease((p - 0.38) / 0.42);

      heroImg.style.transform = `translate3d(0, ${(-4 * recede).toFixed(3)}vh, 0) scale(${(1 - 0.14 * recede).toFixed(4)})`;
      heroImg.style.opacity = (1 - fade).toFixed(3);
      heroImg.style.visibility = fade >= 0.999 ? "hidden" : "visible";

      heroText.style.opacity = rise.toFixed(3);
      heroText.style.transform = `translate3d(0, ${((1 - rise) * 48).toFixed(2)}px, 0)`;
      heroText.style.pointerEvents = rise > 0.5 ? "auto" : "none";

      heroCue.style.opacity = (1 - clamp(p * 6)).toFixed(3);
    };

    const updateTopbar = () => {
      const on = window.scrollY > heroTop + heroHeight - stageHeight * 0.6;
      if (on !== topbarState) {
        topbarState = on;
        setTopbarOn(on);
      }
    };

    const loop = () => {
      const diff = target - current;
      if (Math.abs(diff) < 0.0005) {
        current = target;
        running = false;
      } else {
        current += diff * SMOOTHING;
        frame = requestAnimationFrame(loop);
      }
      apply(current);
    };

    const onScroll = () => {
      updateTopbar();
      if (reduceMotion) return;
      target = progress();
      if (!running) {
        running = true;
        frame = requestAnimationFrame(loop);
      }
    };

    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    updateTopbar();
    if (!reduceMotion) {
      // Start in the right place (e.g. after a refresh halfway down the page)
      target = current = progress();
      apply(current);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("load", onResize); // images can change the height

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("load", onResize);
      cancelAnimationFrame(frame);
    };
  }, []);

  /* ------------------------------------------------------------------
     Scroll reveals
     ------------------------------------------------------------------ */
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll(".reveal") ?? [];
    if (!("IntersectionObserver" in window) || prefersReducedMotion()) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* ------------------------------------------------------------------
     Voting handlers (logic unchanged)
     ------------------------------------------------------------------ */

  // Handle ticket number changes.
  const handleTicketChange = (event) => {
    const value = event.target.value;

    setTicketNumber(value);

    const normalized = normalizeTicket(value);

    const alreadyUsed =
      normalized.length > 0 &&
      (hasTicketVoted(normalized) || sessionUsedTickets.includes(normalized));

    showHint(alreadyUsed ? "This ticket has already been used to vote." : "", alreadyUsed ? "error" : "");
  };

  // Pick a couple (from a plaque or a "Vote for Couple N" link).
  const pick = (index) => {
    if (hasVoted || submitting) return;
    setSelected(index);
    showHint("");
  };

  // Cast vote.
  const castVote = async () => {
    if (hasVoted || submitting) return;

    // Validate ticket number.
    if (!normalizedTicket) {
      showHint("Please enter your ticket number.", "error");
      return;
    }

    // Ticket numbers are exactly 6 characters: letters and/or digits.
    if (!/^[A-Za-z0-9]{6}$/.test(normalizedTicket)) {
      showHint("Your ticket number must be exactly 6 characters (letters and digits only).", "error");
      return;
    }

    // Validate selected couple.
    if (selected === null) {
      showHint("Pick a couple before you vote.", "error");
      return;
    }

    // Check local storage.
    if (hasTicketVoted(normalizedTicket)) {
      showHint("This ticket has already been used to vote.", "error");
      return;
    }

    const coupleId = COUPLES[selected].id;

    setSubmitting(true);
    showHint("");

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
        if (res.status === 409 && data.error?.toLowerCase().includes("already")) {
          saveUsedTicket(normalizedTicket);

          setSessionUsedTickets((previous) =>
            previous.includes(normalizedTicket) ? previous : [...previous, normalizedTicket]
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
        previous.includes(normalizedTicket) ? previous : [...previous, normalizedTicket]
      );

      if (savedLocally) {
        showHint("Your vote has been successfully recorded!", "ok");
      } else {
        showHint(
          "Your vote was recorded successfully, but this browser could not save the ticket locally.",
          "ok"
        );
      }
    } catch (error) {
      showHint(
        error.message || "Your vote wasn't saved. Check your connection and try again.",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    castVote();
  };

  /* ------------------------------------------------------------------
     Markup
     ------------------------------------------------------------------ */
  return (
    <div ref={rootRef}>
      <div className="grain" aria-hidden="true"></div>

      <header className={`topbar${topbarOn ? " is-on" : ""}`} id="topbar">
        <a className="topbar__mark" href="#top" aria-label="Back to top">
          <span className="script">Balul Bobocilor</span>
          <span className="topbar__title">Walk of Fame</span>
        </a>
        <nav className="topbar__nav" aria-label="Sections">
          <a href="#nominees">The Couples</a>
          <a href="#vote" className="topbar__cta">Vote</a>
        </nav>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="hero" id="hero" ref={heroRef} aria-label="Balul Bobocilor: Walk of Fame">
          <div className="hero__stage">
            <img
              className="hero__img"
              ref={heroImgRef}
              src={HERO_IMAGE}
              width="1179"
              height="1248"
              alt="Balul Bobocilor: Walk of Fame, directed by LSAC Iași. 6 December, Vivid Lounge."
              fetchPriority="high"
              decoding="async"
            />

            <div className="hero__text" ref={heroTextRef}>
              <p className="eyebrow">6 December &middot; Vivid Lounge &middot; Iași</p>
              <h1 className="hero__headline">
                Five couples.
                <br />
                <em>One star</em> on the Walk.
              </h1>
              <p className="hero__lede">
                This year's freshers' ball, directed by LSAC Iași, turns Vivid Lounge into a boulevard of
                premieres. Five couples have each stepped into their own film. Scroll down to meet them,
                then cast your vote for the pair who deserves the brightest star.
              </p>
              <a className="btn btn--ghost" href="#nominees">Meet the couples</a>
            </div>

            <div className="hero__cue" ref={heroCueRef} aria-hidden="true">
              <span>Scroll</span>
              <i></i>
            </div>
          </div>
        </section>

        {/* NOMINEES */}
        <section className="nominees" id="nominees" aria-labelledby="nominees-title">
          <div className="nominees__head reveal">
            <p className="eyebrow eyebrow--red">Now showing</p>
            <h2 id="nominees-title" className="section-title">The Couples</h2>
            <p className="section-sub">Five posters, five stories, one red carpet.</p>
          </div>

          <ol className="reel">
            {COUPLES.map((c, i) => (
              <li key={c.id} className={`take${i % 2 ? " take--flip" : ""} reveal`} data-couple={i + 1}>
                <figure className="poster">
                  <div className="poster__frame">
                    <img src={c.image} width="1179" height={c.h} loading="lazy" decoding="async" alt={c.alt} />
                  </div>
                  <figcaption className="poster__slate">
                    <span>Take {pad(i + 1)}</span>
                    <span>Walk of Fame</span>
                  </figcaption>
                </figure>
                <div className="take__copy">
                  <span className="take__num" aria-hidden="true">{pad(i + 1)}</span>
                  <p className="eyebrow eyebrow--red">Couple Nº {i + 1}</p>
                  <h3 className="take__title">{c.title}</h3>
                  <a className="take__vote" href="#vote" onClick={() => pick(i)}>
                    Vote for {c.name} <span aria-hidden="true">&rarr;</span>
                  </a>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* POLL */}
        <section className="poll" id="vote" aria-labelledby="poll-title">
          <div className="poll__head reveal">
            <p className="eyebrow eyebrow--brass">Popularity vote</p>
            <h2 id="poll-title" className="section-title section-title--light">Who earns the star?</h2>
            <p className="section-sub section-sub--light">
              Enter your ticket number and choose your favourite couple. One vote per ticket.
            </p>
          </div>

          <form className="ballot" id="ballot" noValidate onSubmit={handleSubmit}>
            {/* TICKET NUMBER */}
            <div className="ticket-field">
              <label htmlFor="ticketNumber">Enter your ticket number</label>
              <input
                id="ticketNumber"
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="e.g. MX4T9H"
                value={ticketNumber}
                onChange={handleTicketChange}
                disabled={submitting}
                autoComplete="off"
                maxLength={6}
                pattern="[A-Za-z0-9]{6}"
                aria-describedby="ticketNote voteHint"
              />
              <p className="ticket-field__note" id="ticketNote">
                Your ticket number must be <strong>exactly 6 characters</strong>, letters and/or digits
                (e.g. MX4T9H).
              </p>
            </div>

            {/* COUPLE SELECTION */}
            <p className="walk-note" id="walkNote">
              <span>&#9733;</span> Click on the couple you want to vote for <span>&#9733;</span>
            </p>

            <fieldset
              className="walk-set"
              disabled={hasVoted || submitting}
              aria-describedby="walkNote"
            >
              <legend className="sr-only">Choose your favourite couple</legend>

              <div className="walk">

                {COUPLES.map((c, i) => (
                  <label
                    key={c.id}
                    className={`plaque${hasVoted && selected === i ? " is-mine" : ""}`}
                    data-couple={i + 1}
                  >
                    <input
                      type="radio"
                      name="couple"
                      value={i}
                      checked={selected === i}
                      onChange={() => pick(i)}
                    />
                    <span className="plaque__thumb">
                      <img src={c.image} width="1179" height={c.h} loading="lazy" alt="" />
                    </span>
                    <span className="plaque__star" aria-hidden="true">
                      <svg viewBox="0 0 100 96">
                        <use href="#star" />
                      </svg>
                      <b>{i + 1}</b>
                    </span>
                    <span className="plaque__name">{c.title}</span>
                    <span className="plaque__cat">Couple Nº {i + 1}</span>
                    <span className="plaque__badge"></span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="ballot__foot">
              <button
                type="submit"
                className={`btn btn--red${submitting ? " is-busy" : ""}`}
                disabled={hasVoted || submitting}
              >
                {hasVoted ? "Vote cast" : submitting ? "Counting your vote…" : "Cast my vote"}
              </button>
              <p
                className={`ballot__status${hintKind ? ` is-${hintKind}` : ""}`}
                id="voteHint"
                role="status"
                aria-live="polite"
              >
                {hint}
              </p>
            </div>
          </form>
        </section>
      </main>

      <footer className="footer">
        <p className="script footer__script">Balul Bobocilor</p>
        <p className="footer__title">Walk of Fame</p>
        <p className="footer__meta">Directed by LSAC Iași &middot; 6 December &middot; Vivid Lounge</p>
      </footer>

      {/* Shared star shape for the poll plaques */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <path
            id="star"
            d="M50 3 L61.8 36.2 L97 37.1 L69.1 58.8 L79.4 92.6 L50 72.6 L20.6 92.6 L30.9 58.8 L3 37.1 L38.2 36.2 Z"
          />
        </defs>
      </svg>
    </div>
  );
}