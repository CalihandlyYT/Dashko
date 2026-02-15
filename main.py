#!/usr/bin/env python3
"""Запуск локального сервера для сайта Dashko Studio."""

import http.server
import os
import sys
import webbrowser
from pathlib import Path

HOST = "127.0.0.1"
PORT = 8000


def main():
    script_dir = Path(__file__).resolve().parent
    os.chdir(script_dir)

    handler = http.server.SimpleHTTPRequestHandler
    try:
        server = http.server.HTTPServer((HOST, PORT), handler)
    except OSError as e:
        if e.errno == 98 or "WinError 10048" in str(e) or "address already in use" in str(e).lower():
            print(f"Порт {PORT} занят. Запустите с другим портом: python main.py 8080", file=sys.stderr)
        else:
            raise
        sys.exit(1)

    url = f"http://{HOST}:{PORT}/"
    print(f"Сайт доступен: {url}")
    print("Остановка: Ctrl+C")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен.")
        server.shutdown()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            PORT = int(sys.argv[1])
        except ValueError:
            print("Использование: python main.py [порт]", file=sys.stderr)
            sys.exit(1)
    main()
