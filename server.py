
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import mimetypes

# Правильный MIME-тип для JavaScript
mimetypes.add_type("text/javascript", ".js")

class HealMEHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
    }

server = ThreadingHTTPServer(
    ("127.0.0.1", 5500),
    HealMEHandler
)

print("HealME доступен по адресу http://127.0.0.1:5500")
server.serve_forever()