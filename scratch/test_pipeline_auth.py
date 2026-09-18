import asyncio
from app.db.database import async_session
from app.db.models import User
from app.auth.security import create_access_token
import requests

async def main():
    async with async_session() as session:
        user = User(email="test@test.com", password_hash="hash", full_name="Test")
        session.add(user)
        await session.commit()
        await session.refresh(user)
        
        token = create_access_token({"sub": user.email})
        
        headers = {"Authorization": f"Bearer {token}"}
        
        res = requests.post('http://127.0.0.1:8000/api/pipelines/', json={
            'name': 'Test Pipeline',
            'description': '',
            'steps': [{'type': 'python', 'code': 'print("hello")'}]
        }, headers=headers)
        
        print('Create:', res.status_code, res.text)
        if res.status_code == 201:
            pid = res.json()['id']
            res2 = requests.post(f'http://127.0.0.1:8000/api/pipelines/{pid}/run', headers=headers)
            print('Run:', res2.status_code, res2.text)

asyncio.run(main())
