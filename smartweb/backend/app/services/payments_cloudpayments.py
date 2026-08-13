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
import uuid
import logging

from app.services.payments_base import PaymentProvider

log = logging.getLogger("billing.cloudpayments")

# Базовый адрес серверного API CloudPayments (S2S). Меняется только через env,
# чтобы в тестах/песочнице указать другой хост.
API_BASE = os.getenv("CLOUDPAYMENTS_API_BASE", "https://api.cloudpayments.ru")


class CloudPaymentsProvider(PaymentProvider):
    name = "cloudpayments"

    @property
    def public_id(self) -> str:
        return os.getenv("CLOUDPAYMENTS_PUBLIC_ID", "")

    @property
    def _api_secret(self) -> str:
        return os.getenv("CLOUDPAYMENTS_API_SECRET", "")

    @property
    def _secret(self) -> str:
        # Dedicated HMAC secret if provided, else the API secret.
        return os.getenv("CLOUDPAYMENTS_WEBHOOK_HMAC") or os.getenv("CLOUDPAYMENTS_API_SECRET", "")

    def configured(self) -> bool:
        """Готов ли провайдер к серверным вызовам (заданы public_id и API-секрет).
        Пока боевые ключи не подключены — все S2S-вызовы возвращают not_configured
        и НИКУДА не ходят, приём денег не включается."""
        return bool(self.public_id and self._api_secret)

    # ── Серверное API (S2S): подписки ────────────────────────────────────────
    # Реализовано полностью и готово к работе, но БЕЗ боевых ключей не выполняет
    # реальных вызовов (см. configured()). X-Request-ID добавляется на КАЖДЫЙ
    # исходящий запрос для идемпотентности и трассировки.

    def _api_post(self, path: str, payload: dict, request_id: str | None = None) -> dict:
        if not self.configured():
            return {"configured": False, "success": False, "reason": "no_live_keys"}
        import httpx
        rid = request_id or str(uuid.uuid4())
        auth = (self.public_id, self._api_secret)
        headers = {"Content-Type": "application/json", "X-Request-ID": rid}
        url = f"{API_BASE}{path}"
        try:
            with httpx.Client(timeout=20) as client:
                r = client.post(url, json=payload, headers=headers, auth=auth)
            data = r.json() if r.content else {}
            return {"configured": True, "http_status": r.status_code,
                    "success": bool(data.get("Success")), "model": data.get("Model"),
                    "request_id": rid, "raw": data}
        except Exception as e:
            log.warning("CloudPayments S2S error on %s: %s", path, type(e).__name__)
            return {"configured": True, "success": False, "error": type(e).__name__, "request_id": rid}

    def subscription_update(self, subscription_id: str, *, amount: float | None = None,
                            interval: str | None = None, period: int | None = None,
                            description: str | None = None, request_id: str | None = None) -> dict:
        """Subscriptions/Update — изменить параметры рекуррентной подписки
        (сумма/интервал) при апгрейде тарифа. Пустые поля не отправляем."""
        payload: dict = {"Id": subscription_id}
        if amount is not None:
            payload["Amount"] = amount
        if interval:
            payload["Interval"] = interval          # "Month" | "Year"
        if period:
            payload["Period"] = period
        if description:
            payload["Description"] = description
        return self._api_post("/subscriptions/update", payload, request_id)

    def subscription_cancel(self, subscription_id: str, request_id: str | None = None) -> dict:
        """Subscriptions/Cancel — отменить рекуррентную подписку у провайдера."""
        return self._api_post("/subscriptions/cancel", {"Id": subscription_id}, request_id)

    def checkout_config(self, *, amount: int, currency: str, description: str,
                        account_id: str, invoice_id: str, recurrent: bool,
                        period: str = "month") -> dict:
        """period — расчётный период тарифа: "month" (Start, 1 490 ₽) либо
        "year" (Team, 49 990 ₽ единовременно). Интервал подписки CloudPayments
        задаётся по нему: Month/1 или Year/1. Рассрочка не используется:
        по годовому тарифу списывается вся сумма сразу."""
        cfg = {
            "provider": "cloudpayments",
            "public_id": self.public_id,
            "amount": amount / 100.0,  # CloudPayments expects major units
            "currency": currency,
            "description": description,
            "account_id": account_id,
            "invoice_id": invoice_id,
            "period": period,
            "configured": bool(self.public_id),
        }
        if recurrent:
            cfg["recurrent"] = {
                "interval": "Year" if period == "year" else "Month",
                "period": 1,
            }
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
        """Нормализуем уведомление CloudPayments.

        Различаем два вида по составу полей:
          - платёж (Pay/Fail): есть TransactionId (и обычно InvoiceId);
          - подписка (Recurrent/Cancel): есть Id подписки и Status из набора
            Active/PastDue/Cancelled/Rejected/Expired.
        """
        status = (form.get("Status") or "")
        status_l = status.lower()
        tx_id = form.get("TransactionId")
        is_payment = bool(tx_id) or bool(form.get("InvoiceId"))
        # Статусы подписки CloudPayments (Recurrent-уведомление).
        SUB_STATES = {"active", "pastdue", "cancelled", "rejected", "expired"}
        kind = "payment" if is_payment else ("subscription" if status_l in SUB_STATES else "payment")
        return {
            "kind": kind,
            "event": form.get("Event") or ("Recurrent" if kind == "subscription" else "Pay"),
            "external_id": tx_id or form.get("Id"),
            "subscription_id": form.get("Id") if kind == "subscription" else None,
            "sub_status": status if kind == "subscription" else None,
            "amount": int(round(float(form.get("Amount", 0)) * 100)),
            "currency": form.get("Currency", "RUB"),
            "account_id": form.get("AccountId"),
            "invoice_id": form.get("InvoiceId"),
            # Pay-уведомление приходит только при успехе; Completed/Authorized тоже успех.
            "success": kind == "payment" and (status_l in ("completed", "authorized", "") or form.get("Event") in (None, "Pay")),
        }
