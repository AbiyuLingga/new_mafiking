# SMS / Android Notification Listener

Channel ini tidak punya runtime khusus di server. Aplikasi Android listener
harus mengirim HTTP POST ke endpoint yang sama dengan channel webhook:

`POST /api/payment/reconcile/webhook`

Payload minimal:

```json
{
  "merchantOrderId": "MFK-123-1770000000000",
  "fullAmount": 50012,
  "timestamp": 1770000000,
  "signature": "hmac-sha256"
}
```

Signature dihitung dari:

```text
merchantOrderId:fullAmount:timestamp
```

dengan secret `PAYMENT_WEBHOOK_SECRET`.
