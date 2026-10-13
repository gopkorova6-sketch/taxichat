const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer = null;

// Uses MONGO_URI_TEST when provided, otherwise spins up an in-memory MongoDB
const connectTestDb = async () => {
  if (process.env.MONGO_URI_TEST) {
    await mongoose.connect(process.env.MONGO_URI_TEST, {
      dbName: "taxichat_test",
    });
    return null;
  }
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri("taxichat_test"));
  return mongoServer;
};

const disconnectTestDb = async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
};

const clearTestDb = async () => {
  const collections = mongoose.connection.collections;
  for (const collection of Object.values(collections)) {
    await collection.deleteMany({});
  }
};

module.exports = { connectTestDb, disconnectTestDb, clearTestDb };
