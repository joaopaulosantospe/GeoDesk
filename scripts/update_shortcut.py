import os
import ctypes
import subprocess

def update_shortcut():
    desktop = os.path.join(os.environ['USERPROFILE'], 'Desktop')
    shortcut_path = os.path.join(desktop, 'GeoDesk.lnk')
    ico_path = r"D:\geodesk\geodesk.ico"
    vbs_path = r"D:\geodesk\GeoDesk.vbs"

    # PowerShell script to configure WScript.Shell shortcut
    ps_command = f"""
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut('{shortcut_path}')
$s.TargetPath = '{vbs_path}'
$s.WorkingDirectory = 'D:\\geodesk'
$s.IconLocation = '{ico_path},0'
$s.Description = 'GeoDesk - Estação de Trabalho Geoespacial'
$s.Save()
"""
    subprocess.run(["powershell", "-NoProfile", "-Command", ps_command], check=True)
    print(f"Shortcut updated: {shortcut_path} -> icon: {ico_path}")

    # Notify Windows Shell that associations / icons changed
    try:
        # SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0
        ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)
        print("Windows Shell notified of icon update.")
    except Exception as e:
        print(f"Shell notification notice: {e}")

if __name__ == "__main__":
    update_shortcut()
