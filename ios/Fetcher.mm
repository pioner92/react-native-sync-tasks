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

static std::string toStdString(NSString* str) {
  const char* utf8 = str.UTF8String;
  return utf8 ? std::string(utf8) : std::string();
}

FetchResult platformFetch(const FetchRequest& req, CancelToken& cancel) {
  @autoreleasepool {
    NSString* urlString = toNSString(req.url);
    NSURL* nsUrl = urlString ? [NSURL URLWithString:urlString] : nil;

    if (!nsUrl) {
      return {false, 0, "Request error: invalid URL " + req.url, {}};
    }

    NSMutableURLRequest* request = [NSMutableURLRequest requestWithURL:nsUrl];
    request.HTTPMethod = toNSString(req.method);
    // Idle timeout; the overall deadline is enforced below.
    request.timeoutInterval = req.timeoutMs / 1000.0;

    for (const auto& h : req.headers) {
      NSString* key = toNSString(h.key);
      NSString* value = toNSString(h.value);
      if (key && value) {
        [request setValue:value forHTTPHeaderField:key];
      }
    }

    if (req.body) {
      request.HTTPBody = [NSData dataWithBytes:req.body->data() length:req.body->size()];
    }

    __block FetchResult result{false, 0, "", {}};
    dispatch_semaphore_t done = dispatch_semaphore_create(0);

    // Called from a scheduler worker thread, so blocking until completion is fine.
    NSURLSessionDataTask* task = [fetcherSession()
        dataTaskWithRequest:request
          completionHandler:^(NSData* data, NSURLResponse* response, NSError* error) {
            if (error) {
              result.body = "Request error: " + toStdString(error.localizedDescription);
            } else {
              NSHTTPURLResponse* http = (NSHTTPURLResponse*)response;
              int code = (int)http.statusCode;
              result.ok = code < 400;
              result.code = code;
              if (data.length) {
                result.body.assign(static_cast<const char*>(data.bytes), data.length);
              }
              [http.allHeaderFields enumerateKeysAndObjectsUsingBlock:^(id key, id value, BOOL*) {
                result.headers.push_back(
                    {toStdString([[key description] lowercaseString]), toStdString([value description])});
              }];
            }
            dispatch_semaphore_signal(done);
          }];

    cancel.setOnCancel([task] { [task cancel]; });
    [task resume];

    dispatch_time_t deadline = dispatch_time(DISPATCH_TIME_NOW, (int64_t)req.timeoutMs * NSEC_PER_MSEC);
    bool timedOut = dispatch_semaphore_wait(done, deadline) != 0;
    if (timedOut) {
      // Over the overall deadline: cancel and wait for the completion handler before reporting.
      [task cancel];
      dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);
    }
    cancel.clearOnCancel();

    if (timedOut) {
      return {false, 0, "Request error: The request timed out.", {}};
    }
    return result;
  }
}
