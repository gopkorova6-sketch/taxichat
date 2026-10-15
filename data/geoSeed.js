// Seed and sample reference data for the geo import (concept 1.4):
// 3 regions, 5 cities with 2-5 zones each (with adjacency) and landmarks.
// scripts/seed.js imports this module; data/geo-seed.json is its JSON export
// for scripts/importGeo.js.
module.exports = {
  regions: [
    { name: "Республика Татарстан", oktmo: "92000000" },
    { name: "Самарская область", oktmo: "36000000" },
    { name: "Москва", oktmo: "45000000" },
    { name: "Иркутская область", oktmo: "25000000" },
  ],
  cities: [
    // Города Слюдянского района Иркутской области — активны по умолчанию.
    // Слюдянка — основной город проекта.
    {
      name: "Слюдянка",
      oktmo: "25616101",
      region: "Иркутская область",
      status: "ACTIVE",
      alwaysActive: true,
      zones: [
        { name: "Центр", neighbors: ["Слюдянка-2", "Вокзал"] },
        { name: "Слюдянка-2", neighbors: ["Центр"] },
        { name: "Вокзал", neighbors: ["Центр"] },
      ],
      landmarks: [
        { name: "ЖД вокзал Слюдянки", zone: "Вокзал", aliases: ["ЖД", "вокзал"] },
        { name: "Станция Слюдянка-2", zone: "Слюдянка", aliases: ["Слюдянка-2"] },
      ],
    },
    {
      name: "Байкальск",
      oktmo: "25616103",
      region: "Иркутская область",
      status: "ACTIVE",
      alwaysActive: true,
      zones: [{ name: "Байкальск", neighbors: ["Слюдянка", "Култук"] }],
      landmarks: [
        { name: "Гора Соболиная", zone: "Байкальск", aliases: ["Соболиная", "горнолыжка"] },
        { name: "Байкальский ЦБК", zone: "Байкальск", aliases: ["ЦБК"] },
      ],
    },
    {
      name: "Култук",
      oktmo: "25616404",
      region: "Иркутская область",
      status: "ACTIVE",
      alwaysActive: true,
      zones: [
        { name: "Култук", neighbors: ["Слюдянка", "Байкальск"] },
        { name: "Рынок", neighbors: ["Култук"] },
      ],
      landmarks: [{ name: "Култукский рынок", zone: "Култук", aliases: ["рынок"] }],
    },
    { name: "Ангасолка", oktmo: "25616412", region: "Иркутская область", status: "ACTIVE", alwaysActive: true },
    { name: "Андрияновская", oktmo: "25616414", region: "Иркутская область", status: "ACTIVE", alwaysActive: true },
    { name: "Бабха", oktmo: "25616416", region: "Иркутская область", status: "ACTIVE", alwaysActive: true },
    { name: "Буровщина", oktmo: "25616418", region: "Иркутская область", status: "ACTIVE", alwaysActive: true },
    { name: "Быстрая", oktmo: "25616420", region: "Иркутская область", status: "ACTIVE", alwaysActive: true },
    { name: "Мангутай", oktmo: "25616422", region: "Иркутская область", status: "ACTIVE", alwaysActive: true },
    { name: "Мурино", oktmo: "25616424", region: "Иркутская область", status: "ACTIVE", alwaysActive: true },
    { name: "Новоснежная", oktmo: "25616426", region: "Иркутская область", status: "ACTIVE", alwaysActive: true },
    { name: "Орехово", oktmo: "25616428", region: "Иркутская область", status: "ACTIVE", alwaysActive: true },
    { name: "Солзан", oktmo: "25616430", region: "Иркутская область", status: "ACTIVE", alwaysActive: true },
    { name: "Сухой Ручей", oktmo: "25616432", region: "Иркутская область", status: "ACTIVE", alwaysActive: true },
    { name: "Тибельти", oktmo: "25616434", region: "Иркутская область", status: "ACTIVE", alwaysActive: true },
    { name: "Утулик", oktmo: "25616436", region: "Иркутская область", status: "ACTIVE", alwaysActive: true },
  ],
};
