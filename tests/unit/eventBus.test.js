const { createEventBus } = require('../../src/events/eventBus');
test('isolates synchronous and asynchronous errors and continues other listeners', async () => {
    const logger = { error: jest.fn() }, received = jest.fn();
    const bus = createEventBus({ logger });
    bus.subscribe('test', () => { throw new Error('sync failure'); });
    bus.subscribe('test', async () => { throw new Error('async failure'); });
    bus.subscribe('test', received);
    expect(() => bus.publish('test', { id: 1 })).not.toThrow();
    await bus.drain();
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ name: 'test', payload: { id: 1 } }));
});
