# Пример текущей оплаты картой в paymentservice («Полка»).
import httpx
from fastapi import APIRouter

router = APIRouter()
ORDERS_URL = "http://orderservice"


@router.post("/payments/card")
async def pay_by_card(req: CardPaymentRequest) -> CardPaymentResponse:
    payment = await gateway.charge(req.card_token, req.amount_kopecks)
    await payments_repo.save(order_id=req.order_id, payment_id=payment.id, method="CARD", status=payment.status)
    if payment.status == "PAID":
        async with httpx.AsyncClient(timeout=2.0) as client:
            await client.post(f"{ORDERS_URL}/orders/{req.order_id}/paid")
    return CardPaymentResponse(payment_id=payment.id, status=payment.status)
