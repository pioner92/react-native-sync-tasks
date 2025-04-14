use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};

#[repr(C)]
pub struct Header {
    key: *const c_char,
    value: *const c_char,
}

#[repr(C)]
pub struct FetchResult {
    pub ok: bool,
    pub code: i32,
    pub body: *mut c_char,
}

#[no_mangle]
pub extern "C" fn rust_fetch(
    url: *const c_char,
    headers: *const Header,
    header_count: c_int,
) -> FetchResult {
    let url_str = match unsafe { CStr::from_ptr(url) }.to_str() {
        Ok(s) => s,
        Err(_) => {
            return FetchResult {
                ok: false,
                code: 0,
                body: CString::new("Invalid URL").unwrap().into_raw(),
            }
        }
    };

    let mut request = ureq::get(url_str);

    if !headers.is_null() {
        let header_slice = unsafe { std::slice::from_raw_parts(headers, header_count as usize) };
        for Header { key, value } in header_slice {
            if let (Ok(k), Ok(v)) = (
                unsafe { CStr::from_ptr(*key) }.to_str(),
                unsafe { CStr::from_ptr(*value) }.to_str(),
            ) {
                request = request.set(k, v);
            }
        }
    }

    match request.call() {
        Ok(res) => {
            let code = res.status();
            let body = res.into_string().unwrap_or_default();

            FetchResult {
                ok: code < 400,
                code: code.into(),
                body: CString::new(body).unwrap().into_raw(),
            }
        }
        Err(ureq::Error::Status(code, response)) => {
            let body = response
                .into_string()
                .unwrap_or_else(|_| "<no body>".to_string());
            FetchResult {
                ok: false,
                code: code.into(),
                body: CString::new(body).unwrap().into_raw(),
            }
        }
        Err(e) => {
            let msg = format!("Request error: {}", e);
            FetchResult {
                ok: false,
                code: 0,
                body: CString::new(msg).unwrap().into_raw(),
            }
        }
    }
}

#[no_mangle]
pub extern "C" fn rust_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            drop(CString::from_raw(ptr));
        }
    }
}
