// Stub of the GAR/FIAS reference source (concept 1.4).
// The import script accepts simple JSON files for now; a real integration
// implements this interface and is wired into scripts/importGeo.js.
class GeoSource {
  // Returns [{ name, oktmo }]
  async fetchRegions() {
    throw new Error("GAR/FIAS integration is not implemented: provide a JSON file instead");
  }

  // Returns [{ name, oktmo, tz }]
  async fetchCities(regionOktmo) {
    throw new Error("GAR/FIAS integration is not implemented: provide a JSON file instead");
  }
}

module.exports = { GeoSource };
