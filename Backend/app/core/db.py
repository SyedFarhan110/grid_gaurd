from firebase_admin import credentials
from google.cloud import firestore
import firebase_admin
import os
import json
from typing import Optional

class FirestoreDB:
    def __init__(self):
        self.db = None
        self.enabled = False
        
        # Path to service account key
        cred_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "serviceAccountKey.json")
        print(f"🔍 Checking for Firestore credentials at: {cred_path}")
        
        try:
            if os.path.exists(cred_path):
                print("📄 serviceAccountKey.json found! Initializing...")
                cred = credentials.Certificate(cred_path)
                project_id = cred.project_id
                
                # Initialize the main Firebase app (for other services if needed)
                try:
                    firebase_admin.initialize_app(cred)
                except ValueError:
                    pass
                
                # Explicitly create the Firestore client for the 'default' database
                self.db = firestore.Client(
                    project=project_id, 
                    database='default', 
                    credentials=cred.get_credential()
                )
                self.enabled = True
                print(f"✅ Firestore initialized (Project: {project_id}, Database: default)")
            else:
                print(f"⚠️ serviceAccountKey.json NOT found at {cred_path}")
        except Exception as e:
            print(f"❌ Failed to initialize Firestore: {e}")

    def get_db(self):
        return self.db

# Singleton instance
db_client = FirestoreDB()
