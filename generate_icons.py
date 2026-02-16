
import os
from PIL import Image

# Paths
source_image_path = "/home/n/Escritorio/Proyectos/audiolibros/icon.png"
android_res_path = "/home/n/Escritorio/Proyectos/audiolibros/android/app/src/main/res"

# Icon configurations
# (folder_name, size)
# standard Android mipmap sizes
configs = [
    ("mipmap-mdpi", 48),
    ("mipmap-hdpi", 72),
    ("mipmap-xhdpi", 96),
    ("mipmap-xxhdpi", 144),
    ("mipmap-xxxhdpi", 192),
]

def generate_icons():
    if not os.path.exists(source_image_path):
        print(f"Error: Source image not found at {source_image_path}")
        return

    try:
        img = Image.open(source_image_path)
        
        for folder, size in configs:
            target_dir = os.path.join(android_res_path, folder)
            os.makedirs(target_dir, exist_ok=True)
            
            # Generate ic_launcher.png (square/legacy)
            resized_img = img.resize((size, size), Image.Resampling.LANCZOS)
            save_path = os.path.join(target_dir, "ic_launcher.png")
            resized_img.save(save_path)
            print(f"Generated {save_path} ({size}x{size})")
            
            # Generate ic_launcher_round.png 
            round_save_path = os.path.join(target_dir, "ic_launcher_round.png")
            resized_img.save(round_save_path) 
            print(f"Generated {round_save_path} ({size}x{size})")

    except Exception as e:
        print(f"Error processing image: {e}")

if __name__ == "__main__":
    generate_icons()
