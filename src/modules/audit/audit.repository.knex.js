function createAuditRepository(db) {
    return {
        async findAll({ page, limit, eventType }) {
            const query = db('audit_log');
            if (eventType) query.where('event_type', eventType);
            const [{ total }] = await query.clone().count('* as total');
            const data = await query.clone().select('*').orderBy('created_at', 'desc').orderBy('id', 'desc').limit(limit).offset((page - 1) * limit);
            return { data, meta: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } };
        }
    };
}
module.exports = { createAuditRepository };
