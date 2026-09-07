import asyncio
from app.db.database import async_session
from app.services.catalog_service import catalog_service

async def test():
    async with async_session() as db:
        sources = await catalog_service.list_sources(db)
        print("SOURCES:", sources)
        
        entries = await catalog_service.list_entries(db)
        print("ENTRIES:", entries)

if __name__ == "__main__":
    asyncio.run(test())
