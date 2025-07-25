require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = process.env.PORT || 3000;

mongoose
  .connect(process.env.DB_URL || "mongodb://127.0.0.1:27017/emails")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("Error connecting to MongoDB:", err));

// Create the email log schema and model
const emailLogSchema = new mongoose.Schema({
  email_id: { type: String, required: true },
  email: { type: String, required: true },
  people: { type: String, required: true },
  status: { type: String, required: false },
  senderIp: { type: String, required: false },
  opened_at: { type: Date, default: null },
  sent_at: { type: Date, required: true },
});

const EmailLog = mongoose.model("EmailLog", emailLogSchema);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_secret_key",
    resave: false,
    saveUninitialized: false,
  })
);

// app.use(express.static(path.join(__dirname, "public")));

app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// WebSocket connection to notify clients
wss.on("connection", (ws) => {
  console.log("Client connected");
  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

const requireLogin = (req, res, next) => {
  if (req.session.loggedIn) {
    return next();
  }
  res.redirect("/");
};

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Handle login POST
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.AUTH_USER &&
    password === process.env.AUTH_PASS
  ) {
    req.session.loggedIn = true;
    return res.redirect("/dashboard");
  }

  res.send("Invalid credentials. <a href='/'>Try again</a>");
});

app.get("/dashboard", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Track email open and notify clients
app.get("/track/:email_id", async (req, res) => {
  const { email_id } = req.params;
  let clientIp = req.headers["x-forwarded-for"];
  // console.log("Client Ip", clientIp);

  // Update the email status to "Opened"
  await EmailLog.updateOne(
    { email_id, senderIp: { $ne: clientIp } },
    { status: "Opened", opened_at: new Date() }
  );

  // Notify all connected clients about the email status change
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ email_id, status: "Opened" }));
    }
  });

  // Send a transparent 1x1 pixel
  const base64Image =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAwAB/5PqAAAAAElFTkSuQmCC";
  res.setHeader("Content-Type", "image/png");
  res.send(Buffer.from(base64Image, "base64"));
});

// Fetch emails with filters (people and date)
app.get("/emails", async (req, res) => {
  const { people, days, status } = req.query;

  const filter = {};
  if (people && people !== "All") filter.people = people;

  if (days) {
    const now = new Date();
    const midnightUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    midnightUTC.setUTCDate(midnightUTC.getUTCDate() - parseInt(days));
    filter.sent_at = { $gte: midnightUTC };
  }

  // Filter by status
  if (status && status !== "All") {
    filter.status = status;
  }

  try {
    const emailLogs = await EmailLog.find(filter).sort({ sent_at: -1 });

    // Group the emails by the 'people' field
    const groupedEmails = emailLogs.reduce((groups, email) => {
      const group = groups[email.people] || [];
      group.push(email);
      groups[email.people] = group;
      return groups;
    }, {});

    res.json(groupedEmails);
  } catch (error) {
    console.error("Error fetching emails:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST route to add a new email log
app.post("/emails", async (req, res) => {
  try {
    const { email_id, email, people } = req.body;
    let clientIp = req.connection.remoteAddress;
    if (clientIp.startsWith("::ffff:")) {
      clientIp = clientIp.substring(7);
    }
    // console.log("Server Ip", clientIp);

    // Validate required fields
    if (!email_id || !email || !people) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Create a new email log
    const newEmailLog = new EmailLog({
      email_id,
      email,
      people,
      senderIp: clientIp,
      status: "Sent",
      opened_at: null,
      sent_at: new Date(),
    });

    await newEmailLog.save();

    return res.status(201).json(newEmailLog);
  } catch (error) {
    console.error("Error adding email log:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
server.listen(port, async () => {
  console.log(`Server is running on http://localhost:${port}`);
});
