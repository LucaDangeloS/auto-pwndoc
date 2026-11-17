import os
import socket
import subprocess
import sys
import time
import traceback

import uno
from com.sun.star.beans import PropertyValue


def property_value(name, value):
    result = PropertyValue()
    result.Name = name
    result.Value = value
    return result


def main(input_path, output_path, profile_path):
    with socket.socket() as port_socket:
        port_socket.bind(("127.0.0.1", 0))
        port = port_socket.getsockname()[1]

    profile_url = uno.systemPathToFileUrl(os.path.abspath(profile_path))
    accept = f"socket,host=127.0.0.1,port={port};urp;StarOffice.ServiceManager"
    office = subprocess.Popen([
        "soffice",
        "--headless",
        "--invisible",
        "--nologo",
        "--nodefault",
        "--norestore",
        "--nofirststartwizard",
        f"-env:UserInstallation={profile_url}",
        f"--accept={accept}",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    document = None
    desktop = None
    try:
        local_context = uno.getComponentContext()
        resolver = local_context.ServiceManager.createInstanceWithContext(
            "com.sun.star.bridge.UnoUrlResolver", local_context)
        deadline = time.monotonic() + 30
        remote_context = None
        connection = f"uno:socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext"
        while time.monotonic() < deadline:
            if office.poll() is not None:
                raise RuntimeError("LibreOffice exited before its UNO service became ready")
            try:
                remote_context = resolver.resolve(connection)
                break
            except Exception:
                time.sleep(0.2)
        if remote_context is None:
            raise RuntimeError("Timed out waiting for LibreOffice UNO service")

        desktop = remote_context.ServiceManager.createInstanceWithContext(
            "com.sun.star.frame.Desktop", remote_context)
        load_options = (
            property_value("Hidden", True),
            property_value("ReadOnly", True),
            property_value("FilterName", "MS Word 2007 XML"),
        )
        document = desktop.loadComponentFromURL(
            uno.systemPathToFileUrl(os.path.abspath(input_path)), "_blank", 0, load_options)
        if document is None:
            raise RuntimeError("LibreOffice could not open the generated DOCX")

        document.getTextFields().refresh()
        indexes = document.getDocumentIndexes()
        index_count = indexes.getCount()
        for index in range(index_count):
            indexes.getByIndex(index).update()
        document.getTextFields().refresh()
        for index in range(index_count):
            indexes.getByIndex(index).update()

        export_options = (
            property_value("FilterName", "writer_pdf_Export"),
            property_value("Overwrite", True),
        )
        document.storeToURL(uno.systemPathToFileUrl(os.path.abspath(output_path)), export_options)
        print(f"Updated {index_count} document indexes before PDF export")
    finally:
        if document is not None:
            try:
                document.close(True)
            except Exception:
                try:
                    document.dispose()
                except Exception:
                    pass
        if desktop is not None:
            try:
                desktop.terminate()
            except Exception:
                pass
        try:
            office.wait(timeout=5)
        except subprocess.TimeoutExpired:
            office.terminate()
            try:
                office.wait(timeout=5)
            except subprocess.TimeoutExpired:
                office.kill()
                office.wait()


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: refresh_docx_fields.py INPUT.docx OUTPUT.pdf PROFILE_DIR")
    try:
        main(sys.argv[1], sys.argv[2], sys.argv[3])
    except Exception as error:
        traceback.print_exc()
        raise SystemExit(str(error))
