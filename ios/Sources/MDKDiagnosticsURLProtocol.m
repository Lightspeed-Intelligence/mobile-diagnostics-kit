#import "MDKDiagnosticsURLProtocol.h"

#import "MDKDiagnosticsOverrides.h"

#import <objc/runtime.h>

static NSString *const MDKHandledRequestKey = @"MDKDiagnosticsURLProtocolHandled";
static const NSUInteger MDKMaximumMockBodyBytes = 1024 * 1024;

static NSURLSessionConfiguration *MDKConfigurationByAddingProtocol(
    NSURLSessionConfiguration *configuration);

@interface NSURLSessionConfiguration (MDKDiagnostics)

+ (NSURLSessionConfiguration *)mdk_diagnostics_defaultSessionConfiguration;
+ (NSURLSessionConfiguration *)mdk_diagnostics_ephemeralSessionConfiguration;

@end

@interface MDKDiagnosticsURLProtocol
    : NSURLProtocol <NSURLSessionDataDelegate, NSURLSessionTaskDelegate>
@end

@implementation NSURLSessionConfiguration (MDKDiagnostics)

+ (NSURLSessionConfiguration *)mdk_diagnostics_defaultSessionConfiguration {
  return MDKConfigurationByAddingProtocol(
      [self mdk_diagnostics_defaultSessionConfiguration]);
}

+ (NSURLSessionConfiguration *)mdk_diagnostics_ephemeralSessionConfiguration {
  return MDKConfigurationByAddingProtocol(
      [self mdk_diagnostics_ephemeralSessionConfiguration]);
}

@end

static NSURLSessionConfiguration *MDKConfigurationByAddingProtocol(
    NSURLSessionConfiguration *configuration) {
  NSMutableArray<Class> *protocolClasses =
      [configuration.protocolClasses mutableCopy] ?: [NSMutableArray array];
  [protocolClasses removeObject:MDKDiagnosticsURLProtocol.class];
  [protocolClasses insertObject:MDKDiagnosticsURLProtocol.class atIndex:0];
  configuration.protocolClasses = protocolClasses;
  return configuration;
}

static void MDKSwizzleConfigurationSelector(SEL originalSelector,
                                            SEL diagnosticsSelector) {
  Method original = class_getClassMethod(NSURLSessionConfiguration.class,
                                         originalSelector);
  Method diagnostics = class_getClassMethod(NSURLSessionConfiguration.class,
                                            diagnosticsSelector);
  if (original != NULL && diagnostics != NULL) {
    method_exchangeImplementations(original, diagnostics);
  }
}

static NSURLResponse *MDKResponseWithoutContentLength(NSURLResponse *response) {
  if (![response isKindOfClass:NSHTTPURLResponse.class]) {
    return response;
  }
  NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
  NSMutableDictionary *headers = [NSMutableDictionary dictionary];
  [httpResponse.allHeaderFields enumerateKeysAndObjectsUsingBlock:
      ^(id key, id value, BOOL *stop) {
    (void)stop;
    if ([key isKindOfClass:NSString.class] &&
        [(NSString *)key caseInsensitiveCompare:@"Content-Length"] ==
            NSOrderedSame) {
      return;
    }
    if (key != nil && value != nil) {
      headers[key] = value;
    }
  }];
  return [[NSHTTPURLResponse alloc]
      initWithURL:httpResponse.URL
       statusCode:httpResponse.statusCode
      HTTPVersion:@"HTTP/1.1"
      headerFields:headers];
}

@implementation MDKDiagnosticsURLProtocol {
  NSURLSession *_session;
  NSURLSessionDataTask *_task;
  NSURLResponse *_response;
  NSMutableData *_mockBody;
  BOOL _buffersForMock;
}

+ (BOOL)canInitWithRequest:(NSURLRequest *)request {
  if ([NSURLProtocol propertyForKey:MDKHandledRequestKey inRequest:request] != nil ||
      request.URL == nil) {
    return NO;
  }
  NSString *scheme = request.URL.scheme.lowercaseString;
  if (![scheme isEqualToString:@"http"] && ![scheme isEqualToString:@"https"]) {
    return NO;
  }
  NSURL *rewritten = MDKRewriteAPIURL(request.URL);
  return ![rewritten isEqual:request.URL] || MDKShouldMockABConfigRequest(request);
}

+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request {
  return request;
}

- (void)startLoading {
  NSMutableURLRequest *request = [self.request mutableCopy];
  request.URL = MDKRewriteAPIURL(request.URL);
  [NSURLProtocol setProperty:@YES forKey:MDKHandledRequestKey inRequest:request];
  _buffersForMock = MDKShouldMockABConfigRequest(request);
  if (_buffersForMock) {
    _mockBody = [NSMutableData data];
  }

  NSURLSessionConfiguration *configuration =
      [NSURLSessionConfiguration defaultSessionConfiguration];
  NSMutableArray<Class> *protocolClasses = [configuration.protocolClasses mutableCopy];
  [protocolClasses removeObject:MDKDiagnosticsURLProtocol.class];
  configuration.protocolClasses = protocolClasses;
  _session = [NSURLSession sessionWithConfiguration:configuration
                                           delegate:self
                                      delegateQueue:nil];
  _task = [_session dataTaskWithRequest:request];
  [_task resume];
}

- (void)stopLoading {
  [_task cancel];
  [_session invalidateAndCancel];
}

- (void)URLSession:(NSURLSession *)session
    dataTask:(NSURLSessionDataTask *)dataTask
    didReceiveResponse:(NSURLResponse *)response
      completionHandler:(void (^)(NSURLSessionResponseDisposition))completionHandler {
  (void)session;
  (void)dataTask;
  _response = response;
  if (!_buffersForMock) {
    [self.client URLProtocol:self
          didReceiveResponse:response
          cacheStoragePolicy:NSURLCacheStorageNotAllowed];
  }
  completionHandler(NSURLSessionResponseAllow);
}

- (void)URLSession:(NSURLSession *)session
          dataTask:(NSURLSessionDataTask *)dataTask
    didReceiveData:(NSData *)data {
  (void)session;
  (void)dataTask;
  if (_buffersForMock && _mockBody.length + data.length <= MDKMaximumMockBodyBytes) {
    [_mockBody appendData:data];
    return;
  }
  if (_buffersForMock) {
    _buffersForMock = NO;
    if (_response != nil) {
      [self.client URLProtocol:self
            didReceiveResponse:_response
            cacheStoragePolicy:NSURLCacheStorageNotAllowed];
    }
    if (_mockBody.length > 0) {
      [self.client URLProtocol:self didLoadData:_mockBody];
    }
    _mockBody = nil;
  }
  [self.client URLProtocol:self didLoadData:data];
}

- (void)URLSession:(NSURLSession *)session
              task:(NSURLSessionTask *)task
    didCompleteWithError:(NSError *)error {
  (void)session;
  (void)task;
  if (error != nil) {
    [self.client URLProtocol:self didFailWithError:error];
    return;
  }
  if (_buffersForMock && _response != nil) {
    NSData *patched = MDKPatchABConfigResponse(self.request, _mockBody);
    NSData *body = patched ?: _mockBody;
    NSURLResponse *response =
        patched == nil ? _response : MDKResponseWithoutContentLength(_response);
    [self.client URLProtocol:self
          didReceiveResponse:response
          cacheStoragePolicy:NSURLCacheStorageNotAllowed];
    if (body.length > 0) {
      [self.client URLProtocol:self didLoadData:body];
    }
  }
  [self.client URLProtocolDidFinishLoading:self];
  [_session finishTasksAndInvalidate];
}

- (void)URLSession:(NSURLSession *)session
              task:(NSURLSessionTask *)task
    willPerformHTTPRedirection:(NSHTTPURLResponse *)response
            newRequest:(NSURLRequest *)request
     completionHandler:(void (^)(NSURLRequest *_Nullable))completionHandler {
  (void)session;
  (void)task;
  (void)response;
  NSMutableURLRequest *redirect = [request mutableCopy];
  redirect.URL = MDKRewriteAPIURL(redirect.URL);
  [NSURLProtocol setProperty:@YES forKey:MDKHandledRequestKey inRequest:redirect];
  completionHandler(redirect);
}

@end

void MDKInstallDiagnosticsURLProtocol(void) {
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    [NSURLProtocol registerClass:MDKDiagnosticsURLProtocol.class];
    MDKSwizzleConfigurationSelector(
        @selector(defaultSessionConfiguration),
        @selector(mdk_diagnostics_defaultSessionConfiguration));
    MDKSwizzleConfigurationSelector(
        @selector(ephemeralSessionConfiguration),
        @selector(mdk_diagnostics_ephemeralSessionConfiguration));
  });
}
