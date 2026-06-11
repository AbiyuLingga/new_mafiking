// lib/payment-broadcaster.js
// In-memory pub/sub for real-time payment status push (SSE).
// Singleton — one EventEmitter shared across the app.

const { EventEmitter } = require('events');

class PaymentBroadcaster extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(1000);
        this._subscribers = new Map(); // merchantOrderId -> Set<fn>
    }

    /**
     * Publish a paid event for a specific merchant order.
     * @param {string} merchantOrderId
     * @param {Object} payload — { status, paidAt, grantId, amount, ... }
     */
    publish(merchantOrderId, payload) {
        const event = `paid:${merchantOrderId}`;
        this.emit(event, payload);
        this.emit('paid:any', { merchantOrderId, payload });
    }

    /**
     * Subscribe to paid events for a specific merchant order.
     * Returns an unsubscribe function.
     */
    subscribe(merchantOrderId, fn) {
        const event = `paid:${merchantOrderId}`;
        this.on(event, fn);
        return () => this.off(event, fn);
    }

    /**
     * Subscribe to ALL paid events (used by admin metrics).
     * Returns an unsubscribe function.
     */
    subscribeAll(fn) {
        this.on('paid:any', fn);
        return () => this.off('paid:any', fn);
    }

    /**
     * Diagnostics: count active subscribers per order id.
     * Used by the admin metrics endpoint.
     */
    getStats() {
        return {
            totalListeners: this.listenerCount('paid:any'),
            trackedOrders: this.eventNames().filter((e) => e.startsWith('paid:') && e !== 'paid:any').length,
        };
    }
}

module.exports = new PaymentBroadcaster();
