import asyncio
from app.db.database import async_session
from app.api.query_router import get_sql_schema

async def test():
    async with async_session() as db:
        res = await get_sql_schema(source_id="ab76e3b9865d4193b7fe176c57394365", user=None, db=db)
        print("MySQL schema:", res)
        
        res2 = await get_sql_schema(source_id="28092dd0b0b9485aa4582553f56af2fa", user=None, db=db)
        print("CSV schema:", res2)

if __name__ == "__main__":
    asyncio.run(test())
