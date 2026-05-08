"""
Firestore Cleanup Script
------------------------
Usage:
  # Delete a specific collection
  python clear_firestore.py pipeline_results

  # Delete ALL collections in the database
  python clear_firestore.py --all

  # Delete the default 'pipeline_results' collection (no args)
  python clear_firestore.py
"""

import sys
import time
from app.core.db import db_client


def delete_collection(collection_name: str, batch_size: int = 50):
    """Delete all documents in a Firestore collection in batches."""
    if not db_client.enabled:
        print("ERROR: Firestore is not enabled. Check your serviceAccountKey.json.")
        return 0

    collection_ref = db_client.db.collection(collection_name)
    deleted_count = 0

    while True:
        docs = list(collection_ref.limit(batch_size).stream())
        if not docs:
            break

        batch = db_client.db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()

        deleted_count += len(docs)
        print(f"  Deleted {deleted_count} documents from '{collection_name}'...")
        time.sleep(0.1)  # Avoid hitting rate limits

    return deleted_count


def delete_all_collections(batch_size: int = 50):
    """Delete all collections in the Firestore database."""
    if not db_client.enabled:
        print("ERROR: Firestore is not enabled. Check your serviceAccountKey.json.")
        return

    print("Listing all collections...")
    collections = list(db_client.db.collections())

    if not collections:
        print("No collections found. Database is already empty.")
        return

    print(f"Found {len(collections)} collection(s):")
    for col in collections:
        print(f"  - {col.id}")

    print()
    confirm = input("Are you sure you want to delete ALL collections? (yes/no): ").strip().lower()
    if confirm != "yes":
        print("Aborted.")
        return

    total_deleted = 0
    for col in collections:
        print(f"\nDeleting collection: '{col.id}'")
        count = delete_collection(col.id, batch_size)
        print(f"  Done. Deleted {count} documents from '{col.id}'.")
        total_deleted += count

    print(f"\nAll done! Total documents deleted: {total_deleted}")


if __name__ == "__main__":
    args = sys.argv[1:]

    if "--all" in args:
        delete_all_collections()
    else:
        # Default to pipeline_results if no argument given
        collection_name = args[0] if args else "pipeline_results"
        print(f"Deleting collection: '{collection_name}'...")
        count = delete_collection(collection_name)
        if count == 0:
            print(f"Collection '{collection_name}' is already empty or does not exist.")
        else:
            print(f"\nDone! Deleted {count} documents from '{collection_name}'.")
