
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./Admin.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:4000"
).replace(/\/+$/, "");

const COUPLES = [
  "couple-1",
  "couple-2",
  "couple-3",
  "couple-4",
  "couple-5",
];

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data;
}

export default function Admin() {
  const [keyInput, setKeyInput] = useState("");
  const [adminKey, setAdminKey] = useState("");

  const [votes, setVotes] = useState(null);
  const [totalVotes, setTotalVotes] = useState(0);

  const [ticketNumber, setTicketNumber] = useState("");
  const [name, setName] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [socketStatus, setSocketStatus] = useState("Disconnected");

  // Keep the WebSocket instance between renders.
  const socketRef = useRef(null);

  // Disconnect when the component unmounts.
  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Load initial voting results using HTTP.
  async function loadDashboard(key) {
    const data = await requestJson(
      `${API_BASE_URL}/api/admin/dashboard`,
      {
        headers: {
          "x-admin-key": key,
        },
      }
    );

    setVotes(data.votes);
    setTotalVotes(data.totalVotes);
  }

  // Establish authenticated WebSocket connection.
  function connectToVoteUpdates(key) {
    // Disconnect any previous connection.
    socketRef.current?.disconnect();

    setSocketStatus("Connecting...");

    const socket = io(API_BASE_URL, {
      transports: ["websocket"],
      auth: {
        adminKey: key,
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    // Successfully connected.
    socket.on("connect", () => {
      setSocketStatus("Live");
      console.log("Connected to live voting updates.");
    });

    // Receive updated voting results.
    socket.on("votes:update", (data) => {
      if (!data || !data.votes) return;

      setVotes(data.votes);
      setTotalVotes(data.totalVotes ?? 0);

      console.log("Voting results updated:", data.votes);
    });

    // Connection lost.
    socket.on("disconnect", () => {
      setSocketStatus("Reconnecting...");
    });

    // Connection error.
    socket.on("connect_error", (err) => {
      setSocketStatus("Connection failed");
      console.error("WebSocket connection error:", err.message);
    });

    socketRef.current = socket;
  }

  // Admin authentication.
  async function handleLogin(event) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const key = keyInput.trim();

    try {
      // Verify admin key through the HTTP API.
      await loadDashboard(key);

      setAdminKey(key);

      // Connect to WebSocket after successful authentication.
      connectToVoteUpdates(key);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Manual refresh if needed.
  async function handleRefresh() {
    setError("");
    setLoading(true);

    try {
      await loadDashboard(adminKey);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Create a new ticket.
  async function handleCreateTicket(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    setSaving(true);

    try {
      const data = await requestJson(
        `${API_BASE_URL}/api/admin/tickets`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({
            ticketNumber: ticketNumber.trim(),
            name: name.trim(),
          }),
        }
      );

      setMessage(data.message);

      setTicketNumber("");
      setName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Admin logout.
  function handleLogout() {
    socketRef.current?.disconnect();
    socketRef.current = null;

    setSocketStatus("Disconnected");

    setAdminKey("");
    setKeyInput("");

    setVotes(null);
    setTotalVotes(0);

    setError("");
    setMessage("");
  }

  // Admin login screen.
  if (!adminKey) {
    return (
      <main className="admin-container">
        <section className="admin-login">
          <h1>Admin Panel</h1>
          <p>Enter your admin key to continue.</p>

          {error && (
            <div className="admin-error">{error}</div>
          )}

          <form onSubmit={handleLogin}>
            <label htmlFor="admin-key">
              Admin key
            </label>

            <input
              id="admin-key"
              type="password"
              value={keyInput}
              onChange={(event) =>
                setKeyInput(event.target.value)
              }
              placeholder="Enter admin key"
              required
            />

            <button type="submit" disabled={loading}>
              {loading ? "Connecting..." : "Login"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  // Calculate percentage for each couple.
  const percentage = (count) =>
    totalVotes > 0 ? (count / totalVotes) * 100 : 0;

  return (
    <main className="admin-container">
      <header className="admin-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p>Manage tickets and view voting results.</p>
        </div>

        <button
          type="button"
          className="admin-secondary-button"
          onClick={handleLogout}
        >
          Logout
        </button>
      </header>

      {error && (
        <div className="admin-error">{error}</div>
      )}

      {message && (
        <div className="admin-success">{message}</div>
      )}

      {/* Voting statistics */}
      <section className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Voting Results</h2>

            <p className="socket-status">
              WebSocket:{" "}
              <span
                className={
                  socketStatus === "Live"
                    ? "socket-live"
                    : "socket-offline"
                }
              >
                {socketStatus}
              </span>
            </p>
          </div>

          <button
            type="button"
            className="admin-secondary-button"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="admin-total-votes">
          <span>Total votes</span>
          <strong>{totalVotes}</strong>
        </div>

        <div className="vote-grid">
          {COUPLES.map((coupleId, index) => {
            const count = votes?.[coupleId] ?? 0;
            const percent = percentage(count);

            return (
              <article
                className="vote-card"
                key={coupleId}
              >
                <div className="vote-card-header">
                  <h3>Couple {index + 1}</h3>
                  <strong>{count} votes</strong>
                </div>

                <div className="vote-progress">
                  <div
                    className="vote-progress-fill"
                    style={{
                      width: `${percent}%`,
                    }}
                  />
                </div>

                <span className="vote-percentage">
                  {percent.toFixed(1)}%
                </span>
              </article>
            );
          })}
        </div>
      </section>

      {/* Ticket creation */}
      <section className="admin-section">
        <h2>Create a Ticket</h2>

        <form
          className="ticket-form"
          onSubmit={handleCreateTicket}
        >
          <div className="admin-form-field">
            <label htmlFor="ticket-number">
              Ticket number
            </label>

            <input
              id="ticket-number"
              type="text"
              value={ticketNumber}
              onChange={(event) =>
                setTicketNumber(event.target.value)
              }
              placeholder="e.g. 123456"
              maxLength={50}
              required
            />
          </div>

          <div className="admin-form-field">
            <label htmlFor="ticket-name">
              Name (optional)
            </label>

            <input
              id="ticket-name"
              type="text"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="e.g. John Doe"
              maxLength={100}
            />
          </div>

          <button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create Ticket"}
          </button>
        </form>
      </section>
    </main>
  );
}
