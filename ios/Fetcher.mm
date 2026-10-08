//
//  Fetcher.mm
//  SyncTasks
//

#import <Foundation/Foundation.h>

#include "Fetcher.hpp"

static NSURLSession* fetcherSession() {
  static NSURLSession* session;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSURLSessionConfiguration* config =
        [NSURLSessionConfiguration ephemeralSessionConfiguration];
    // Polling must hit the network every time, without cache or cookies.
    config.requestCachePolicy = NSURLRequestReloadIgnoringLocalCacheData;
    config.URLCache = nil;
    config.HTTPCookieStorage = nil;
    config.HTTPShouldSetCookies = NO;
    session = [NSURLSession sessionWithConfiguration:config];
  });
  return session;
}

static NSString* toNSString(const std::string& str) {
  return [[NSString alloc] initWithBytes:str.data()
                                  length:str.size()
                                encoding:NSUTF8StringEncoding];
}

FetchResult platformFetch(const std::string& url, const CPPHeaders& headers, int timeoutMs) {
  @autoreleasepool {
    NSString* urlString = toNSString(url);
    NSURL* nsUrl = urlString ? [NSURL URLWithString:urlString] : nil;

    if (!nsUrl) {
      return {false, 0, "Request error: invalid URL " + url};
    }

    NSMutableURLRequest* request = [NSMutableURLRequest requestWithURL:nsUrl];
    // Idle timeout; the overall deadline is enforced below.
    request.timeoutInterval = timeoutMs / 1000.0;

    for (const auto& h : headers) {
      NSString* key = toNSString(h.key);
      NSString* value = toNSString(h.value);
      if (key && value) {
        [request setValue:value forHTTPHeaderField:key];
      }
    }

    __block FetchResult result{false, 0, ""};
    dispatch_semaphore_t done = dispatch_semaphore_create(0);

    // Called from a scheduler worker thread, so blocking until completion is fine.
    NSURLSessionDataTask* task = [fetcherSession()
        dataTaskWithRequest:request
          completionHandler:^(NSData* data, NSURLResponse* response, NSError* error) {
            if (error) {
              const char* message = error.localizedDescription.UTF8String;
              result.body = std::string("Request error: ") + (message ? message : "unknown");
            } else {
              int code = (int)((NSHTTPURLResponse*)response).statusCode;
              result.ok = code < 400;
              result.code = code;
              if (data.length) {
                result.body.assign(static_cast<const char*>(data.bytes), data.length);
              }
            }
            dispatch_semaphore_signal(done);
          }];

    [task resume];

    dispatch_time_t deadline = dispatch_time(DISPATCH_TIME_NOW, (int64_t)timeoutMs * NSEC_PER_MSEC);
    if (dispatch_semaphore_wait(done, deadline) != 0) {
      // Over the overall deadline: cancel and wait for the completion handler before reporting.
      [task cancel];
      dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);
      return {false, 0, "Request error: The request timed out."};
    }

    return result;
  }
}
