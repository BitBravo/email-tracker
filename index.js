require('dotenv').config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { Sequelize, DataTypes } = require("sequelize");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = process.env.PORT || 3000;

const sequelize = new Sequelize(process.env.DB_URL, {
  dialect: "postgres",
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

app.use(express.static(path.join(__dirname, "public")));

app.use(cors());
app.use(bodyParser.json());

// WebSocket connection to notify clients
wss.on("connection", (ws) => {
  console.log("Client connected");
  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

// Track email open and notify clients
app.get("/", async (req, res) => {
  res, send("OK");
});

// Track email open and notify clients
app.get("/track/:email_id", async (req, res) => {
  const { email_id } = req.params;

  // Update the email status to "Opened"
  await EmailLog.update(
    { status: "Opened", opened_at: new Date() },
    { where: { email_id } }
  );

  // Notify all connected clients about the email status change
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ email_id, status: "Opened" }));
    }
  });

  // Send a transparent 1x1 pixel
  res.set("Content-Type", "image/png");
  res.send(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAwAB/5PqAAAAAElFTkSuQmCC",
      "base64"
    )
  );
});

// Fetch emails with filters (people and date)
app.get("/emails", async (req, res) => {
  const { people, days } = req.query;

  const whereClause = {};
  if (people && people !== "All") whereClause.people = people;

  if (days) {
    const dateFilter = new Date();
    dateFilter.setDate(dateFilter.getDate() - parseInt(days));
    whereClause.sent_at = { [Sequelize.Op.gte]: dateFilter };
  }

  // Fetch grouped emails by people
  const emailLogs = await EmailLog.findAll({
    where: whereClause,
    group: ["people"],
    order: [["sent_at", "DESC"]],
  });

  // Group the emails by the 'people' field
  const groupedEmails = emailLogs.reduce((groups, email) => {
    const group = groups[email.people] || [];
    group.push(email);
    groups[email.people] = group;
    return groups;
  }, {});

  res.json(groupedEmails);
});

// POST route to add a new email log
app.post("/emails", async (req, res) => {
  try {
    const { email_id, email, people } = req.body;

    // Validate required fields
    if (!email_id || !email || !people) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Create a new email log
    const newEmailLog = await EmailLog.create({
      email_id,
      email,
      people,
      opened_at: null,
      sent_at: new Date(),
    });

    return res.status(201).json(newEmailLog);
  } catch (error) {
    console.error("Error adding email log:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
server.listen(port, async () => {
  await sequelize.sync();
  console.log(`Server is running on http://localhost: ${port}`);
});
