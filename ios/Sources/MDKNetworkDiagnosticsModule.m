#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

#import <DoraemonKit/DoraemonCacheManager.h>
#import <DoraemonKit/DoraemonNetFlowDataSource.h>
#import <DoraemonKit/DoraemonNetFlowHttpModel.h>
#import <DoraemonKit/DoraemonNetFlowManager.h>
#import <React/RCTBridgeModule.h>

static NSArray<NSDictionary<NSString *, NSString *> *> *
MDKNetworkHeaders(NSDictionary *headers) {
  if (headers.count == 0) {
    return @[];
  }
  NSArray *keys = [headers.allKeys
      sortedArrayUsingComparator:^NSComparisonResult(id left, id right) {
        return [[left description]
            localizedCaseInsensitiveCompare:[right description]];
      }];
  NSMutableArray *result = [NSMutableArray arrayWithCapacity:keys.count];
  for (id key in keys) {
    [result addObject:@{
      @"name" : [key description] ?: @"",
      @"value" : [headers[key] description] ?: @"",
    }];
  }
  return result;
}

static BOOL MDKNetworkIsTextMIMEType(NSString *mimeType) {
  NSString *normalized = mimeType.lowercaseString ?: @"";
  return [normalized hasPrefix:@"text/"] ||
         [normalized containsString:@"json"] ||
         [normalized containsString:@"xml"] ||
         [normalized containsString:@"javascript"] ||
         [normalized containsString:@"form-urlencoded"];
}

static NSDictionary *
MDKNetworkSnapshot(DoraemonNetFlowHttpModel *model) {
  NSString *url = model.url.length > 0 ? model.url
                                        : model.request.URL.absoluteString;
  NSURLComponents *components =
      [NSURLComponents componentsWithString:url ?: @""];
  NSString *path = components.percentEncodedPath.length > 0
                       ? components.percentEncodedPath
                       : @"/";
  if (components.percentEncodedQuery.length > 0) {
    path = [path stringByAppendingFormat:@"?%@",
                                      components.percentEncodedQuery];
  }
  NSString *requestId = model.requestId.length > 0
                            ? model.requestId
                            : [NSString stringWithFormat:@"%@|%.6f", url ?: @"",
                                                       model.startTime];
  NSString *method = model.request.HTTPMethod.length > 0
                         ? model.request.HTTPMethod.uppercaseString
                         : model.method.uppercaseString;
  NSString *status = model.statusCode.length > 0 ? model.statusCode : @"Pending";
  NSString *mimeType = model.mineType ?: @"";
  NSString *responseBody = model.responseBody ?: @"";
  NSTimeInterval duration = model.totalDuration.doubleValue;
  if (duration <= 0.0 && model.endTime > model.startTime) {
    duration = model.endTime - model.startTime;
  }

  NSDictionary *responseHeaders = @{};
  if ([model.response isKindOfClass:NSHTTPURLResponse.class]) {
    responseHeaders = ((NSHTTPURLResponse *)model.response).allHeaderFields;
  }

  return @{
    @"id" : requestId ?: @"",
    @"url" : url ?: @"",
    @"host" : components.host ?: @"",
    @"path" : path,
    @"method" : method.length > 0 ? method : @"HTTP",
    @"status" : status,
    @"mimeType" : mimeType,
    @"startTime" : @(MAX(0.0, model.startTime * 1000.0)),
    @"duration" : @(MAX(0.0, duration * 1000.0)),
    @"requestBytes" : @(MAX(0.0, model.uploadFlow.doubleValue)),
    @"responseBytes" : @(MAX(0.0, model.downFlow.doubleValue)),
    @"requestHeaders" :
        MDKNetworkHeaders(model.request.allHTTPHeaderFields ?: @{}),
    @"responseHeaders" : MDKNetworkHeaders(responseHeaders),
    @"requestBody" : model.requestBody ?: @"",
    @"responseBody" : responseBody,
    @"responseBodyBinary" :
        @(responseBody.length == 0 && model.responseData.length > 0 &&
          !MDKNetworkIsTextMIMEType(mimeType)),
  };
}

@interface MDKNetworkDiagnosticsModule : NSObject <RCTBridgeModule>
@end

@implementation MDKNetworkDiagnosticsModule

RCT_EXPORT_MODULE(MobileDiagnosticsNetwork)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (dispatch_queue_t)methodQueue {
  return dispatch_get_main_queue();
}

RCT_REMAP_METHOD(getRequests,
                 getRequestsWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  @try {
    NSArray *models =
        [[DoraemonNetFlowDataSource shareInstance].httpModelArray copy];
    NSMutableArray *snapshots =
        [NSMutableArray arrayWithCapacity:models.count];
    for (DoraemonNetFlowHttpModel *model in models) {
      [snapshots addObject:MDKNetworkSnapshot(model)];
    }
    resolve(snapshots);
  } @catch (NSException *exception) {
    reject(@"network_snapshot_failed", @"Unable to read captured requests",
           [NSError errorWithDomain:@"MobileDiagnosticsNetwork"
                               code:1
                           userInfo:@{
                             NSLocalizedDescriptionKey : exception.reason ?: @""
                           }]);
  }
}

RCT_REMAP_METHOD(clearRequests,
                 clearRequestsWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  (void)reject;
  [[DoraemonNetFlowDataSource shareInstance] clear];
  resolve(nil);
}

RCT_REMAP_METHOD(setCaptureEnabled,
                 setCaptureEnabled:(BOOL)enabled
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  (void)reject;
  [[DoraemonCacheManager sharedInstance] saveNetFlowSwitch:enabled];
  [[DoraemonNetFlowManager shareInstance] canInterceptNetFlow:enabled];
  resolve(nil);
}

RCT_REMAP_METHOD(isCaptureEnabled,
                 isCaptureEnabledWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  (void)reject;
  resolve(@([[DoraemonCacheManager sharedInstance] netFlowSwitch]));
}

RCT_REMAP_METHOD(copyToClipboard,
                 copyToClipboard:(NSString *)value
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  (void)reject;
  UIPasteboard.generalPasteboard.string = value ?: @"";
  resolve(nil);
}

@end
