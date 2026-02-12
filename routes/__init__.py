from .video_transcript import router as video_router
from .video_transcript_premium import router as premium_router
from .pdf_request import router as pdf_router
from .summary_router import router as summary_router
from .translate_router import router as translate_router
from .auth import router as auth_router


all_routes = [video_router, premium_router, pdf_router, summary_router, translate_router, auth_router]