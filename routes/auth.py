from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse

from authlib.integrations.starlette_client import OAuth
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from starlette.requests import Request
from jose import jwt
from datetime import datetime, timedelta, timezone

import os
import resend
from dotenv import load_dotenv

from dependencies.auth import get_current_user

load_dotenv()

router = APIRouter(prefix="/auth")

# Register Google as an OAuth provider.

oauth = OAuth()
oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
JWT_SECRET = os.getenv("JWT_SECRET")
resend.api_key = os.getenv("RESEND_API_KEY")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30

# This endpoint does one thing: redirect the browser to Google's consent screen.
# The redirect_uri tells Google: "after the user logs in, send them back to /auth/callback"

@router.get("/google/login")
async def login(request: Request):
    redirect_uri = request.url_for("auth_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri, prompt="select_account")


# Google redirects the user here after they log in.
# The URL contains a ?code=... param that we exchange for the user's profile.
# Then we upsert the user in our DB.

from database.connection import get_db
from database.orm import User, OAuthAccount

@router.get("/google/callback", name="auth_callback")
async def auth_callback(request: Request, db: AsyncSession = Depends(get_db)):

    # 1. Exchange Google's code for user info (server-to-server call)
    token = await oauth.google.authorize_access_token(request)
    user_info = token.get("userinfo")

    google_id = user_info["sub"]          # Google's unique ID for this user
    email = user_info["email"]
    name = user_info.get("name", "")
    avatar = user_info.get("picture")

    # 2. Check if this Google account already exists in our DB
    result = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.provider == "google",
            OAuthAccount.provider_user_id == google_id,
        )
    )
    oauth_account = result.scalar_one_or_none()

    if oauth_account:
        user_result = await db.execute(select(User).where(User.id == oauth_account.user_id))
        user = user_result.scalar_one()

    else:
        user = User(email=email, name=name, avatar_url=avatar)
        db.add(user)
        await db.flush()  # generates user.id before we reference it below

        oauth_account = OAuthAccount(
            user_id=user.id,
            provider="google",
            provider_user_id=google_id,
        )
        db.add(oauth_account)
        await db.commit()
        await db.refresh(user)

    # 3. Create a JWT — contains only the user's ID and an expiration date.
    #    Signed with our secret so nobody can forge it.
    jwt_payload = {
        "sub": str(user.id),                                              # who
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS),  # until when
    }
    jwt_token = jwt.encode(jwt_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    # 4. Set the JWT as an HTTP-only cookie and redirect to frontend.
    #    HTTP-only = JavaScript can't read it (prevents XSS theft).
    #    The browser will send it automatically on every future request.
    response = RedirectResponse(url=FRONTEND_URL)
    response.set_cookie(
        key="tubetext_token",
        value=jwt_token,
        httponly=True,
        max_age=60 * 60 * 24 * JWT_EXPIRATION_DAYS,
        samesite="lax",
    )

    return response


@router.get("/me")
async def get_me(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "name": user.name,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "tier": user.tier,
    }


@router.get("/logout")
async def logout():
    response = JSONResponse(content={"message": "Logged out"})
    response.delete_cookie(key="tubetext_token")
    return response
