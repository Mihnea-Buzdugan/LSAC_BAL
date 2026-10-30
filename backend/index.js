// Works with a default `npm init` project (CommonJS). Use as your main file (index.js / server.js / app.js).
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const PORT = process.env.PORT || 4000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/hollywood-poll";
// Forces the database name, whatever the connection string says.
const DB_NAME = process.env.MONGODB_DB || "BalulBobocilor";

// Must match the `id` values of COUPLES in App.jsx.
const COUPLE_IDS = ["couple-1", "couple-2", "couple-3", "couple-4", "couple-5"];

// One document per couple, holding its vote count.
const voteSchema = new mongoose.Schema({
  coupleId: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
});
// Third argument forces the exact collection name "Votes".
const Vote = mongoose.model("Vote", voteSchema, "Votes");

// Returns { "couple-1": 3, "couple-2": 0, ... } including couples with no votes yet.
async function getResults() {
  const docs = await Vote.find({ coupleId: { $in: COUPLE_IDS } }).lean();
  const counts = Object.fromEntries(docs.map((d) => [d.coupleId, d.count]));
  return Object.fromEntries(COUPLE_IDS.map((id) => [id, counts[id] ?? 0]));
}

const app = express();

// Lets the React app (a different port/origin) call this API.
// In production set CLIENT_ORIGIN to your site's URL, e.g. https://my-poll.com
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN
      ? process.env.CLIENT_ORIGIN.split(",")
      : true,
  })
);
app.use(express.json());

// GET /api/votes -> current results
app.get("/api/votes", async (_req, res) => {
  try {
    res.json({ votes: await getResults() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load votes." });
  }
});

// POST /api/votes  { coupleId: "couple-2" } -> adds one vote, returns new results
app.post("/api/votes", async (req, res) => {
  const { coupleId } = req.body ?? {};
  if (!COUPLE_IDS.includes(coupleId)) {
    return res.status(400).json({ error: "Unknown couple." });
  }
  try {
    // Atomic increment, so simultaneous votes never overwrite each other.
    await Vote.updateOne({ coupleId }, { $inc: { count: 1 } }, { upsert: true });
    res.status(201).json({ votes: await getResults() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save your vote." });
  }
});

mongoose
  .connect(MONGODB_URI, { dbName: DB_NAME })
  .then(() => {
    console.log(`MongoDB connected: database "${mongoose.connection.name}", collection "Votes"`);
    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });