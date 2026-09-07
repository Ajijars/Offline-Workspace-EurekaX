import asyncio
from app.db.database import async_session
from app.services.sql_service import sql_service

async def test():
    async with async_session() as db:
        schema = await sql_service.get_schema(db)
        print("SCHEMA:", schema)

if __name__ == "__main__":
    asyncio.run(test())
