const { AppError } = require("../errors/AppError");

function errorHandler(err, req, res, next) {
    if (err.code === "23505" && err.constraint === "users_email_unique") {
        return res.status(409).json({ error: { code: "EMAIL_TAKEN", message: "Email is already taken", requestId: req.id } });
    }
    const databaseErrors = {
        "23505": [409, "UNIQUE_VIOLATION", "Resource already exists"],
        "23503": [409, "REFERENCE_CONFLICT", "Referenced resource is unavailable or still in use"],
        "23514": [400, "CONSTRAINT_VIOLATION", "Data violates a constraint"],
        "23502": [400, "CONSTRAINT_VIOLATION", "Required value is missing"],
        "23P01": [409, "ROOM_ALREADY_BOOKED", "Room is already booked in this time interval"]
    };
    if (databaseErrors[err.code]) {
        const [status, code, message] = databaseErrors[err.code];
        return res.status(status).json({ error: { code, message, requestId: req.id } });
    }
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: {
                code: err.code,
                message: err.message,
                details: err.details,
                requestId: req.id
            }
        });
    }

    if (err.type === "entity.parse.failed") {
        return res.status(400).json({
            error: {
                code: "INVALID_JSON",
                message: "Request body is not valid JSON",
                requestId: req.id
            }
        });
    }

    console.error(`[${req.id}] Unhandled Error:`, err);

    res.status(500).json({
        error: {
            code: "INTERNAL_ERROR",
            message: "Unexpected error",
            requestId: req.id
        }
    });
}

module.exports = errorHandler;

