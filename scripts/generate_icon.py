import os
import math
from PIL import Image, ImageDraw, ImageFilter

def create_geodesk_icon():
    size = 512
    # Create RGBA canvas
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Subtle drop shadow
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    margin = 38
    s_draw.rounded_rectangle(
        [margin + 4, margin + 18, size - margin - 4, size - margin + 12],
        radius=95,
        fill=(0, 0, 0, 110)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    img.paste(shadow, (0, 0), shadow)

    # 2. Squircle base (rounded rectangle with gradient)
    # Generate vertical/diagonal gradient
    grad = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    # Colors: top-left #0ea5e9 (14, 165, 233), middle #2563eb (37, 99, 235), bottom-right #4338ca (67, 56, 202)
    for y in range(size):
        for x in range(size):
            t = (x * 0.4 + y * 0.6) / size
            r = int(14 * (1 - t) + 45 * t)
            g = int(165 * (1 - t * 0.7) + 55 * (t * 0.7))
            b = int(233 * (1 - t * 0.2) + 210 * (t * 0.2))
            grad.putpixel((x, y), (r, g, b, 255))

    # Mask for squircle
    mask = Image.new('L', (size, size), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=96,
        fill=255
    )
    
    # Inner border / gloss
    base_box = Image.composite(grad, Image.new('RGBA', (size, size), (0, 0, 0, 0)), mask)
    img.paste(base_box, (0, 0), mask)

    # Border stroke
    overlay = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    o_draw = ImageDraw.Draw(overlay)
    o_draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=96,
        outline=(255, 255, 255, 60),
        width=4
    )

    # Ambient glow inside
    cx, cy = size // 2, size // 2 - 4
    
    # Geospatial elements:
    # 3. Outer orbital / radar ring
    o_draw.ellipse([cx - 170, cy - 170, cx + 170, cy + 170], outline=(56, 189, 248, 80), width=4)
    # Satellite orbit dot
    sat_angle = math.radians(40)
    sat_r = 170
    sx = cx + int(sat_r * math.cos(sat_angle))
    sy = cy + int(sat_r * math.sin(sat_angle))
    o_draw.ellipse([sx - 12, sy - 12, sx + 12, sy + 12], fill=(56, 189, 248, 255))
    o_draw.ellipse([sx - 6, sy - 6, sx + 6, sy + 6], fill=(255, 255, 255, 255))

    # 4. Central Globe (radius 125)
    r_globe = 125
    # Globe background circle
    globe_bg = (10, 20, 45, 220)
    o_draw.ellipse([cx - r_globe, cy - r_globe, cx + r_globe, cy + r_globe], fill=globe_bg, outline=(255, 255, 255, 230), width=8)

    # Equator line
    o_draw.line([cx - r_globe, cy, cx + r_globe, cy], fill=(255, 255, 255, 220), width=6)
    # Latitude lines (+-45 deg)
    h_offset = int(r_globe * 0.52)
    w_at_h = int(math.sqrt(r_globe**2 - h_offset**2))
    # Upper latitude curve
    o_draw.arc([cx - w_at_h, cy - h_offset - 25, cx + w_at_h, cy - h_offset + 25], 0, 180, fill=(255, 255, 255, 170), width=5)
    # Lower latitude curve
    o_draw.arc([cx - w_at_h, cy + h_offset - 25, cx + w_at_h, cy + h_offset + 25], 180, 360, fill=(255, 255, 255, 170), width=5)

    # Prime Meridian (center vertical)
    o_draw.line([cx, cy - r_globe, cx, cy + r_globe], fill=(255, 255, 255, 220), width=6)
    # Elliptical meridians
    o_draw.ellipse([cx - int(r_globe * 0.55), cy - r_globe, cx + int(r_globe * 0.55), cy + r_globe], outline=(255, 255, 255, 180), width=5)

    # Central GPS/Beacon pulse pin
    # Small glowing node in center
    o_draw.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=(56, 189, 248, 255), outline=(255, 255, 255, 255), width=3)
    o_draw.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=(255, 255, 255, 255))

    img.paste(overlay, (0, 0), overlay)

    # Save PNG high-res
    out_dir = r"D:\geodesk"
    png_path = os.path.join(out_dir, "geodesk.png")
    img.save(png_path, "PNG")

    # Generate multi-size ICO
    ico_path = os.path.join(out_dir, "geodesk.ico")
    icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(ico_path, format="ICO", sizes=icon_sizes)

    # Also save to public/
    public_dir = os.path.join(out_dir, "public")
    if os.path.exists(public_dir):
        img.save(os.path.join(public_dir, "geodesk.ico"), format="ICO", sizes=icon_sizes)
        img.save(os.path.join(public_dir, "geodesk.png"), "PNG")

    print(f"Icons generated successfully: {ico_path} ({os.path.getsize(ico_path)} bytes)")

if __name__ == "__main__":
    create_geodesk_icon()
