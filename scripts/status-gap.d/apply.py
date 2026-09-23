import base64
import hashlib
import pathlib

root = pathlib.Path("scripts/status-gap.d")
expect = {
    "part00.txt": "8b9b8b28d04057b5e8cf037b356916cd40a99bdae1c4ef8280f1895695ac126c",
}
chunks = []
for name, digest in expect.items():
    raw = (root / name).read_text().strip()
    got = hashlib.sha256(raw.encode()).hexdigest()
    if got != digest:
        raise SystemExit(f"part mismatch {name} {got}")
    chunks.append(raw)
pathlib.Path("/tmp/patch.diff").write_bytes(base64.b64decode("".join(chunks)))
