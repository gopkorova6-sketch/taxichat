const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const { importGeoData } = require("./geoImport");
const { GeoSource } = require("../utilities/geoSource");

const usage = () => {
  console.error("Usage: node scripts/importGeo.js <file.json>");
  console.error("The file format is described in scripts/geoImport.js; sample: data/geo-seed.json");
  process.exit(1);
};

const importFromFile = async (filePath) => {
  if (!filePath) usage();
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Copy .env.example to .env first.");
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(filePath), "utf8");
  const data = JSON.parse(raw);

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to database "${mongoose.connection.name}"`);

  // GAR/FIAS integration point: a real source implements utilities/geoSource.js
  const source = new GeoSource();
  void source; // reserved for future scheduled imports

  const summary = await importGeoData(data);
  console.log(
    `Imported: regions ${summary.regions}, cities ${summary.cities}, zones ${summary.zones}, landmarks ${summary.landmarks}`
  );

  await mongoose.disconnect();
};

importFromFile(process.argv[2]).catch((error) => {
  console.error("Import failed:", error.message);
  process.exit(1);
});
