import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_PUBLISHABLE_KEY")

if not url or not key:
    print("ERROR: Supabase credentials not found.")
    exit()

supabase = create_client(url, key)

print("✅ Supabase connection created successfully!")
print("Project:", url)