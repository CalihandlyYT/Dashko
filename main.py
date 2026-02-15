#!/usr/bin/env python3
"""Запуск сайта Dashko Studio с входом и отзывами (Flask + SQLite)."""

import os
import sys
import webbrowser
from pathlib import Path

HOST = "127.0.0.1"
PORT = 8000


def main():
    script_dir = Path(__file__).resolve().parent
    os.chdir(script_dir)

    # Инициализация БД и запуск Flask
    from app import app, init_db
    init_db()

    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            port = PORT
    else:
        port = int(os.environ.get("PORT", PORT))

    url = f"http://{HOST}:{port}/"
    print(f"Сайт доступен: {url}")
    print("Вход и отзывы работают через этот сервер (без Supabase). Остановка: Ctrl+C")
    webbrowser.open(url)
    app.run(host=HOST, port=port, debug=True)


if __name__ == "__main__":
    main()
