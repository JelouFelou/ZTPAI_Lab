function mapUser(row) {
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role, createdAt: row.created_at } : null;
}
function createKnexUsersRepository(db) {
    return {
        async findByEmail(email) { return mapUser(await db("users").where({ email }).first()); },
        async findById(id) { return mapUser(await db("users").where({ id }).first()); },
        async create(input) {
            const [row] = await db("users").insert({ email: input.email, password_hash: input.passwordHash, role: "USER" }).returning("*");
            return mapUser(row);
        }
    };
}
module.exports = { createKnexUsersRepository };
