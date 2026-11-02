const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const port = process.env.PORT;
const bodyParser = require("body-parser");
const http = require("http");
const { Server } = require("socket.io");

// Routers
const authRouter = require("./routes/authentication/authRoutes");
const InnovationlabRouter = require("./routes/innovationIdea/innovationLabRoutes");
const AutomationReqRouter = require("./routes/automationRequest/AutomationRequestsRoutes");
const AiEnthusiastsRouter = require("./routes/aiEnthusiast/AiEnthusiastsRoutes");
const SupportReqRouter = require("./routes/supportRequest/SupportRequestRoutes");
const messageRouter = require("./routes/messageRoutes");
const commentReactionRouter = require("./routes/commentReactionRoutes");
const dashboardRouter = require("./routes/dashboard/dashboardRoutes");
const userManagementRouter = require("./routes/userManagement/UserManagementRoutes");
const requestTransferController = require("./routes/requestTransferRoutes");
const requestExportRouter = require("./routes/requestExportRoutes");
const path = require("path");
const requestLogger = require("./middlewares/requestLogger");
const errorHandler = require("./middlewares/errorHandler");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger/swaggerSpec");


const corsOptions = {
  origin: (origin, callback) => {
    // Allow all origins (reflection) for seamless multi-environment access
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "authorization"
  ],
  exposedHeaders: ["Content-Disposition"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Explicit CORS header fallback middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, authorization"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.get("/health", (req, res) => {
  res.send("Hello" );
});
// Middleware setup
app.use(express.raw({ type: "application/octet-stream", limit: "10mb" }));
app.use(express.static("uploads"));
app.get("/", (req, res) => res.send("Hello"));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Body parser
app.use(bodyParser.json({ limit: "25mb" }));
app.use(bodyParser.urlencoded({ limit: "25mb", extended: true }));
app.use(requestLogger);

// Swagger Documentation with Bearer Authorization
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "A2I API Documentation",
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: "none",
      filter: true,
    },
  })
);

// Routes
app.use("/api", authRouter);
app.use("/api", InnovationlabRouter);
app.use("/api", AutomationReqRouter);
app.use("/api", AiEnthusiastsRouter);
app.use("/api", SupportReqRouter);
app.use("/api", messageRouter);
app.use("/api", commentReactionRouter);
app.use("/api", dashboardRouter);
app.use("/api", userManagementRouter);
app.use("/api", requestTransferController)
app.use("/api", requestExportRouter);

app.use(errorHandler);

// HTTP + Socket.IO setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.SOCKET_URL || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// 🔹 Socket.IO connection handling
io.on("connection", (socket) => {

  // Export progress: any client can follow any request's export room
  socket.on("join-export", (room) => socket.join(room));
  socket.on("export-progress", ({ room, data }) => io.to(room).emit("export-progress", data));

  // =============================
  // 🔸 JOIN ROOM EVENTS
  // =============================
  socket.on("join-user", (userId) => {
    socket.join(`user_${userId}`);
  });

  socket.on("join-innovation", (innovationId) => {
    socket.join(`innovation_${innovationId}`);
  });

  socket.on("join-automation", (automationId) => {
    socket.join(`automation_${automationId}`);
  });

  socket.on("join-enthusiast", (enthusiastId) => {
    socket.join(`enthusiast_${enthusiastId}`);
  });

  socket.on("join-reaction-room", (roomName) => {
    socket.join(`reaction_${roomName}`);
  });

  socket.on("join-reaction-item", (data) => {
    const roomName = `${data.request_type}_${data.request_id}`;
    socket.join(roomName);
  });

  // =============================
  // 🔸 CHAT ROOM HANDLERS
  // =============================
  socket.on("join-chat", (data) => {
    const roomName = `chat_${data.request_id}_${data.request_type}`;
    socket.join(roomName);
  });

  socket.on("send-message", (data) => {

    const roomName = `chat_${data.request_id}_${data.request_type}`;

    io.to(roomName).emit("new-message", {
      message_id: data.message_id,
      request_id: data.request_id,
      request_type: data.request_type,
      sender_type: data.sender_type,
      emp_id: data.emp_id,
      emp_name: data.emp_name,
      message: data.message,
      created_at: data.created_at || new Date().toISOString(),
    });

  });

  socket.on("messages-seen", (data) => {
    const roomName = `chat_${data.request_id}_${data.request_type}`;
    socket.to(roomName).emit("messages-read", {
      request_id: data.request_id,
      request_type: data.request_type,
      read_by: data.emp_name,
      read_by_emp_id: data.emp_id,
      read_at: new Date().toISOString(),
    });
  });

  // =============================
  // 🔸 NOTIFICATIONS & STATUS UPDATES
  // =============================
  socket.on("send-notification", (data) => {
    socket.to(`user_${data.userId}`).emit("receive-notification", data);
  });

  socket.on("innovation-status-update", (data) => {
    io.to(`innovation_${data.innovationId}`).emit("innovation-status-changed", data);
  });

  socket.on("automation-status-update", (data) => {
    io.to(`automation_${data.automationId}`).emit("automation-status-changed", data);
  });

  socket.on("enthusiast-status-update", (data) => {
    io.to(`enthusiast_${data.enthusiastId}`).emit("enthusiast-status-changed", data);
  });

  // =============================
  // 🔸 COMMENT & REACTION EVENTS
  // =============================
  socket.on("reaction-updated", (data) => {
    io.emit("reaction-updated", data);
  });

  socket.on("comment-added", (data) => {
    const roomName = `${data.request_type}_${data.request_id}`;
    io.to(roomName).emit("comment-added", data);
  });

  socket.on("comment-updated", (data) => {
    io.emit("comment-updated", data);
  });

  socket.on("comment-reaction-updated", (data) => {
    io.emit("comment-reaction-updated", data);
  });

  socket.on("comment-reply-added", (data) => {
    io.emit("comment-reply-added", data);
  });

  // =============================
  // 🔸 USER MANAGEMENT EVENTS
  // =============================
  socket.on("user-role-change", (data) => {
    io.emit("user-role-updated", data);

    // Force logout the affected user
    io.to(`user_${data.emp_id}`).emit("force-logout", {
      message: "Your role has been changed. Please login again.",
      reason: "role_changed"
    });
  });

  socket.on("user-role-status-change", (data) => {
    io.emit("user-role-status-changed", data);

    // Force logout the affected user
    io.to(`user_${data.emp_id}`).emit("force-logout", {
      message: "Your role status has been updated. Please login again.",
      reason: "role_status_changed"
    });
  });

  socket.on("user-role-delete", (data) => {
    io.emit("user-role-deleted", data);
        io.to(`user_${data.emp_id}`).emit("force-logout", {
      message: "Your role has been deleted. Please login again.",
      reason: "role_status_deleted"
    });

    // In your server.js socket.io setup
socket.on('notify-user-role-change', (data) => {
  // Send notification ONLY to the specific user
  // io.to(`user_${data.emp_id}`).emit('role-changed-notification', data);
});

socket.on('notify-user-status-change', (data) => {
  // Send notification ONLY to the specific user
  io.to(`user_${data.emp_id}`).emit('role-changed-notification', data);
});

socket.on('notify-user-role-deleted', (data) => {
  // Send notification ONLY to the specific user
  io.to(`user_${data.emp_id}`).emit('role-changed-notification', data);
});
  });

  // =============================
  // 🔸 DISCONNECT
  // =============================
  socket.on("disconnect", () => {
  });
});

// Make io available to routes
app.set("io", io);

// Start server
const start = async () => {
  try {
    server.listen(port, () =>
      console.log(`Server is listening on port ${port}...`)
    );
  } catch (error) {
    console.log(error);
  }
};

start();
