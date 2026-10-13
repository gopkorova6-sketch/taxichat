// Normalizes a Russian phone to +7XXXXXXXXXX; returns null for invalid input
const normalizePhone = (raw) => {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "8") digits = `7${digits.slice(1)}`;
  if (digits.length === 11 && digits[0] === "7") return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return null;
};

// Short car caption shown to passengers, e.g. "Белая 456"
const carCaption = (car) =>
  [car.color, car.plate, car.brand].filter(Boolean).join(" ");

// Two drivers of one city must not share the same color+plate pair
const sameCarPair = (a, b) =>
  String(a.car?.color ?? "").trim().toLowerCase() ===
    String(b.car?.color ?? "").trim().toLowerCase() &&
  String(a.car?.plate ?? "").trim().toLowerCase() ===
    String(b.car?.plate ?? "").trim().toLowerCase();

module.exports = { normalizePhone, carCaption, sameCarPair };
