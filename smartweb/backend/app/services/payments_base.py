"""Payment provider abstraction.

Keeps the billing engine independent of the concrete provider so CloudPayments,
Alfa-Bank or YooKassa are just different implementations of this interface.
"""
import os
from abc import ABC, abstractmethod


class PaymentProvider(ABC):
    name = "base"

    @abstractmethod
    def checkout_config(self, *, amount: int, currency: str, description: str,
                        account_id: str, invoice_id: str, recurrent: bool) -> dict:
        """Return the data the frontend needs to open the payment UI."""
        ...

    @abstractmethod
    def verify_webhook(self, raw_body: bytes, signature: str | None) -> bool:
        """Validate the authenticity of an incoming webhook."""
        ...

    @abstractmethod
    def parse_webhook(self, form: dict) -> dict:
        """Normalize a provider webhook into a common shape:
        {event, external_id, amount, currency, account_id, invoice_id, success}
        """
        ...


def get_provider() -> "PaymentProvider":
    """Select the active provider via env (PAYMENT_PROVIDER, default cloudpayments)."""
    name = os.getenv("PAYMENT_PROVIDER", "cloudpayments").lower()
    # Future providers (alfabank, yookassa, stripe) plug in here.
    from app.services.payments_cloudpayments import CloudPaymentsProvider
    return CloudPaymentsProvider()
