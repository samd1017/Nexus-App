import base64
import hashlib
import pathlib

root = pathlib.Path("scripts/backlink-cover.d")
expect = {
    "part00.txt": "491bc8496873fcb71d5d88c13ea7bb59a90da9523f7d78e3a4cb8de0cb69ee8f",
    "part01.txt": "26790a5cafa0764d57c56bfb6ece061784b82c4c1e6debf23db2b9790afde9c2",
    "part02.txt": "ba1a05e72ab4e52076de36f994ced24a1473187e29ce049d52b3e68a1d248e74",
    "part03.txt": "fa8bfdf3086eba42ce3559652f69a2763b9d837548683b02bf7bad476abbeadf",
    "part04.txt": "79bbae69073da73639ab006d567f82b0c349935acc97cf569d7fed3aff35f564",
}
chunks = []
for name, digest in expect.items():
    raw = (root / name).read_text().strip()
    got = hashlib.sha256(raw.encode()).hexdigest()
    if got != digest:
        raise SystemExit(f"part mismatch {name} {got}")
    chunks.append(raw)
pathlib.Path("/tmp/patch.diff").write_bytes(base64.b64decode("".join(chunks)))
