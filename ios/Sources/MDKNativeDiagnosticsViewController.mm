#import "MDKNativeDiagnosticsViewController.h"

#import "MDKExpoUpdatesAdapter.h"

#import <DoraemonKit/DoraemonKit.h>
#import <DoraemonKit/DoraemonNetFlowDataSource.h>
#import <DoraemonKit/DoraemonNetFlowHttpModel.h>
#import <MMKVCore/MMKV.h>
#import <objc/message.h>
#import <UIKit/UIKit.h>

static UIColor *MDKBackgroundColor(void) {
  return [UIColor colorWithRed:15.0 / 255.0
                         green:23.0 / 255.0
                          blue:42.0 / 255.0
                         alpha:1.0];
}

static UIColor *MDKCardColor(void) {
  return [UIColor colorWithRed:30.0 / 255.0
                         green:41.0 / 255.0
                          blue:59.0 / 255.0
                         alpha:1.0];
}

static BOOL MDKUsesEnglish(void) {
  return [NSLocale.preferredLanguages.firstObject.lowercaseString
      hasPrefix:@"en"];
}

static NSString *MDKText(NSString *english, NSString *chinese) {
  return MDKUsesEnglish() ? english : chinese;
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
                           options:NSRegularExpressionSearch | NSCaseInsensitiveSearch]
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
                                                           NSJSONWritingSortedKeys
                                                     error:nil];
  return pretty == nil
             ? rawValue
             : [[NSString alloc] initWithData:pretty
                                      encoding:NSUTF8StringEncoding];
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

static NSArray<NSDictionary<NSString *, NSString *> *> *MDKStorageEntries(void) {
  NSString *rootPath = MDKMMKVRootPath();
  [NSFileManager.defaultManager createDirectoryAtPath:rootPath
                          withIntermediateDirectories:YES
                                           attributes:nil
                                                error:nil];
  std::string root = rootPath.UTF8String ?: "";
  mmkv::MMKV::initializeMMKV(root, mmkv::MMKVLogWarning);
  mmkv::MMKV *storage = mmkv::MMKV::mmkvWithID(
      DEFAULT_MMAP_ID, mmkv::MMKV_SINGLE_PROCESS, nullptr, &root);
  if (storage == nullptr) {
    return @[];
  }

  NSMutableArray *entries = [NSMutableArray array];
  for (NSString *key in storage->allKeysObjC()) {
    std::string stringValue;
    NSString *display = nil;
    if (storage->getString(key, stringValue)) {
      display = [[NSString alloc]
          initWithBytes:stringValue.data()
                 length:stringValue.size()
               encoding:NSUTF8StringEncoding];
    } else {
      bool hasNumber = false;
      double numberValue = storage->getDouble(key, 0.0, &hasNumber);
      if (hasNumber) {
        display = [NSString stringWithFormat:@"%.15g", numberValue];
      } else {
        bool hasBoolean = false;
        bool booleanValue = storage->getBool(key, false, &hasBoolean);
        if (hasBoolean) {
          display = booleanValue ? @"true" : @"false";
        }
      }
    }
    [entries addObject:@{
      @"key" : key,
      @"value" : MDKDisplayString(key, display ?: @"<binary or unreadable>"),
    }];
  }
  [entries sortUsingComparator:^NSComparisonResult(NSDictionary *left,
                                                    NSDictionary *right) {
    return [left[@"key"] localizedCaseInsensitiveCompare:right[@"key"]];
  }];
  return entries;
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
  UIStackView *_content;
  UILabel *_otaStatus;
  NSArray<DoraemonNetFlowHttpModel *> *_networkModels;
}

- (instancetype)initWithDestination:(MDKDiagnosticsDestination)destination {
  self = [super initWithNibName:nil bundle:nil];
  if (self != nil) {
    _destination = destination;
  }
  return self;
}

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = MDKBackgroundColor();
  self.navigationItem.leftBarButtonItem =
      [[UIBarButtonItem alloc] initWithTitle:MDKText(@"Back", @"返回")
                                      style:UIBarButtonItemStylePlain
                                     target:self
                                     action:@selector(close)];
  switch (_destination) {
    case MDKDiagnosticsDestinationNetwork:
      self.title = MDKText(@"Network", @"网络抓包");
      break;
    case MDKDiagnosticsDestinationExpoUpdate:
      self.title = MDKText(@"Expo Update", @"Expo 热更新");
      break;
    case MDKDiagnosticsDestinationLocalState:
      self.title = MDKText(@"Local State", @"本地状态");
      break;
  }

  UIScrollView *scrollView = [[UIScrollView alloc] init];
  scrollView.translatesAutoresizingMaskIntoConstraints = NO;
  scrollView.alwaysBounceVertical = YES;
  [self.view addSubview:scrollView];
  [NSLayoutConstraint activateConstraints:@[
    [scrollView.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor],
    [scrollView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
    [scrollView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
    [scrollView.bottomAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.bottomAnchor],
  ]];

  _content = [[UIStackView alloc] init];
  _content.translatesAutoresizingMaskIntoConstraints = NO;
  _content.axis = UILayoutConstraintAxisVertical;
  _content.spacing = 10.0;
  _content.layoutMargins = UIEdgeInsetsMake(16.0, 16.0, 16.0, 16.0);
  _content.layoutMarginsRelativeArrangement = YES;
  [scrollView addSubview:_content];
  [NSLayoutConstraint activateConstraints:@[
    [_content.topAnchor constraintEqualToAnchor:scrollView.contentLayoutGuide.topAnchor],
    [_content.leadingAnchor constraintEqualToAnchor:scrollView.contentLayoutGuide.leadingAnchor],
    [_content.trailingAnchor constraintEqualToAnchor:scrollView.contentLayoutGuide.trailingAnchor],
    [_content.bottomAnchor constraintEqualToAnchor:scrollView.contentLayoutGuide.bottomAnchor],
    [_content.widthAnchor constraintEqualToAnchor:scrollView.frameLayoutGuide.widthAnchor],
  ]];

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
  }
}

- (void)renderStorage {
  NSArray *entries = MDKStorageEntries();
  if (entries.count == 0) {
    [_content addArrangedSubview:[self labelWithText:MDKText(
                                                          @"No MMKV entries",
                                                          @"暂无 MMKV 数据")]];
    return;
  }
  for (NSDictionary *entry in entries) {
    [_content addArrangedSubview:[self cardWithTitle:entry[@"key"]
                                               value:entry[@"value"]]];
  }
}

- (void)renderNetwork {
  UIButton *clear = [UIButton buttonWithType:UIButtonTypeSystem];
  [clear setTitle:MDKText(@"Clear requests", @"清空请求")
          forState:UIControlStateNormal];
  clear.contentHorizontalAlignment = UIControlContentHorizontalAlignmentLeft;
  [clear addTarget:self
                action:@selector(clearNetwork)
      forControlEvents:UIControlEventTouchUpInside];
  [_content addArrangedSubview:clear];

  _networkModels = [[[DoraemonNetFlowDataSource shareInstance].httpModelArray
      reverseObjectEnumerator] allObjects];
  if (_networkModels.count == 0) {
    [_content addArrangedSubview:[self labelWithText:MDKText(
                                                          @"No captured requests",
                                                          @"暂无已捕获请求")]];
    return;
  }
  [_networkModels enumerateObjectsUsingBlock:^(
                      DoraemonNetFlowHttpModel *model, NSUInteger index,
                      __unused BOOL *stop) {
    NSString *method = model.request.HTTPMethod ?: model.method ?: @"HTTP";
    NSString *status = model.statusCode.length > 0 ? model.statusCode : @"Pending";
    NSString *title = [NSString stringWithFormat:@"%@  %@", method, status];
    UIButton *row = [UIButton buttonWithType:UIButtonTypeSystem];
    row.tag = index;
    row.contentHorizontalAlignment = UIControlContentHorizontalAlignmentLeft;
    row.titleLabel.numberOfLines = 0;
    [row setTitle:[NSString stringWithFormat:@"%@\n%@", title,
                                             model.url ?: model.request.URL.absoluteString ?: @""]
          forState:UIControlStateNormal];
    row.backgroundColor = MDKCardColor();
    row.layer.cornerRadius = 12.0;
    row.contentEdgeInsets = UIEdgeInsetsMake(12.0, 12.0, 12.0, 12.0);
    [row addTarget:self
                  action:@selector(showNetworkDetail:)
        forControlEvents:UIControlEventTouchUpInside];
    [self->_content addArrangedSubview:row];
  }];
}

- (void)clearNetwork {
  [[DoraemonNetFlowDataSource shareInstance] clear];
  for (UIView *view in _content.arrangedSubviews.copy) {
    [_content removeArrangedSubview:view];
    [view removeFromSuperview];
  }
  [self renderNetwork];
}

- (void)showNetworkDetail:(UIButton *)sender {
  if (sender.tag >= _networkModels.count) {
    return;
  }
  DoraemonNetFlowHttpModel *model = _networkModels[sender.tag];
  NSString *detail = [NSString
      stringWithFormat:@"%@\n\nRequest headers\n%@\n\nRequest body\n%@\n\nResponse body\n%@",
                       model.url ?: model.request.URL.absoluteString ?: @"",
                       model.request.allHTTPHeaderFields ?: @{},
                       model.requestBody ?: @"", model.responseBody ?: @""];
  UIAlertController *alert =
      [UIAlertController alertControllerWithTitle:MDKText(@"Request", @"请求详情")
                                          message:detail
                                   preferredStyle:UIAlertControllerStyleAlert];
  [alert addAction:[UIAlertAction actionWithTitle:MDKText(@"Done", @"完成")
                                           style:UIAlertActionStyleCancel
                                         handler:nil]];
  [self presentViewController:alert animated:YES completion:nil];
}

- (void)renderExpoUpdate {
  NSDictionary *info = [MDKExpoUpdatesAdapter runtimeInfo];
  if (![info[@"isEnabled"] boolValue]) {
    [_content addArrangedSubview:[self labelWithText:MDKText(
                                                          @"Unavailable in this build",
                                                          @"当前构建不可用")]];
    return;
  }

  NSNumber *commitTime = info[@"commitTime"];
  NSString *published = @"—";
  if ([commitTime isKindOfClass:NSNumber.class]) {
    NSDate *date = [NSDate dateWithTimeIntervalSince1970:commitTime.doubleValue / 1000.0];
    published = [NSDateFormatter localizedStringFromDate:date
                                               dateStyle:NSDateFormatterMediumStyle
                                               timeStyle:NSDateFormatterMediumStyle];
  }
  NSString *source = [info[@"isEmbeddedLaunch"] boolValue] ? @"Embedded" : @"OTA";
  NSString *runtime = [NSString
      stringWithFormat:@"Branch: %@\nUpdate ID: %@\nPublished: %@\nChannel: %@\nRuntime: %@\nSource: %@",
                       info[@"sourceBranch"] ?: @"—", info[@"updateId"] ?: @"Embedded build",
                       published, info[@"channel"] ?: @"—",
                       info[@"runtimeVersion"] ?: @"—", source];
  _otaStatus = [self labelWithText:runtime];
  [_content addArrangedSubview:_otaStatus];

  UIButton *apply = [UIButton buttonWithType:UIButtonTypeSystem];
  [apply setTitle:MDKText(@"Check and apply update", @"检查并应用更新")
          forState:UIControlStateNormal];
  apply.contentHorizontalAlignment = UIControlContentHorizontalAlignmentLeft;
  [apply addTarget:self
                action:@selector(checkAndApplyUpdate:)
      forControlEvents:UIControlEventTouchUpInside];
  [_content addArrangedSubview:apply];
}

- (void)checkAndApplyUpdate:(UIButton *)button {
  button.enabled = NO;
  _otaStatus.text = [_otaStatus.text stringByAppendingString:MDKText(@"\n\nChecking…", @"\n\n正在检查…")];
  [MDKExpoUpdatesAdapter checkAndApplyWithCompletion:^(NSString *result) {
    button.enabled = YES;
    NSString *message = result;
    if ([result isEqualToString:@"up-to-date"]) {
      message = MDKText(@"Already up to date", @"当前已是最新版本");
    } else if ([result isEqualToString:@"unavailable"]) {
      message = MDKText(@"Unavailable in this build", @"当前构建不可用");
    } else if ([result isEqualToString:@"relaunching"]) {
      message = MDKText(@"Relaunching…", @"正在重新加载…");
    }
    self->_otaStatus.text =
        [self->_otaStatus.text stringByAppendingFormat:@"\n%@", message];
  }];
}

- (UILabel *)labelWithText:(NSString *)text {
  UILabel *label = [[UILabel alloc] init];
  label.numberOfLines = 0;
  label.textColor = UIColor.whiteColor;
  label.font = [UIFont systemFontOfSize:15.0];
  label.text = text;
  label.userInteractionEnabled = YES;
  return label;
}

- (UIView *)cardWithTitle:(NSString *)title value:(NSString *)value {
  UIStackView *card = [[UIStackView alloc] init];
  card.axis = UILayoutConstraintAxisVertical;
  card.spacing = 8.0;
  card.layoutMargins = UIEdgeInsetsMake(12.0, 12.0, 12.0, 12.0);
  card.layoutMarginsRelativeArrangement = YES;
  card.backgroundColor = MDKCardColor();
  card.layer.cornerRadius = 12.0;
  UILabel *titleLabel = [self labelWithText:title];
  titleLabel.font = [UIFont boldSystemFontOfSize:15.0];
  [card addArrangedSubview:titleLabel];
  UILabel *valueLabel = [self labelWithText:value];
  valueLabel.font = [UIFont monospacedSystemFontOfSize:12.0
                                               weight:UIFontWeightRegular];
  valueLabel.textColor = [UIColor colorWithWhite:0.82 alpha:1.0];
  [card addArrangedSubview:valueLabel];
  return card;
}

- (void)close {
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
