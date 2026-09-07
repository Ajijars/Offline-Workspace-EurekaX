import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import async_session, init_db
from app.services.catalog_service import catalog_service

async def run():
    await init_db()
    async with async_session() as db:
        source = await catalog_service.create_source(
            db,
            name="My Local MySQL Database",
            source_type="sql",
            connection_config={
                "connection_string": "mysql+aiomysql://root:password@localhost:3306/your_database"
            },
            description="Placeholder for your local MySQL server.",
            created_by="system",
        )
        print(f"Created data source: {source['name']}")

if __name__ == "__main__":
    asyncio.run(run())
