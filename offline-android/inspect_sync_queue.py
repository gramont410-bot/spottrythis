"""Read only sync metadata from the connected debug app; never alter its data."""
from pathlib import Path
import json
import sqlite3
import subprocess
import tempfile

adb = "C:/Users/gramo/AppData/Local/Android/Sdk/platform-tools/adb.exe"
with tempfile.TemporaryDirectory(prefix="sync-inspect-", dir=Path(__file__).parent) as folder:
    copied = subprocess.run(
        [adb, "exec-out", "run-as", "com.example.spot", "cat", "databases/patrol_outbox.db"],
        capture_output=True, check=True
    )
    path = Path(folder) / "outbox.db"
    path.write_bytes(copied.stdout)
    connection = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    for kind, payload, error in connection.execute("SELECT kind, payload, error FROM outbox ORDER BY created"):
        data = json.loads(payload)
        result = {"kind": kind, "error": error}
        if kind == "report":
            photos = data.get("photos", [])
            result["photo_count"] = len(photos)
            result["photo_files_present"] = [
                subprocess.run([adb, "shell", "run-as", "com.example.spot", "test", "-s", photo],
                               capture_output=True).returncode == 0
                for photo in photos
            ]
        print(json.dumps(result))
    connection.close()
