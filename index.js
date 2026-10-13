const { expressServer } = require("./server");
const initSocket = require("./socket");
const { initJobs, getAgenda } = require("./jobs");

initSocket(expressServer);

// Background jobs run outside tests; disable with DISABLE_JOBS=1
if (process.env.NODE_ENV !== "test" && process.env.DISABLE_JOBS !== "1") {
  initJobs(process.env.MONGO_URI).catch((error) => {
    console.error("Failed to start background jobs:", error.message);
  });
}

// Graceful shutdown: stop the job scheduler, close sockets and the server
const shutdown = async () => {
  console.log("Shutting down...");
  try {
    await getAgenda()?.stop();
  } catch (error) {
    console.error("Agenda stop failed:", error.message);
  }
  expressServer.close(() => process.exit(0));
  // Force exit if connections keep the server open
  setTimeout(() => process.exit(0), 5000).unref();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
