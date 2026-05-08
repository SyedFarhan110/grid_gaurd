from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
import asyncio

from app.core.stream_manager import stream_manager

router = APIRouter()

@router.get("/events", summary="📡 Connect to the real-time prediction stream (SSE)")
async def stream_events(request: Request):
    """
    Connect to this endpoint using Server-Sent Events (SSE) to receive
    a continuous stream of pipeline predictions combined with raw data.
    """
    queue = await stream_manager.add_client()
    
    async def event_generator():
        try:
            while True:
                # If client disconnects, break out
                if await request.is_disconnected():
                    break
                
                # Wait for next message from producer
                try:
                    # Timeout to check for disconnects frequently
                    message = await asyncio.wait_for(queue.get(), timeout=1.0)
                    yield f"data: {message}\n\n"
                except asyncio.TimeoutError:
                    # Send a keep-alive heartbeat if no data
                    yield "event: heartbeat\ndata: {}\n\n"
        finally:
            stream_manager.remove_client(queue)

    return StreamingResponse(
        event_generator(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable buffering for ngrok/Nginx
        }
    )
