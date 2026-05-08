import firebase_admin
from firebase_admin import credentials, firestore
import os
import sys

def test_firestore():
    cred_path = r"c:\Users\User\Desktop\fydp\FYDP\application\Backend\serviceAccountKey.json"
    if not os.path.exists(cred_path):
        print(f"Error: Credentials not found at {cred_path}")
        return

    try:
        cred = credentials.Certificate(cred_path)
        print(f"Project ID from creds: {cred.project_id}")
        
        # Initialize default app
        try:
            app = firebase_admin.initialize_app(cred)
            print("Firebase App initialized.")
        except ValueError:
            # Already initialized
            app = firebase_admin.get_app()
            print("Using existing Firebase App.")

        db = firestore.client()
        print(f"Firestore client created for project: {db.project}")
        
        print("Attempting to list collections (this will check if DB exists)...")
        collections = db.collections()
        # This is a generator, we need to iterate or just call it
        print("Collections call successful.")
        
        print("Attempting a test write...")
        db.collection("test_connection").document("status").set({"last_check": firestore.SERVER_TIMESTAMP, "status": "ok"})
        print("✅ Test write successful! The database is working.")

    except Exception as e:
        print(f"❌ Error during test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_firestore()
