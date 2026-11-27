import os
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

def create_geodesk_icon(out_dir=r"D:\geodesk"):
    size = 512
    # Create RGBA canvas
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))

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

    print(f"App icon generated: {ico_path} ({os.path.getsize(ico_path)} bytes)")
    return img


def create_geodesk_project_icon(out_dir=r"D:\geodesk"):
    """
    Gera o ícone de documento/projeto do GeoDesk (.geodesk).
    Design: Folha de documento com dobra superior direita (estilo Excel/Word/VSCode),
    linhas de grade cartográfica/topográfica em tons suaves e o emblema distintivo
    do globo GeoDesk em destaque no centro com etiqueta '.GEODESK'.
    """
    size = 512
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))

    # Page sheet coordinates
    page_l = 84
    page_t = 36
    page_r = 428
    page_b = 476
    fold = 96
    corner_r = 24

    # Cut points for fold
    cut_top = (page_r - fold, page_t)    # (332, 36)
    cut_right = (page_r, page_t + fold)  # (428, 132)

    # 1. Document drop shadow
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    off_y = 12
    off_x = 2
    s_poly = [
        (page_l + off_x + corner_r, page_t + off_y),
        (cut_top[0] + off_x, cut_top[1] + off_y),
        (cut_right[0] + off_x, cut_right[1] + off_y),
        (page_r + off_x, page_b + off_y - corner_r),
        (page_r + off_x - corner_r, page_b + off_y),
        (page_l + off_x + corner_r, page_b + off_y),
        (page_l + off_x, page_b + off_y - corner_r),
        (page_l + off_x, page_t + off_y + corner_r),
    ]
    s_draw.polygon(s_poly, fill=(15, 23, 42, 105))
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    img.paste(shadow, (0, 0), shadow)

    # 2. Document Page Surface Mask & Gradient
    mask = Image.new('L', (size, size), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.rounded_rectangle(
        [page_l, page_t, page_r, page_b],
        radius=corner_r,
        fill=255
    )
    # Cut off top right corner for the fold
    m_draw.polygon(
        [(cut_top[0] - 2, page_t - 2), (page_r + 2, page_t - 2), (page_r + 2, cut_right[1] + 2)],
        fill=0
    )

    page_grad = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    for y in range(page_t, page_b + 1):
        t = (y - page_t) / (page_b - page_t)
        r = int(255 * (1 - t) + 242 * t)
        g = int(255 * (1 - t) + 246 * t)
        b = int(255 * (1 - t) + 252 * t)
        for x in range(page_l, page_r + 1):
            page_grad.putpixel((x, y), (r, g, b, 255))

    page_surface = Image.composite(page_grad, Image.new('RGBA', (size, size), (0, 0, 0, 0)), mask)
    img.paste(page_surface, (0, 0), mask)

    # 3. Cartographic & Geospatial grid lines on paper (upper part)
    grid_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(grid_layer)

    # Coordinate graticule (vertical & horizontal lines)
    for gx in [135, 185, 235, 285, 335, 385]:
        g_draw.line([(gx, 70), (gx, 230)], fill=(186, 230, 253, 120), width=2)
    for gy in [80, 125, 170, 215]:
        g_draw.line([(page_l + 20, gy), (page_r - 20, gy)], fill=(186, 230, 253, 120), width=2)

    # Topographic contour lines
    g_draw.arc([page_l + 20, 60, page_r - 30, 190], 190, 350, fill=(56, 189, 248, 140), width=3)
    g_draw.arc([page_l + 50, 90, page_r - 70, 220], 195, 345, fill=(14, 165, 233, 110), width=2)

    # Stylized GIS Parcel Polygon
    parcel = [(140, 120), (210, 85), (290, 110), (270, 180), (170, 175)]
    g_draw.polygon(parcel, fill=(14, 165, 233, 22), outline=(2, 132, 199, 110), width=2)
    for px, py in parcel:
        g_draw.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(37, 99, 235, 180))

    grid_masked = Image.composite(grid_layer, Image.new('RGBA', (size, size), (0, 0, 0, 0)), mask)
    img.paste(grid_masked, (0, 0), grid_masked)

    # 4. Fold shadow & Flap (Dog-Ear)
    fold_shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    fs_draw = ImageDraw.Draw(fold_shadow)
    fs_draw.polygon([(cut_top[0] - 6, cut_top[1] + 6), (cut_top[0] - 6, cut_right[1] + 6), (cut_right[0] + 6, cut_right[1] + 6)], fill=(15, 23, 42, 90))
    fold_shadow = fold_shadow.filter(ImageFilter.GaussianBlur(8))
    fold_shadow_masked = Image.composite(fold_shadow, Image.new('RGBA', (size, size), (0, 0, 0, 0)), mask)
    img.paste(fold_shadow_masked, (0, 0), fold_shadow_masked)

    flap_mask = Image.new('L', (size, size), 0)
    fl_draw = ImageDraw.Draw(flap_mask)
    fl_draw.polygon([cut_top, (cut_top[0], cut_right[1]), cut_right], fill=255)

    flap_grad = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    for y in range(page_t, int(cut_right[1]) + 1):
        for x in range(int(cut_top[0]), page_r + 1):
            t = ((x - cut_top[0]) + (y - page_t)) / (fold * 2)
            t = max(0.0, min(1.0, t))
            r = int(220 * (1 - t) + 248 * t)
            g = int(228 * (1 - t) + 250 * t)
            b = int(240 * (1 - t) + 254 * t)
            flap_grad.putpixel((x, y), (r, g, b, 255))

    flap_surface = Image.composite(flap_grad, Image.new('RGBA', (size, size), (0, 0, 0, 0)), flap_mask)
    img.paste(flap_surface, (0, 0), flap_mask)

    doc_stroke = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ds_draw = ImageDraw.Draw(doc_stroke)
    page_outline = [
        (page_l + corner_r, page_t),
        (cut_top[0], cut_top[1]),
        (cut_right[0], cut_right[1]),
        (page_r, page_b - corner_r),
        (page_r - corner_r, page_b),
        (page_l + corner_r, page_b),
        (page_l, page_b - corner_r),
        (page_l, page_t + corner_r),
    ]
    ds_draw.polygon(page_outline, outline=(203, 213, 225, 255), width=3)
    ds_draw.line([cut_top, cut_right], fill=(148, 163, 184, 255), width=3)
    ds_draw.line([cut_top, (cut_top[0], cut_right[1])], fill=(203, 213, 225, 255), width=3)
    ds_draw.line([(cut_top[0], cut_right[1]), cut_right], fill=(203, 213, 225, 255), width=3)
    img.paste(doc_stroke, (0, 0), doc_stroke)

    # 5. GeoDesk Brand Emblem / Tile (Center-Lower)
    cx = 256
    cy = 296
    tile_w = 208
    tile_h = 208
    tile_r = 44
    tile_box = [cx - tile_w // 2, cy - tile_h // 2, cx + tile_w // 2, cy + tile_h // 2]

    # Tile drop shadow
    t_shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ts_draw = ImageDraw.Draw(t_shadow)
    ts_draw.rounded_rectangle(
        [tile_box[0] + 2, tile_box[1] + 12, tile_box[2] + 2, tile_box[3] + 14],
        radius=tile_r,
        fill=(15, 23, 42, 115)
    )
    t_shadow = t_shadow.filter(ImageFilter.GaussianBlur(14))
    img.paste(t_shadow, (0, 0), t_shadow)

    # Tile gradient (Same GeoDesk Signature Gradient: #0ea5e9 -> #2563eb -> #4338ca)
    t_grad = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    for y in range(tile_box[1], tile_box[3] + 1):
        for x in range(tile_box[0], tile_box[2] + 1):
            t = ((x - tile_box[0]) * 0.4 + (y - tile_box[1]) * 0.6) / tile_w
            t = max(0.0, min(1.0, t))
            r = int(14 * (1 - t) + 45 * t)
            g = int(165 * (1 - t * 0.7) + 55 * (t * 0.7))
            b = int(233 * (1 - t * 0.2) + 210 * (t * 0.2))
            t_grad.putpixel((x, y), (r, g, b, 255))

    t_mask = Image.new('L', (size, size), 0)
    tm_draw = ImageDraw.Draw(t_mask)
    tm_draw.rounded_rectangle(tile_box, radius=tile_r, fill=255)

    tile_surface = Image.composite(t_grad, Image.new('RGBA', (size, size), (0, 0, 0, 0)), t_mask)
    img.paste(tile_surface, (0, 0), t_mask)

    # Tile border / gloss
    t_overlay = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    to_draw = ImageDraw.Draw(t_overlay)
    to_draw.rounded_rectangle(tile_box, radius=tile_r, outline=(255, 255, 255, 80), width=3)

    # 6. Geospatial Globe & Elements inside Tile
    orbit_r = 82
    to_draw.ellipse([cx - orbit_r, cy - orbit_r, cx + orbit_r, cy + orbit_r], outline=(56, 189, 248, 85), width=2)

    sat_angle = math.radians(40)
    sx = cx + int(orbit_r * math.cos(sat_angle))
    sy = cy + int(orbit_r * math.sin(sat_angle))
    to_draw.ellipse([sx - 6, sy - 6, sx + 6, sy + 6], fill=(56, 189, 248, 255))
    to_draw.ellipse([sx - 3, sy - 3, sx + 3, sy + 3], fill=(255, 255, 255, 255))

    r_globe = 62
    globe_bg = (10, 20, 45, 230)
    to_draw.ellipse([cx - r_globe, cy - r_globe, cx + r_globe, cy + r_globe], fill=globe_bg, outline=(255, 255, 255, 235), width=4)

    to_draw.line([cx - r_globe, cy, cx + r_globe, cy], fill=(255, 255, 255, 220), width=3)

    h_offset = int(r_globe * 0.52)
    w_at_h = int(math.sqrt(r_globe**2 - h_offset**2))
    to_draw.arc([cx - w_at_h, cy - h_offset - 12, cx + w_at_h, cy - h_offset + 12], 0, 180, fill=(255, 255, 255, 175), width=2)
    to_draw.arc([cx - w_at_h, cy + h_offset - 12, cx + w_at_h, cy + h_offset + 12], 180, 360, fill=(255, 255, 255, 175), width=2)

    to_draw.line([cx, cy - r_globe, cx, cy + r_globe], fill=(255, 255, 255, 220), width=3)

    to_draw.ellipse([cx - int(r_globe * 0.55), cy - r_globe, cx + int(r_globe * 0.55), cy + r_globe], outline=(255, 255, 255, 180), width=2)

    to_draw.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], fill=(56, 189, 248, 255), outline=(255, 255, 255, 255), width=2)
    to_draw.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(255, 255, 255, 255))

    img.paste(t_overlay, (0, 0), t_overlay)

    # 7. Document Footer Badge / Extension Pill
    pill_w = 176
    pill_h = 34
    pill_y = cy + tile_h // 2 + 16
    pill_box = [cx - pill_w // 2, pill_y, cx + pill_w // 2, pill_y + pill_h]

    pill_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    p_draw = ImageDraw.Draw(pill_img)

    p_draw.rounded_rectangle([pill_box[0] + 1, pill_box[1] + 2, pill_box[2] + 1, pill_box[3] + 3], radius=8, fill=(15, 23, 42, 60))
    p_draw.rounded_rectangle(pill_box, radius=8, fill=(37, 99, 235, 255), outline=(255, 255, 255, 220), width=2)

    font = None
    for fn in ["segoeuib.ttf", "arialbd.ttf", "calibrib.ttf"]:
        try:
            font = ImageFont.truetype(fn, 19)
            break
        except Exception:
            pass

    text = ".GEODESK"
    if font:
        bbox = p_draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = cx - tw // 2
        ty = pill_y + (pill_h - th) // 2 - 2
        p_draw.text((tx, ty), text, font=font, fill=(255, 255, 255, 255))

    img.paste(pill_img, (0, 0), pill_img)

    # 8. Save PNG and ICO
    png_path = os.path.join(out_dir, "geodesk-project.png")
    img.save(png_path, "PNG")

    ico_path = os.path.join(out_dir, "geodesk-project.ico")
    icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(ico_path, format="ICO", sizes=icon_sizes)

    # Also save to public/
    public_dir = os.path.join(out_dir, "public")
    if os.path.exists(public_dir):
        img.save(os.path.join(public_dir, "geodesk-project.ico"), format="ICO", sizes=icon_sizes)
        img.save(os.path.join(public_dir, "geodesk-project.png"), "PNG")

    print(f"Project icon generated: {ico_path} ({os.path.getsize(ico_path)} bytes)")
    return img

if __name__ == "__main__":
    create_geodesk_icon()
    create_geodesk_project_icon()
