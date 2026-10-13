const server = require("./server");
const initSocket = require("./socket");
const { initJobs } = require("./jobs");

initSocket(server.expressServer);

// Background jobs run outside tests; disable with DISABLE_JOBS=1
if (process.env.NODE_ENV !== "test" && process.env.DISABLE_JOBS !== "1") {
  initJobs(process.env.MONGO_URI).catch((error) => {
    console.error("Failed to start background jobs:", error.message);
  });
}
