"""
prepare_db.py — Builds the QA embeddings SQLite database from CSV.

Usage:
    cd backend
    python prepare_db.py
"""

import os
import sys
import sqlite3
import numpy as np
import pandas as pd

from pathlib import Path

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    raise ImportError(
        "sentence-transformers is required. Install with: pip install sentence-transformers"
    )

# ── Configuration ──────────────────────────────────────
ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"

CSV_PATH = DATA_DIR / "qa_pairs.csv"
DB_PATH = DATA_DIR / "qa_embeddings.db"
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
BATCH_SIZE = 64


def to_blob(arr: np.ndarray) -> bytes:
    """Convert numpy float32 array to bytes for SQLite BLOB storage."""
    return arr.astype(np.float32).tobytes()


def main():
    print(f"[prepare_db] CSV: {CSV_PATH}")
    print(f"[prepare_db] DB:  {DB_PATH}")

    if not CSV_PATH.exists():
        print(f"ERROR: CSV not found at {CSV_PATH}")
        sys.exit(1)

    # Read CSV
    df = pd.read_csv(CSV_PATH)
    print(f"[prepare_db] Loaded {len(df)} rows")

    # Validate required columns
    for col in ["question", "answer"]:
        if col not in df.columns:
            print(f"ERROR: CSV missing required column: '{col}'")
            sys.exit(1)

    # Auto-generate IDs if missing
    if "id" not in df.columns:
        df.insert(0, "id", range(1, len(df) + 1))

    # Ensure tags column exists
    if "tags" not in df.columns:
        df["tags"] = ""

    # Load embedding model
    print(f"[prepare_db] Loading model: {MODEL_NAME}", flush=True)
    model = SentenceTransformer(MODEL_NAME)

    # Compute embeddings in batches
    questions = df["question"].fillna("").astype(str).tolist()
    all_embs = []
    print(f"[prepare_db] Computing embeddings for {len(questions)} questions...", flush=True)

    for i in range(0, len(questions), BATCH_SIZE):
        batch = questions[i:i + BATCH_SIZE]
        print(f"[prepare_db] Encoding batch {i+1} to {min(i+BATCH_SIZE, len(questions))}...", flush=True)
        embs = model.encode(batch, show_progress_bar=False, convert_to_numpy=True)
        # Normalize to unit vectors
        norms = np.linalg.norm(embs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        embs = embs / norms
        all_embs.append(embs.astype(np.float32))

    all_embs = np.vstack(all_embs)
    emb_dim = all_embs.shape[1]
    print(f"[prepare_db] Embeddings shape: {all_embs.shape}", flush=True)

    # Ensure data directory exists
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Remove existing DB
    if DB_PATH.exists():
        DB_PATH.unlink()

    # Create SQLite database
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE qa_embeddings (
            id INTEGER PRIMARY KEY,
            question TEXT,
            answer TEXT,
            tags TEXT,
            embedding BLOB,
            emb_dim INTEGER
        )
    """)
    conn.commit()

    # Insert rows
    print("[prepare_db] Inserting rows...")
    for idx, row in df.iterrows():
        cursor.execute(
            "INSERT INTO qa_embeddings (id, question, answer, tags, embedding, emb_dim) VALUES (?, ?, ?, ?, ?, ?)",
            (
                int(row["id"]),
                str(row["question"]),
                str(row["answer"]),
                str(row.get("tags", "")),
                sqlite3.Binary(to_blob(all_embs[idx])),
                int(emb_dim),
            ),
        )

    conn.commit()
    conn.close()
    print(f"[prepare_db] Done. Database created at: {DB_PATH}")


if __name__ == "__main__":
    main()
