"""Package the editable Android project without local caches or build outputs."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import shutil
import xml.etree.ElementTree as ET

directory = Path(__file__).resolve().parent
project = directory / "trythis"
excluded = {".git", ".gradle", ".idea", "build", ".kotlin", ".cxx", ".externalNativeBuild"}
archive = directory / "SPOT-offline-patrol-project.zip"
with ZipFile(archive, "w", compression=ZIP_DEFLATED) as output:
    for file in project.rglob("*"):
        relative = file.relative_to(project)
        if file.is_file() and not excluded.intersection(relative.parts) and file.name != "local.properties":
            output.write(file, Path("trythis") / relative)
with ZipFile(archive) as output:
    assert output.testzip() is None
apk = directory / "SPOT-offline-patrol-debug.apk"
shutil.copy2(project / "app/build/outputs/apk/debug/app-debug.apk", apk)
reports = [ET.parse(path).getroot() for path in (project / "app/build/test-results/testDebugUnitTest").glob("TEST-*.xml")]
print({"tests": sum(int(r.attrib["tests"]) for r in reports),
       "failures": sum(int(r.attrib["failures"]) for r in reports),
       "errors": sum(int(r.attrib["errors"]) for r in reports)})
print(f"Project: {archive} ({archive.stat().st_size:,} bytes)")
print(f"APK: {apk} ({apk.stat().st_size:,} bytes)")
