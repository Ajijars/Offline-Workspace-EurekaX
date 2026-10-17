import asyncio
import httpx

async def test():
    async with httpx.AsyncClient() as client:
        # login
        res = await client.post("http://localhost:8000/api/auth/login", json={"email": "admin@eurekax.io", "password": "admin123"})
        if res.status_code != 200:
            print("Login failed:", res.text)
            return
        token = res.json()["access_token"]
        
        # get schema
        res = await client.get("http://localhost:8000/api/query/schema?source_id=local", headers={"Authorization": f"Bearer {token}"})
        print("STATUS:", res.status_code)
        print("RESPONSE:", res.text)

if __name__ == "__main__":
    asyncio.run(test())
