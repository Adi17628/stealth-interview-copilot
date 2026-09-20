"""
stealth_overlay.py — Windows DWM Capture-Exclusion & Stealth Window Utility.

Mechanism:
  Uses the Windows Desktop Window Manager (DWM) API `SetWindowDisplayAffinity`
  with the `WDA_EXCLUDEFROMCAPTURE` flag (0x00000011).

How it Works:
  - When WDA_EXCLUDEFROMCAPTURE is applied to a window handle (HWND), Windows DWM
    excludes that window from ALL screen-recording and screen-sharing pipelines
    (including Google Meet getDisplayMedia, Zoom screen share, Microsoft Teams,
    OBS, Discord, and Slack).
  - The window remains 100% visible on your physical monitor, but is completely
    invisible (transparent) on the shared screen received by interviewers.

Usage:
  1. Open the AI Interview Assistant in your browser (e.g. Chrome, Edge, or an app window).
  2. Run: python stealth_overlay.py
  3. The script locates the window and applies WDA_EXCLUDEFROMCAPTURE + HWND_TOPMOST.
"""

import sys
import ctypes
from ctypes import wintypes

# Win32 API constants
WDA_NONE = 0x00000000
WDA_MONITOR = 0x00000001
WDA_EXCLUDEFROMCAPTURE = 0x00000011  # Windows 10 (2004+) & Windows 11

SWP_NOMOVE = 0x0002
SWP_NOSIZE = 0x0001
HWND_TOPMOST = -1

user32 = ctypes.windll.user32


def set_stealth_mode(hwnd: int, enable: bool = True) -> bool:
    """
    Apply or remove WDA_EXCLUDEFROMCAPTURE on a window handle.
    Returns True if successful.
    """
    affinity = WDA_EXCLUDEFROMCAPTURE if enable else WDA_NONE
    result = user32.SetWindowDisplayAffinity(wintypes.HWND(hwnd), wintypes.DWORD(affinity))
    return bool(result)


def make_always_on_top(hwnd: int) -> bool:
    """Make window float above all meeting windows (Zoom/Meet/Teams)."""
    return bool(user32.SetWindowPos(
        wintypes.HWND(hwnd),
        wintypes.HWND(HWND_TOPMOST),
        0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE
    ))


def find_assistant_windows():
    """Locate open browser or app windows for the AI Interview Assistant."""
    found = []

    def enum_windows_callback(hwnd, extra):
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buff = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buff, length + 1)
                title = buff.value
                # Match application title keywords
                if any(kw in title.lower() for kw in ["ai interview assistant", "intervai", "parakeet", "localhost:5173"]):
                    found.append((hwnd, title))
        return True

    CMPFUNC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows(CMPFUNC(enum_windows_callback), 0)
    return found


def main():
    print("=" * 65)
    print("  AI Interview Assistant — Stealth Window Protection Utility")
    print("  (WDA_EXCLUDEFROMCAPTURE: Invisible to Google Meet, Zoom, Teams)")
    print("=" * 65)

    windows = find_assistant_windows()

    if not windows:
        print("\n[!] No active 'AI Interview Assistant' window found.")
        print("    Please make sure http://localhost:5173/ is open in your browser,")
        print("    or enter a custom window title or HWND below.\n")
        
        choice = input("Enter part of window title (or HWND number): ").strip()
        if choice.isdigit():
            target_hwnd = int(choice)
            target_title = f"HWND: {target_hwnd}"
        else:
            def search_callback(hwnd, extra):
                if user32.IsWindowVisible(hwnd):
                    length = user32.GetWindowTextLengthW(hwnd)
                    if length > 0:
                        buff = ctypes.create_unicode_buffer(length + 1)
                        user32.GetWindowTextW(hwnd, buff, length + 1)
                        if choice.lower() in buff.value.lower():
                            windows.append((hwnd, buff.value))
                return True

            CMPFUNC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
            user32.EnumWindows(CMPFUNC(search_callback), 0)
            if not windows:
                print("[x] Window not found.")
                sys.exit(1)
            target_hwnd, target_title = windows[0]
    else:
        target_hwnd, target_title = windows[0]

    print(f"\n[*] Target Window Found:")
    print(f"    HWND:  {target_hwnd}")
    print(f"    Title: {target_title}")

    # 1. Apply Screen-Sharing Undetectability
    success = set_stealth_mode(target_hwnd, enable=True)
    if success:
        print("\n[+] SUCCESS: WDA_EXCLUDEFROMCAPTURE applied!")
        print("    -> This window is now 100% INVISIBLE to:")
        print("       - Google Meet (Entire Screen & Window share)")
        print("       - Microsoft Teams")
        print("       - Zoom")
        print("       - Discord / Slack / OBS")
        print("    -> It remains completely visible and interactive on your monitor.")
    else:
        print("\n[!] Warning: SetWindowDisplayAffinity failed.")
        print("    (Ensure you are running on Windows 10 v2004+ or Windows 11).")

    # 2. Make Always on Top
    make_always_on_top(target_hwnd)
    print("[+] Applied Always-on-Top (floats above Zoom/Meet/Teams).")
    print("\nPress Ctrl+C or close this console when your interview is finished.")


if __name__ == "__main__":
    main()
