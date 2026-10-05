//! Read-only verification of a running native window, using its HWND argument.
#[cfg(windows)]
fn main() {
    use windows_sys::Win32::{
        Foundation::{HWND, RECT},
        Graphics::Gdi::{CreateRectRgn, DeleteObject, GetWindowRgn, PtInRegion},
        UI::WindowsAndMessaging::{
            GetClientRect, GetWindowLongPtrW, GetWindowRect, IsWindow, GWL_EXSTYLE, GWL_STYLE,
            WS_CAPTION, WS_EX_CLIENTEDGE, WS_EX_DLGMODALFRAME, WS_EX_STATICEDGE, WS_EX_WINDOWEDGE,
            WS_THICKFRAME,
        },
    };
    let hwnd = std::env::args()
        .nth(1)
        .expect("Pass the running window HWND")
        .parse::<usize>()
        .expect("HWND must be a decimal integer") as HWND;
    unsafe {
        assert_ne!(IsWindow(hwnd), 0, "window no longer exists");
        if std::env::args().any(|arg| arg == "--tree") {
            use windows_sys::Win32::UI::WindowsAndMessaging::EnumChildWindows;
            inspect_child(hwnd, 0);
            EnumChildWindows(hwnd, Some(inspect_child), 0);
        }
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let frame_removed = style & (WS_CAPTION | WS_THICKFRAME) == 0
            && ex_style
                & (WS_EX_CLIENTEDGE | WS_EX_DLGMODALFRAME | WS_EX_STATICEDGE | WS_EX_WINDOWEDGE)
                == 0;
        let mut outer = RECT::default();
        let mut client = RECT::default();
        assert_ne!(GetWindowRect(hwnd, &mut outer), 0);
        assert_ne!(GetClientRect(hwnd, &mut client), 0);
        let (width, height) = (outer.right - outer.left, outer.bottom - outer.top);
        let region = CreateRectRgn(0, 0, 0, 0);
        assert!(!region.is_null());
        assert_ne!(GetWindowRgn(hwnd, region), 0, "native region missing");
        let corners_excluded = [
            (0, 0),
            (width - 1, 0),
            (0, height - 1),
            (width - 1, height - 1),
        ]
        .iter()
        .all(|&(x, y)| PtInRegion(region, x, y) == 0);
        let edges_retained = [
            (width / 2, 0),
            (0, height / 2),
            (width - 1, height / 2),
            (width / 2, height - 1),
            (width / 2, height / 2),
        ]
        .iter()
        .all(|&(x, y)| PtInRegion(region, x, y) != 0);
        DeleteObject(region);
        let client_fills_window = client.right == width && client.bottom == height;
        println!("{{\"width\":{width},\"height\":{height},\"nativeFrameRemoved\":{frame_removed},\"clientFillsWindow\":{client_fills_window},\"fourCornersExcluded\":{corners_excluded},\"edgesAndCenterRetained\":{edges_retained}}}");
        assert!(frame_removed && client_fills_window && corners_excluded && edges_retained);
    }
}

#[cfg(windows)]
unsafe extern "system" fn inspect_child(
    hwnd: windows_sys::Win32::Foundation::HWND,
    _: isize,
) -> i32 {
    use windows_sys::Win32::{Foundation::RECT, UI::WindowsAndMessaging::*};
    let mut class = [0u16; 256];
    let mut title = [0u16; 256];
    let class_len = GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32);
    let title_len = GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32);
    let mut rect = RECT::default();
    GetWindowRect(hwnd, &mut rect);
    println!(
        "HWND={} class={} title={} style={:08x} exStyle={:08x} rect={},{},{},{}",
        hwnd as usize,
        String::from_utf16_lossy(&class[..class_len as usize]),
        String::from_utf16_lossy(&title[..title_len as usize]),
        GetWindowLongPtrW(hwnd, GWL_STYLE),
        GetWindowLongPtrW(hwnd, GWL_EXSTYLE),
        rect.left,
        rect.top,
        rect.right,
        rect.bottom
    );
    1
}

#[cfg(not(windows))]
fn main() {
    eprintln!("Native window inspection is only available on Windows.");
}
