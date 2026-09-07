import asyncio
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import async_session, init_db
from app.services.catalog_service import catalog_service

async def seed():
    await init_db()
    async with async_session() as db:
        print("Seeding Secure Storage...")
        
        # 1. Create Source for CSV
        csv_source = await catalog_service.create_source(
            db,
            name="Secure CSV Data",
            source_type="csv",
            connection_config={"base_path": "secure_storage/dataset"},
            description="Secure local folder for CSV datasets",
            created_by="system",
        )
        print(f"  - Created Source: {csv_source['name']}")
        
        # 2. Create Source for JSON
        json_source = await catalog_service.create_source(
            db,
            name="Secure JSON Data",
            source_type="json",
            connection_config={"base_path": "secure_storage/dataset"},
            description="Secure local folder for JSON datasets",
            created_by="system",
        )
        print(f"  - Created Source: {json_source['name']}")

        # 3. Create Source for Excel
        excel_source = await catalog_service.create_source(
            db,
            name="Secure Excel Data",
            source_type="excel",
            connection_config={"base_path": "secure_storage/dataset"},
            description="Secure local folder for Excel datasets",
            created_by="system",
        )
        print(f"  - Created Source: {excel_source['name']}")

        # Register individual files as catalog entries
        dataset_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "secure_storage", "dataset")
        if os.path.exists(dataset_path):
            for file in os.listdir(dataset_path):
                if file.endswith(".csv"):
                    await catalog_service.add_entry(
                        db,
                        data_source_id=csv_source["id"],
                        table_name=file,
                        description=f"Secure CSV dataset: {file}",
                        tags="secure,csv",
                        updated_by="system"
                    )
                    print(f"  - Added Catalog Entry: {file}")
                elif file.endswith(".json"):
                    await catalog_service.add_entry(
                        db,
                        data_source_id=json_source["id"],
                        table_name=file,
                        description=f"Secure JSON dataset: {file}",
                        tags="secure,json",
                        updated_by="system"
                    )
                    print(f"  - Added Catalog Entry: {file}")
                elif file.endswith((".xlsx", ".xls")):
                    await catalog_service.add_entry(
                        db,
                        data_source_id=excel_source["id"],
                        table_name=file,
                        description=f"Secure Excel dataset: {file}",
                        tags="secure,excel",
                        updated_by="system"
                    )
                    print(f"  - Added Catalog Entry: {file}")

        print("\n[SUCCESS] Secure Storage seeding complete!")

if __name__ == "__main__":
    asyncio.run(seed())
