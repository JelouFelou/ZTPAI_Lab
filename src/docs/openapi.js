const ref = name => ({ $ref: `#/components/schemas/${name}` });
const json = schema => ({ "application/json": { schema } });
const response = (description, schema) => ({ description, ...(schema ? { content: json(schema) } : {}) });
const errors = (...codes) => Object.fromEntries(codes.map(code => [code, { $ref: `#/components/responses/Error${code}` }]));
const body = name => ({ required: true, content: json(ref(name)) });
const id = { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } };
const array = name => ({ type: "array", items: ref(name) });
const text = { type: "string" };
const positive = { type: "integer", minimum: 1 };
const date = { type: "string", format: "date-time" };
const object = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const buildingInput = { name: { type: "string", minLength: 1, maxLength: 100 }, address: { type: "string", minLength: 3, maxLength: 200 } };
const roomInput = { buildingId: positive, name: { type: "string", minLength: 1, maxLength: 100 }, capacity: positive };
const password = { type: "string", minLength: 10, maxLength: 72, format: "password", description: "Maximum 72 UTF-8 bytes (bcrypt limit)." };
const tag = (name, summary, operation) => ({ tags: [name], summary, ...operation });
module.exports = {
    openapi: "3.0.3", info: { title: "Room Booking API", version: "4.0.0", description: "Authentication, role-based access and private reservations. Demo credentials are listed in README.md." },
    servers: [{ url: "/" }], security: [{ bearerAuth: [] }],
    tags: ["Auth", "Buildings", "Rooms", "Reservations", "Documentation"].map(name => ({ name })),
    components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Paste accessToken from POST /api/auth/login." } },
        schemas: {
            Error: object({ error: object({ code: text, message: text, details: { type: "array", items: object({ location: text, field: text, message: text }) }, requestId: text }, ["code", "message", "requestId"]) }),
            Register: object({ email: { type: "string", format: "email", example: "jan@example.com" }, password }),
            Login: object({ email: { type: "string", format: "email" }, password: { ...password, minLength: 1 } }),
            User: object({ id: positive, email: { type: "string", format: "email" }, role: { type: "string", enum: ["USER", "ADMIN"] }, createdAt: date }),
            Token: object({ accessToken: text, tokenType: { type: "string", enum: ["Bearer"] }, expiresIn: { type: "string", example: "15m" } }),
            BuildingInput: object(buildingInput), BuildingPatch: { ...object(buildingInput, []), minProperties: 1 },
            Building: object({ id: positive, ...buildingInput, roomsCount: { type: "integer", minimum: 0 } }),
            BuildingSummary: object({ id: positive, name: text }),
            RoomInput: object(roomInput), RoomPatch: { ...object(roomInput, []), minProperties: 1 },
            Room: object({ id: positive, name: text, capacity: positive, building: ref("BuildingSummary") }),
            ReservationInput: object({ roomId: positive, participants: positive, startTime: date, endTime: date }),
            Reservation: object({ id: positive, room: object({ id: positive, name: text, building: ref("BuildingSummary") }),
                user: object({ id: positive, email: { type: "string", format: "email" } }), participants: positive,
                startTime: date, endTime: date, status: { type: "string", enum: ["CONFIRMED", "CANCELLED"] }, createdAt: date, cancelledAt: { ...date, nullable: true } }),
            ReservationPage: object({ data: array("Reservation"), meta: object({ page: positive, limit: positive, total: { type: "integer", minimum: 0 }, totalPages: { type: "integer", minimum: 0 } }) })
        },
        responses: Object.fromEntries([[400, "Invalid input or JSON"], [401, "Missing, invalid or expired token / invalid login credentials"],
            [403, "Role is not allowed or USER attempted to use userId filter"], [404, "Resource not found (also returned for another user's reservation)"],
            [409, "Conflict: duplicate email/name, capacity exceeded, overlap, started reservation or foreign key"], [500, "Unexpected server error"]]
            .map(([code, description]) => [`Error${code}`, response(description, ref("Error"))]))
    },
    paths: {
        "/api/auth/register": { post: tag("Auth", "Register a USER (email normalized to lowercase)", { security: [], requestBody: body("Register"), responses: { 201: response("Created; never contains password hash", ref("User")), ...errors(400, 409, 500) } }) },
        "/api/auth/login": { post: tag("Auth", "Log in and receive an HS256 token", { security: [], requestBody: body("Login"), responses: { 200: response("JWT contains sub, role, iat and exp only", ref("Token")), ...errors(400, 401, 500) } }) },
        "/api/auth/me": { get: tag("Auth", "Current account", { responses: { 200: response("User without password hash", ref("User")), ...errors(401, 500) } }) },
        "/api/buildings": {
            get: tag("Buildings", "List buildings including roomsCount", { responses: { 200: response("Buildings", array("Building")), ...errors(401, 500) } }),
            post: tag("Buildings", "ADMIN: create building", { requestBody: body("BuildingInput"), responses: { 201: response("Created", ref("Building")), ...errors(400, 401, 403, 409, 500) } })
        },
        "/api/buildings/{id}": { parameters: [id],
            get: tag("Buildings", "Get building", { responses: { 200: response("Building", ref("Building")), ...errors(400, 401, 404, 500) } }),
            patch: tag("Buildings", "ADMIN: update building", { requestBody: body("BuildingPatch"), responses: { 200: response("Updated", ref("Building")), ...errors(400, 401, 403, 404, 409, 500) } }),
            delete: tag("Buildings", "ADMIN: delete empty building (RESTRICT)", { responses: { 204: response("Deleted"), ...errors(400, 401, 403, 404, 409, 500) } })
        },
        "/api/buildings/{id}/rooms": { parameters: [id], get: tag("Buildings", "List rooms of existing building", { responses: { 200: response("Rooms (possibly empty)", array("Room")), ...errors(400, 401, 404, 500) } }) },
        "/api/rooms": {
            get: tag("Rooms", "List rooms with buildings", { responses: { 200: response("Rooms", array("Room")), ...errors(401, 500) } }),
            post: tag("Rooms", "ADMIN: create room", { requestBody: body("RoomInput"), responses: { 201: response("Created", ref("Room")), ...errors(400, 401, 403, 404, 409, 500) } })
        },
        "/api/rooms/{id}": { parameters: [id],
            get: tag("Rooms", "Get room with building", { responses: { 200: response("Room", ref("Room")), ...errors(400, 401, 404, 500) } }),
            patch: tag("Rooms", "ADMIN: update room", { requestBody: body("RoomPatch"), responses: { 200: response("Updated", ref("Room")), ...errors(400, 401, 403, 404, 409, 500) } }),
            delete: tag("Rooms", "ADMIN: delete room without reservations (RESTRICT)", { responses: { 204: response("Deleted"), ...errors(400, 401, 403, 404, 409, 500) } })
        },
        "/api/reservations": {
            get: tag("Reservations", "USER: own reservations; ADMIN: all or filtered by userId", {
                parameters: Object.entries({ roomId: positive, buildingId: positive, userId: { ...positive, description: "ADMIN only; USER receives 403" }, status: { type: "string", enum: ["CONFIRMED", "CANCELLED"] },
                    from: { ...date, description: "Overlap: endTime > from" }, to: { ...date, description: "Overlap: startTime < to; must be after from" }, page: { ...positive, default: 1 },
                    limit: { ...positive, maximum: 100, default: 20 }, sort: { type: "string", enum: ["startTime", "-startTime", "createdAt", "-createdAt", "participants", "-participants"], default: "startTime" } })
                    .map(([name, schema]) => ({ name, in: "query", required: false, schema })),
                responses: { 200: response("Filtered page; out-of-range page returns empty data", ref("ReservationPage")), ...errors(400, 401, 403, 500) }
            }),
            post: tag("Reservations", "Create reservation owned by the authenticated user", { description: "15 minutes to 8 hours, future start. userId and reservedBy are rejected. Business rules apply to ADMIN too.", requestBody: body("ReservationInput"), responses: { 201: response("Created", ref("Reservation")), ...errors(400, 401, 404, 409, 500) } })
        },
        "/api/reservations/{id}": { parameters: [id], get: tag("Reservations", "Owner or ADMIN: get private reservation", { responses: { 200: response("Reservation", ref("Reservation")), ...errors(400, 401, 404, 500) } }) },
        "/api/reservations/{id}/cancel": { parameters: [id], patch: tag("Reservations", "Owner or ADMIN: cancel; repeated cancellation is idempotent", { responses: { 200: response("Cancelled", ref("Reservation")), ...errors(400, 401, 404, 409, 500) } }) },
        "/api/docs": { get: tag("Documentation", "Public Swagger UI", { security: [], responses: { 200: { description: "Swagger UI", content: { "text/html": { schema: text } } } } }) },
        "/api/docs/openapi.json": { get: tag("Documentation", "Public OpenAPI document", { security: [], responses: { 200: response("OpenAPI 3.0 document", { type: "object" }) } }) }
    }
};
