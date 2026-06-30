import sys
sys.path.insert(0, '/home/elle_bryson/Downloads/app-cdxgr0mgb6yp(1)')

from mallchain_mines.api_server import app

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4000, debug=True)