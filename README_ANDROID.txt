Guía de Instalación en Android (Termux o Pydroid 3)
=====================================================

Opción A: Usando Termux (Recomendado)
-------------------------------------
1. Instala la app "Termux" (F-Droid o APK externo, la version de Play Store es antigua).
2. Copia la carpeta del proyecto a tu celular.
3. Abre Termux y navega a la carpeta.
   (Ejemplo: `cd /sdcard/Download/voco`)
4. Ejecuta el script de instalación:
   bash instalar_termux.sh
5. Inicia el servidor:
   python app.py

Opción B: Usando Pydroid 3
--------------------------
1. Instala "Pydroid 3" desde la Google Play Store.
2. Abre la app y ve al menú "Pip".
3. En "Quick Install" o "Install", escribe e instala una por una:
   - flask
   - flask-cors
   - edge-tts
   - PyPDF2
   (Nota: Pydroid no soporta 'pandoc' fácilmente, así que los EPUB podrían fallar. PDF y TXT funcionarán).
4. Abre el archivo `app.py` en Pydroid.
5. Presiona el botón de Play (▶).

¿Cómo conectar la App Móvil?
----------------------------
1. Si usas Termux/Pydroid en el MISMO celular que la App:
   - Dirección: http://localhost:5000

2. Si ejecutas en PC y la App en el celular:
   - Dirección: http://<IP_DE_TU_PC>:5000
   (Ejemplo: http://192.168.1.15:5000)
