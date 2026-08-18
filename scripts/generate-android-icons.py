"""Generate Android app icons from the 1024x1024 source PNG."""
import os
from PIL import Image

SRC = "/home/z/my-project/public/icon-1024.png"
ANDROID_DIR = "/home/z/my-project/android-resources/mipmap"

# Standard Android icon sizes (in pixels) per density bucket
ICONS = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

# Adaptive icon foreground (108dp total = 72dp safe zone)
ADAPTIVE = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

# Play Store icon (512x512)
PLAY_STORE = 512

os.makedirs(ANDROID_DIR, exist_ok=True)
src = Image.open(SRC).convert("RGBA")

for folder, size in ICONS.items():
    out_dir = os.path.join(ANDROID_DIR, folder)
    os.makedirs(out_dir, exist_ok=True)
    icon = src.resize((size, size), Image.LANCZOS)
    icon.save(os.path.join(out_dir, "ic_launcher.png"))
    icon.save(os.path.join(out_dir, "ic_launcher_round.png"))
    print(f"  {folder}/ic_launcher.png ({size}x{size})")

# Play Store icon
play = src.resize((PLAY_STORE, PLAY_STORE), Image.LANCZOS)
play.save(os.path.join(ANDROID_DIR, "playstore-icon.png"))
print(f"  playstore-icon.png ({PLAY_STORE}x{PLAY_STORE})")

# Adaptive foreground — same source, no padding needed since source is already the icon
for folder, size in ADAPTIVE.items():
    out_dir = os.path.join(ANDROID_DIR, folder)
    os.makedirs(out_dir, exist_ok=True)
    icon = src.resize((size, size), Image.LANCZOS)
    icon.save(os.path.join(out_dir, "ic_launcher_foreground.png"))
    print(f"  {folder}/ic_launcher_foreground.png ({size}x{size})")

print("\nAll Android icons generated at", ANDROID_DIR)
