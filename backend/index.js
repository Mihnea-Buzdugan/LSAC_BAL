
require("node:dns").setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const http = require("node:http");
const { Server } = require("socket.io");
const PORT = process.env.PORT || 4000;

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/hollywood-poll";

const DB_NAME = process.env.MONGODB_DB || "BalulBobocilor";

// MongoDB collection containing the tickets.
const TICKETS_COLLECTION =
  process.env.MONGODB_TICKETS_COLLECTION || "Tickets";

// Must match the IDs in App.jsx.
const COUPLE_IDS = [
  "couple-1",
  "couple-2",
  "couple-3",
  "couple-4",
  "couple-5",
];

const app = express();

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

const CLIENT_ORIGINS = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(",").map((origin) => origin.trim())
  : true;

app.use(
  cors({
    origin: CLIENT_ORIGINS,
  })
);

app.use(express.json());

// Create an HTTP server for Express and Socket.IO.
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGINS,
    methods: ["GET", "POST"],
  },
});

// --------------------------------------------------
// DATABASE HELPERS
// --------------------------------------------------

// Access the existing tickets collection.
function getTicketsCollection() {
  return mongoose.connection.collection(TICKETS_COLLECTION);
}

// --------------------------------------------------
// ADMIN AUTHENTICATION
// --------------------------------------------------

function isValidAdminKey(providedKey) {
  const expectedKey = process.env.ADMIN_KEY;

  if (
    typeof expectedKey !== "string" ||
    !expectedKey ||
    typeof providedKey !== "string"
  ) {
    return false;
  }

  const providedBuffer = Buffer.from(providedKey);
  const expectedBuffer = Buffer.from(expectedKey);

  return (
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_KEY) {
    return res.status(503).json({
      error: "Admin access is not configured.",
    });
  }

  if (!isValidAdminKey(req.get("x-admin-key") || "")) {
    return res.status(401).json({
      error: "Invalid admin key.",
    });
  }

  next();
}

// Authenticate every admin WebSocket connection.
io.use((socket, next) => {
  if (!process.env.ADMIN_KEY) {
    return next(new Error("Admin access is not configured."));
  }

  const adminKey = socket.handshake.auth?.adminKey;

  if (!isValidAdminKey(adminKey)) {
    return next(new Error("Invalid admin key."));
  }

  next();
});

// --------------------------------------------------
// VOTING RESULTS
// --------------------------------------------------

// Calculate voting results directly from the tickets collection.
async function getResults() {
  const tickets = getTicketsCollection();

  const results = await tickets
    .aggregate([
      {
        $match: {
          hasVoted: true,
          votedCouple: { $in: COUPLE_IDS },
        },
      },
      {
        $group: {
          _id: "$votedCouple",
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const counts = Object.fromEntries(
    results.map((result) => [result._id, result.count])
  );

  // Include couples that haven't received any votes.
  return Object.fromEntries(
    COUPLE_IDS.map((id) => [id, counts[id] ?? 0])
  );
}


// Build the dashboard data.
async function getDashboardData() {
  const votes = await getResults();

  const totalVotes = Object.values(votes).reduce(
    (total, count) => total + count,
    0
  );

  return {
    votes,
    totalVotes,
  };
}

// Send voting results to one connected admin.
async function sendVoteUpdate(socket) {
  try {
    const dashboard = await getDashboardData();

    socket.emit("votes:update", dashboard);
  } catch (err) {
    console.error("Error sending initial vote update:", err);
  }
}

// Broadcast updated voting results to all connected admins.
async function broadcastVoteUpdate() {
  try {
    const dashboard = await getDashboardData();

    io.to("admins").emit("votes:update", dashboard);
  } catch (err) {
    console.error("Error broadcasting vote update:", err);
  }
}

// Handle authenticated admin connections.
io.on("connection", (socket) => {
  console.log("Admin dashboard connected:", socket.id);

  socket.join("admins");

  // Immediately send the current voting results.
  sendVoteUpdate(socket);

  socket.on("disconnect", () => {
    console.log("Admin dashboard disconnected:", socket.id);
  });
});

// --------------------------------------------------
// PUBLIC API
// --------------------------------------------------



// POST /api/votes
// Body: { ticketNumber: "123456", coupleId: "couple-1" }
//
// Finds the ticket and registers its vote.
app.post("/api/votes", async (req, res) => {
  const { ticketNumber, coupleId } = req.body ?? {};

  // Validate ticket number.
  if (
    (typeof ticketNumber !== "string" &&
      typeof ticketNumber !== "number") ||
    !String(ticketNumber).trim()
  ) {
    return res.status(400).json({
      error: "Please provide a valid ticket number.",
    });
  }

  const normalizedTicket = String(ticketNumber).trim();

  // Validate selected couple.
  if (!COUPLE_IDS.includes(coupleId)) {
    return res.status(400).json({
      error: "Unknown couple.",
    });
  }

  try {
    const tickets = getTicketsCollection();

    // Atomically find an unused ticket and register its vote.
    // $ne: true also matches documents where hasVoted is missing.
    const result = await tickets.updateOne(
      {
        ticketNumber: normalizedTicket,
        hasVoted: { $ne: true },
      },
      {
        $set: {
          votedCouple: coupleId,
          hasVoted: true,
        },
      }
    );

    // No unused ticket was found.
    if (result.matchedCount === 0) {
      const existingTicket = await tickets.findOne(
        { ticketNumber: normalizedTicket },
        { projection: { _id: 1, hasVoted: 1 } }
      );

      // Ticket doesn't exist.
      if (!existingTicket) {
        return res.status(404).json({
          error: "Ticket number not found.",
        });
      }

      // Ticket has already voted.
      if (existingTicket.hasVoted === true) {
        return res.status(409).json({
          error: "This ticket has already been used to vote.",
        });
      }

      return res.status(409).json({
        error: "Could not register this vote. Please try again.",
      });
    }

    broadcastVoteUpdate();
    
    res.status(201).json({
      message: "Vote successfully recorded!",
    });
  } catch (err) {
    console.error("Error saving vote:", err);

    res.status(500).json({
      error: "Could not save your vote.",
    });
  }
});

// --------------------------------------------------
// ADMIN API
// --------------------------------------------------

// GET /api/admin/dashboard
// Returns voting results and total votes.
app.get("/api/admin/dashboard", requireAdmin, async (_req, res) => {
  try {
    const dashboard = await getDashboardData();

    res.json(dashboard);
  } catch (err) {
    console.error("Error loading admin dashboard:", err);

    res.status(500).json({
      error: "Could not load admin dashboard.",
    });
  }
});

// POST /api/admin/tickets
// Body: { ticketNumber: "123456", name: "John Doe" }
//
// Name is optional.
// Creates a new ticket in the existing Tickets collection.
app.post("/api/admin/tickets", requireAdmin, async (req, res) => {
  const { ticketNumber, name } = req.body ?? {};

  // Validate ticket number.
  if (
    (typeof ticketNumber !== "string" &&
      typeof ticketNumber !== "number") ||
    !String(ticketNumber).trim()
  ) {
    return res.status(400).json({
      error: "Please provide a valid ticket number.",
    });
  }

  const normalizedTicket = String(ticketNumber).trim();

  if (normalizedTicket.length > 50) {
    return res.status(400).json({
      error: "Ticket number cannot exceed 50 characters.",
    });
  }

  // Validate optional name.
  if (
    name !== undefined &&
    name !== null &&
    typeof name !== "string"
  ) {
    return res.status(400).json({
      error: "Invalid ticket name.",
    });
  }

  const normalizedName =
    typeof name === "string" ? name.trim() : "";

  if (normalizedName.length > 100) {
    return res.status(400).json({
      error: "Name cannot exceed 100 characters.",
    });
  }

  try {
    const tickets = getTicketsCollection();

    // Check whether this ticket number already exists.
    const existingTicket = await tickets.findOne({
      ticketNumber: normalizedTicket,
    });

    if (existingTicket) {
      return res.status(409).json({
        error: "A ticket with this number already exists.",
      });
    }

    // Create a new unused ticket.
    const ticket = {
      ticketNumber: normalizedTicket,
      hasVoted: false,
    };

    // Only include the name if one was provided.
    if (normalizedName) {
      ticket.name = normalizedName;
    }

    const result = await tickets.insertOne(ticket);

    res.status(201).json({
      message: "Ticket created successfully.",
      ticket: {
        ...ticket,
        _id: result.insertedId,
      },
    });
  } catch (err) {
    // MongoDB duplicate key error.
    if (err.code === 11000) {
      return res.status(409).json({
        error: "A ticket with this number already exists.",
      });
    }

    console.error("Error creating ticket:", err);

    res.status(500).json({
      error: "Could not create ticket.",
    });
  }
});

// --------------------------------------------------
// CONNECT TO MONGODB AND START EXPRESS
// --------------------------------------------------

mongoose
  .connect(MONGODB_URI, { dbName: DB_NAME })
  .then(() => {
    console.log(
      `MongoDB connected: database "${mongoose.connection.name}", collection "${TICKETS_COLLECTION}"`
    );

    httpServer.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });