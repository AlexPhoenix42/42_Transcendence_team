# chess_coach/consumers.py

from channels.generic.websocket         import AsyncWebsocketConsumer

from chess_coach.services               import ask_coach_stream

import json
import logging
logger = logging.getLogger(__name__)


class CoachConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if  user is None or user.is_anonymous:
            await self.close(code=4001)
            return

        self.user = user
        await self.accept()


    async def receive(self, text_data=None, bytes_data=None):
        if  text_data is None:
            await self.send(text_data=json.dumps({"error": "Empty message."}))
            return

        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({"error": "Invalid Json."}))
            return

        question = data.get("question", "").strip()
        if  len(question) > 500:
            await self.send(text_data=json.dumps({"error": "Question must be 1-500 chars."}))
            return

        if  not question:
            question = "Comment on the last move."

        try:
            async for token in ask_coach_stream(
                question=question,
                new_fen=data.get("new_fen"),
                old_fen=data.get("old_fen"),
                eval_info=data.get("eval_info"),
            ):
                await self.send(text_data=json.dumps({"type": "stream", "token": token}))

            await self.send(text_data=json.dumps({"type": "done"}))

        except (ConnectionError, TimeoutError, OSError):
            await self.send(text_data=json.dumps
            ({"type": "error", "message": "Chess coach is offline right now."}))


    async def disconnect(self, code):
        pass
        

