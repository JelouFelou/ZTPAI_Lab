const config = require("../../knexfile");
if (!config.connection) throw new Error("Set DATABASE_URL in .env or environment");
module.exports = require("knex")(config);
