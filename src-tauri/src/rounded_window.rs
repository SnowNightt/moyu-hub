//! Clip the native Acrylic surface, not only the HTML, to the prototype's rounded outline.
use std::{
    io,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
#[cfg(debug_assertions)]
use tauri::Manager;
use windows_sys::Win32::{
    Foundation::HWND,
    Graphics::Gdi::{
        CreateRectRgn, CreateRoundRectRgn, DeleteObject, EqualRgn, GetWindowRgn, SetWindowRgn, HRGN,
    },
};

// Keep in sync with --window-radius in shared/styles/shell.css (logical CSS pixels).
const CORNER_RADIUS: f64 = 18.0;

#[derive(Clone, Copy, PartialEq, Eq)]
struct Shape {
    hwnd: usize,
    width: i32,
    height: i32,
    diameter: i32,
}

// SetWindowRgn emits position messages. Cache before the call, without holding the lock,
// so a repeated size event cannot recursively reset the same region or deadlock.
static LAST_SHAPE: Mutex<Option<Shape>> = Mutex::new(None);
static APPLYING: AtomicBool = AtomicBool::new(false);

struct ApplyGuard;
impl Drop for ApplyGuard {
    fn drop(&mut self) {
        APPLYING.store(false, Ordering::Release);
    }
}

struct OwnedRegion(HRGN);
impl Drop for OwnedRegion {
    fn drop(&mut self) {
        // This wrapper owns only regions that have not been transferred to Windows.
        unsafe { DeleteObject(self.0) };
    }
}

fn create_region(width: i32, height: i32, diameter: i32) -> io::Result<OwnedRegion> {
    let region = unsafe { CreateRoundRectRgn(0, 0, width + 1, height + 1, diameter, diameter) };
    if region.is_null() {
        Err(io::Error::last_os_error())
    } else {
        Ok(OwnedRegion(region))
    }
}

pub fn reset() {
    *LAST_SHAPE.lock().unwrap_or_else(|error| error.into_inner()) = None;
}

pub fn apply(window: &tauri::Window) -> tauri::Result<()> {
    // SetWindowRgn can synchronously emit another window event before the new
    // region is installed. Do not inspect/reapply that intermediate region.
    if APPLYING.swap(true, Ordering::AcqRel) {
        return Ok(());
    }
    let _guard = ApplyGuard;
    let size = window.outer_size()?;
    // Minimized windows may report an empty size; retain the last valid region.
    if size.width == 0 || size.height == 0 {
        return Ok(());
    }
    let hwnd = window.hwnd()?.0 as HWND;
    let shape = Shape {
        hwnd: hwnd as usize,
        width: size.width as i32,
        height: size.height as i32,
        diameter: (CORNER_RADIUS * window.scale_factor()? * 2.0).round() as i32,
    };
    let region = create_region(shape.width, shape.height, shape.diameter)?;
    let cached = *LAST_SHAPE.lock().unwrap_or_else(|error| error.into_inner()) == Some(shape);
    // Theme/restore operations may reset native state without changing the size.
    // Only skip clipping if Windows still has the expected rounded region.
    if cached && region_matches(hwnd, &region) {
        return Ok(());
    }
    *LAST_SHAPE.lock().unwrap_or_else(|error| error.into_inner()) = Some(shape);
    if unsafe { SetWindowRgn(hwnd, region.0, 1) } == 0 {
        let error = io::Error::last_os_error();
        reset();
        return Err(error.into());
    }
    // On success Windows owns and eventually deletes this HRGN. Do not delete it here.
    std::mem::forget(region);

    #[cfg(debug_assertions)]
    {
        if let Err(error) = verify_native_region(hwnd, shape.width, shape.height) {
            reset();
            return Err(error.into());
        }
        // Local debug evidence, read back from the actual HWND region. Never blocks clipping.
        if let Ok(directory) = window.app_handle().path().app_local_data_dir() {
            let _ = std::fs::write(
                directory.join("window-shape-check.json"),
                format!(
                    r#"{{"width":{},"height":{},"cornerDiameter":{},"fourCornersExcluded":true}}"#,
                    shape.width, shape.height, shape.diameter
                ),
            );
        }
    }
    Ok(())
}

fn region_matches(hwnd: HWND, expected: &OwnedRegion) -> bool {
    let actual = OwnedRegion(unsafe { CreateRectRgn(0, 0, 0, 0) });
    !actual.0.is_null()
        && unsafe { GetWindowRgn(hwnd, actual.0) } != 0
        && unsafe { EqualRgn(actual.0, expected.0) } != 0
}

#[cfg(debug_assertions)]
fn verify_native_region(hwnd: HWND, width: i32, height: i32) -> io::Result<()> {
    use windows_sys::Win32::Graphics::Gdi::{CreateRectRgn, GetWindowRgn, PtInRegion};
    let region = OwnedRegion(unsafe { CreateRectRgn(0, 0, 0, 0) });
    if region.0.is_null() || unsafe { GetWindowRgn(hwnd, region.0) } == 0 {
        return Err(io::Error::last_os_error());
    }
    for (x, y) in [
        (0, 0),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1),
    ] {
        if unsafe { PtInRegion(region.0, x, y) } != 0 {
            return Err(io::Error::other(
                "native window still includes a square corner",
            ));
        }
    }
    eprintln!("MoyuHub: native rounded region verified ({width}x{height}); all four corner pixels excluded");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::Graphics::Gdi::PtInRegion;

    #[test]
    fn clips_all_corners_without_cutting_straight_edges_at_common_dpi() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            let width = (960.0 * scale) as i32;
            let height = (600.0 * scale) as i32;
            let diameter = (CORNER_RADIUS * scale * 2.0).round() as i32;
            let region = create_region(width, height, diameter).unwrap();
            for (x, y) in [
                (0, 0),
                (width - 1, 0),
                (0, height - 1),
                (width - 1, height - 1),
            ] {
                assert_eq!(
                    unsafe { PtInRegion(region.0, x, y) },
                    0,
                    "corner at DPI {scale}"
                );
            }
            for (x, y) in [
                (width / 2, 0),
                (0, height / 2),
                (width - 1, height / 2),
                (width / 2, height - 1),
                (width / 2, height / 2),
            ] {
                assert_ne!(
                    unsafe { PtInRegion(region.0, x, y) },
                    0,
                    "edge at DPI {scale}"
                );
            }
        }
    }
}
