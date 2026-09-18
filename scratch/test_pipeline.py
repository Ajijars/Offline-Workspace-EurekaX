import requests

res = requests.post('http://127.0.0.1:8000/api/pipelines/', json={
    'name': 'Test Pipeline',
    'description': '',
    'steps': [{'type': 'python', 'code': 'print("hello")'}]
})
print('Create:', res.status_code, res.text)
if res.status_code == 201:
    pid = res.json()['id']
    res2 = requests.post(f'http://127.0.0.1:8000/api/pipelines/{pid}/run')
    print('Run:', res2.status_code, res2.text)
