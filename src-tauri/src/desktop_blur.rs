//! A live desktop underlay. Only this visual is blurred; WebView2 stays above it.
//! DWM's shared-visual exports are undocumented (ABI reference: ADeltaX's
//! https://gist.github.com/ADeltaX/aea6aac248604d0cb7d423a61b06e247).
//! Resolve them at runtime, restrict OS builds, and retain the system fallback.
use std::{cell::RefCell, ffi::c_void, ptr};
use tauri::Emitter;
use windows::{
    core::{w, Interface, HRESULT, PCSTR},
    Win32::{
        Foundation::{HMODULE, HWND, RECT, SIZE},
        Graphics::{
            Direct2D::Common::{D2D1_BORDER_MODE_HARD, D2D_RECT_F},
            Direct3D::D3D_DRIVER_TYPE_HARDWARE,
            Direct3D11::{
                D3D11CreateDevice, ID3D11Device, D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                D3D11_SDK_VERSION,
            },
            DirectComposition::*,
            Dwm::{DwmUnregisterThumbnail, DWM_THUMBNAIL_PROPERTIES},
            Dxgi::IDXGIDevice,
        },
        System::LibraryLoader::{GetModuleHandleW, GetProcAddress},
    },
};
use windows_sys::Win32::{
    Foundation::{LPARAM, LRESULT, WPARAM},
    UI::{
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::{
            FindWindowW, GetClientRect, GetSystemMetrics, GetWindow, GetWindowRect, IsIconic,
            IsWindowVisible, KillTimer, SetTimer, GW_HWNDPREV, SM_CXVIRTUALSCREEN,
            SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, WM_DISPLAYCHANGE,
            WM_NCDESTROY, WM_TIMER, WM_WINDOWPOSCHANGED,
        },
    },
};

type CreateDesktop = unsafe extern "system" fn(
    HWND,
    HWND,
    u32,
    *const DWM_THUMBNAIL_PROPERTIES,
    *mut c_void,
    *mut *mut c_void,
    *mut isize,
) -> HRESULT;
type CreateWindows =
    unsafe extern "system" fn(HWND, *mut c_void, *mut *mut c_void, *mut isize) -> HRESULT;
type UpdateWindows10 = unsafe extern "system" fn(
    isize,
    *const HWND,
    u32,
    *const HWND,
    u32,
    *mut RECT,
    *mut SIZE,
) -> HRESULT;
type UpdateWindows11 = unsafe extern "system" fn(
    isize,
    *const HWND,
    u32,
    *const HWND,
    u32,
    *mut RECT,
    *mut SIZE,
    u32,
) -> HRESULT;
const SUBCLASS_ID: usize = 0x4D424C52;
const TIMER_ID: usize = 0x4D424C52;

#[repr(C)]
struct CompositionAttribute {
    attribute: u32,
    data: *mut c_void,
    size: usize,
}
type WindowAttribute = unsafe extern "system" fn(HWND, *mut CompositionAttribute) -> i32;
struct LivePreview {
    hwnd: HWND,
    previous: i32,
    set: WindowAttribute,
}
impl LivePreview {
    unsafe fn exclude(hwnd: HWND) -> Result<Self, String> {
        let module = GetModuleHandleW(w!("user32.dll")).map_err(|e| e.to_string())?;
        let set: WindowAttribute = std::mem::transmute(
            GetProcAddress(module, windows::core::s!("SetWindowCompositionAttribute"))
                .ok_or("无法设置背景排除状态")?,
        );
        let mut enabled = 1i32;
        let mut attribute = CompositionAttribute {
            attribute: 13,
            data: &mut enabled as *mut _ as _,
            size: 4,
        };
        if set(hwnd, &mut attribute) == 0 {
            return Err("无法排除自身背景".into());
        }
        // This flag belongs to our own window and starts disabled. GetWindow-
        // CompositionAttribute does not support reading it on Windows 10.
        Ok(Self {
            hwnd,
            previous: 0,
            set,
        })
    }
}
impl Drop for LivePreview {
    fn drop(&mut self) {
        unsafe {
            let mut attribute = CompositionAttribute {
                attribute: 13,
                data: &mut self.previous as *mut _ as _,
                size: 4,
            };
            (self.set)(self.hwnd, &mut attribute);
        }
    }
}

thread_local! {
    static RENDERER: RefCell<Option<Renderer>> = const { RefCell::new(None) };
}

struct Thumbnail(isize);
impl Drop for Thumbnail {
    fn drop(&mut self) {
        if self.0 != 0 {
            unsafe {
                let _ = DwmUnregisterThumbnail(self.0);
            }
        }
    }
}

struct Renderer {
    window: tauri::Window,
    hwnd: HWND,
    device: IDCompositionDesktopDevice,
    target: IDCompositionTarget,
    root: IDCompositionVisual2,
    scene: IDCompositionVisual2,
    windows_visual: IDCompositionVisual2,
    blur: IDCompositionGaussianBlurEffect,
    _desktop: Thumbnail,
    _preview: LivePreview,
    windows: Thumbnail,
    update: *const c_void,
    build: u32,
    strength: u32,
    last_geometry: Option<(i32, i32, i32, i32, u32)>,
}

fn failure(context: &str, error: impl std::fmt::Display) -> String {
    format!("{context}: {error}")
}

// Keep a small positive minimum: the product always has a glass material.
fn deviation(strength: u32, scale: f64) -> f32 {
    ((1.0 + 29.0 * strength.min(100) as f64 / 100.0) * scale) as f32
}

impl Renderer {
    unsafe fn new(window: &tauri::Window, strength: u32) -> Result<Self, String> {
        let build = windows_version::OsVersion::current().build;
        if !((19041..=19045).contains(&build)
            || [22000, 22621, 22631, 26100, 26200].contains(&build))
        {
            return Err(format!("此 Windows 版本尚不支持可调模糊（{build}）"));
        }
        let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
        let preview = LivePreview::exclude(hwnd)?;
        let module = GetModuleHandleW(w!("dwmapi.dll")).map_err(|e| failure("DWM", e))?;
        let resolve = |ordinal: usize| -> Result<*const c_void, String> {
            GetProcAddress(module, PCSTR(ordinal as *const u8))
                .map(|p| p as *const c_void)
                .ok_or_else(|| format!("DWM 接口 {ordinal} 不可用"))
        };
        let create_desktop: CreateDesktop = std::mem::transmute(resolve(147)?);
        let create_windows: CreateWindows = std::mem::transmute(resolve(163)?);
        let update = resolve(164)?;
        let mut d3d: Option<ID3D11Device> = None;
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut d3d),
            None,
            None,
        )
        .map_err(|e| failure("D3D11", e))?;
        let dxgi: IDXGIDevice = d3d
            .ok_or("D3D11 device missing")?
            .cast()
            .map_err(|e| e.to_string())?;
        let device: IDCompositionDesktopDevice =
            DCompositionCreateDevice3(&dxgi).map_err(|e| failure("DirectComposition", e))?;
        let effects: IDCompositionDevice3 = device.cast().map_err(|e| e.to_string())?;
        let root = effects.CreateVisual().map_err(|e| e.to_string())?;
        let scene = effects.CreateVisual().map_err(|e| e.to_string())?;
        let blur = effects
            .CreateGaussianBlurEffect()
            .map_err(|e| e.to_string())?;
        blur.SetBorderMode(D2D1_BORDER_MODE_HARD)
            .map_err(|e| e.to_string())?;
        scene.SetEffect(&blur).map_err(|e| e.to_string())?;
        root.AddVisual(&scene, false, None)
            .map_err(|e| e.to_string())?;
        let desktop_hwnd = HWND(FindWindowW(w!("Progman").as_ptr(), ptr::null()));
        if desktop_hwnd.is_invalid() {
            return Err("桌面背景窗口不可用".into());
        }
        let mut bounds = windows_sys::Win32::Foundation::RECT::default();
        if GetWindowRect(desktop_hwnd.0, &mut bounds) == 0 {
            return Err("无法读取桌面范围".into());
        }
        let props = DWM_THUMBNAIL_PROPERTIES {
            dwFlags: 0x1F | 0x04000000, // source/destination/opacity/visibility/client + ENABLE3D
            rcDestination: RECT {
                left: bounds.left,
                top: bounds.top,
                right: bounds.right,
                bottom: bounds.bottom,
            },
            rcSource: RECT {
                left: 0,
                top: 0,
                right: bounds.right - bounds.left,
                bottom: bounds.bottom - bounds.top,
            },
            opacity: 255,
            fVisible: true.into(),
            fSourceClientAreaOnly: false.into(),
        };
        let mut desktop = Thumbnail(0);
        let mut visual = ptr::null_mut();
        create_desktop(
            hwnd,
            desktop_hwnd,
            2,
            &props,
            device.as_raw(),
            &mut visual,
            &mut desktop.0,
        )
        .ok()
        .map_err(|e| failure("桌面背景", e))?;
        if visual.is_null() {
            return Err("桌面背景为空".into());
        }
        let desktop_visual = IDCompositionVisual2::from_raw(visual);
        scene
            .AddVisual(&desktop_visual, false, None)
            .map_err(|e| e.to_string())?;
        let mut windows = Thumbnail(0);
        visual = ptr::null_mut();
        create_windows(hwnd, device.as_raw(), &mut visual, &mut windows.0)
            .ok()
            .map_err(|e| failure("窗口背景", e))?;
        if visual.is_null() {
            return Err("窗口背景为空".into());
        }
        let windows_visual = IDCompositionVisual2::from_raw(visual);
        scene
            .AddVisual(&windows_visual, true, &desktop_visual)
            .map_err(|e| e.to_string())?;
        // FALSE puts this target below child HWNDs, including the clear WebView2.
        let target = device
            .CreateTargetForHwnd(hwnd, false)
            .map_err(|e| failure("背景图层", e))?;
        target.SetRoot(&root).map_err(|e| e.to_string())?;
        let mut renderer = Self {
            window: window.clone(),
            hwnd,
            device,
            target,
            root,
            scene,
            windows_visual,
            blur,
            _desktop: desktop,
            _preview: preview,
            windows,
            update,
            build,
            strength,
            last_geometry: None,
        };
        renderer.sync(true)?;
        Ok(renderer)
    }

    unsafe fn sync(&mut self, force: bool) -> Result<(), String> {
        if !force && (IsWindowVisible(self.hwnd.0) == 0 || IsIconic(self.hwnd.0) != 0) {
            return Ok(());
        }
        let mut bounds = windows_sys::Win32::Foundation::RECT::default();
        let mut client = windows_sys::Win32::Foundation::RECT::default();
        if GetWindowRect(self.hwnd.0, &mut bounds) == 0
            || GetClientRect(self.hwnd.0, &mut client) == 0
        {
            return Err("无法读取窗口范围".into());
        }
        let scale = self.window.scale_factor().map_err(|e| e.to_string())?;
        let geometry = (
            bounds.left,
            bounds.top,
            client.right,
            client.bottom,
            (scale * 96.0).round() as u32,
        );
        // Exclude our own window AND windows above it. Otherwise focusing another
        // application could make that application appear inside our backdrop.
        let mut exclusions = vec![HWND::default()];
        let mut above = GetWindow(self.hwnd.0, GW_HWNDPREV);
        let mut visited = 0;
        while !above.is_null() && visited < 4096 {
            visited += 1;
            if IsWindowVisible(above) != 0 {
                exclusions.push(HWND(above));
            }
            above = GetWindow(above, GW_HWNDPREV);
        }
        let moved = self.last_geometry != Some(geometry);
        // Refresh membership even when we have not moved: another application
        // can open, close, minimize or reorder a window underneath this one.
        {
            let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
            let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
            let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
            let mut source = RECT {
                left: x,
                top: y,
                right: x + width,
                bottom: y + height,
            };
            let mut size = SIZE {
                cx: width,
                cy: height,
            };
            let result = if self.build < 20000 {
                let update: UpdateWindows10 = std::mem::transmute(self.update);
                update(
                    self.windows.0,
                    ptr::null(),
                    0,
                    exclusions.as_ptr(),
                    exclusions.len() as u32,
                    &mut source,
                    &mut size,
                )
            } else {
                let update: UpdateWindows11 = std::mem::transmute(self.update);
                update(
                    self.windows.0,
                    ptr::null(),
                    0,
                    exclusions.as_ptr(),
                    exclusions.len() as u32,
                    &mut source,
                    &mut size,
                    1,
                )
            };
            result.ok().map_err(|e| failure("更新背景", e))?;
            self.windows_visual
                .SetOffsetX2(x as f32)
                .map_err(|e| e.to_string())?;
            self.windows_visual
                .SetOffsetY2(y as f32)
                .map_err(|e| e.to_string())?;
        }
        if force || moved {
            self.blur
                .SetStandardDeviation2(deviation(self.strength, scale))
                .map_err(|e| e.to_string())?;
            self.scene
                .SetOffsetX2(-bounds.left as f32)
                .map_err(|e| e.to_string())?;
            self.scene
                .SetOffsetY2(-bounds.top as f32)
                .map_err(|e| e.to_string())?;
            self.root
                .SetClip2(&D2D_RECT_F {
                    left: 0.0,
                    top: 0.0,
                    right: client.right as f32,
                    bottom: client.bottom as f32,
                })
                .map_err(|e| e.to_string())?;
            self.last_geometry = Some(geometry);
        }
        self.device.Commit().map_err(|e| failure("提交背景", e))?;
        Ok(())
    }
}

impl Drop for Renderer {
    fn drop(&mut self) {
        unsafe {
            KillTimer(self.hwnd.0, TIMER_ID);
            RemoveWindowSubclass(self.hwnd.0, Some(subclass), SUBCLASS_ID);
            let _ = self.target.SetRoot(None);
            let _ = self.device.Commit();
        }
    }
}

unsafe extern "system" fn subclass(
    hwnd: windows_sys::Win32::Foundation::HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    if message == WM_NCDESTROY {
        RENDERER.with(|cell| {
            if let Ok(mut state) = cell.try_borrow_mut() {
                state.take();
            }
        });
    } else if message == WM_WINDOWPOSCHANGED
        || message == WM_DISPLAYCHANGE
        || (message == WM_TIMER && wparam == TIMER_ID)
    {
        RENDERER.with(|cell| {
            if let Ok(mut state) = cell.try_borrow_mut() {
                if let Some(renderer) = state.as_mut() {
                    if let Err(error) = renderer.sync(message == WM_DISPLAYCHANGE) {
                        let _ = renderer.window.emit("desktop-blur-unavailable", error);
                        state.take();
                    }
                }
            }
        });
    }
    DefSubclassProc(hwnd, message, wparam, lparam)
}

/// Must run on the window's UI thread; COM resources never leave this thread.
pub fn set_strength(window: &tauri::Window, strength: u32) -> Result<(), String> {
    if window.label() != "main" {
        return Err("只允许主窗口调节模糊".into());
    }
    if strength > 100 {
        return Err("模糊强度必须在 0～100 之间".into());
    }
    RENDERER.with(|cell| {
        let mut state = cell.borrow_mut();
        unsafe {
            if let Some(renderer) = state.as_mut() {
                renderer.strength = strength;
                // A drag changes only the effect parameter, not the backdrop or window.
                let result = (|| {
                    let scale = window.scale_factor().map_err(|e| e.to_string())?;
                    renderer
                        .blur
                        .SetStandardDeviation2(deviation(strength, scale))
                        .map_err(|e| e.to_string())?;
                    renderer.device.Commit().map_err(|e| e.to_string())
                })();
                if result.is_err() {
                    state.take();
                }
                return result;
            }
            let renderer = Renderer::new(window, strength)?;
            if SetWindowSubclass(renderer.hwnd.0, Some(subclass), SUBCLASS_ID, 0) == 0 {
                return Err("无法安装背景窗口回调".into());
            }
            if SetTimer(renderer.hwnd.0, TIMER_ID, 100, None) == 0 {
                return Err("无法启动背景同步".into());
            }
            *state = Some(renderer);
            Ok(())
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blur_range_stays_positive_monotonic_and_dpi_scaled() {
        assert_eq!(deviation(0, 1.0), 1.0);
        assert_eq!(deviation(100, 1.0), 30.0);
        for value in 0..100 {
            assert!(deviation(value + 1, 1.0) > deviation(value, 1.0));
        }
        assert_eq!(deviation(40, 2.0), deviation(40, 1.0) * 2.0);
    }
}
