import asyncio
from app.db.database import async_session
from app.services.pipeline_service import pipeline_service

async def main():
    async with async_session() as session:
        # Create pipeline
        pipe = await pipeline_service.create(
            session, 
            name="Test", 
            steps=[{"type": "python", "code": "print('hello world')"}]
        )
        print("Created pipeline:", pipe["id"])
        
        # Run pipeline
        res = await pipeline_service.run(session, pipe["id"])
        print("Run result:", res)

asyncio.run(main())
