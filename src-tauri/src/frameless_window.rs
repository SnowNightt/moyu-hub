//! Tao keeps WS_CAPTION even for undecorated top-level windows. With shadows
//! disabled Windows can paint that classic frame over our custom titlebar.
use std::io;
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    Graphics::Dwm::{DwmSetWindowAttribute, DWMNCRP_DISABLED, DWMWA_NCRENDERING_POLICY},
    UI::{
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, GWL_STYLE,
            STYLESTRUCT, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
            WM_NCACTIVATE, WM_NCCALCSIZE, WM_NCDESTROY, WM_NCPAINT, WM_STYLECHANGING, WS_CAPTION,
            WS_EX_CLIENTEDGE, WS_EX_DLGMODALFRAME, WS_EX_STATICEDGE, WS_EX_WINDOWEDGE,
            WS_THICKFRAME,
        },
    },
};

const SUBCLASS_ID: usize = 0x4D4F5955;
const FRAME_STYLES: u32 = WS_CAPTION | WS_THICKFRAME;
const FRAME_EX_STYLES: u32 =
    WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_DLGMODALFRAME | WS_EX_STATICEDGE;

fn without_frame(index: i32, style: u32) -> u32 {
    match index {
        GWL_STYLE => style & !FRAME_STYLES,
        GWL_EXSTYLE => style & !FRAME_EX_STYLES,
        _ => style,
    }
}

unsafe extern "system" fn subclass(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    id: usize,
    _data: usize,
) -> LRESULT {
    // Suppress non-client rendering as well as the style bits. Transparent
    // WebView2/DWM surfaces can retain a classic caption after style removal.
    match message {
        WM_NCCALCSIZE | WM_NCPAINT => return 0,
        WM_NCACTIVATE => return 1,
        _ => {}
    }
    // Tao rewrites window styles when pinning, hiding or restoring. Filter the
    // proposed styles before Windows applies them, avoiding a visible frame flash.
    if message == WM_STYLECHANGING && lparam != 0 {
        let styles = &mut *(lparam as *mut STYLESTRUCT);
        styles.styleNew = without_frame(wparam as i32, styles.styleNew);
    } else if message == WM_NCDESTROY {
        RemoveWindowSubclass(hwnd, Some(subclass), id);
    }
    DefSubclassProc(hwnd, message, wparam, lparam)
}

// Called on the window's UI thread, before rounded-window clipping and first show.
pub fn install(window: &tauri::Window) -> tauri::Result<()> {
    install_for_hwnd(window.hwnd()?.0 as HWND)?;
    Ok(())
}

fn install_for_hwnd(hwnd: HWND) -> io::Result<()> {
    unsafe {
        if SetWindowSubclass(hwnd, Some(subclass), SUBCLASS_ID, 0) == 0 {
            return Err(io::Error::last_os_error());
        }
        let policy = DWMNCRP_DISABLED;
        let result = DwmSetWindowAttribute(
            hwnd,
            DWMWA_NCRENDERING_POLICY as u32,
            &policy as *const _ as _,
            std::mem::size_of_val(&policy) as u32,
        );
        if result < 0 {
            return Err(io::Error::other(format!(
                "Disabling DWM non-client rendering failed: {result:#x}"
            )));
        }
        for index in [GWL_STYLE, GWL_EXSTYLE] {
            let old = GetWindowLongPtrW(hwnd, index) as u32;
            let new = without_frame(index, old);
            if old != new {
                SetWindowLongPtrW(hwnd, index, new as isize);
            }
        }
        if SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
        ) == 0
        {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::{
        Foundation::RECT,
        UI::WindowsAndMessaging::{
            CreateWindowExW, DestroyWindow, GetClientRect, GetWindowRect, WS_CLIPSIBLINGS,
            WS_MINIMIZEBOX, WS_SYSMENU,
        },
    };

    #[test]
    fn native_frame_stays_removed_after_framework_style_updates() {
        let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
        let style = WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_CLIPSIBLINGS;
        unsafe {
            let hwnd = CreateWindowExW(
                WS_EX_WINDOWEDGE,
                class.as_ptr(),
                std::ptr::null(),
                style,
                0,
                0,
                960,
                600,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null(),
            );
            assert!(!hwnd.is_null());
            install_for_hwnd(hwnd).unwrap();
            // Reproduce Tao's style rewrites for pin/show/restore operations.
            for _ in 0..3 {
                SetWindowLongPtrW(hwnd, GWL_STYLE, style as isize);
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, WS_EX_WINDOWEDGE as isize);
                assert_eq!(GetWindowLongPtrW(hwnd, GWL_STYLE) as u32 & FRAME_STYLES, 0);
                assert_eq!(
                    GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 & FRAME_EX_STYLES,
                    0
                );
                assert_ne!(GetWindowLongPtrW(hwnd, GWL_STYLE) as u32 & WS_SYSMENU, 0);
                SetWindowPos(
                    hwnd,
                    std::ptr::null_mut(),
                    0,
                    0,
                    0,
                    0,
                    SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
                );
                let mut client = RECT::default();
                let mut outer = RECT::default();
                assert_ne!(GetClientRect(hwnd, &mut client), 0);
                assert_ne!(GetWindowRect(hwnd, &mut outer), 0);
                assert_eq!(client.right, outer.right - outer.left);
                assert_eq!(client.bottom, outer.bottom - outer.top);
            }
            assert_ne!(DestroyWindow(hwnd), 0);
        }
    }
}
