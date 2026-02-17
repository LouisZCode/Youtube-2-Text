import os
import asyncio
import logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database.connection import get_db
from database.orm import User, Subscription
from dependencies.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments")

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
STRIPE_MONTHLY_PRICE = os.getenv("STRIPE_MONTHLY_PRICE_ID")
STRIPE_YEARLY_PRICE = os.getenv("STRIPE_YEARLY_PRICE_ID")
STRIPE_LIFETIME_PRICE = os.getenv("STRIPE_LIFETIME_PRICE_ID")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


# ── Endpoints ────────────────────────────────────────────────────────


class CheckoutRequest(BaseModel):
    plan: str  # "monthly" | "lifetime"


@router.post("/checkout")
async def create_checkout(
    body: CheckoutRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")

    price_map = {
        "monthly": STRIPE_MONTHLY_PRICE,
        "yearly": STRIPE_YEARLY_PRICE,
        "lifetime": STRIPE_LIFETIME_PRICE,
    }
    price_id = price_map.get(body.plan)
    if not price_id:
        raise HTTPException(status_code=500, detail="Payment plan not configured")

    mode = "payment" if body.plan == "lifetime" else "subscription"

    # Find or create Stripe customer by email
    customers = await asyncio.to_thread(stripe.Customer.list, email=user.email, limit=1)
    if customers.data:
        customer = customers.data[0]
    else:
        customer = await asyncio.to_thread(stripe.Customer.create, email=user.email, name=user.name)

    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        mode=mode,
        customer=customer.id,
        line_items=[{"price": price_id, "quantity": 1}],
        metadata={"user_id": str(user.id)},
        success_url=FRONTEND_URL,
        cancel_url=FRONTEND_URL,
    )

    return {"url": session.url}


@router.post("/webhook")
async def handle_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    raw_body = await request.body()
    sig_header = request.headers.get("Stripe-Signature", "")

    try:
        event = stripe.Webhook.construct_event(raw_body, sig_header, STRIPE_WEBHOOK_SECRET)
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = event["type"]
    data_object = event["data"]["object"]

    # ── checkout.session.completed ──────────────────────────────────
    if event_type == "checkout.session.completed":
        user_id = data_object.get("metadata", {}).get("user_id")
        if not user_id:
            logger.warning("Checkout session missing user_id in metadata")
            return {"ok": True}

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            logger.warning(f"Webhook: user {user_id} not found")
            return {"ok": True}

        stripe_customer_id = data_object["customer"]
        stripe_subscription_id = data_object.get("subscription")  # null for one-time
        # Retrieve the price ID from line items
        line_items = await asyncio.to_thread(
            stripe.checkout.Session.list_line_items, data_object["id"], limit=1
        )
        stripe_price_id = line_items.data[0].price.id if line_items.data else ""

        sub_result = await db.execute(select(Subscription).where(Subscription.user_id == user.id))
        subscription = sub_result.scalar_one_or_none()

        user.tier = "premium"
        if subscription:
            subscription.stripe_customer_id = stripe_customer_id
            subscription.stripe_subscription_id = stripe_subscription_id
            subscription.stripe_price_id = stripe_price_id
            subscription.status = "active"
        else:
            subscription = Subscription(
                user_id=user.id,
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=stripe_subscription_id,
                stripe_price_id=stripe_price_id,
                status="active",
            )
            db.add(subscription)

        db.add(user)
        await db.commit()
        logger.info(f"checkout.session.completed → user {user_id} upgraded to premium")

    # ── customer.subscription.updated ──────────────────────────────
    elif event_type == "customer.subscription.updated":
        stripe_sub_id = data_object["id"]
        status = data_object["status"]

        sub_result = await db.execute(
            select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
        )
        subscription = sub_result.scalar_one_or_none()
        if not subscription:
            logger.warning(f"subscription.updated: no row for {stripe_sub_id}")
            return {"ok": True}

        result = await db.execute(select(User).where(User.id == subscription.user_id))
        user = result.scalar_one_or_none()

        if status == "active":
            subscription.status = "active"
            if user:
                user.tier = "premium"
        elif status in ("canceled", "past_due", "unpaid"):
            subscription.status = status
            if user:
                user.tier = "free"

        if user:
            db.add(user)
        db.add(subscription)
        await db.commit()
        logger.info(f"subscription.updated → {stripe_sub_id} status={status}")

    # ── customer.subscription.deleted ──────────────────────────────
    elif event_type == "customer.subscription.deleted":
        stripe_sub_id = data_object["id"]

        sub_result = await db.execute(
            select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
        )
        subscription = sub_result.scalar_one_or_none()
        if not subscription:
            logger.warning(f"subscription.deleted: no row for {stripe_sub_id}")
            return {"ok": True}

        result = await db.execute(select(User).where(User.id == subscription.user_id))
        user = result.scalar_one_or_none()

        subscription.status = "cancelled"
        if user:
            user.tier = "free"
            db.add(user)
        db.add(subscription)
        await db.commit()
        logger.info(f"subscription.deleted → {stripe_sub_id} cancelled")

    return {"ok": True}


@router.get("/portal")
async def get_customer_portal(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")

    result = await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    subscription = result.scalar_one_or_none()

    if not subscription:
        raise HTTPException(status_code=404, detail="No subscription found")

    session = await asyncio.to_thread(
        stripe.billing_portal.Session.create,
        customer=subscription.stripe_customer_id,
        return_url=FRONTEND_URL,
    )
    return {"url": session.url}
