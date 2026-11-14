function registerAuditListeners(eventBus, db, { logger = console, saveAudit } = {}) {
    const save = saveAudit ?? (event => db('audit_log').insert({ event_type: event.name, payload: event.payload, created_at: event.occurredAt }));
    const unsubscribe = ['reservation.created', 'reservation.cancelled'].map(name => eventBus.subscribe(name, save));
    unsubscribe.push(eventBus.subscribe('reservation.cancelled', async ({ payload }) => {
        if (payload.cancelledBy === payload.userId) return;
        const [actor, owner] = await Promise.all([
            db('users').where({ id: payload.cancelledBy }).first(), db('users').where({ id: payload.userId }).first()
        ]);
        if (actor?.role === 'ADMIN' && owner) logger.log(`[notification] to: ${owner.email} reservation ${payload.reservationId} cancelled by ADMIN`);
    }));
    return () => unsubscribe.forEach(fn => fn());
}
module.exports = { registerAuditListeners };
