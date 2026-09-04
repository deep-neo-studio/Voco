import os
import sys
import threading
import time
import webbrowser

# Adjust Flask paths if running as packaged executable by PyInstaller
if getattr(sys, 'frozen', False):
    import app as myapp
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    myapp.app.template_folder = template_folder
    myapp.app.static_folder = static_folder

from app import app

def open_browser():
    # Wait a bit for the server to start before opening the browser
    time.sleep(2)
    print("Abriendo el navegador en http://127.0.0.1:5000")
    webbrowser.open('http://127.0.0.1:5000')

if __name__ == '__main__':
    # Run browser opener in the background
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run the Flask server
    print("\n🎧 Voco: Servidor Iniciado")
    print("Presiona Ctrl+C para cerrar el programa.\n")
    app.run(host='127.0.0.1', port=5000, debug=False)
