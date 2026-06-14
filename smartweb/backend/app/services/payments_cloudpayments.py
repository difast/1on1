"""CloudPayments provider.

Credentials come from env (never the repo):
  CLOUDPAYMENTS_PUBLIC_ID   - widget public id (frontend)
  CLOUDPAYMENTS_API_SECRET  - server API password / used for webhook HMAC

Webhook authenticity: CloudPayments signs the raw request body with
HMAC-SHA256 over the API secret, base64-encoded, in the `Content-HMAC` header.
"""
import os
import hmac
import base64
import hashlib

from app.services.payments_base import PaymentProvider


class CloudPaymentsProvider(PaymentProvider):
    name = "cloudpayments"

    @property
    def public_id(self) -> str:
        return os.getenv("CLOUDPAYMENTS_PUBLIC_ID", "")

    @property
    def _secret(self) -> str:
        # Dedicated HMAC secret if provided, else the API secret.
        return os.getenv("CLOUDPAYMENTS_WEBHOOK_HMAC") or os.getenv("CLOUDPAYMENTS_API_SECRET", "")

    def checkout_config(self, *, amount: int, currency: str, description: str,
                        account_id: str, invoice_id: str, recurrent: bool) -> dict:
        cfg = {
            "provider": "cloudpayments",
            "public_id": self.public_id,
            "amount": amount / 100.0,  # CloudPayments expects major units
            "currency": currency,
            "description": description,
            "account_id": account_id,
            "invoice_id": invoice_id,
            "configured": bool(self.public_id),
        }
        if recurrent:
            # Monthly subscription by default; period adjusted by caller via amount.
            cfg["recurrent"] = {"interval": "Month", "period": 1}
        return cfg

    def verify_webhook(self, raw_body: bytes, signature: str | None) -> bool:
        secret = self._secret
        if not secret or not signature:
            return False
        digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
        expected = base64.b64encode(digest).decode("utf-8")
        try:
            return hmac.compare_digest(expected, signature)
        except Exception:
            return False

    def parse_webhook(self, form: dict) -> dict:
        status = (form.get("Status") or "").lower()
        return {
            "event": form.get("Event") or "Pay",
            "external_id": form.get("TransactionId") or form.get("Id"),
            "amount": int(round(float(form.get("Amount", 0)) * 100)),
            "currency": form.get("Currency", "RUB"),
            "account_id": form.get("AccountId"),
            "invoice_id": form.get("InvoiceId"),
            # CloudPayments Pay webhook fires only on success; Completed status too.
            "success": status in ("completed", "authorized", "") or form.get("Event") in (None, "Pay"),
        }
