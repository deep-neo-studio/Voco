
import asyncio
import edge_tts
from pathlib import Path

async def test():
    voz = "es-MX-JorgeNeural"
    texto = "Hola mundo"
    # Ensure this matches the failing path
    output_dir = Path.home() / 'Descargas' / 'Audiolibros' / 'test_manual'
    output_dir.mkdir(parents=True, exist_ok=True)
    
    archivo = output_dir / "test_file.mp3"
    print(f"Saving to: {archivo}")
    
    communicate = edge_tts.Communicate(texto, voz)
    await communicate.save(str(archivo))
    print("Done")

if __name__ == "__main__":
    asyncio.run(test())
