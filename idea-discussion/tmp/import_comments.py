import csv
import json
import html
import os
import requests

# 実際のファイル名に変更してください
csv_file = "driving.csv"
# 実際のテーマIDに変更してください
theme_id = "xxxxxxxxxxx"
# 実際のエンドポイントに変更してください
base_url = os.getenv("IDEA_FRONTEND_API_BASE_URL", f"http://localhost:{os.getenv('PORT', '3100')}")
base_url = base_url.rstrip("/")
if base_url.endswith("/api"):
    base_url = base_url[:-4]
endpoint = f"{base_url}/api/themes/{theme_id}/import/generic"

with open(csv_file, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        content = html.unescape(row["content"]).replace("<br>", "\n")
        source_type = row["sourceType"]
        source_url = row["sourceUrl"]

        payload = {
            "sourceType": source_type,
            "content": content,
            "metadata": {
                "url": source_url
            }
        }

        headers = {
            "Content-Type": "application/json"
        }

        response = requests.post(endpoint, headers=headers, data=json.dumps(payload))

        print(f"Sent: {source_url} → Status {response.status_code}")
        if response.status_code != 200:
            print("  Response:", response.text)
