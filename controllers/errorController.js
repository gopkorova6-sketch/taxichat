const errorController = (err, req, res, next) => {
  const statusCode = err.statusCode ?? 500;
  const message = err.statusCode ? err.message : "Внутренняя ошибка сервера";

  if (!err.statusCode) {
    // Mongoose duplicate key
    if (err.code === 11000) {
      return res.status(409).json({
        status: "fail",
        message: "Значение поля уже используется",
      });
    }
    // Mongoose validation error
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({
        status: "fail",
        message: messages[0],
        details: messages,
      });
    }
    // Invalid ObjectId and cast errors
    if (err.name === "CastError") {
      return res.status(400).json({ status: "fail", message: "Некорректный идентификатор" });
    }
    // Malformed JSON body
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ status: "fail", message: "Некорректный формат запроса" });
    }
    console.error("Unhandled error:", err);
  }

  res.status(statusCode).json({
    status: err.status ?? "error",
    message,
    ...(err.details && { details: err.details }),
  });
};

module.exports = errorController;
