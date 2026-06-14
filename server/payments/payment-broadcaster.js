// lib/payment-broadcaster.js
// In-memory pub/sub for real-time payment status push (SSE).
// Singleton — one EventEmitter shared across the app.

const { EventEmitter } = require('events');

const DEFAULT_MAX_CONNECTIONS_PER_USER = 3; // P2-2: cap per-user SSE connections

class PaymentBroadcaster extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(1000);
        this._subscribers = new Map(); // merchantOrderId -> Set<fn>
        // P2-2 FIX: per-user SSE connection tracking to prevent DoS via
        // many concurrent tabs. Map: userId -> Set<connectionId>.
        this._userConnections = new Map();
        // Map: connectionId -> { userId, merchantOrderId, fn, openedAt }.
        this._connections = new Map();
        this._connSeq = 0;
        this._maxConnPerUser = Number(process.env.SSE_MAX_CONN_PER_USER) || DEFAULT_MAX_CONNECTIONS_PER_USER;
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
     * P2-2 FIX: register an SSE connection for a (userId, merchantOrderId)
     * pair. If the user already has `maxConnPerUser` connections, refuse
     * the new one — the SSE route should respond 429 and the client will
     * fall back to polling.
     *
     * @param {Object} args
     * @param {number|string} args.userId
     * @param {string} args.merchantOrderId
     * @param {Function} args.onPaid
     * @returns {{ ok: boolean, connectionId?: string, reason?: string }}
     */
    registerConnection({ userId, merchantOrderId, onPaid }) {
        if (!userId || !merchantOrderId || typeof onPaid !== 'function') {
            return { ok: false, reason: 'invalid_args' };
        }
        let userSet = this._userConnections.get(String(userId));
        if (!userSet) {
            userSet = new Set();
            this._userConnections.set(String(userId), userSet);
        }
        if (userSet.size >= this._maxConnPerUser) {
            return { ok: false, reason: 'too_many_connections', limit: this._maxConnPerUser };
        }
        const connectionId = `c${++this._connSeq}`;
        const unsubscribe = this.subscribe(merchantOrderId, (payload) => {
            try { onPaid(payload); } catch (_) { /* swallow handler errors */ }
        });
        const conn = {
            userId: String(userId),
            merchantOrderId,
            unsubscribe,
            openedAt: Date.now(),
        };
        this._connections.set(connectionId, conn);
        userSet.add(connectionId);
        return { ok: true, connectionId, limit: this._maxConnPerUser };
    }

    /**
     * Release a previously-registered connection.
     */
    releaseConnection(connectionId) {
        const conn = this._connections.get(connectionId);
        if (!conn) return;
        try { conn.unsubscribe(); } catch (_) {}
        this._connections.delete(connectionId);
        const userSet = this._userConnections.get(conn.userId);
        if (userSet) {
            userSet.delete(connectionId);
            if (userSet.size === 0) this._userConnections.delete(conn.userId);
        }
    }

    /**
     * Diagnostics: count active subscribers per order id.
     * Used by the admin metrics endpoint.
     */
    getStats() {
        let totalConn = 0;
        for (const set of this._userConnections.values()) totalConn += set.size;
        return {
            totalListeners: this.listenerCount('paid:any'),
            trackedOrders: this.eventNames().filter((e) => e.startsWith('paid:') && e !== 'paid:any').length,
            activeSseConnections: totalConn,
            maxConnPerUser: this._maxConnPerUser,
            uniqueUsersWithSse: this._userConnections.size,
        };
    }
}

module.exports = new PaymentBroadcaster();
