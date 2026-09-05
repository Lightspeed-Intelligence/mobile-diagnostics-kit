#import "MDKNativeDiagnosticsViewController.h"

#import "MDKExpoUpdatesAdapter.h"
#import "MDKDiagnosticsOverrides.h"

#import <DoraemonKit/DoraemonCacheManager.h>
#import <DoraemonKit/DoraemonKit.h>
#import <DoraemonKit/DoraemonNetFlowDataSource.h>
#import <DoraemonKit/DoraemonNetFlowHttpModel.h>
#import <DoraemonKit/DoraemonNetFlowManager.h>
#import <ImageIO/ImageIO.h>
#import <MMKVCore/MMKV.h>
#import <objc/message.h>
#import <UIKit/UIKit.h>

#include <cmath>

static const NSUInteger MDKMaxImagePreviewBytes = 12 * 1024 * 1024;
static const CGFloat MDKMaxImagePreviewDimension = 2048.0;

static UIColor *MDKColor(NSUInteger hex) {
  return [UIColor colorWithRed:((hex >> 16) & 0xff) / 255.0
                         green:((hex >> 8) & 0xff) / 255.0
                          blue:(hex & 0xff) / 255.0
                         alpha:1.0];
}

static UIColor *MDKSurfaceColor(void) { return MDKColor(0x111827); }
static UIColor *MDKBackgroundColor(void) { return MDKColor(0x0F172A); }
static UIColor *MDKCardColor(void) { return MDKColor(0x1E293B); }
static UIColor *MDKActiveCardColor(void) { return MDKColor(0x263449); }
static UIColor *MDKBorderColor(void) { return MDKColor(0x334155); }
static UIColor *MDKTextColor(void) { return MDKColor(0xF8FAFC); }
static UIColor *MDKSecondaryTextColor(void) { return MDKColor(0xCBD5E1); }
static UIColor *MDKMutedTextColor(void) { return MDKColor(0x94A3B8); }
static UIColor *MDKAccentColor(void) { return MDKColor(0x22C55E); }
static UIColor *MDKAccentSurfaceColor(void) { return MDKColor(0x123222); }
static UIColor *MDKAccentBorderColor(void) { return MDKColor(0x1F613A); }
static UIColor *MDKDangerColor(void) { return MDKColor(0xFCA5A5); }
static UIColor *MDKBlueColor(void) { return MDKColor(0x60A5FA); }

static BOOL MDKUsesEnglish(void) {
  return [NSLocale.preferredLanguages.firstObject.lowercaseString
      hasPrefix:@"en"];
}

static NSString *MDKText(NSString *english, NSString *chinese) {
  return MDKUsesEnglish() ? english : chinese;
}

static NSString *MDKStorageSecurityTitle(void) {
  return MDKText(@"Private by default", @"数据仅保留在本机");
}

static NSString *MDKStorageSearchPlaceholder(void) {
  return MDKText(@"Search MMKV entries", @"搜索 MMKV 条目");
}

static NSString *MDKStorageReadOnlyText(void) {
  return MDKText(
      @"This entry contains protected or unsupported data, so it remains read-only.",
      @"该条目包含受保护或不支持的数据，因此保持只读。");
}

static NSString *MDKStorageEditableText(void) {
  return MDKText(
      @"Edit the complete stored value below. Saving preserves its MMKV string, number, or boolean type.",
      @"可在下方编辑完整值；保存时会保持原有 MMKV 字符串、数字或布尔类型。");
}

static NSString *MDKCurrentBundleTitle(void) {
  return MDKText(@"Current RN bundle", @"当前 RN 包");
}

static NSString *MDKOtaActionTitle(void) {
  return MDKText(@"Check for an Expo update", @"检查 Expo 热更新");
}

static NSArray<NSDictionary<NSString *, NSString *> *> *MDKMockEndpointRegistry(void) {
  return @[
    @{
      @"identifier" : MDKABConfigMockIdentifier,
      @"title" : MDKText(@"AB Experiment API", @"AB 实验接口"),
      @"description" : MDKText(
          @"Override selected values returned by the dedicated AB config bundle interface.",
          @"覆盖独立 AB 配置接口返回的指定实验值。"),
      @"method" : @"POST",
      @"path" : MDKABConfigPath,
    },
  ];
}

static UIFont *MDKMonoFont(CGFloat size, UIFontWeight weight) {
  return [UIFont monospacedSystemFontOfSize:size weight:weight];
}

static BOOL MDKIsSensitiveName(NSString *name) {
  NSString *normalized = [[name
      stringByReplacingOccurrencesOfString:@"([a-z])([A-Z])"
                                withString:@"$1_$2"
                                   options:NSRegularExpressionSearch
                                     range:NSMakeRange(0, name.length)]
      lowercaseString];
  NSString *pattern =
      @"(^|[_\\-.])(access[_-]?token|refresh[_-]?token|id[_-]?token|token|"
       "authorization|cookie|secret|password|passwd|api[_-]?key|private[_-]?"
       "key|client[_-]?secret|credential|sentry)([_\\-.]|$)";
  return [normalized rangeOfString:pattern
                           options:NSRegularExpressionSearch |
                                   NSCaseInsensitiveSearch]
             .location != NSNotFound;
}

static id MDKSanitizeJSON(id value) {
  if ([value isKindOfClass:NSDictionary.class]) {
    NSMutableDictionary *result = [NSMutableDictionary dictionary];
    [(NSDictionary *)value enumerateKeysAndObjectsUsingBlock:^(
                               id key, id child, __unused BOOL *stop) {
      NSString *name = [key description];
      result[name] = MDKIsSensitiveName(name) ? @"[REDACTED]"
                                               : MDKSanitizeJSON(child);
    }];
    return result;
  }
  if ([value isKindOfClass:NSArray.class]) {
    NSMutableArray *result = [NSMutableArray array];
    for (id child in (NSArray *)value) {
      [result addObject:MDKSanitizeJSON(child) ?: NSNull.null];
    }
    return result;
  }
  return value ?: NSNull.null;
}

static BOOL MDKJSONContainsSensitiveField(id value) {
  if ([value isKindOfClass:NSDictionary.class]) {
    for (id key in (NSDictionary *)value) {
      if (MDKIsSensitiveName([key description]) ||
          MDKJSONContainsSensitiveField(((NSDictionary *)value)[key])) {
        return YES;
      }
    }
  } else if ([value isKindOfClass:NSArray.class]) {
    for (id child in (NSArray *)value) {
      if (MDKJSONContainsSensitiveField(child)) {
        return YES;
      }
    }
  }
  return NO;
}

static NSString *MDKPrettyJSONString(NSString *rawValue) {
  if (rawValue.length == 0) {
    return rawValue ?: @"";
  }
  NSData *data = [rawValue dataUsingEncoding:NSUTF8StringEncoding];
  id json = data == nil ? nil
                        : [NSJSONSerialization JSONObjectWithData:data
                                                          options:0
                                                            error:nil];
  if (json == nil || ![NSJSONSerialization isValidJSONObject:json]) {
    return rawValue;
  }
  NSData *pretty = [NSJSONSerialization dataWithJSONObject:json
                                                   options:NSJSONWritingPrettyPrinted |
                                                           NSJSONWritingSortedKeys
                                                     error:nil];
  return pretty == nil
             ? rawValue
             : [[NSString alloc] initWithData:pretty
                                      encoding:NSUTF8StringEncoding];
}

static NSString *MDKDisplayString(NSString *key, NSString *rawValue) {
  if (MDKIsSensitiveName(key)) {
    return @"[REDACTED]";
  }
  NSData *data = [rawValue dataUsingEncoding:NSUTF8StringEncoding];
  id json = data == nil ? nil
                        : [NSJSONSerialization JSONObjectWithData:data
                                                          options:0
                                                            error:nil];
  if (json == nil) {
    return rawValue;
  }
  NSData *pretty = [NSJSONSerialization dataWithJSONObject:MDKSanitizeJSON(json)
                                                   options:NSJSONWritingPrettyPrinted |
                                                           NSJSONWritingSortedKeys |
                                                           NSJSONWritingFragmentsAllowed
                                                     error:nil];
  return pretty == nil
             ? rawValue
             : [[NSString alloc] initWithData:pretty
                                      encoding:NSUTF8StringEncoding];
}

static NSString *MDKCompactPreview(NSString *value) {
  NSString *preview = [value stringByReplacingOccurrencesOfString:@"\\s+"
                                                        withString:@" "
                                                           options:NSRegularExpressionSearch
                                                             range:NSMakeRange(0, value.length)];
  preview = [preview stringByTrimmingCharactersInSet:
                         NSCharacterSet.whitespaceAndNewlineCharacterSet];
  return preview.length > 180
             ? [[preview substringToIndex:180] stringByAppendingString:@"…"]
             : preview;
}

static id MDKParseJSONValue(NSString *value) {
  NSData *data = [value dataUsingEncoding:NSUTF8StringEncoding];
  if (data == nil) {
    return nil;
  }
  return [NSJSONSerialization JSONObjectWithData:data
                                         options:NSJSONReadingFragmentsAllowed
                                           error:nil];
}

static NSString *MDKPrettyJSONValue(id value) {
  if (value == nil || value == NSNull.null) {
    return @"null";
  }
  if ([value isKindOfClass:NSDictionary.class] ||
      [value isKindOfClass:NSArray.class]) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value
                                                   options:NSJSONWritingPrettyPrinted |
                                                           NSJSONWritingSortedKeys
                                                     error:nil];
    if (data != nil) {
      return [[NSString alloc] initWithData:data
                                   encoding:NSUTF8StringEncoding];
    }
  }
  if ([value isKindOfClass:NSNumber.class] &&
      CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) {
    return [value boolValue] ? @"true" : @"false";
  }
  return [value description] ?: @"";
}

static NSString *MDKMMKVRootPath(void) {
  NSString *appGroup =
      [NSBundle.mainBundle objectForInfoDictionaryKey:@"AppGroupIdentifier"];
  if (appGroup.length > 0) {
    NSURL *container = [NSFileManager.defaultManager
        containerURLForSecurityApplicationGroupIdentifier:appGroup];
    if (container != nil) {
      return container.path;
    }
  }
  NSURL *documents = [NSFileManager.defaultManager
      URLsForDirectory:NSDocumentDirectory
             inDomains:NSUserDomainMask]
                         .firstObject;
  return [documents URLByAppendingPathComponent:@"mmkv" isDirectory:YES].path;
}

static mmkv::MMKV *MDKDefaultStorage(void) {
  NSString *rootPath = MDKMMKVRootPath();
  [NSFileManager.defaultManager createDirectoryAtPath:rootPath
                          withIntermediateDirectories:YES
                                           attributes:nil
                                                error:nil];
  std::string root = rootPath.UTF8String ?: "";
  mmkv::MMKV::initializeMMKV(root, mmkv::MMKVLogWarning);
  mmkv::MMKV *storage = mmkv::MMKV::mmkvWithID(
      DEFAULT_MMAP_ID, mmkv::MMKV_SINGLE_PROCESS, nullptr, &root);
  return storage;
}

static NSArray<NSDictionary<NSString *, NSString *> *> *MDKStorageEntries(void) {
  mmkv::MMKV *storage = MDKDefaultStorage();
  if (storage == nullptr) {
    return @[];
  }

  NSMutableArray *entries = [NSMutableArray array];
  for (NSString *key in storage->allKeysObjC()) {
    std::string stringValue;
    NSString *display = nil;
    NSString *kind = @"binary";
    if (storage->getString(key, stringValue)) {
      display = [[NSString alloc]
          initWithBytes:stringValue.data()
                 length:stringValue.size()
               encoding:NSUTF8StringEncoding];
      if (display != nil) {
        kind = @"string";
      }
    } else {
      bool hasNumber = false;
      double numberValue = storage->getDouble(key, 0.0, &hasNumber);
      if (hasNumber) {
        display = [NSString stringWithFormat:@"%.15g", numberValue];
        kind = @"number";
      } else {
        bool hasBoolean = false;
        bool booleanValue = storage->getBool(key, false, &hasBoolean);
        if (hasBoolean) {
          display = booleanValue ? @"true" : @"false";
          kind = @"boolean";
        }
      }
    }
    NSString *rawValue = display ?: @"<binary or unreadable>";
    id parsed = MDKParseJSONValue(rawValue);
    BOOL canMutate = ![kind isEqualToString:@"binary"] &&
                     !MDKIsSensitiveName(key) &&
                     !MDKJSONContainsSensitiveField(parsed);
    [entries addObject:@{
      @"key" : key,
      @"kind" : kind,
      @"value" : MDKDisplayString(key, rawValue),
      @"canMutate" : canMutate ? @"true" : @"false",
    }];
  }
  [entries sortUsingComparator:^NSComparisonResult(NSDictionary *left,
                                                    NSDictionary *right) {
    return [left[@"key"] localizedCaseInsensitiveCompare:right[@"key"]];
  }];
  return entries;
}

static BOOL MDKWriteStorageEntry(NSDictionary<NSString *, NSString *> *entry,
                                 NSString *editorText) {
  if (![entry[@"canMutate"] boolValue]) {
    return NO;
  }
  mmkv::MMKV *storage = MDKDefaultStorage();
  std::string key = entry[@"key"].UTF8String ?: "";
  NSString *kind = entry[@"kind"];
  if (storage == nullptr || key.empty()) {
    return NO;
  }
  if ([kind isEqualToString:@"string"]) {
    std::string value = editorText.UTF8String ?: "";
    return storage->set(value, key);
  }
  NSString *trimmed = [editorText
      stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  if ([kind isEqualToString:@"number"]) {
    NSScanner *scanner = [NSScanner scannerWithString:trimmed];
    scanner.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    double numberValue = 0.0;
    if (![scanner scanDouble:&numberValue] || !scanner.isAtEnd ||
        !std::isfinite(numberValue)) {
      return NO;
    }
    return storage->set(numberValue, key);
  }
  if ([kind isEqualToString:@"boolean"]) {
    NSString *booleanText = trimmed.lowercaseString;
    if (![booleanText isEqualToString:@"true"] &&
        ![booleanText isEqualToString:@"false"]) {
      return NO;
    }
    bool booleanValue = [booleanText isEqualToString:@"true"];
    return storage->set(booleanValue, key);
  }
  return NO;
}

static BOOL MDKRemoveStorageEntry(NSDictionary<NSString *, NSString *> *entry) {
  if (![entry[@"canMutate"] boolValue]) {
    return NO;
  }
  mmkv::MMKV *storage = MDKDefaultStorage();
  std::string key = entry[@"key"].UTF8String ?: "";
  if (storage == nullptr || key.empty() || !storage->containsKey(key)) {
    return NO;
  }
  return storage->removeValueForKey(key);
}

static NSString *MDKNetworkURL(DoraemonNetFlowHttpModel *model) {
  NSURL *recordedURL = model.request.URL;
  if (recordedURL == nil && model.url.length > 0) {
    recordedURL = [NSURL URLWithString:model.url];
  }
  NSURL *effectiveURL = recordedURL == nil ? nil : MDKRewriteAPIURL(recordedURL);
  return effectiveURL.absoluteString ?: model.url ?: @"";
}

static NSString *MDKNetworkMethod(DoraemonNetFlowHttpModel *model) {
  NSString *method = model.request.HTTPMethod.length > 0
                         ? model.request.HTTPMethod
                         : model.method;
  return method.length > 0 ? method.uppercaseString : @"HTTP";
}

static NSString *MDKNetworkStatus(DoraemonNetFlowHttpModel *model) {
  return model.statusCode.length > 0
             ? model.statusCode
             : MDKText(@"Pending", @"等待中");
}

static NSString *MDKFormatBytes(double bytes) {
  double safe = MAX(0.0, bytes);
  if (safe >= 1024.0 * 1024.0) {
    return [NSString stringWithFormat:@"%.1f MB", safe / (1024.0 * 1024.0)];
  }
  if (safe >= 1024.0) {
    return [NSString stringWithFormat:@"%.1f KB", safe / 1024.0];
  }
  return [NSString stringWithFormat:@"%.0f B", safe];
}

static NSString *MDKFormatDuration(DoraemonNetFlowHttpModel *model) {
  double milliseconds = model.totalDuration.doubleValue * 1000.0;
  if (milliseconds <= 0.0 && model.endTime > model.startTime) {
    milliseconds = (model.endTime - model.startTime) * 1000.0;
  }
  if (milliseconds <= 0.0) {
    return @"—";
  }
  return milliseconds < 1000.0
             ? [NSString stringWithFormat:@"%.0f ms", milliseconds]
             : [NSString stringWithFormat:@"%.2f s", milliseconds / 1000.0];
}

static NSString *MDKFormatStartTime(NSTimeInterval timestamp) {
  if (timestamp <= 0.0) {
    return @"—";
  }
  NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
  formatter.dateFormat = @"HH:mm:ss.SSS";
  return [formatter stringFromDate:[NSDate dateWithTimeIntervalSince1970:timestamp]];
}

static NSDictionary *MDKNetworkResponseHeaders(DoraemonNetFlowHttpModel *model) {
  if ([model.response isKindOfClass:NSHTTPURLResponse.class]) {
    return ((NSHTTPURLResponse *)model.response).allHeaderFields ?: @{};
  }
  return @{};
}

static BOOL MDKNetworkIsTextMIMEType(NSString *mimeType) {
  NSString *normalized = mimeType.lowercaseString ?: @"";
  return [normalized hasPrefix:@"text/"] || [normalized containsString:@"json"] ||
         [normalized containsString:@"xml"] ||
         [normalized containsString:@"javascript"] ||
         [normalized containsString:@"form-urlencoded"];
}

static UIImage *MDKImagePreviewFromData(NSData *data) {
  if (data.length == 0 || data.length > MDKMaxImagePreviewBytes) {
    return nil;
  }
  CGImageSourceRef source = CGImageSourceCreateWithData(
      (__bridge CFDataRef)data, NULL);
  if (source == NULL) {
    return nil;
  }
  NSDictionary *options = @{
    (__bridge NSString *)kCGImageSourceCreateThumbnailFromImageAlways : @YES,
    (__bridge NSString *)kCGImageSourceCreateThumbnailWithTransform : @YES,
    (__bridge NSString *)kCGImageSourceShouldCacheImmediately : @YES,
    (__bridge NSString *)kCGImageSourceThumbnailMaxPixelSize :
        @(MDKMaxImagePreviewDimension),
  };
  CGImageRef thumbnail = CGImageSourceCreateThumbnailAtIndex(
      source, 0, (__bridge CFDictionaryRef)options);
  CFRelease(source);
  if (thumbnail == NULL) {
    return nil;
  }
  UIImage *image = [UIImage imageWithCGImage:thumbnail
                                       scale:UIScreen.mainScreen.scale
                                 orientation:UIImageOrientationUp];
  CGImageRelease(thumbnail);
  return image;
}

static BOOL MDKNetworkIsError(DoraemonNetFlowHttpModel *model) {
  NSInteger status = model.statusCode.integerValue;
  return status >= 400 || status < 0;
}

static NSString *MDKNetworkResourceType(DoraemonNetFlowHttpModel *model) {
  NSString *mime = model.mineType.lowercaseString ?: @"";
  NSString *path = [NSURLComponents componentsWithString:MDKNetworkURL(model)]
                       .path.lowercaseString ?: @"";
  if ([mime hasPrefix:@"image/"] ||
      [path rangeOfString:@"\\.(png|jpe?g|gif|webp|svg|avif|heic)$"
                  options:NSRegularExpressionSearch].location != NSNotFound) {
    return @"image";
  }
  if ([mime hasPrefix:@"audio/"] || [mime hasPrefix:@"video/"] ||
      [path rangeOfString:@"\\.(mp4|mov|m4v|webm|mp3|m4a|wav|aac|ogg)$"
                  options:NSRegularExpressionSearch].location != NSNotFound) {
    return @"media";
  }
  static NSSet<NSString *> *fetchMethods;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    fetchMethods = [NSSet setWithArray:@[ @"GET", @"POST", @"PUT", @"PATCH", @"DELETE" ]];
  });
  if ([fetchMethods containsObject:MDKNetworkMethod(model)] &&
      (![mime hasPrefix:@"image/"] && ![mime hasPrefix:@"audio/"] &&
       ![mime hasPrefix:@"video/"])) {
    return @"fetch";
  }
  return @"other";
}

static UIViewController *MDKTopViewController(UIViewController *controller) {
  if (controller.presentedViewController != nil) {
    return MDKTopViewController(controller.presentedViewController);
  }
  if ([controller isKindOfClass:UINavigationController.class]) {
    return MDKTopViewController(
        ((UINavigationController *)controller).visibleViewController);
  }
  if ([controller isKindOfClass:UITabBarController.class]) {
    return MDKTopViewController(
        ((UITabBarController *)controller).selectedViewController);
  }
  return controller;
}

static UIViewController *MDKApplicationTopViewController(void) {
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) {
      continue;
    }
    UIWindowScene *windowScene = (UIWindowScene *)scene;
    UIWindow *window = [windowScene.windows
        filteredArrayUsingPredicate:
            [NSPredicate predicateWithBlock:^BOOL(UIWindow *candidate,
                                                  __unused NSDictionary *bindings) {
              return candidate.isKeyWindow && candidate.rootViewController != nil;
            }]]
                           .firstObject;
    if (window != nil) {
      return MDKTopViewController(window.rootViewController);
    }
  }
  return nil;
}

@interface MDKNativeDiagnosticsContentController : UIViewController

- (instancetype)initWithDestination:(MDKDiagnosticsDestination)destination;

@end

@implementation MDKNativeDiagnosticsContentController {
  MDKDiagnosticsDestination _destination;
  UIStackView *_bodyStack;
  UIScrollView *_scrollView;
  UIStackView *_content;
  UIView *_networkDetailHeader;

  NSArray<NSDictionary<NSString *, NSString *> *> *_storageEntries;
  NSArray<NSDictionary<NSString *, NSString *> *> *_filteredStorageEntries;
  UIStackView *_storageResults;
  UIView *_storageDetailView;
  UITextField *_storageSearchField;
  UITextView *_storageEditor;
  NSString *_selectedStorageKey;

  NSArray<DoraemonNetFlowHttpModel *> *_networkAllModels;
  NSArray<DoraemonNetFlowHttpModel *> *_networkModels;
  UIStackView *_networkResults;
  UILabel *_networkRequestMetric;
  UILabel *_networkErrorMetric;
  UILabel *_networkReceivedMetric;
  UILabel *_networkShowing;
  UITextField *_networkSearchField;
  UISwitch *_networkCaptureSwitch;
  NSArray<UIButton *> *_networkFilterButtons;
  NSString *_networkFilter;
  NSTimer *_networkRefreshTimer;
  DoraemonNetFlowHttpModel *_selectedNetworkModel;
  BOOL _networkResponseTab;

  UILabel *_otaStatus;

  UITextField *_apiBaseField;
  NSString *_selectedMockIdentifier;
  UISwitch *_abMockSwitch;
  NSMutableArray<NSDictionary<NSString *, id> *> *_abMockRows;
  UIStackView *_abMockRowsStack;
  UIView *_abMockEmptyState;
}

- (instancetype)initWithDestination:(MDKDiagnosticsDestination)destination {
  self = [super initWithNibName:nil bundle:nil];
  if (self != nil) {
    _destination = destination;
    _networkFilter = @"all";
  }
  return self;
}

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = MDKSurfaceColor();
  [self configureNavigation];
  [self configureScrollContent];
  [self renderDestination];
}

- (void)viewDidAppear:(BOOL)animated {
  [super viewDidAppear:animated];
  [self scheduleNetworkRefresh];
}

- (void)viewWillDisappear:(BOOL)animated {
  [_networkRefreshTimer invalidate];
  _networkRefreshTimer = nil;
  [super viewWillDisappear:animated];
}

- (void)configureNavigation {
  NSString *title = @"";
  switch (_destination) {
    case MDKDiagnosticsDestinationNetwork:
      title = MDKText(@"Network", @"网络抓包");
      break;
    case MDKDiagnosticsDestinationExpoUpdate:
      title = MDKText(@"Expo Update", @"Expo 热更新");
      break;
    case MDKDiagnosticsDestinationLocalState:
      title = MDKText(@"Local State", @"本地状态");
      break;
    case MDKDiagnosticsDestinationAPI:
      title = MDKText(@"API Environment", @"API 环境");
      break;
    case MDKDiagnosticsDestinationMocks:
      title = MDKText(@"Interface Mock", @"接口 Mock");
      break;
  }
  self.title = title;

  UIStackView *titleView = [[UIStackView alloc] init];
  titleView.axis = UILayoutConstraintAxisVertical;
  titleView.alignment = UIStackViewAlignmentCenter;
  titleView.spacing = 1.0;
  UILabel *eyebrow = [self labelWithText:MDKText(@"ON-DEVICE DIAGNOSTICS", @"设备诊断")];
  eyebrow.textColor = MDKAccentColor();
  eyebrow.font = [UIFont boldSystemFontOfSize:9.0];
  eyebrow.accessibilityElementsHidden = YES;
  UILabel *titleLabel = [self labelWithText:title];
  titleLabel.font = [UIFont boldSystemFontOfSize:17.0];
  titleLabel.textAlignment = NSTextAlignmentCenter;
  [titleView addArrangedSubview:eyebrow];
  [titleView addArrangedSubview:titleLabel];
  titleView.accessibilityLabel = title;
  self.navigationItem.titleView = titleView;

  UIBarButtonItem *back = [[UIBarButtonItem alloc]
      initWithTitle:MDKText(@"Back", @"返回")
              style:UIBarButtonItemStylePlain
             target:self
             action:@selector(close)];
  back.accessibilityLabel = MDKText(@"Back to DoKit tools", @"返回 DoKit 工具");
  back.tintColor = MDKSecondaryTextColor();
  self.navigationItem.leftBarButtonItem = back;

  UINavigationBarAppearance *appearance = [[UINavigationBarAppearance alloc] init];
  [appearance configureWithOpaqueBackground];
  appearance.backgroundColor = MDKSurfaceColor();
  appearance.shadowColor = MDKBorderColor();
  self.navigationController.navigationBar.standardAppearance = appearance;
  self.navigationController.navigationBar.scrollEdgeAppearance = appearance;
}

- (void)configureScrollContent {
  _bodyStack = [[UIStackView alloc] init];
  _bodyStack.translatesAutoresizingMaskIntoConstraints = NO;
  _bodyStack.axis = UILayoutConstraintAxisVertical;
  _bodyStack.spacing = 0.0;
  _bodyStack.backgroundColor = MDKSurfaceColor();
  [self.view addSubview:_bodyStack];
  [NSLayoutConstraint activateConstraints:@[
    [_bodyStack.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor],
    [_bodyStack.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
    [_bodyStack.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
    [_bodyStack.bottomAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.bottomAnchor],
  ]];

  _networkDetailHeader = [self renderNetworkDetailHeader];
  _networkDetailHeader.hidden = YES;
  [_bodyStack addArrangedSubview:_networkDetailHeader];

  _scrollView = [[UIScrollView alloc] init];
  _scrollView.translatesAutoresizingMaskIntoConstraints = NO;
  _scrollView.alwaysBounceVertical = YES;
  _scrollView.keyboardDismissMode = UIScrollViewKeyboardDismissModeOnDrag;
  _scrollView.backgroundColor = MDKSurfaceColor();
  [_scrollView setContentHuggingPriority:UILayoutPriorityDefaultLow
                                 forAxis:UILayoutConstraintAxisVertical];
  [_bodyStack addArrangedSubview:_scrollView];

  _content = [[UIStackView alloc] init];
  _content.translatesAutoresizingMaskIntoConstraints = NO;
  _content.axis = UILayoutConstraintAxisVertical;
  _content.spacing = 10.0;
  _content.layoutMargins = UIEdgeInsetsMake(16.0, 16.0, 36.0, 16.0);
  _content.layoutMarginsRelativeArrangement = YES;
  [_scrollView addSubview:_content];
  [NSLayoutConstraint activateConstraints:@[
    [_content.topAnchor constraintEqualToAnchor:_scrollView.contentLayoutGuide.topAnchor],
    [_content.leadingAnchor constraintEqualToAnchor:_scrollView.contentLayoutGuide.leadingAnchor],
    [_content.trailingAnchor constraintEqualToAnchor:_scrollView.contentLayoutGuide.trailingAnchor],
    [_content.bottomAnchor constraintEqualToAnchor:_scrollView.contentLayoutGuide.bottomAnchor],
    [_content.widthAnchor constraintEqualToAnchor:_scrollView.frameLayoutGuide.widthAnchor],
  ]];
}

- (void)renderDestination {
  [self setNetworkDetailHeaderVisible:NO];
  [self clearStack:_content];
  switch (_destination) {
    case MDKDiagnosticsDestinationNetwork:
      [self renderNetwork];
      break;
    case MDKDiagnosticsDestinationExpoUpdate:
      [self renderExpoUpdate];
      break;
    case MDKDiagnosticsDestinationLocalState:
      [self renderStorage];
      break;
    case MDKDiagnosticsDestinationAPI:
      [self renderAPIEnvironment];
      break;
    case MDKDiagnosticsDestinationMocks:
      [self renderInterfaceMocks];
      break;
  }
  [_scrollView setContentOffset:CGPointZero animated:NO];
}

#pragma mark - API environment

- (void)renderAPIEnvironment {
  [_content addArrangedSubview:[self
      infoCardWithTitle:MDKText(@"First-party API only", @"仅限 Tipsy API")
                   value:MDKText(
                       @"Changes the origin for new Tipsy /api/v1, /api/v2, and future versioned API requests. OSS, CDN, analytics, and third-party requests are not changed.",
                       @"替换新发起的 Tipsy /api/v1、/api/v2 及后续版本化 API 请求的来源地址。OSS、CDN、埋点和第三方请求不受影响。")]];

  UIStackView *current = [self cardWithColor:MDKCardColor() radius:12.0];
  UILabel *currentTitle = [self labelWithText:MDKText(@"Current override", @"当前覆盖地址")];
  currentTitle.font = [UIFont systemFontOfSize:12.0];
  currentTitle.textColor = MDKMutedTextColor();
  [current addArrangedSubview:currentTitle];
  NSString *saved = MDKSavedAPIBaseURL();
  UILabel *currentValue = [self labelWithText:saved ?: MDKText(
      @"Build default (no override)", @"构建默认值（未覆盖）")];
  currentValue.font = MDKMonoFont(12.0, UIFontWeightRegular);
  currentValue.textColor = saved == nil ? MDKSecondaryTextColor() : MDKAccentColor();
  currentValue.accessibilityLabel = currentValue.text;
  [current addArrangedSubview:currentValue];
  [_content addArrangedSubview:current];

  _apiBaseField = [self searchFieldWithPlaceholder:
      @"https://branch.api.dev.fantacy.live"];
  _apiBaseField.text = saved ?: @"";
  _apiBaseField.keyboardType = UIKeyboardTypeURL;
  _apiBaseField.accessibilityLabel = MDKText(@"API base URL", @"API 地址");
  [_content addArrangedSubview:_apiBaseField];

  UIStackView *actions = [[UIStackView alloc] init];
  actions.axis = UILayoutConstraintAxisHorizontal;
  actions.distribution = UIStackViewDistributionFillEqually;
  actions.spacing = 8.0;
  UIButton *save = [self primaryButtonWithTitle:MDKText(@"Save", @"保存")];
  [save addTarget:self
                action:@selector(saveAPIEnvironment)
      forControlEvents:UIControlEventTouchUpInside];
  UIButton *reset = [self secondaryButtonWithTitle:MDKText(@"Reset", @"恢复默认")];
  [reset addTarget:self
                 action:@selector(clearAPIEnvironment)
       forControlEvents:UIControlEventTouchUpInside];
  [actions addArrangedSubview:save];
  [actions addArrangedSubview:reset];
  [_content addArrangedSubview:actions];

  [_content addArrangedSubview:[self
      infoCardWithTitle:MDKText(@"Path versions are preserved", @"保留原接口版本")
                   value:MDKText(
                       @"Only scheme, host, and port are replaced. A v1 request stays v1 and a v2 request stays v2. Existing streaming connections continue until reconnected.",
                       @"只替换 scheme、host 和 port。v1 请求仍是 v1，v2 请求仍是 v2；已经建立的流式连接会继续使用原地址，直到重新连接。")]];
}

- (void)saveAPIEnvironment {
  if (!MDKSaveAPIBaseURL(_apiBaseField.text ?: @"")) {
    [self showNoticeWithTitle:MDKText(@"Invalid API address", @"API 地址无效")
                     message:MDKText(
                         @"Use HTTPS with api.dev.fantacy.live, one of its subdomains, or exact api.tipsy.chat. Credentials, query, fragments, and nonstandard ports are not allowed.",
                         @"仅支持 HTTPS 的 api.dev.fantacy.live、其子域名或精确的 api.tipsy.chat；不允许凭据、query、fragment 和非标准端口。")];
    return;
  }
  [self renderDestination];
}

- (void)clearAPIEnvironment {
  MDKClearAPIBaseURL();
  [self renderDestination];
}

static NSDictionary<NSString *, NSString *> *MDKLatestABConfigValues(void) {
  NSArray<DoraemonNetFlowHttpModel *> *models =
      [[DoraemonNetFlowDataSource shareInstance].httpModelArray copy];
  for (DoraemonNetFlowHttpModel *model in [models reverseObjectEnumerator]) {
    NSURL *url = model.request.URL;
    if (url == nil && model.url.length > 0) {
      url = [NSURL URLWithString:model.url];
    }
    if (url == nil) {
      continue;
    }
    NSMutableURLRequest *request = [model.request mutableCopy];
    if (request == nil) {
      request = [NSMutableURLRequest requestWithURL:url];
      request.HTTPMethod = model.method;
    }
    if (!MDKIsABConfigRequest(request)) {
      continue;
    }

    NSData *body = [model.responseBody dataUsingEncoding:NSUTF8StringEncoding];
    if (body.length == 0) {
      body = model.responseData;
    }
    if (body.length == 0) {
      continue;
    }
    NSDictionary *root = [NSJSONSerialization JSONObjectWithData:body options:0 error:nil];
    NSDictionary *data = [root isKindOfClass:NSDictionary.class] ? root[@"data"] : nil;
    NSDictionary *configs = [data isKindOfClass:NSDictionary.class] ? data[@"configs"] : nil;
    if (![configs isKindOfClass:NSDictionary.class]) {
      continue;
    }
    NSMutableDictionary<NSString *, NSString *> *values = [NSMutableDictionary dictionary];
    [configs enumerateKeysAndObjectsUsingBlock:^(id key, id value, __unused BOOL *stop) {
      if (![key isKindOfClass:NSString.class]) {
        return;
      }
      if ([value isKindOfClass:NSString.class]) {
        values[key] = value;
      } else if ([value isKindOfClass:NSNumber.class]) {
        values[key] = [value stringValue];
      }
    }];
    return [values copy];
  }
  return nil;
}

#pragma mark - Interface mocks

- (void)renderInterfaceMocks {
  if ([_selectedMockIdentifier isEqualToString:MDKABConfigMockIdentifier]) {
    [self renderABMockDetails];
    return;
  }
  [_content addArrangedSubview:[self
      infoCardWithTitle:MDKText(@"Opt-in response overrides", @"按需覆盖响应")
                   value:MDKText(
                       @"Each mock is disabled by default and matches one exact API contract. Unknown fields and other interfaces pass through unchanged.",
                       @"每个 Mock 默认关闭，并且只匹配一个精确接口契约。未知字段和其他接口均原样透传。")]];

  [MDKMockEndpointRegistry() enumerateObjectsUsingBlock:^(
      NSDictionary<NSString *, NSString *> *endpoint, NSUInteger index,
      __unused BOOL *stop) {
    NSDictionary *override = MDKMockOverride(endpoint[@"identifier"]);
    UIButton *button = [UIButton buttonWithType:UIButtonTypeCustom];
    button.tag = index;
    button.backgroundColor = MDKCardColor();
    button.layer.cornerRadius = 12.0;
    button.layer.borderWidth = 1.0;
    button.layer.borderColor = MDKBorderColor().CGColor;
    BOOL enabled = [override[@"enabled"] boolValue];
    button.accessibilityLabel = [NSString stringWithFormat:@"%@, %@", endpoint[@"title"],
        enabled ? MDKText(@"Enabled", @"已启用") : MDKText(@"Disabled", @"未启用")];
    [button addTarget:self
                   action:@selector(showMockDetails:)
         forControlEvents:UIControlEventTouchUpInside];

    UIStackView *labels = [[UIStackView alloc] init];
    labels.translatesAutoresizingMaskIntoConstraints = NO;
    labels.axis = UILayoutConstraintAxisVertical;
    labels.spacing = 7.0;
    labels.userInteractionEnabled = NO;
    UIStackView *top = [[UIStackView alloc] init];
    top.axis = UILayoutConstraintAxisHorizontal;
    top.alignment = UIStackViewAlignmentCenter;
    top.spacing = 8.0;
    UILabel *title = [self labelWithText:endpoint[@"title"]];
    title.font = [UIFont boldSystemFontOfSize:15.0];
    UILabel *status = [self badgeWithText:
        (enabled ? MDKText(@"Enabled", @"已启用") : MDKText(@"Disabled", @"未启用"))
                                      color:(enabled ? MDKAccentColor() : MDKBorderColor())];
    [top addArrangedSubview:title];
    [top addArrangedSubview:status];
    UILabel *description = [self labelWithText:endpoint[@"description"]];
    description.font = [UIFont systemFontOfSize:12.0];
    description.textColor = MDKSecondaryTextColor();
    UILabel *path = [self labelWithText:[NSString
        stringWithFormat:@"%@ %@", endpoint[@"method"], endpoint[@"path"]]];
    path.font = MDKMonoFont(10.0, UIFontWeightRegular);
    path.textColor = MDKMutedTextColor();
    [labels addArrangedSubview:top];
    [labels addArrangedSubview:description];
    [labels addArrangedSubview:path];
    [button addSubview:labels];
    [NSLayoutConstraint activateConstraints:@[
      [labels.topAnchor constraintEqualToAnchor:button.topAnchor constant:13.0],
      [labels.leadingAnchor constraintEqualToAnchor:button.leadingAnchor constant:13.0],
      [labels.trailingAnchor constraintEqualToAnchor:button.trailingAnchor constant:-13.0],
      [labels.bottomAnchor constraintEqualToAnchor:button.bottomAnchor constant:-13.0],
      [button.heightAnchor constraintGreaterThanOrEqualToConstant:96.0],
    ]];
    [self->_content addArrangedSubview:button];
  }];
}

- (void)showMockDetails:(UIButton *)sender {
  NSArray *registry = MDKMockEndpointRegistry();
  if (sender.tag >= registry.count) {
    return;
  }
  _selectedMockIdentifier = registry[sender.tag][@"identifier"];
  [self renderDestination];
}

- (void)renderABMockDetails {
  UIButton *back = [self secondaryButtonWithTitle:
      MDKText(@"Back to interface list", @"返回接口列表")];
  [back addTarget:self
               action:@selector(backToMockList)
     forControlEvents:UIControlEventTouchUpInside];
  [_content addArrangedSubview:back];

  NSDictionary *override = MDKMockOverride(MDKABConfigMockIdentifier);
  NSDictionary *savedValues = [override[@"values"] isKindOfClass:NSDictionary.class]
                                   ? override[@"values"]
                                   : @{};
  NSDictionary *latestValues = MDKLatestABConfigValues();
  NSMutableDictionary *values = [NSMutableDictionary dictionaryWithDictionary:
      latestValues ?: @{}];
  [values addEntriesFromDictionary:savedValues];
  UIStackView *summary = [self cardWithColor:MDKCardColor() radius:12.0];
  UIStackView *top = [[UIStackView alloc] init];
  top.axis = UILayoutConstraintAxisHorizontal;
  top.alignment = UIStackViewAlignmentCenter;
  top.spacing = 8.0;
  UIStackView *copy = [[UIStackView alloc] init];
  copy.axis = UILayoutConstraintAxisVertical;
  copy.spacing = 4.0;
  UILabel *title = [self labelWithText:MDKText(@"AB Experiment API", @"AB 实验接口")];
  title.font = [UIFont boldSystemFontOfSize:17.0];
  UILabel *path = [self labelWithText:[NSString stringWithFormat:@"POST %@", MDKABConfigPath]];
  path.font = MDKMonoFont(10.0, UIFontWeightRegular);
  path.textColor = MDKMutedTextColor();
  [copy addArrangedSubview:title];
  [copy addArrangedSubview:path];
  _abMockSwitch = [[UISwitch alloc] init];
  _abMockSwitch.on = [override[@"enabled"] boolValue];
  _abMockSwitch.onTintColor = MDKAccentColor();
  _abMockSwitch.accessibilityLabel = MDKText(@"Enable this interface mock",
                                             @"启用此接口 Mock");
  [top addArrangedSubview:copy];
  [top addArrangedSubview:_abMockSwitch];
  [summary addArrangedSubview:top];
  [_content addArrangedSubview:summary];

  [_content addArrangedSubview:[self
      infoCardWithTitle:MDKText(@"Latest server response", @"最近一次服务端响应")
                   value:(latestValues == nil
                              ? MDKText(@"Capture an AB response or add a key below.",
                                        @"请先捕获 AB 响应，或在下方添加 key。")
                              : MDKText(
                                    @"Keys from the newest captured AB response are shown below. Change a value and save to mock it; you can also add a new key.",
                                    @"下方已列出最近一次捕获的 AB 响应中的 key。修改 value 后保存即可 Mock，也可以继续添加新 key。"))]];
  UIButton *refresh = [self secondaryButtonWithTitle:
      MDKText(@"Refresh from latest response", @"从最近响应刷新")];
  [refresh addTarget:self
              action:@selector(refreshABMockDetails)
    forControlEvents:UIControlEventTouchUpInside];
  [_content addArrangedSubview:refresh];

  _abMockRows = [NSMutableArray array];
  _abMockEmptyState = nil;
  UIStackView *valueCard = [self cardWithColor:MDKCardColor() radius:12.0];
  UILabel *keyTitle = [self labelWithText:MDKText(@"Experiment overrides", @"实验覆盖")];
  keyTitle.font = [UIFont systemFontOfSize:12.0];
  keyTitle.textColor = MDKMutedTextColor();
  [valueCard addArrangedSubview:keyTitle];
  _abMockRowsStack = [[UIStackView alloc] init];
  _abMockRowsStack.axis = UILayoutConstraintAxisVertical;
  _abMockRowsStack.spacing = 8.0;
  [valueCard addArrangedSubview:_abMockRowsStack];
  for (NSString *key in [values.allKeys sortedArrayUsingSelector:@selector(compare:)]) {
    id savedValue = values[key];
    [self addABMockRowWithKey:key
                         value:([savedValue isKindOfClass:NSString.class] ? savedValue : @"")
                 serverValues:latestValues ?: @{}
              hasServerSnapshot:(latestValues != nil)
                       persisted:[savedValues isKindOfClass:NSString.class] &&
                                   savedValues[key] != nil];
  }
  [self refreshABMockEmptyState];
  UIButton *add = [self secondaryButtonWithTitle:
      MDKText(@"Add experiment", @"添加实验")];
  [add addTarget:self
               action:@selector(addABMockRow:)
     forControlEvents:UIControlEventTouchUpInside];
  [valueCard addArrangedSubview:add];
  [_content addArrangedSubview:valueCard];

  UIButton *save = [self primaryButtonWithTitle:MDKText(@"Save", @"保存")];
  [save addTarget:self
                action:@selector(saveABMock)
      forControlEvents:UIControlEventTouchUpInside];
  [_content addArrangedSubview:save];
  UIButton *clear = [self secondaryButtonWithTitle:
      MDKText(@"Clear all experiment mocks", @"清理全部实验 Mock")];
  [clear setTitleColor:MDKDangerColor() forState:UIControlStateNormal];
  [clear addTarget:self
            action:@selector(clearAllABMocks:)
  forControlEvents:UIControlEventTouchUpInside];
  [_content addArrangedSubview:clear];
  [_content addArrangedSubview:[self
      infoCardWithTitle:MDKText(@"Merge behavior", @"合并规则")
                   value:MDKText(
                       @"Configured values are merged into data.configs after a valid server response. Other experiments and response fields remain unchanged.",
                       @"服务端响应合法时，将配置的实验值合并进 data.configs。其他实验和响应字段保持不变。")]];
}

- (void)refreshABMockDetails {
  [self renderDestination];
}

- (void)backToMockList {
  _selectedMockIdentifier = nil;
  [self renderDestination];
}

- (void)addABMockRow:(UIButton *)sender {
  (void)sender;
  NSDictionary *latestValues = MDKLatestABConfigValues();
  [self addABMockRowWithKey:@""
                       value:@""
                serverValues:latestValues ?: @{}
             hasServerSnapshot:(latestValues != nil)
                      persisted:NO];
  [self refreshABMockEmptyState];
}

- (void)addABMockRowWithKey:(NSString *)key
                      value:(NSString *)value
               serverValues:(NSDictionary<NSString *, NSString *> *)serverValues
            hasServerSnapshot:(BOOL)hasServerSnapshot
                     persisted:(BOOL)persisted {
  UITextField *keyField = [self searchFieldWithPlaceholder:
      MDKText(@"Experiment key, for example enable_recsys_in_home_show_case",
              @"实验键，例如 enable_recsys_in_home_show_case")];
  keyField.text = key ?: @"";
  keyField.accessibilityLabel = MDKText(@"Experiment key", @"实验键");
  UITextField *valueField = [self searchFieldWithPlaceholder:
      MDKText(@"Experiment value", @"实验值")];
  valueField.text = value ?: @"";
  valueField.accessibilityLabel = MDKText(@"Experiment value", @"实验值");

  UIStackView *row = [self cardWithColor:MDKBackgroundColor() radius:9.0];
  UILabel *source = [self badgeWithText:@"" color:MDKMutedTextColor()];
  source.hidden = YES;
  [row addArrangedSubview:source];
  [row addArrangedSubview:keyField];
  [row addArrangedSubview:valueField];
  UIStackView *presets = [[UIStackView alloc] init];
  presets.axis = UILayoutConstraintAxisHorizontal;
  presets.distribution = UIStackViewDistributionFillEqually;
  presets.spacing = 8.0;
  UIButton *trueButton = [self secondaryButtonWithTitle:@"true"];
  [trueButton addTarget:self
                    action:@selector(setABPresetTrue:)
          forControlEvents:UIControlEventTouchUpInside];
  UIButton *falseButton = [self secondaryButtonWithTitle:@"false"];
  [falseButton addTarget:self
                    action:@selector(setABPresetFalse:)
          forControlEvents:UIControlEventTouchUpInside];
  UIButton *remove = [self secondaryButtonWithTitle:MDKText(@"Remove", @"删除")];
  [remove addTarget:self
             action:@selector(removeABMockRow:)
   forControlEvents:UIControlEventTouchUpInside];
  [presets addArrangedSubview:trueButton];
  [presets addArrangedSubview:falseButton];
  [presets addArrangedSubview:remove];
  [row addArrangedSubview:presets];
  [_abMockRows addObject:@{
    @"card" : row,
    @"key" : keyField,
    @"value" : valueField,
    @"trueButton" : trueButton,
    @"falseButton" : falseButton,
    @"remove" : remove,
    @"source" : source,
    @"serverValues" : serverValues ?: @{},
    @"hasServerSnapshot" : @(hasServerSnapshot),
    @"persisted" : @(persisted),
  }];
  [_abMockRowsStack addArrangedSubview:row];
  [keyField addTarget:self
               action:@selector(refreshABMockRowStatusFromField:)
     forControlEvents:UIControlEventEditingChanged];
  [valueField addTarget:self
                 action:@selector(refreshABMockRowStatusFromField:)
       forControlEvents:UIControlEventEditingChanged];
  [self refreshABMockRowStatus:_abMockRows.lastObject];
}

- (void)refreshABMockRowStatusFromField:(UITextField *)sender {
  for (NSDictionary<NSString *, id> *row in _abMockRows) {
    if (row[@"key"] == sender || row[@"value"] == sender) {
      [self refreshABMockRowStatus:row];
      return;
    }
  }
}

- (void)refreshABMockRowStatus:(NSDictionary<NSString *, id> *)row {
  UITextField *keyField = row[@"key"];
  UITextField *valueField = row[@"value"];
  UILabel *source = row[@"source"];
  NSString *key = [keyField.text stringByTrimmingCharactersInSet:
      NSCharacterSet.whitespaceAndNewlineCharacterSet];
  NSString *value = valueField.text ?: @"";
  NSDictionary *serverValues = row[@"serverValues"];
  BOOL hasServerSnapshot = [row[@"hasServerSnapshot"] boolValue];
  NSString *status = nil;
  UIColor *color = MDKMutedTextColor();
  if (key.length > 0) {
    if (hasServerSnapshot && serverValues[key] == nil) {
      status = MDKText(@"New", @"新增");
      color = MDKColor(0xB45309);
    } else if (hasServerSnapshot && ![serverValues[key] isEqualToString:value]) {
      status = MDKText(@"Modified", @"已修改");
      color = MDKAccentColor();
    } else if (hasServerSnapshot) {
      status = MDKText(@"Server", @"服务端");
      color = MDKColor(0x1D4ED8);
    } else if ([row[@"persisted"] boolValue]) {
      status = @"Mock";
      color = MDKColor(0x7C3AED);
    }
  }
  source.hidden = status.length == 0;
  source.text = status ?: @"";
  source.backgroundColor = color;
}

- (void)refreshABMockEmptyState {
  if (_abMockRows.count == 0) {
    if (_abMockEmptyState == nil) {
      _abMockEmptyState = [self emptyStateWithTitle:
          MDKText(@"No experiment overrides", @"暂无实验覆盖")
                                body:MDKText(
                                    @"Capture an AB response or add one or more key/value pairs to override it.",
                                    @"请先捕获 AB 响应，或添加一个或多个键值对来覆盖它。")];
      [_abMockRowsStack addArrangedSubview:_abMockEmptyState];
    }
  } else if (_abMockEmptyState != nil) {
    [_abMockRowsStack removeArrangedSubview:_abMockEmptyState];
    [_abMockEmptyState removeFromSuperview];
    _abMockEmptyState = nil;
  }
}

- (NSDictionary<NSString *, id> *)abMockRowForPresetButton:(UIButton *)sender {
  for (NSDictionary<NSString *, id> *row in _abMockRows) {
    if (row[@"trueButton"] == sender || row[@"falseButton"] == sender) {
      return row;
    }
  }
  return nil;
}

- (void)setABPresetTrue:(UIButton *)sender {
  UITextField *valueField = [self abMockRowForPresetButton:sender][@"value"];
  valueField.text = @"true";
}

- (void)setABPresetFalse:(UIButton *)sender {
  UITextField *valueField = [self abMockRowForPresetButton:sender][@"value"];
  valueField.text = @"false";
}

- (void)removeABMockRow:(UIButton *)sender {
  NSDictionary<NSString *, id> *target = [self abMockRowForPresetButton:sender];
  if (target == nil) {
    for (NSDictionary<NSString *, id> *row in _abMockRows) {
      if (row[@"remove"] == sender) {
        target = row;
        break;
      }
    }
  }
  if (target == nil) {
    return;
  }
  [_abMockRows removeObject:target];
  [_abMockRowsStack removeArrangedSubview:target[@"card"]];
  [target[@"card"] removeFromSuperview];
  [self refreshABMockEmptyState];
}

- (void)saveABMock {
  NSMutableDictionary<NSString *, NSString *> *values = [NSMutableDictionary dictionary];
  for (NSDictionary<NSString *, id> *row in _abMockRows) {
    UITextField *keyField = row[@"key"];
    NSString *key = [keyField.text stringByTrimmingCharactersInSet:
        NSCharacterSet.whitespaceAndNewlineCharacterSet];
    NSString *value = [row[@"value"] text] ?: @"";
    NSDictionary *serverValues = row[@"serverValues"];
    BOOL unchangedServerValue = [row[@"hasServerSnapshot"] boolValue] &&
                                [serverValues[key] isEqualToString:value];
    if (key.length > 0 && !unchangedServerValue) {
      values[key] = value;
    }
  }
  MDKSaveMockOverride(
      MDKABConfigMockIdentifier, _abMockSwitch.isOn, values);
  [self renderDestination];
}

- (void)clearAllABMocks:(UIButton *)sender {
  (void)sender;
  UIAlertController *alert = [UIAlertController
      alertControllerWithTitle:MDKText(@"Clear all experiment mocks?", @"清理全部实验 Mock？")
                       message:MDKText(
                           @"This removes every saved AB key/value override and disables the AB interface mock.",
                           @"这会删除所有已保存的 AB 键值覆盖，并关闭 AB 接口 Mock。")
                preferredStyle:UIAlertControllerStyleAlert];
  [alert addAction:[UIAlertAction actionWithTitle:MDKText(@"Cancel", @"取消")
                                             style:UIAlertActionStyleCancel
                                           handler:nil]];
  [alert addAction:[UIAlertAction actionWithTitle:MDKText(@"Clear", @"清理")
                                             style:UIAlertActionStyleDestructive
                                           handler:^(__unused UIAlertAction *action) {
    if (MDKClearAllMockOverrides()) {
      [self renderDestination];
    }
  }]];
  [self presentViewController:alert animated:YES completion:nil];
}

#pragma mark - Local state

- (void)renderStorage {
  _storageEntries = MDKStorageEntries();
  [_content addArrangedSubview:[self
      infoCardWithTitle:MDKStorageSecurityTitle()
                   value:MDKText(
                             @"Non-sensitive MMKV entries can be edited or deleted. Credential-like keys and fields stay redacted and read-only.",
                             @"非敏感 MMKV 条目可直接编辑或删除；凭据类 key 和字段仍会隐藏并保持只读。")]];

  _storageSearchField = [self searchFieldWithPlaceholder:MDKStorageSearchPlaceholder()];
  _storageSearchField.accessibilityLabel = MDKStorageSearchPlaceholder();
  [_storageSearchField addTarget:self
                          action:@selector(filterStorageEntries)
                forControlEvents:UIControlEventEditingChanged];
  [_content addArrangedSubview:_storageSearchField];

  _storageResults = [[UIStackView alloc] init];
  _storageResults.axis = UILayoutConstraintAxisVertical;
  _storageResults.spacing = 8.0;
  [_content addArrangedSubview:_storageResults];
  [self filterStorageEntries];
}

- (void)filterStorageEntries {
  NSString *needle = [_storageSearchField.text
      stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet]
                         .lowercaseString;
  if (needle.length == 0) {
    _filteredStorageEntries = _storageEntries;
  } else {
    NSPredicate *predicate = [NSPredicate predicateWithBlock:^BOOL(
        NSDictionary *entry, __unused NSDictionary *bindings) {
      NSString *haystack = [NSString stringWithFormat:@"%@ %@", entry[@"key"],
                                                       entry[@"value"]]
                                .lowercaseString;
      return [haystack containsString:needle];
    }];
    _filteredStorageEntries = [_storageEntries filteredArrayUsingPredicate:predicate];
  }
  [self renderStorageResults];
}

- (void)renderStorageResults {
  [self clearStack:_storageResults];
  _storageDetailView = nil;
  _storageEditor = nil;
  if (_filteredStorageEntries.count == 0) {
    [_storageResults addArrangedSubview:[self
        emptyStateWithTitle:MDKText(@"No entries available", @"暂无可用条目")
                       body:MDKText(@"No keys match the current search.",
                                    @"没有符合当前搜索条件的 key。")]];
  }

  [_filteredStorageEntries enumerateObjectsUsingBlock:^(
                               NSDictionary *entry, NSUInteger index,
                               __unused BOOL *stop) {
    BOOL selected = [entry[@"key"] isEqualToString:self->_selectedStorageKey];
    UIButton *row = [self storageEntryButton:entry
                                    selected:selected];
    row.tag = index;
    [row addTarget:self
                  action:@selector(showStorageDetail:)
        forControlEvents:UIControlEventTouchUpInside];
    [self->_storageResults addArrangedSubview:row];
    if (selected) {
      self->_storageDetailView = [self storageDetailCard:entry];
      [self->_storageResults addArrangedSubview:self->_storageDetailView];
    }
  }];
}

- (void)showStorageDetail:(UIButton *)sender {
  if (sender.tag >= _filteredStorageEntries.count) {
    return;
  }
  _selectedStorageKey = _filteredStorageEntries[sender.tag][@"key"];
  [self renderStorageResults];
}

- (UIButton *)storageEntryButton:(NSDictionary *)entry selected:(BOOL)selected {
  UIButton *button = [UIButton buttonWithType:UIButtonTypeCustom];
  button.backgroundColor = selected ? MDKActiveCardColor() : MDKCardColor();
  button.layer.cornerRadius = 12.0;
  button.layer.borderWidth = 1.0;
  button.layer.borderColor = (selected ? MDKAccentColor() : MDKBorderColor()).CGColor;
  button.accessibilityLabel = [NSString stringWithFormat:@"%@, %@", entry[@"key"],
                                                         MDKCompactPreview(entry[@"value"])];

  UIStackView *labels = [[UIStackView alloc] init];
  labels.translatesAutoresizingMaskIntoConstraints = NO;
  labels.axis = UILayoutConstraintAxisVertical;
  labels.spacing = 8.0;
  labels.userInteractionEnabled = NO;
  UIStackView *storageTop = [[UIStackView alloc] init];
  storageTop.axis = UILayoutConstraintAxisHorizontal;
  storageTop.alignment = UIStackViewAlignmentCenter;
  storageTop.spacing = 8.0;
  UILabel *key = [self labelWithText:entry[@"key"]];
  key.font = [UIFont boldSystemFontOfSize:15.0];
  key.numberOfLines = 2;
  key.lineBreakMode = NSLineBreakByTruncatingTail;
  [key setContentCompressionResistancePriority:UILayoutPriorityDefaultLow
                                        forAxis:UILayoutConstraintAxisHorizontal];
  UILabel *kind = [self
      labelWithText:[[self storageKindForValue:entry[@"value"]] uppercaseString]];
  kind.font = MDKMonoFont(10.0, UIFontWeightSemibold);
  kind.textColor = MDKAccentColor();
  kind.numberOfLines = 1;
  [kind setContentHuggingPriority:UILayoutPriorityRequired
                          forAxis:UILayoutConstraintAxisHorizontal];
  [kind setContentCompressionResistancePriority:UILayoutPriorityRequired
                                         forAxis:UILayoutConstraintAxisHorizontal];
  UILabel *preview = [self labelWithText:MDKCompactPreview(entry[@"value"])];
  preview.font = MDKMonoFont(11.0, UIFontWeightRegular);
  preview.textColor = MDKSecondaryTextColor();
  preview.numberOfLines = 2;
  preview.lineBreakMode = NSLineBreakByTruncatingTail;
  [storageTop addArrangedSubview:key];
  [storageTop addArrangedSubview:kind];
  [labels addArrangedSubview:storageTop];
  [labels addArrangedSubview:preview];
  [button addSubview:labels];
  [NSLayoutConstraint activateConstraints:@[
    [labels.topAnchor constraintEqualToAnchor:button.topAnchor constant:13.0],
    [labels.leadingAnchor constraintEqualToAnchor:button.leadingAnchor constant:13.0],
    [labels.trailingAnchor constraintEqualToAnchor:button.trailingAnchor constant:-13.0],
    [labels.bottomAnchor constraintEqualToAnchor:button.bottomAnchor constant:-13.0],
    [button.heightAnchor constraintGreaterThanOrEqualToConstant:74.0],
  ]];
  return button;
}

- (UIView *)storageDetailCard:(NSDictionary *)entry {
  UIStackView *card = [self cardWithColor:MDKBackgroundColor() radius:14.0];
  UIStackView *header = [[UIStackView alloc] init];
  header.axis = UILayoutConstraintAxisHorizontal;
  header.alignment = UIStackViewAlignmentCenter;
  header.spacing = 10.0;
  UIStackView *headingBlock = [[UIStackView alloc] init];
  headingBlock.axis = UILayoutConstraintAxisVertical;
  headingBlock.spacing = 3.0;
  UILabel *heading = [self labelWithText:MDKText(@"Entry details", @"条目详情")];
  heading.font = [UIFont boldSystemFontOfSize:17.0];
  UILabel *key = [self labelWithText:entry[@"key"]];
  key.font = MDKMonoFont(10.0, UIFontWeightRegular);
  key.textColor = MDKMutedTextColor();
  [headingBlock addArrangedSubview:heading];
  [headingBlock addArrangedSubview:key];
  [headingBlock setContentHuggingPriority:UILayoutPriorityDefaultLow
                                  forAxis:UILayoutConstraintAxisHorizontal];
  [header addArrangedSubview:headingBlock];
  UIButton *refresh = [self secondaryButtonWithTitle:MDKText(@"Refresh", @"刷新")];
  refresh.accessibilityLabel = MDKText(@"Refresh local state", @"刷新本地状态");
  [refresh addTarget:self
              action:@selector(refreshStorage)
    forControlEvents:UIControlEventTouchUpInside];
  [refresh setContentHuggingPriority:UILayoutPriorityRequired
                             forAxis:UILayoutConstraintAxisHorizontal];
  [refresh setContentCompressionResistancePriority:UILayoutPriorityRequired
                                            forAxis:UILayoutConstraintAxisHorizontal];
  [header addArrangedSubview:refresh];
  [card addArrangedSubview:header];
  BOOL canMutate = [entry[@"canMutate"] boolValue];
  UILabel *description = [self labelWithText:canMutate
                                                 ? MDKStorageEditableText()
                                                 : MDKStorageReadOnlyText()];
  description.font = [UIFont systemFontOfSize:12.0];
  description.textColor = MDKSecondaryTextColor();
  [card addArrangedSubview:description];
  [self addStorageValueRowsForEntry:entry toStack:card];
  if (canMutate) {
    _storageEditor = [[UITextView alloc] init];
    _storageEditor.backgroundColor = MDKCardColor();
    _storageEditor.layer.cornerRadius = 9.0;
    _storageEditor.layer.borderWidth = 1.0;
    _storageEditor.layer.borderColor = MDKBorderColor().CGColor;
    _storageEditor.textColor = MDKTextColor();
    _storageEditor.tintColor = MDKAccentColor();
    _storageEditor.font = MDKMonoFont(12.0, UIFontWeightRegular);
    _storageEditor.textContainerInset = UIEdgeInsetsMake(10.0, 9.0, 10.0, 9.0);
    _storageEditor.autocapitalizationType = UITextAutocapitalizationTypeNone;
    _storageEditor.autocorrectionType = UITextAutocorrectionTypeNo;
    _storageEditor.smartQuotesType = UITextSmartQuotesTypeNo;
    _storageEditor.smartDashesType = UITextSmartDashesTypeNo;
    _storageEditor.text = entry[@"value"] ?: @"";
    _storageEditor.accessibilityLabel = MDKText(@"Stored value editor",
                                                @"本地值编辑器");
    if ([entry[@"kind"] isEqualToString:@"number"]) {
      _storageEditor.keyboardType = UIKeyboardTypeNumbersAndPunctuation;
    }
    [_storageEditor.heightAnchor constraintGreaterThanOrEqualToConstant:132.0].active = YES;
    [card addArrangedSubview:_storageEditor];

    UIStackView *actions = [[UIStackView alloc] init];
    actions.axis = UILayoutConstraintAxisHorizontal;
    actions.distribution = UIStackViewDistributionFillEqually;
    actions.spacing = 8.0;
    UIButton *save = [self primaryButtonWithTitle:MDKText(@"Save value", @"保存值")];
    [save addTarget:self
                  action:@selector(saveStorageEntry)
        forControlEvents:UIControlEventTouchUpInside];
    UIButton *remove = [self secondaryButtonWithTitle:MDKText(@"Delete key", @"删除 key")];
    [remove setTitleColor:MDKDangerColor() forState:UIControlStateNormal];
    [remove addTarget:self
                   action:@selector(confirmDeleteStorageEntry)
         forControlEvents:UIControlEventTouchUpInside];
    [actions addArrangedSubview:save];
    [actions addArrangedSubview:remove];
    [card addArrangedSubview:actions];
  }
  return card;
}

- (NSString *)storageKindForValue:(NSString *)rawValue {
  id value = MDKParseJSONValue(rawValue);
  if ([value isKindOfClass:NSDictionary.class]) return @"object";
  if ([value isKindOfClass:NSArray.class]) return @"array";
  if ([value isKindOfClass:NSNumber.class]) {
    return CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()
               ? @"boolean"
               : @"number";
  }
  if (value == NSNull.null) return @"null";
  return @"string";
}

- (void)addStorageValueRowsForEntry:(NSDictionary *)entry
                            toStack:(UIStackView *)stack {
  id value = MDKParseJSONValue(entry[@"value"]);
  if ([value isKindOfClass:NSDictionary.class]) {
    NSDictionary *dictionary = value;
    NSArray *keys = [dictionary.allKeys
        sortedArrayUsingComparator:^NSComparisonResult(id left, id right) {
      return [[left description]
          localizedCaseInsensitiveCompare:[right description]];
    }];
    if (keys.count == 0) {
      [stack addArrangedSubview:[self
          emptyStateWithTitle:MDKText(@"No fields", @"暂无字段")
                         body:MDKText(@"This object is empty.", @"该对象为空。")]];
      return;
    }
    for (id key in keys) {
      [stack addArrangedSubview:[self storageValueRow:[key description]
                                                value:MDKPrettyJSONValue(dictionary[key])]];
    }
    return;
  }
  [stack addArrangedSubview:[self
      storageValueRow:MDKText(@"Value", @"值")
                 value:value == nil ? entry[@"value"] : MDKPrettyJSONValue(value)]];
}

- (UIView *)storageValueRow:(NSString *)name value:(NSString *)value {
  UIStackView *row = [[UIStackView alloc] init];
  row.axis = UILayoutConstraintAxisVertical;
  row.spacing = 4.0;
  row.layoutMargins = UIEdgeInsetsMake(7.0, 0.0, 7.0, 0.0);
  row.layoutMarginsRelativeArrangement = YES;
  UILabel *nameLabel = [self labelWithText:name];
  nameLabel.font = MDKMonoFont(12.0, UIFontWeightBold);
  UITextView *valueView = [self selectableTextWithText:value];
  valueView.font = MDKMonoFont(11.0, UIFontWeightRegular);
  valueView.textColor = MDKSecondaryTextColor();
  valueView.accessibilityLabel = [NSString stringWithFormat:@"%@: %@", name,
                                                            value ?: @""];
  [row addArrangedSubview:nameLabel];
  [row addArrangedSubview:valueView];
  [row addArrangedSubview:[self divider]];
  return row;
}

- (void)refreshStorage {
  _storageEntries = MDKStorageEntries();
  BOOL selectionExists = NO;
  for (NSDictionary *entry in _storageEntries) {
    if ([entry[@"key"] isEqualToString:_selectedStorageKey]) {
      selectionExists = YES;
      break;
    }
  }
  if (!selectionExists) {
    _selectedStorageKey = nil;
  }
  [self filterStorageEntries];
}

- (NSDictionary<NSString *, NSString *> *)selectedStorageEntry {
  for (NSDictionary<NSString *, NSString *> *entry in _storageEntries) {
    if ([entry[@"key"] isEqualToString:_selectedStorageKey]) {
      return entry;
    }
  }
  return nil;
}

- (void)saveStorageEntry {
  NSDictionary<NSString *, NSString *> *entry = [self selectedStorageEntry];
  if (entry != nil && MDKWriteStorageEntry(entry, _storageEditor.text ?: @"")) {
    [self.view endEditing:YES];
    [self refreshStorage];
    return;
  }
  [self showStorageError:MDKText(
      @"Save failed. Enter a value matching the original type.",
      @"保存失败，请输入与原类型一致的值。")];
}

- (void)confirmDeleteStorageEntry {
  NSDictionary<NSString *, NSString *> *entry = [self selectedStorageEntry];
  if (entry == nil) {
    return;
  }
  NSString *message = [NSString
      stringWithFormat:MDKText(
                           @"This permanently removes %@ from this device. The app may recreate it.",
                           @"将从当前设备永久删除 %@；应用后续可能重新创建它。"),
                       entry[@"key"]];
  UIAlertController *alert = [UIAlertController
      alertControllerWithTitle:MDKText(@"Delete this local key?",
                                       @"删除这个本地 key？")
                    message:message
             preferredStyle:UIAlertControllerStyleAlert];
  [alert addAction:[UIAlertAction actionWithTitle:MDKText(@"Cancel", @"取消")
                                            style:UIAlertActionStyleCancel
                                          handler:nil]];
  __weak MDKNativeDiagnosticsContentController *weakSelf = self;
  [alert addAction:[UIAlertAction
                       actionWithTitle:MDKText(@"Delete key", @"删除 key")
                                 style:UIAlertActionStyleDestructive
                               handler:^(__unused UIAlertAction *action) {
    MDKNativeDiagnosticsContentController *strongSelf = weakSelf;
    if (strongSelf == nil) {
      return;
    }
    if (MDKRemoveStorageEntry(entry)) {
      strongSelf->_selectedStorageKey = nil;
      [strongSelf.view endEditing:YES];
      [strongSelf refreshStorage];
    } else {
      [strongSelf showStorageError:MDKText(@"Delete failed.", @"删除失败。")];
    }
  }]];
  [self presentViewController:alert animated:YES completion:nil];
}

- (void)showStorageError:(NSString *)message {
  UIAlertController *alert = [UIAlertController
      alertControllerWithTitle:MDKText(@"Local State", @"本地状态")
                    message:message
             preferredStyle:UIAlertControllerStyleAlert];
  [alert addAction:[UIAlertAction actionWithTitle:MDKText(@"OK", @"确定")
                                            style:UIAlertActionStyleDefault
                                          handler:nil]];
  [self presentViewController:alert animated:YES completion:nil];
}

#pragma mark - Network

- (void)renderNetwork {
  _selectedNetworkModel = nil;
  UIStackView *metrics = [self cardWithColor:MDKBackgroundColor() radius:8.0];
  metrics.axis = UILayoutConstraintAxisHorizontal;
  metrics.distribution = UIStackViewDistributionFillEqually;
  metrics.alignment = UIStackViewAlignmentCenter;
  _networkRequestMetric = [self metricWithLabel:MDKText(@"Requests", @"请求")
                                                 color:MDKTextColor()];
  _networkErrorMetric = [self metricWithLabel:MDKText(@"Errors", @"错误")
                                               color:MDKDangerColor()];
  _networkReceivedMetric = [self metricWithLabel:MDKText(@"Received", @"已接收")
                                                  color:MDKTextColor()];
  [metrics addArrangedSubview:_networkRequestMetric.superview];
  [metrics addArrangedSubview:_networkErrorMetric.superview];
  [metrics addArrangedSubview:_networkReceivedMetric.superview];

  UIStackView *capture = [[UIStackView alloc] init];
  capture.axis = UILayoutConstraintAxisVertical;
  capture.alignment = UIStackViewAlignmentCenter;
  capture.spacing = 2.0;
  _networkCaptureSwitch = [[UISwitch alloc] init];
  _networkCaptureSwitch.onTintColor = MDKAccentColor();
  _networkCaptureSwitch.on = [[DoraemonCacheManager sharedInstance] netFlowSwitch];
  _networkCaptureSwitch.accessibilityLabel = MDKText(@"Capture", @"抓包");
  [_networkCaptureSwitch addTarget:self
                            action:@selector(toggleNetworkCapture:)
                  forControlEvents:UIControlEventValueChanged];
  UILabel *captureLabel = [self labelWithText:MDKText(@"Capture", @"抓包")];
  captureLabel.font = [UIFont boldSystemFontOfSize:10.0];
  captureLabel.textColor = MDKMutedTextColor();
  [capture addArrangedSubview:_networkCaptureSwitch];
  [capture addArrangedSubview:captureLabel];
  [metrics addArrangedSubview:capture];
  [metrics.heightAnchor constraintGreaterThanOrEqualToConstant:70.0].active = YES;
  [_content addArrangedSubview:metrics];

  UIStackView *actions = [[UIStackView alloc] init];
  actions.axis = UILayoutConstraintAxisHorizontal;
  actions.distribution = UIStackViewDistributionFillEqually;
  actions.spacing = 8.0;
  UIButton *refresh = [self secondaryButtonWithTitle:MDKText(@"Refresh", @"刷新")];
  refresh.accessibilityLabel = MDKText(@"Refresh network requests", @"刷新网络请求");
  [refresh addTarget:self
              action:@selector(refreshNetwork)
    forControlEvents:UIControlEventTouchUpInside];
  UIButton *clear = [self secondaryButtonWithTitle:MDKText(@"Clear requests", @"清空请求")];
  [clear setTitleColor:MDKDangerColor() forState:UIControlStateNormal];
  clear.accessibilityLabel = MDKText(@"Clear network requests", @"清空网络请求");
  [clear addTarget:self
            action:@selector(confirmClearNetwork)
  forControlEvents:UIControlEventTouchUpInside];
  [actions addArrangedSubview:refresh];
  [actions addArrangedSubview:clear];
  [_content addArrangedSubview:actions];

  _networkSearchField = [self searchFieldWithPlaceholder:
      MDKText(@"Search host, path, method, or status",
              @"搜索域名、路径、方法或状态码")];
  _networkSearchField.accessibilityLabel = _networkSearchField.placeholder;
  [_networkSearchField addTarget:self
                          action:@selector(filterNetworkModels)
                forControlEvents:UIControlEventEditingChanged];
  [_content addArrangedSubview:_networkSearchField];

  [_content addArrangedSubview:[self networkFilterControl]];

  _networkShowing = [self labelWithText:@""];
  _networkShowing.font = MDKMonoFont(10.0, UIFontWeightRegular);
  _networkShowing.textColor = MDKMutedTextColor();
  [_content addArrangedSubview:_networkShowing];

  _networkResults = [[UIStackView alloc] init];
  _networkResults.axis = UILayoutConstraintAxisVertical;
  _networkResults.spacing = 8.0;
  [_content addArrangedSubview:_networkResults];
  [self refreshNetwork];
}

- (UIView *)networkFilterControl {
  NSArray<NSString *> *filters = @[ @"all", @"fetch", @"image", @"media", @"other", @"errors" ];
  NSArray<NSString *> *labels = @[
    MDKText(@"All", @"全部"), MDKText(@"Fetch", @"接口"),
    MDKText(@"Image", @"图片"), MDKText(@"Media", @"媒体"),
    MDKText(@"Other", @"其他"), MDKText(@"Errors", @"错误")
  ];
  UIScrollView *scroll = [[UIScrollView alloc] init];
  scroll.translatesAutoresizingMaskIntoConstraints = NO;
  scroll.showsHorizontalScrollIndicator = NO;
  scroll.backgroundColor = MDKBackgroundColor();
  scroll.layer.cornerRadius = 7.0;
  [scroll.heightAnchor constraintEqualToConstant:42.0].active = YES;

  UIStackView *row = [[UIStackView alloc] init];
  row.translatesAutoresizingMaskIntoConstraints = NO;
  row.axis = UILayoutConstraintAxisHorizontal;
  row.spacing = 2.0;
  row.layoutMargins = UIEdgeInsetsMake(3.0, 3.0, 3.0, 3.0);
  row.layoutMarginsRelativeArrangement = YES;
  [scroll addSubview:row];
  [NSLayoutConstraint activateConstraints:@[
    [row.topAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.topAnchor],
    [row.leadingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.leadingAnchor],
    [row.trailingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.trailingAnchor],
    [row.bottomAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.bottomAnchor],
    [row.heightAnchor constraintEqualToAnchor:scroll.frameLayoutGuide.heightAnchor],
  ]];

  NSMutableArray *buttons = [NSMutableArray array];
  for (NSUInteger index = 0; index < filters.count; index++) {
    UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
    button.tag = index;
    button.accessibilityLabel = labels[index];
    [button setTitle:labels[index] forState:UIControlStateNormal];
    [button setTitleColor:MDKMutedTextColor() forState:UIControlStateNormal];
    button.titleLabel.font = [UIFont boldSystemFontOfSize:12.0];
    button.layer.cornerRadius = 5.0;
    button.contentEdgeInsets = UIEdgeInsetsMake(0.0, 12.0, 0.0, 12.0);
    [button addTarget:self
                  action:@selector(selectNetworkFilter:)
        forControlEvents:UIControlEventTouchUpInside];
    [row addArrangedSubview:button];
    [buttons addObject:button];
  }
  _networkFilterButtons = buttons;
  [self updateNetworkFilterStyles];
  return scroll;
}

- (UILabel *)metricWithLabel:(NSString *)label color:(UIColor *)color {
  UIStackView *container = [[UIStackView alloc] init];
  container.axis = UILayoutConstraintAxisVertical;
  container.alignment = UIStackViewAlignmentCenter;
  container.spacing = 3.0;
  UILabel *value = [self labelWithText:@"0"];
  value.font = MDKMonoFont(15.0, UIFontWeightBold);
  value.textColor = color;
  UILabel *caption = [self labelWithText:label];
  caption.font = [UIFont boldSystemFontOfSize:10.0];
  caption.textColor = MDKMutedTextColor();
  [container addArrangedSubview:value];
  [container addArrangedSubview:caption];
  return value;
}

- (void)scheduleNetworkRefresh {
  [_networkRefreshTimer invalidate];
  _networkRefreshTimer = nil;
  if (_destination != MDKDiagnosticsDestinationNetwork ||
      _selectedNetworkModel != nil || self.view.window == nil) {
    return;
  }
  _networkRefreshTimer = [NSTimer scheduledTimerWithTimeInterval:1.0
                                                          target:self
                                                        selector:@selector(refreshNetwork)
                                                        userInfo:nil
                                                         repeats:YES];
}

- (void)toggleNetworkCapture:(UISwitch *)sender {
  [[DoraemonCacheManager sharedInstance] saveNetFlowSwitch:sender.on];
  [[DoraemonNetFlowManager shareInstance] canInterceptNetFlow:sender.on];
  [self refreshNetwork];
}

- (void)confirmClearNetwork {
  UIAlertController *alert = [UIAlertController
      alertControllerWithTitle:MDKText(@"Clear captured requests?",
                                       @"清空已捕获的请求？")
                   message:MDKText(@"This removes the current in-memory request list.",
                                   @"将删除当前保存在内存中的请求列表。")
            preferredStyle:UIAlertControllerStyleAlert];
  [alert addAction:[UIAlertAction actionWithTitle:MDKText(@"Cancel", @"取消")
                                           style:UIAlertActionStyleCancel
                                         handler:nil]];
  __weak MDKNativeDiagnosticsContentController *weakSelf = self;
  [alert addAction:[UIAlertAction
                       actionWithTitle:MDKText(@"Clear requests", @"清空请求")
                                 style:UIAlertActionStyleDestructive
                               handler:^(__unused UIAlertAction *action) {
    [[DoraemonNetFlowDataSource shareInstance] clear];
    [weakSelf refreshNetwork];
  }]];
  [self presentViewController:alert animated:YES completion:nil];
}

- (void)selectNetworkFilter:(UIButton *)sender {
  NSArray<NSString *> *filters = @[ @"all", @"fetch", @"image", @"media", @"other", @"errors" ];
  if (sender.tag >= filters.count) {
    return;
  }
  _networkFilter = filters[sender.tag];
  [self updateNetworkFilterStyles];
  [self filterNetworkModels];
}

- (void)updateNetworkFilterStyles {
  NSArray<NSString *> *filters = @[ @"all", @"fetch", @"image", @"media", @"other", @"errors" ];
  [_networkFilterButtons enumerateObjectsUsingBlock:^(
                             UIButton *button, NSUInteger index,
                             __unused BOOL *stop) {
    BOOL selected = [filters[index] isEqualToString:self->_networkFilter];
    button.backgroundColor = selected ? MDKActiveCardColor() : UIColor.clearColor;
    [button setTitleColor:selected ? MDKTextColor() : MDKMutedTextColor()
                 forState:UIControlStateNormal];
    button.accessibilityTraits = selected
                                     ? UIAccessibilityTraitButton |
                                           UIAccessibilityTraitSelected
                                     : UIAccessibilityTraitButton;
  }];
}

- (void)refreshNetwork {
  if (_selectedNetworkModel != nil) {
    return;
  }
  NSArray *snapshot = [[DoraemonNetFlowDataSource shareInstance].httpModelArray copy];
  _networkAllModels = [[snapshot reverseObjectEnumerator] allObjects];
  [self filterNetworkModels];
}

- (void)filterNetworkModels {
  NSString *needle = [_networkSearchField.text
      stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet]
                         .lowercaseString;
  NSMutableArray *filtered = [NSMutableArray array];
  for (DoraemonNetFlowHttpModel *model in _networkAllModels) {
    BOOL matchesFilter = [_networkFilter isEqualToString:@"all"] ||
                         ([_networkFilter isEqualToString:@"errors"]
                              ? MDKNetworkIsError(model)
                              : [MDKNetworkResourceType(model)
                                    isEqualToString:_networkFilter]);
    NSString *haystack = [NSString
        stringWithFormat:@"%@ %@ %@ %@", MDKNetworkURL(model),
                         MDKNetworkMethod(model), MDKNetworkStatus(model),
                         model.mineType ?: @""]
                             .lowercaseString;
    if (matchesFilter &&
        (needle.length == 0 || [haystack containsString:needle])) {
      [filtered addObject:model];
    }
  }
  _networkModels = filtered;
  [self renderNetworkResults];
}

- (void)renderNetworkResults {
  if (_networkResults == nil) {
    return;
  }
  NSUInteger errors = 0;
  double received = 0.0;
  for (DoraemonNetFlowHttpModel *model in _networkAllModels) {
    if (MDKNetworkIsError(model)) {
      errors += 1;
    }
    received += model.downFlow.doubleValue;
  }
  _networkRequestMetric.text = [NSString stringWithFormat:@"%lu",
                                                          (unsigned long)_networkAllModels.count];
  _networkErrorMetric.text = [NSString stringWithFormat:@"%lu", (unsigned long)errors];
  _networkReceivedMetric.text = MDKFormatBytes(received);
  _networkShowing.text = [NSString
      stringWithFormat:MDKText(@"Showing %lu of %lu", @"显示 %lu/%lu 条"),
                       (unsigned long)_networkModels.count,
                       (unsigned long)_networkAllModels.count];
  [self clearStack:_networkResults];
  if (_networkModels.count == 0) {
    [_networkResults addArrangedSubview:[self
        emptyStateWithTitle:MDKText(@"No captured requests", @"暂无已捕获请求")
                       body:MDKText(
                                @"Use the app, then return here to inspect requests.",
                                @"请先操作应用，再返回这里查看请求。")]];
    return;
  }
  [_networkModels enumerateObjectsUsingBlock:^(
                      DoraemonNetFlowHttpModel *model, NSUInteger index,
                      __unused BOOL *stop) {
    UIButton *row = [self networkRequestButton:model];
    row.tag = index;
    [row addTarget:self
                  action:@selector(showNetworkDetail:)
        forControlEvents:UIControlEventTouchUpInside];
    [self->_networkResults addArrangedSubview:row];
  }];
}

- (UIButton *)networkRequestButton:(DoraemonNetFlowHttpModel *)model {
  UIButton *button = [UIButton buttonWithType:UIButtonTypeCustom];
  button.backgroundColor = MDKCardColor();
  button.layer.cornerRadius = 8.0;
  button.layer.borderWidth = 1.0;
  button.layer.borderColor = MDKBorderColor().CGColor;
  button.accessibilityLabel = [NSString
      stringWithFormat:@"%@, %@, %@", MDKNetworkMethod(model),
                       MDKNetworkStatus(model), MDKNetworkURL(model)];

  UIStackView *content = [[UIStackView alloc] init];
  content.translatesAutoresizingMaskIntoConstraints = NO;
  content.axis = UILayoutConstraintAxisVertical;
  content.spacing = 7.0;
  content.userInteractionEnabled = NO;
  UIStackView *top = [[UIStackView alloc] init];
  top.axis = UILayoutConstraintAxisHorizontal;
  top.alignment = UIStackViewAlignmentCenter;
  top.spacing = 8.0;
  UILabel *method = [self badgeWithText:MDKNetworkMethod(model)
                                  color:[self methodColor:MDKNetworkMethod(model)]];
  UILabel *status = [self labelWithText:MDKNetworkStatus(model)];
  status.font = MDKMonoFont(12.0, UIFontWeightBold);
  status.textColor = [self statusColor:model.statusCode.integerValue];
  NSURLComponents *components =
      [NSURLComponents componentsWithString:MDKNetworkURL(model)];
  UILabel *host = [self labelWithText:components.host ?: @""];
  host.font = [UIFont systemFontOfSize:11.0];
  host.textColor = MDKMutedTextColor();
  host.textAlignment = NSTextAlignmentRight;
  host.numberOfLines = 1;
  host.lineBreakMode = NSLineBreakByTruncatingTail;
  [host setContentCompressionResistancePriority:UILayoutPriorityDefaultLow
                                        forAxis:UILayoutConstraintAxisHorizontal];
  [top addArrangedSubview:method];
  [top addArrangedSubview:status];
  [top addArrangedSubview:host];
  [content addArrangedSubview:top];

  NSString *path = components.percentEncodedPath.length > 0
                       ? components.percentEncodedPath
                       : @"/";
  if (components.percentEncodedQuery.length > 0) {
    path = [path stringByAppendingFormat:@"?%@", components.percentEncodedQuery];
  }
  UILabel *pathLabel = [self labelWithText:path];
  pathLabel.font = MDKMonoFont(13.0, UIFontWeightSemibold);
  pathLabel.numberOfLines = 2;
  pathLabel.lineBreakMode = NSLineBreakByTruncatingTail;
  [content addArrangedSubview:pathLabel];
  UILabel *metadata = [self
      labelWithText:[NSString stringWithFormat:MDKText(@"%@ / %@ received",
                                                       @"%@ / 已接收 %@"),
                                                 MDKFormatDuration(model),
                                                 MDKFormatBytes(model.downFlow.doubleValue)]];
  metadata.font = MDKMonoFont(10.0, UIFontWeightRegular);
  metadata.textColor = MDKMutedTextColor();
  [content addArrangedSubview:metadata];
  [button addSubview:content];
  [NSLayoutConstraint activateConstraints:@[
    [content.topAnchor constraintEqualToAnchor:button.topAnchor constant:12.0],
    [content.leadingAnchor constraintEqualToAnchor:button.leadingAnchor constant:12.0],
    [content.trailingAnchor constraintEqualToAnchor:button.trailingAnchor constant:-12.0],
    [content.bottomAnchor constraintEqualToAnchor:button.bottomAnchor constant:-12.0],
    [button.heightAnchor constraintGreaterThanOrEqualToConstant:82.0],
  ]];
  return button;
}

- (void)showNetworkDetail:(UIButton *)sender {
  if (sender.tag >= _networkModels.count) {
    return;
  }
  _selectedNetworkModel = _networkModels[sender.tag];
  [_networkRefreshTimer invalidate];
  _networkRefreshTimer = nil;
  [self renderNetworkDetailForModel:_selectedNetworkModel responseTab:NO];
}

- (void)renderNetworkDetailForModel:(DoraemonNetFlowHttpModel *)model
                        responseTab:(BOOL)responseTab {
  _networkResponseTab = responseTab;
  [self setNetworkDetailHeaderVisible:YES];
  [self clearStack:_content];

  UIStackView *summary = [self cardWithColor:MDKBackgroundColor() radius:8.0];
  UIStackView *top = [[UIStackView alloc] init];
  top.axis = UILayoutConstraintAxisHorizontal;
  top.alignment = UIStackViewAlignmentCenter;
  top.spacing = 8.0;
  [top addArrangedSubview:[self badgeWithText:MDKNetworkMethod(model)
                                       color:[self methodColor:MDKNetworkMethod(model)]]];
  UILabel *status = [self labelWithText:MDKNetworkStatus(model)];
  status.font = MDKMonoFont(12.0, UIFontWeightBold);
  status.textColor = [self statusColor:model.statusCode.integerValue];
  [top addArrangedSubview:status];
  UIView *spacer = [[UIView alloc] init];
  [spacer setContentHuggingPriority:UILayoutPriorityDefaultLow
                            forAxis:UILayoutConstraintAxisHorizontal];
  [top addArrangedSubview:spacer];
  UIButton *curl = [self secondaryButtonWithTitle:MDKText(@"Copy cURL", @"复制 cURL")];
  curl.accessibilityLabel = curl.currentTitle;
  [curl addTarget:self action:@selector(copyCurl:)
  forControlEvents:UIControlEventTouchUpInside];
  [top addArrangedSubview:curl];
  [summary addArrangedSubview:top];
  UITextView *url = [self selectableTextWithText:MDKNetworkURL(model)];
  url.font = MDKMonoFont(11.0, UIFontWeightRegular);
  url.textColor = MDKSecondaryTextColor();
  [summary addArrangedSubview:url];
  [_content addArrangedSubview:summary];

  UISegmentedControl *tabs = [[UISegmentedControl alloc]
      initWithItems:@[ MDKText(@"Request", @"请求"),
                       MDKText(@"Response", @"响应") ]];
  tabs.selectedSegmentIndex = responseTab ? 1 : 0;
  tabs.selectedSegmentTintColor = MDKActiveCardColor();
  tabs.backgroundColor = MDKBackgroundColor();
  [tabs setTitleTextAttributes:@{ NSForegroundColorAttributeName : MDKMutedTextColor() }
                      forState:UIControlStateNormal];
  [tabs setTitleTextAttributes:@{ NSForegroundColorAttributeName : MDKTextColor() }
                      forState:UIControlStateSelected];
  tabs.accessibilityLabel = MDKText(@"Request or response details",
                                    @"请求或响应详情");
  [tabs addTarget:self
           action:@selector(selectNetworkDetailTab:)
 forControlEvents:UIControlEventValueChanged];
  [tabs.heightAnchor constraintEqualToConstant:40.0].active = YES;
  [_content addArrangedSubview:tabs];

  if (responseTab) {
    [self addResponseSections:model];
  } else {
    [self addRequestSections:model];
  }
  [_scrollView setContentOffset:CGPointZero animated:NO];
}

- (UIView *)renderNetworkDetailHeader {
  UIStackView *container = [[UIStackView alloc] init];
  container.axis = UILayoutConstraintAxisVertical;
  container.spacing = 0.0;
  container.backgroundColor = MDKSurfaceColor();

  UIStackView *row = [[UIStackView alloc] init];
  row.axis = UILayoutConstraintAxisHorizontal;
  row.alignment = UIStackViewAlignmentCenter;
  row.spacing = 8.0;
  row.layoutMargins = UIEdgeInsetsMake(4.0, 16.0, 4.0, 16.0);
  row.layoutMarginsRelativeArrangement = YES;
  [row.heightAnchor constraintGreaterThanOrEqualToConstant:52.0].active = YES;

  UIButton *back = [UIButton buttonWithType:UIButtonTypeSystem];
  [back setTitle:@"‹" forState:UIControlStateNormal];
  [back setTitleColor:MDKSecondaryTextColor() forState:UIControlStateNormal];
  back.titleLabel.font = [UIFont systemFontOfSize:28.0 weight:UIFontWeightMedium];
  back.backgroundColor = MDKCardColor();
  back.layer.cornerRadius = 22.0;
  back.accessibilityLabel = MDKText(@"Back to network requests", @"返回请求列表");
  [back addTarget:self
           action:@selector(backToNetworkList)
 forControlEvents:UIControlEventTouchUpInside];
  [back.widthAnchor constraintEqualToConstant:44.0].active = YES;
  [back.heightAnchor constraintEqualToConstant:44.0].active = YES;
  [back setContentHuggingPriority:UILayoutPriorityRequired
                          forAxis:UILayoutConstraintAxisHorizontal];
  [back setContentCompressionResistancePriority:UILayoutPriorityRequired
                                         forAxis:UILayoutConstraintAxisHorizontal];
  [row addArrangedSubview:back];

  UILabel *title = [self labelWithText:MDKText(@"Request details", @"请求详情")];
  title.font = [UIFont boldSystemFontOfSize:16.0];
  title.numberOfLines = 1;
  title.lineBreakMode = NSLineBreakByTruncatingTail;
  [title setContentHuggingPriority:UILayoutPriorityDefaultLow
                           forAxis:UILayoutConstraintAxisHorizontal];
  [row addArrangedSubview:title];
  [container addArrangedSubview:row];
  [container addArrangedSubview:[self divider]];
  return container;
}

- (void)setNetworkDetailHeaderVisible:(BOOL)visible {
  _networkDetailHeader.hidden = !visible;
}

- (void)backToNetworkList {
  _selectedNetworkModel = nil;
  [self renderDestination];
  [self scheduleNetworkRefresh];
}

- (void)selectNetworkDetailTab:(UISegmentedControl *)sender {
  [self renderNetworkDetailForModel:_selectedNetworkModel
                        responseTab:sender.selectedSegmentIndex == 1];
}

- (void)addRequestSections:(DoraemonNetFlowHttpModel *)model {
  [self addDetailSection:MDKText(@"General", @"概览")
                    rows:@[
                      @[ MDKText(@"Request URL", @"请求地址"), MDKNetworkURL(model) ],
                      @[ MDKText(@"Method", @"方法"), MDKNetworkMethod(model) ],
                      @[ MDKText(@"Started", @"开始时间"), MDKFormatStartTime(model.startTime) ],
                      @[ MDKText(@"Duration", @"耗时"), MDKFormatDuration(model) ],
                      @[ MDKText(@"Transferred", @"传输大小"),
                         [NSString stringWithFormat:MDKText(@"up %@ / down %@",
                                                           @"上传 %@ / 下载 %@"),
                                                    MDKFormatBytes(model.uploadFlow.doubleValue),
                                                    MDKFormatBytes(model.downFlow.doubleValue)] ],
                    ]
       initiallyExpanded:YES];
  [self addHeadersSection:MDKText(@"Request headers", @"请求头")
                  headers:model.request.allHTTPHeaderFields ?: @{}];
  [self addBodySection:MDKText(@"Payload", @"请求参数")
                   body:model.requestBody ?: @""
                 binary:NO
              byteCount:model.uploadFlow.doubleValue];
}

- (void)addResponseSections:(DoraemonNetFlowHttpModel *)model {
  [self addDetailSection:MDKText(@"General", @"概览")
                    rows:@[
                      @[ MDKText(@"Status", @"状态码"), MDKNetworkStatus(model) ],
                      @[ MDKText(@"Content type", @"内容类型"), model.mineType ?: @"—" ],
                      @[ MDKText(@"Duration", @"耗时"), MDKFormatDuration(model) ],
                      @[ MDKText(@"Received", @"接收大小"),
                         MDKFormatBytes(model.downFlow.doubleValue) ],
                    ]
       initiallyExpanded:YES];
  [self addHeadersSection:MDKText(@"Response headers", @"响应头")
                  headers:MDKNetworkResponseHeaders(model)];
  if ([MDKNetworkResourceType(model) isEqualToString:@"image"]) {
    [self addImageBodySection:MDKText(@"Response body", @"响应体")
                         data:model.responseData
                    byteCount:model.downFlow.doubleValue];
    return;
  }
  BOOL binary = model.responseBody.length == 0 && model.responseData.length > 0 &&
                !MDKNetworkIsTextMIMEType(model.mineType);
  [self addBodySection:MDKText(@"Response body", @"响应体")
                   body:model.responseBody ?: @""
                 binary:binary
              byteCount:model.downFlow.doubleValue];
}

- (void)addImageBodySection:(NSString *)title
                       data:(NSData *)data
                  byteCount:(double)byteCount {
  UIStackView *content = [[UIStackView alloc] init];
  content.axis = UILayoutConstraintAxisVertical;
  content.spacing = 8.0;
  content.layoutMargins = UIEdgeInsetsMake(10.0, 10.0, 10.0, 10.0);
  content.layoutMarginsRelativeArrangement = YES;

  UIImage *image = MDKImagePreviewFromData(data);
  UILabel *status = [self labelWithText:@""];
  status.font = MDKMonoFont(11.0, UIFontWeightRegular);
  status.textColor = MDKMutedTextColor();
  status.textAlignment = NSTextAlignmentCenter;
  status.numberOfLines = 0;
  if (image != nil) {
    UIImageView *preview = [[UIImageView alloc] initWithImage:image];
    preview.contentMode = UIViewContentModeScaleAspectFit;
    preview.clipsToBounds = YES;
    preview.backgroundColor = MDKCardColor();
    preview.layer.cornerRadius = 6.0;
    preview.isAccessibilityElement = YES;
    preview.accessibilityLabel = MDKText(@"Image response preview", @"图片响应预览");
    CGFloat availableWidth = MAX(UIScreen.mainScreen.bounds.size.width - 40.0, 240.0);
    CGFloat aspectHeight = image.size.width > 0.0
                               ? availableWidth * image.size.height / image.size.width
                               : 240.0;
    [preview.heightAnchor
        constraintEqualToConstant:MIN(MAX(aspectHeight, 120.0), 360.0)]
        .active = YES;
    [content addArrangedSubview:preview];
    status.text = [NSString
        stringWithFormat:MDKText(@"Captured response · %.0f × %.0f · %@",
                                 @"已捕获响应 · %.0f × %.0f · %@"),
                         image.size.width, image.size.height,
                         MDKFormatBytes(byteCount > 0.0 ? byteCount : data.length)];
  } else if (data.length > MDKMaxImagePreviewBytes) {
    status.text = [NSString
        stringWithFormat:MDKText(@"Image preview skipped · %@ exceeds the on-device limit",
                                 @"已跳过图片预览 · %@ 超出本机预览上限"),
                         MDKFormatBytes(data.length)];
  } else {
    status.text = MDKText(
        @"Image preview unavailable. The captured body is empty or uses an unsupported format.",
        @"无法预览图片；捕获到的正文为空，或图片格式暂不支持。");
  }
  [content addArrangedSubview:status];
  [_content addArrangedSubview:[self collapsibleSectionWithTitle:title
                                              initiallyExpanded:YES
                                                         content:content]];
}

- (void)addDetailSection:(NSString *)title
                    rows:(NSArray<NSArray<NSString *> *> *)rows
       initiallyExpanded:(BOOL)initiallyExpanded {
  UIStackView *rowsStack = [[UIStackView alloc] init];
  rowsStack.axis = UILayoutConstraintAxisVertical;
  rowsStack.spacing = 0.0;
  rowsStack.layoutMargins = UIEdgeInsetsMake(0.0, 12.0, 0.0, 12.0);
  rowsStack.layoutMarginsRelativeArrangement = YES;
  for (NSArray<NSString *> *row in rows) {
    UIStackView *pair = [[UIStackView alloc] init];
    pair.axis = UILayoutConstraintAxisVertical;
    pair.spacing = 4.0;
    pair.layoutMargins = UIEdgeInsetsMake(7.0, 0.0, 7.0, 0.0);
    pair.layoutMarginsRelativeArrangement = YES;
    UILabel *key = [self labelWithText:row.firstObject ?: @""];
    key.font = MDKMonoFont(10.0, UIFontWeightBold);
    key.textColor = MDKBlueColor();
    UITextView *value = [self
        selectableTextWithText:row.count > 1 ? row[1] : @""];
    value.font = MDKMonoFont(11.0, UIFontWeightRegular);
    value.textColor = MDKSecondaryTextColor();
    [pair addArrangedSubview:key];
    [pair addArrangedSubview:value];
    [pair addArrangedSubview:[self divider]];
    [rowsStack addArrangedSubview:pair];
  }
  [_content addArrangedSubview:[self collapsibleSectionWithTitle:title
                                              initiallyExpanded:initiallyExpanded
                                                         content:rowsStack]];
}

- (void)addHeadersSection:(NSString *)title headers:(NSDictionary *)headers {
  NSArray *keys = [headers.allKeys
      sortedArrayUsingComparator:^NSComparisonResult(id left, id right) {
    return [[left description] localizedCaseInsensitiveCompare:[right description]];
  }];
  NSMutableArray *rows = [NSMutableArray array];
  for (id key in keys) {
    [rows addObject:@[ [key description] ?: @"", [headers[key] description] ?: @"" ]];
  }
  if (rows.count == 0) {
    [rows addObject:@[ MDKText(@"Header", @"请求头"),
                       MDKText(@"No headers", @"暂无请求头") ]];
  }
  [self addDetailSection:title rows:rows initiallyExpanded:NO];
}

- (void)addBodySection:(NSString *)title
                   body:(NSString *)body
                 binary:(BOOL)binary
              byteCount:(double)byteCount {
  UIStackView *bodyContent = [[UIStackView alloc] init];
  bodyContent.axis = UILayoutConstraintAxisVertical;
  bodyContent.spacing = 0.0;
  UIStackView *toolbar = [[UIStackView alloc] init];
  toolbar.axis = UILayoutConstraintAxisHorizontal;
  toolbar.alignment = UIStackViewAlignmentCenter;
  toolbar.layoutMargins = UIEdgeInsetsMake(8.0, 8.0, 0.0, 8.0);
  toolbar.layoutMarginsRelativeArrangement = YES;
  UIView *spacer = [[UIView alloc] init];
  [spacer setContentHuggingPriority:UILayoutPriorityDefaultLow
                            forAxis:UILayoutConstraintAxisHorizontal];
  [toolbar addArrangedSubview:spacer];
  UIButton *copy = [self secondaryButtonWithTitle:MDKText(@"Copy body", @"复制正文")];
  copy.enabled = body.length > 0 && !binary;
  copy.alpha = copy.enabled ? 1.0 : 0.5;
  copy.accessibilityLabel = copy.currentTitle;
  [copy addTarget:self
           action:@selector(copyNetworkBody:)
 forControlEvents:UIControlEventTouchUpInside];
  [toolbar addArrangedSubview:copy];
  if (body.length > 0 && !binary) {
    [bodyContent addArrangedSubview:toolbar];
  }

  NSString *display = @"";
  if (binary) {
    display = [NSString stringWithFormat:
        MDKText(@"Binary response body · %@ · text preview unavailable",
                @"二进制响应正文 · %@ · 无法预览文本"),
        MDKFormatBytes(byteCount)];
  } else if (body.length == 0) {
    display = MDKText(@"No body", @"暂无正文");
  } else {
    display = MDKPrettyJSONString(body);
    if (display.length > 120000) {
      display = [[display substringToIndex:120000]
          stringByAppendingFormat:@"\n\n%@",
                                  MDKText(@"Preview truncated for on-device display",
                                          @"内容过长，已截断本机预览")];
    }
  }
  UITextView *value = [self selectableTextWithText:display];
  value.font = MDKMonoFont(11.0, UIFontWeightRegular);
  value.textColor = MDKSecondaryTextColor();
  value.backgroundColor = MDKCardColor();
  value.layer.cornerRadius = 6.0;
  value.layer.masksToBounds = YES;
  value.textContainerInset = UIEdgeInsetsMake(10.0, 10.0, 10.0, 10.0);
  UIStackView *valueWrapper = [[UIStackView alloc] init];
  valueWrapper.axis = UILayoutConstraintAxisVertical;
  valueWrapper.layoutMargins = UIEdgeInsetsMake(10.0, 10.0, 10.0, 10.0);
  valueWrapper.layoutMarginsRelativeArrangement = YES;
  [valueWrapper addArrangedSubview:value];
  [bodyContent addArrangedSubview:valueWrapper];
  [_content addArrangedSubview:[self collapsibleSectionWithTitle:title
                                              initiallyExpanded:YES
                                                         content:bodyContent]];
}

- (UIView *)collapsibleSectionWithTitle:(NSString *)title
                      initiallyExpanded:(BOOL)initiallyExpanded
                                 content:(UIView *)content {
  UIStackView *section = [[UIStackView alloc] init];
  section.axis = UILayoutConstraintAxisVertical;
  section.spacing = 0.0;
  section.backgroundColor = MDKBackgroundColor();
  section.layer.cornerRadius = 8.0;
  section.layer.borderWidth = 1.0;
  section.layer.borderColor = MDKBorderColor().CGColor;
  section.layer.masksToBounds = YES;

  UIButton *header = [UIButton buttonWithType:UIButtonTypeCustom];
  header.accessibilityLabel = title;
  header.accessibilityValue = initiallyExpanded
                                  ? MDKText(@"Expanded", @"已展开")
                                  : MDKText(@"Collapsed", @"已收起");
  [header addTarget:self
             action:@selector(toggleCollapsibleSection:)
   forControlEvents:UIControlEventTouchUpInside];
  [header.heightAnchor constraintGreaterThanOrEqualToConstant:44.0].active = YES;

  UIStackView *headerContent = [[UIStackView alloc] init];
  headerContent.translatesAutoresizingMaskIntoConstraints = NO;
  headerContent.axis = UILayoutConstraintAxisHorizontal;
  headerContent.alignment = UIStackViewAlignmentCenter;
  headerContent.userInteractionEnabled = NO;
  UILabel *heading = [self labelWithText:title];
  heading.font = [UIFont boldSystemFontOfSize:12.0];
  [heading setContentHuggingPriority:UILayoutPriorityDefaultLow
                            forAxis:UILayoutConstraintAxisHorizontal];
  [headerContent addArrangedSubview:heading];
  UILabel *indicator = [self labelWithText:initiallyExpanded ? @"−" : @"+"];
  indicator.tag = 9102;
  indicator.font = MDKMonoFont(16.0, UIFontWeightRegular);
  indicator.textColor = MDKMutedTextColor();
  indicator.textAlignment = NSTextAlignmentRight;
  [indicator setContentHuggingPriority:UILayoutPriorityRequired
                               forAxis:UILayoutConstraintAxisHorizontal];
  [indicator setContentCompressionResistancePriority:UILayoutPriorityRequired
                                              forAxis:UILayoutConstraintAxisHorizontal];
  [headerContent addArrangedSubview:indicator];
  [header addSubview:headerContent];
  [NSLayoutConstraint activateConstraints:@[
    [headerContent.topAnchor constraintEqualToAnchor:header.topAnchor],
    [headerContent.leadingAnchor constraintEqualToAnchor:header.leadingAnchor constant:12.0],
    [headerContent.trailingAnchor constraintEqualToAnchor:header.trailingAnchor constant:-12.0],
    [headerContent.bottomAnchor constraintEqualToAnchor:header.bottomAnchor],
  ]];
  [section addArrangedSubview:header];
  content.hidden = !initiallyExpanded;
  [section addArrangedSubview:content];
  return section;
}

- (void)toggleCollapsibleSection:(UIButton *)sender {
  UIStackView *section = (UIStackView *)sender.superview;
  if (![section isKindOfClass:UIStackView.class] ||
      section.arrangedSubviews.count < 2) {
    return;
  }
  UIView *content = section.arrangedSubviews[1];
  BOOL expanded = content.hidden;
  content.hidden = !expanded;
  UILabel *indicator = [sender viewWithTag:9102];
  indicator.text = expanded ? @"−" : @"+";
  sender.accessibilityValue = expanded ? MDKText(@"Expanded", @"已展开")
                                       : MDKText(@"Collapsed", @"已收起");
}

- (void)copyCurl:(__unused UIButton *)sender {
  if (_selectedNetworkModel == nil) {
    return;
  }
  NSMutableArray<NSString *> *parts = [NSMutableArray arrayWithObject:@"curl"];
  [parts addObject:[NSString stringWithFormat:@"-X %@", MDKNetworkMethod(_selectedNetworkModel)]];
  NSDictionary *headers = _selectedNetworkModel.request.allHTTPHeaderFields ?: @{};
  for (id key in headers) {
    NSString *header = [NSString stringWithFormat:@"%@: %@", [key description],
                                                       [headers[key] description]];
    [parts addObject:[NSString stringWithFormat:@"-H %@", [self shellQuote:header]]];
  }
  if (_selectedNetworkModel.requestBody.length > 0) {
    [parts addObject:[NSString stringWithFormat:@"--data-raw %@",
                                                [self shellQuote:_selectedNetworkModel.requestBody]]];
  }
  [parts addObject:[self shellQuote:MDKNetworkURL(_selectedNetworkModel)]];
  [self copyText:[parts componentsJoinedByString:@" \\\n  "]];
}

- (void)copyNetworkBody:(__unused UIButton *)sender {
  NSString *body = _networkResponseTab ? _selectedNetworkModel.responseBody
                                      : _selectedNetworkModel.requestBody;
  [self copyText:body ?: @""];
}

- (NSString *)shellQuote:(NSString *)value {
  return [NSString stringWithFormat:@"'%@'",
                                    [value stringByReplacingOccurrencesOfString:@"'"
                                                                     withString:@"'\\''"]];
}

- (void)copyText:(NSString *)value {
  UIPasteboard.generalPasteboard.string = value ?: @"";
  UIAlertController *notice = [UIAlertController
      alertControllerWithTitle:MDKText(@"Copied to clipboard", @"已复制到剪贴板")
                   message:nil
            preferredStyle:UIAlertControllerStyleAlert];
  [self presentViewController:notice animated:YES completion:^{
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.7 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      [notice dismissViewControllerAnimated:YES completion:nil];
    });
  }];
}

- (UILabel *)badgeWithText:(NSString *)text color:(UIColor *)color {
  UILabel *badge = [self labelWithText:text];
  badge.font = MDKMonoFont(10.0, UIFontWeightHeavy);
  badge.textAlignment = NSTextAlignmentCenter;
  badge.backgroundColor = color;
  badge.layer.cornerRadius = 5.0;
  badge.layer.masksToBounds = YES;
  [badge.widthAnchor constraintGreaterThanOrEqualToConstant:48.0].active = YES;
  [badge.heightAnchor constraintEqualToConstant:22.0].active = YES;
  return badge;
}

- (UIColor *)methodColor:(NSString *)method {
  if ([method isEqualToString:@"GET"]) return MDKColor(0x1D4ED8);
  if ([method isEqualToString:@"POST"]) return MDKColor(0x6D28D9);
  if ([method isEqualToString:@"PUT"] || [method isEqualToString:@"PATCH"]) {
    return MDKColor(0xB45309);
  }
  if ([method isEqualToString:@"DELETE"]) return MDKColor(0xB91C1C);
  return MDKColor(0x475569);
}

- (UIColor *)statusColor:(NSInteger)status {
  if (status >= 200 && status < 300) return MDKAccentColor();
  if (status >= 300 && status < 400) return MDKColor(0x38BDF8);
  if (status >= 400 && status < 500) return MDKColor(0xFBBF24);
  if (status >= 500) return MDKDangerColor();
  return MDKMutedTextColor();
}

#pragma mark - Expo update

- (void)renderExpoUpdate {
  NSDictionary *info = [MDKExpoUpdatesAdapter runtimeInfo];
  BOOL enabled = [info[@"isEnabled"] boolValue];
  NSNumber *commitTime = info[@"commitTime"];
  NSString *published = @"—";
  if ([commitTime isKindOfClass:NSNumber.class]) {
    NSDate *date = [NSDate
        dateWithTimeIntervalSince1970:commitTime.doubleValue / 1000.0];
    published = [NSDateFormatter localizedStringFromDate:date
                                               dateStyle:NSDateFormatterMediumStyle
                                               timeStyle:NSDateFormatterMediumStyle];
  }
  NSString *source = enabled
                         ? ([info[@"isEmbeddedLaunch"] boolValue]
                                ? MDKText(@"Embedded", @"内置包")
                                : MDKText(@"OTA", @"热更新"))
                         : @"—";

  UIStackView *runtime = [self cardWithColor:MDKBackgroundColor() radius:14.0];
  UILabel *runtimeTitle = [self labelWithText:MDKCurrentBundleTitle()];
  runtimeTitle.font = [UIFont boldSystemFontOfSize:16.0];
  [runtime addArrangedSubview:runtimeTitle];
  [runtime addArrangedSubview:[self runtimeRow:MDKText(@"Branch", @"分支")
                                            value:info[@"sourceBranch"] ?: @"—"]];
  [runtime addArrangedSubview:[self runtimeRow:MDKText(@"Launch source", @"来源")
                                            value:source]];
  [runtime addArrangedSubview:[self runtimeRow:MDKText(@"Update ID", @"更新 ID")
                                            value:info[@"updateId"] ?: @"—"]];
  [runtime addArrangedSubview:[self runtimeRow:MDKText(@"Published", @"发布时间")
                                            value:published]];
  [runtime addArrangedSubview:[self runtimeRow:MDKText(@"Channel", @"频道")
                                            value:info[@"channel"] ?: @"—"]];
  [runtime addArrangedSubview:[self runtimeRow:MDKText(@"Runtime", @"运行时版本")
                                            value:info[@"runtimeVersion"] ?: @"—"]];
  [_content addArrangedSubview:runtime];

  UIStackView *action = [self cardWithColor:MDKCardColor() radius:14.0];
  UILabel *title = [self labelWithText:MDKOtaActionTitle()];
  title.font = [UIFont boldSystemFontOfSize:19.0];
  [action addArrangedSubview:title];
  [title.widthAnchor constraintEqualToAnchor:action.widthAnchor constant:-26.0].active = YES;
  UILabel *description = [self labelWithText:MDKText(
      @"Uses the installed runtime and channel. It does not accept arbitrary update URLs or expose manifest details.",
      @"使用当前安装包的运行时和频道；不接受任意更新地址，也不展示更新清单详情。")];
  description.font = [UIFont systemFontOfSize:13.0];
  description.textColor = MDKSecondaryTextColor();
  [action addArrangedSubview:description];
  [description.widthAnchor constraintEqualToAnchor:action.widthAnchor constant:-26.0].active = YES;
  UIButton *apply = [self primaryButtonWithTitle:
      MDKText(@"Check and apply update", @"检查并应用更新")];
  apply.enabled = enabled;
  apply.alpha = enabled ? 1.0 : 0.58;
  apply.accessibilityLabel = apply.currentTitle;
  [apply addTarget:self
                action:@selector(checkAndApplyUpdate:)
      forControlEvents:UIControlEventTouchUpInside];
  [action addArrangedSubview:apply];
  [apply.widthAnchor constraintEqualToAnchor:action.widthAnchor constant:-26.0].active = YES;
  _otaStatus = [self labelWithText:enabled
                                       ? MDKText(@"Ready to check the current runtime and channel",
                                                 @"可以检查当前运行时和频道的更新")
                                       : MDKText(@"Unavailable in this build",
                                                 @"当前构建不可用")];
  _otaStatus.font = [UIFont systemFontOfSize:12.0];
  _otaStatus.textColor = MDKMutedTextColor();
  _otaStatus.textAlignment = NSTextAlignmentCenter;
  _otaStatus.accessibilityLabel = _otaStatus.text;
  [action addArrangedSubview:_otaStatus];
  [_otaStatus.widthAnchor constraintEqualToAnchor:action.widthAnchor constant:-26.0].active = YES;
  [_content addArrangedSubview:action];

  [_content addArrangedSubview:[self
      infoCardWithTitle:MDKText(@"Network inspection", @"网络抓包")
                   value:MDKText(
                             @"Captured by the native DoKit engine and presented locally. Request and response contents are never uploaded by this package.",
                             @"请求由原生 DoKit 引擎捕获并仅在本机展示，本工具不会上传请求或响应内容。")]];
}

- (UIView *)runtimeRow:(NSString *)label value:(NSString *)value {
  UIStackView *container = [[UIStackView alloc] init];
  container.axis = UILayoutConstraintAxisVertical;
  container.spacing = 0.0;
  [container addArrangedSubview:[self divider]];
  UIStackView *row = [[UIStackView alloc] init];
  row.axis = UILayoutConstraintAxisHorizontal;
  row.alignment = UIStackViewAlignmentTop;
  row.spacing = 12.0;
  row.layoutMargins = UIEdgeInsetsMake(9.0, 0.0, 0.0, 0.0);
  row.layoutMarginsRelativeArrangement = YES;
  UILabel *name = [self labelWithText:label];
  name.font = [UIFont systemFontOfSize:11.0];
  name.textColor = MDKMutedTextColor();
  [name.widthAnchor constraintEqualToConstant:94.0].active = YES;
  UITextView *display = [self
      selectableTextWithText:value.length > 0 ? value : @"—"];
  display.font = MDKMonoFont(11.0, UIFontWeightRegular);
  display.textColor = MDKSecondaryTextColor();
  display.textAlignment = NSTextAlignmentRight;
  [row addArrangedSubview:name];
  [row addArrangedSubview:display];
  [container addArrangedSubview:row];
  return container;
}

- (void)checkAndApplyUpdate:(UIButton *)button {
  button.enabled = NO;
  button.alpha = 0.58;
  _otaStatus.text = MDKText(@"Checking…", @"正在检查…");
  _otaStatus.accessibilityLabel = _otaStatus.text;
  [MDKExpoUpdatesAdapter checkAndApplyWithCompletion:^(NSString *result) {
    button.enabled = YES;
    button.alpha = 1.0;
    NSString *message = result;
    if ([result isEqualToString:@"up-to-date"]) {
      message = MDKText(@"Already up to date", @"已是最新版本");
    } else if ([result isEqualToString:@"unavailable"]) {
      message = MDKText(@"Unavailable in this build", @"当前构建不可用");
    } else if ([result isEqualToString:@"relaunching"]) {
      [self renderDestination];
      message = MDKText(@"Already up to date", @"已是最新版本");
    }
    self->_otaStatus.text = message;
    self->_otaStatus.accessibilityLabel = message;
  }];
}

#pragma mark - Shared UI

- (UILabel *)labelWithText:(NSString *)text {
  UILabel *label = [[UILabel alloc] init];
  label.numberOfLines = 0;
  label.textColor = MDKTextColor();
  label.font = [UIFont systemFontOfSize:15.0];
  label.text = text;
  return label;
}

- (UITextView *)selectableTextWithText:(NSString *)text {
  UITextView *view = [[UITextView alloc] init];
  view.backgroundColor = UIColor.clearColor;
  view.editable = NO;
  view.selectable = YES;
  view.scrollEnabled = NO;
  view.textContainerInset = UIEdgeInsetsZero;
  view.textContainer.lineFragmentPadding = 0.0;
  view.text = text ?: @"";
  return view;
}

- (UIView *)divider {
  UIView *divider = [[UIView alloc] init];
  divider.backgroundColor = MDKBorderColor();
  [divider.heightAnchor constraintEqualToConstant:1.0].active = YES;
  return divider;
}

- (UIStackView *)cardWithColor:(UIColor *)color radius:(CGFloat)radius {
  UIStackView *card = [[UIStackView alloc] init];
  card.axis = UILayoutConstraintAxisVertical;
  card.spacing = 8.0;
  card.layoutMargins = UIEdgeInsetsMake(13.0, 13.0, 13.0, 13.0);
  card.layoutMarginsRelativeArrangement = YES;
  card.backgroundColor = color;
  card.layer.cornerRadius = radius;
  card.layer.borderWidth = 1.0;
  card.layer.borderColor = MDKBorderColor().CGColor;
  return card;
}

- (UIView *)infoCardWithTitle:(NSString *)title value:(NSString *)value {
  UIStackView *card = [self cardWithColor:MDKAccentSurfaceColor() radius:12.0];
  card.layer.borderColor = MDKAccentBorderColor().CGColor;
  UILabel *titleLabel = [self labelWithText:title];
  titleLabel.font = [UIFont boldSystemFontOfSize:13.0];
  titleLabel.textColor = MDKAccentColor();
  [card addArrangedSubview:titleLabel];
  UILabel *valueLabel = [self labelWithText:value];
  valueLabel.font = [UIFont systemFontOfSize:12.0];
  valueLabel.textColor = MDKSecondaryTextColor();
  [card addArrangedSubview:valueLabel];
  return card;
}

- (UIView *)emptyStateWithTitle:(NSString *)title body:(NSString *)body {
  UIStackView *empty = [[UIStackView alloc] init];
  empty.axis = UILayoutConstraintAxisVertical;
  empty.alignment = UIStackViewAlignmentCenter;
  empty.spacing = 6.0;
  empty.layoutMargins = UIEdgeInsetsMake(38.0, 18.0, 38.0, 18.0);
  empty.layoutMarginsRelativeArrangement = YES;
  empty.accessibilityLabel = [NSString stringWithFormat:@"%@. %@", title, body];
  UILabel *heading = [self labelWithText:title];
  heading.font = [UIFont boldSystemFontOfSize:15.0];
  heading.textColor = MDKSecondaryTextColor();
  heading.textAlignment = NSTextAlignmentCenter;
  UILabel *copy = [self labelWithText:body];
  copy.font = [UIFont systemFontOfSize:12.0];
  copy.textColor = MDKMutedTextColor();
  copy.textAlignment = NSTextAlignmentCenter;
  [empty addArrangedSubview:heading];
  [empty addArrangedSubview:copy];
  return empty;
}

- (UITextField *)searchFieldWithPlaceholder:(NSString *)placeholder {
  UITextField *field = [[UITextField alloc] init];
  field.backgroundColor = MDKBackgroundColor();
  field.layer.cornerRadius = 9.0;
  field.layer.borderWidth = 1.0;
  field.layer.borderColor = MDKBorderColor().CGColor;
  field.textColor = MDKTextColor();
  field.tintColor = MDKAccentColor();
  field.font = [UIFont systemFontOfSize:14.0];
  field.placeholder = placeholder;
  field.attributedPlaceholder = [[NSAttributedString alloc]
      initWithString:placeholder
          attributes:@{ NSForegroundColorAttributeName : MDKMutedTextColor() }];
  field.autocapitalizationType = UITextAutocapitalizationTypeNone;
  field.autocorrectionType = UITextAutocorrectionTypeNo;
  UIView *padding = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 13.0, 1.0)];
  field.leftView = padding;
  field.leftViewMode = UITextFieldViewModeAlways;
  field.rightView = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 13.0, 1.0)];
  field.rightViewMode = UITextFieldViewModeAlways;
  [field.heightAnchor constraintGreaterThanOrEqualToConstant:44.0].active = YES;
  return field;
}

- (UIButton *)secondaryButtonWithTitle:(NSString *)title {
  UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
  [button setTitle:title forState:UIControlStateNormal];
  [button setTitleColor:MDKSecondaryTextColor() forState:UIControlStateNormal];
  button.titleLabel.font = [UIFont boldSystemFontOfSize:12.0];
  button.backgroundColor = MDKCardColor();
  button.layer.cornerRadius = 8.0;
  button.layer.borderWidth = 1.0;
  button.layer.borderColor = MDKBorderColor().CGColor;
  button.contentEdgeInsets = UIEdgeInsetsMake(8.0, 12.0, 8.0, 12.0);
  [button.heightAnchor constraintGreaterThanOrEqualToConstant:44.0].active = YES;
  return button;
}

- (UIButton *)primaryButtonWithTitle:(NSString *)title {
  UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
  [button setTitle:title forState:UIControlStateNormal];
  [button setTitleColor:MDKColor(0x052E16) forState:UIControlStateNormal];
  button.titleLabel.font = [UIFont boldSystemFontOfSize:13.0];
  button.backgroundColor = MDKAccentColor();
  button.layer.cornerRadius = 9.0;
  [button.heightAnchor constraintEqualToConstant:46.0].active = YES;
  return button;
}

- (void)showNoticeWithTitle:(NSString *)title message:(NSString *)message {
  UIAlertController *alert = [UIAlertController alertControllerWithTitle:title
                                                                 message:message
                                                          preferredStyle:UIAlertControllerStyleAlert];
  [alert addAction:[UIAlertAction actionWithTitle:MDKText(@"OK", @"确定")
                                            style:UIAlertActionStyleDefault
                                          handler:nil]];
  [self presentViewController:alert animated:YES completion:nil];
}

- (void)clearStack:(UIStackView *)stack {
  for (UIView *view in stack.arrangedSubviews.copy) {
    [stack removeArrangedSubview:view];
    [view removeFromSuperview];
  }
}

- (void)close {
  [_networkRefreshTimer invalidate];
  _networkRefreshTimer = nil;
  [self dismissViewControllerAnimated:YES
                           completion:^{
    DoraemonManager *manager = [DoraemonManager shareInstance];
    SEL selector = NSSelectorFromString(@"showHomeWindow");
    if ([manager respondsToSelector:selector]) {
      void (*sendMessage)(id, SEL) = (void (*)(id, SEL))objc_msgSend;
      sendMessage(manager, selector);
    }
  }];
}

@end

@implementation MDKNativeDiagnosticsViewController

+ (void)presentDestination:(MDKDiagnosticsDestination)destination {
  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *presenter = MDKApplicationTopViewController();
    if (presenter == nil ||
        [presenter isKindOfClass:MDKNativeDiagnosticsContentController.class]) {
      return;
    }
    MDKNativeDiagnosticsContentController *content =
        [[MDKNativeDiagnosticsContentController alloc]
            initWithDestination:destination];
    UINavigationController *navigation =
        [[UINavigationController alloc] initWithRootViewController:content];
    navigation.modalPresentationStyle = UIModalPresentationFullScreen;
    navigation.navigationBar.barStyle = UIBarStyleBlack;
    [presenter presentViewController:navigation animated:YES completion:nil];
  });
}

@end
