// Payment alerting thresholds and event mapping
// Phase 7: declarative alert rules consumed by the server log + collector.
//
// To integrate with a real alerting system (PagerDuty, Slack webhook, etc.),
// override `deliverAlert` in your bootstrap. Default behavior is to log
// the alert with a [ALERT] tag for downstream log scraping.

const THRESHOLDS = {
    INVALID_WEBHOOK_SPIKE: 5,
    AMBIGUOUS_BURST: 3,
    COLLECTOR_ERRORS_MAX: 5,
    EXPIRED_RESURRECTION_WINDOW_MIN: 60,
    PAYMENT_BURST_WINDOW_SEC: 60,
    PAYMENT_BURST_THRESHOLD: 20,
    AMOUNT_COLLISION_COUNT: 3,
};

function defaultDeliver(alert) {
    const payload = {
        ts: new Date().toISOString(),
        severity: alert.severity || 'warning',
        title: alert.title,
        source: alert.source || 'payment',
        details: alert.details || {},
    };
    console.log('[ALERT]', JSON.stringify(payload));
}

let deliver = defaultDeliver;
function setAlertDeliver(fn) {
    if (typeof fn === 'function') deliver = fn;
}

function alertInvalidWebhookSpike(countInWindow) {
    if (countInWindow < THRESHOLDS.INVALID_WEBHOOK_SPIKE) return;
    deliver({
        severity: 'critical',
        title: 'Invalid webhook signature spike',
        source: 'payment.webhook',
        details: { count: countInWindow, windowSec: 300 },
    });
}

function alertAmbiguousAmountBurst(count) {
    if (count < THRESHOLDS.AMBIGUOUS_BURST) return;
    deliver({
        severity: 'warning',
        title: 'Ambiguous payment amount burst',
        source: 'payment.auto_verify',
        details: { ambiguousCount: count, windowHours: 24 },
    });
}

function alertCollectorFailures(consecutiveErrors) {
    if (consecutiveErrors < THRESHOLDS.COLLECTOR_ERRORS_MAX) return;
    deliver({
        severity: 'critical',
        title: 'Collector reached max consecutive errors',
        source: 'payment.collector',
        details: { consecutiveErrors },
    });
}

function alertExpiredResurrection(merchantOrderId, source) {
    deliver({
        severity: 'critical',
        title: 'Attempted resurrection of EXPIRED payment',
        source: 'payment.reconciler',
        details: { merchantOrderId, attemptedBy: source },
    });
}

function alertAmountMismatch(merchantOrderId, expected, provided, source) {
    deliver({
        severity: 'warning',
        title: 'Payment amount mismatch',
        source: 'payment.reconciler',
        details: { merchantOrderId, expected, provided, source },
    });
}

function alertSuccessBurst(windowSec, count) {
    if (count < THRESHOLDS.PAYMENT_BURST_THRESHOLD) return;
    deliver({
        severity: 'warning',
        title: 'Sudden payment success burst',
        source: 'payment.reconciler',
        details: { windowSec, count },
    });
}

function alertAdminMarkPaid(actorId, merchantOrderId) {
    deliver({
        severity: 'info',
        title: 'Admin manual mark-paid',
        source: 'payment.admin',
        details: { actorId, merchantOrderId },
    });
}

module.exports = {
    THRESHOLDS,
    alertAdminMarkPaid,
    alertAmountMismatch,
    alertAmbiguousAmountBurst,
    alertCollectorFailures,
    alertExpiredResurrection,
    alertInvalidWebhookSpike,
    alertSuccessBurst,
    setAlertDeliver,
};
