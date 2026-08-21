#import "MobileDiagnostics.h"

#import <DoraemonKit/DoraemonBaseViewController.h>
#import <DoraemonKit/DoraemonKit.h>
#import <DoraemonKit/DoraemonCacheManager.h>
#import <React/RCTBridgeModule.h>
#import <objc/message.h>
#import <objc/runtime.h>

@interface MDKDiagnosticsSurfaceViewController : UIViewController

- (instancetype)initWithInitialDestination:(NSString *)initialDestination
                            surfaceProvider:
                                (MDKDiagnosticsSurfaceProvider)surfaceProvider;

@end

static __weak MDKDiagnosticsSurfaceViewController
    *MDKActiveDiagnosticsSurfaceController = nil;

static BOOL MDKUsesEnglishLanguage(void) {
  NSString *language = NSLocale.preferredLanguages.firstObject;
  return [language.lowercaseString hasPrefix:@"en"];
}

static NSString *MDKLocalizedString(NSString *english, NSString *chinese) {
  // DoKit 3.1.7 only ships English and Simplified Chinese resources. Match
  // its non-English fallback so built-in and custom tool names stay aligned.
  return MDKUsesEnglishLanguage() ? english : chinese;
}

@implementation MDKDiagnosticsSurfaceViewController {
  NSString *_initialDestination;
  MDKDiagnosticsSurfaceProvider _surfaceProvider;
}

- (instancetype)initWithInitialDestination:(NSString *)initialDestination
                            surfaceProvider:
                                (MDKDiagnosticsSurfaceProvider)surfaceProvider {
  self = [super initWithNibName:nil bundle:nil];
  if (self != nil) {
    _initialDestination = [initialDestination copy];
    _surfaceProvider = [surfaceProvider copy];
  }
  return self;
}

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor =
      [UIColor colorWithRed:15.0 / 255.0
                      green:23.0 / 255.0
                       blue:42.0 / 255.0
                      alpha:1.0];
  self.view.accessibilityIdentifier = @"mobileDiagnostics.screen";

  MDKDiagnosticsSurfaceProvider surfaceProvider = _surfaceProvider;
  NSString *initialDestination = _initialDestination;
  UIView *surface = surfaceProvider(initialDestination);
  surface.frame = self.view.bounds;
  surface.autoresizingMask =
      UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  [self.view addSubview:surface];
}

- (void)viewDidAppear:(BOOL)animated {
  [super viewDidAppear:animated];
  MDKActiveDiagnosticsSurfaceController = self;
}

- (void)viewDidDisappear:(BOOL)animated {
  [super viewDidDisappear:animated];
  if (MDKActiveDiagnosticsSurfaceController == self &&
      (self.isMovingFromParentViewController ||
       self.navigationController == nil)) {
    MDKActiveDiagnosticsSurfaceController = nil;
  }
}

@end

@interface MDKDiagnosticsPresentationModule : NSObject <RCTBridgeModule>
@end

@implementation MDKDiagnosticsPresentationModule

RCT_EXPORT_MODULE(MobileDiagnosticsPresentation)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

RCT_EXPORT_METHOD(close) {
  dispatch_async(dispatch_get_main_queue(), ^{
    MDKDiagnosticsSurfaceViewController *controller =
        MDKActiveDiagnosticsSurfaceController;
    UINavigationController *navigationController =
        controller.navigationController;
    if (controller == nil ||
        navigationController.topViewController != controller) {
      return;
    }
    [navigationController popViewControllerAnimated:YES];
  });
}

@end

typedef void (*MDKViewWillAppearImplementation)(id, SEL, BOOL);

static MDKViewWillAppearImplementation MDKOriginalDoKitViewWillAppear = NULL;

static void MDKDoKitViewWillAppear(DoraemonBaseViewController *controller,
                                   SEL command, BOOL animated) {
  if (MDKOriginalDoKitViewWillAppear != NULL) {
    MDKOriginalDoKitViewWillAppear(controller, command, animated);
  }

  // The DoKit home intentionally has no back item. Child pages use a native
  // bar item so UIKit owns the hit target instead of DoKit's 30pt custom view.
  if ([controller isKindOfClass:NSClassFromString(@"DoraemonHomeViewController")]) {
    return;
  }

  UIImage *backImage = [UIImage systemImageNamed:@"chevron.backward"];
  UIBarButtonItem *backItem =
      [[UIBarButtonItem alloc] initWithImage:backImage
                                      style:UIBarButtonItemStylePlain
                                     target:controller
                                     action:@selector(leftNavBackClick:)];
  backItem.accessibilityLabel = @"Back";
  controller.navigationItem.leftBarButtonItem = backItem;
}

static void MDKInstallDoKitNavigationPatch(void) {
  Class baseViewController = [DoraemonBaseViewController class];
  Method viewWillAppear = class_getInstanceMethod(
      baseViewController, @selector(viewWillAppear:));
  if (viewWillAppear == NULL) {
    return;
  }

  MDKOriginalDoKitViewWillAppear =
      (MDKViewWillAppearImplementation)method_getImplementation(viewWillAppear);
  method_setImplementation(viewWillAppear, (IMP)MDKDoKitViewWillAppear);
}

static void MDKIgnoreTelemetryPoint(id self, SEL command, NSString *name) {
  (void)self;
  (void)command;
  (void)name;
  // DoKit 3.1.7 has no public iOS equivalent of Android's disableUpload().
  // Replacing its internal point collector keeps diagnostics on the device.
}

static void MDKDisableDoKitTelemetry(void) {
  // DoKit's startup usage upload is separate from its interaction event
  // collector. Disable both before DoraemonManager is created or installed.
  Class statisticsClass = NSClassFromString(@"DoraemonStatisticsUtil");
  SEL shareSelector = NSSelectorFromString(@"shareInstance");
  SEL disableSelector = NSSelectorFromString(@"setNoUpLoad:");
  if ([statisticsClass respondsToSelector:shareSelector]) {
    id (*sendObjectMessage)(id, SEL) =
        (id (*)(id, SEL))objc_msgSend;
    void (*sendBoolMessage)(id, SEL, BOOL) =
        (void (*)(id, SEL, BOOL))objc_msgSend;
    id statisticsManager = sendObjectMessage(statisticsClass, shareSelector);
    if ([statisticsManager respondsToSelector:disableSelector]) {
      sendBoolMessage(statisticsManager, disableSelector, YES);
    }
  }

  Class telemetryClass = NSClassFromString(@"DoraemonBuriedPointManager");
  SEL telemetrySelector = NSSelectorFromString(@"addPointName:");
  Method telemetryMethod =
      class_getInstanceMethod(telemetryClass, telemetrySelector);
  if (telemetryMethod != NULL) {
    method_setImplementation(telemetryMethod, (IMP)MDKIgnoreTelemetryPoint);
  }
}

static NSString *MDKModuleContainingPlugin(DoraemonManager *manager,
                                            NSString *pluginName) {
  for (NSDictionary *module in manager.dataArray) {
    for (NSDictionary *plugin in module[@"pluginArray"]) {
      if ([plugin[@"pluginName"] isEqualToString:pluginName]) {
        return module[@"moduleName"];
      }
    }
  }
  return nil;
}

static void MDKRemoveUnsupportedPlatformTools(DoraemonManager *manager) {
  NSSet<NSString *> *platformModuleNames =
      [NSSet setWithObjects:@"平台工具", @"Platform", nil];
  NSIndexSet *platformModules =
      [manager.dataArray indexesOfObjectsPassingTest:^BOOL(
                             NSDictionary *module, __unused NSUInteger index,
                             __unused BOOL *stop) {
        NSString *moduleName = module[@"moduleName"];
        return [platformModuleNames containsObject:moduleName];
      }];
  [manager.dataArray removeObjectsAtIndexes:platformModules];
  [[DoraemonCacheManager sharedInstance]
      saveKitManagerData:manager.dataArray];
}

static void MDKReplaceLegacyNetworkPlugin(
    DoraemonManager *manager, MDKDiagnosticsOpenHandler openHandler) {
  NSString *legacyPlugin = @"DoraemonNetFlowPlugin";
  NSString *legacyModule = MDKModuleContainingPlugin(manager, legacyPlugin);
  if (legacyModule.length > 0) {
    [manager removePluginWithPluginName:legacyPlugin atModule:legacyModule];
  }

  // DoKit persists built-in visibility separately from manager.dataArray.
  // Refresh it after removal so upgraded QA installs cannot resurrect the
  // legacy Network entry from a previous session.
  [[DoraemonCacheManager sharedInstance]
      saveKitManagerData:manager.dataArray];

  [manager addPluginWithTitle:MDKLocalizedString(@"Network", @"网络抓包")
                         icon:@"doraemon_net"
                         desc:MDKLocalizedString(@"Inspect captured requests",
                                                 @"查看已捕获的网络请求")
                   pluginName:@"MDKNetworkPlugin"
                      atModule:MDKLocalizedString(@"Application Tools", @"应用工具")
                        handle:^(__unused NSDictionary *itemData) {
    [manager hiddenHomeWindow];
    if (openHandler != nil) {
      openHandler(MDKDiagnosticsDestinationNetwork);
    }
  }];
}

@implementation MDKMobileDiagnostics

+ (void)install {
  [self installWithOpenHandler:nil];
}

+ (void)installWithOpenHandler:(MDKDiagnosticsOpenHandler)openHandler {
  static MDKDiagnosticsOpenHandler diagnosticsOpenHandler = nil;
  diagnosticsOpenHandler = [openHandler copy];

  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    MDKDisableDoKitTelemetry();
    MDKInstallDoKitNavigationPatch();

    DoraemonManager *manager = [DoraemonManager shareInstance];
    [manager addPluginWithTitle:MDKLocalizedString(@"Local State", @"本地状态")
                           icon:@"doraemon_file"
                           desc:MDKLocalizedString(
                                    @"Inspect allow-listed on-device state",
                                    @"查看允许访问的本机状态")
                     pluginName:@"MDKLocalStatePlugin"
                        atModule:MDKLocalizedString(@"Application Tools", @"应用工具")
                          handle:^(__unused NSDictionary *itemData) {
      [manager hiddenHomeWindow];
      if (diagnosticsOpenHandler != nil) {
        diagnosticsOpenHandler(MDKDiagnosticsDestinationLocalState);
      }
    }];
    [manager addPluginWithTitle:MDKLocalizedString(@"Expo Update", @"Expo 热更新")
                           icon:@"doraemon_file_sync"
                           desc:MDKLocalizedString(
                                    @"Check and apply a compatible update",
                                    @"检查并应用兼容的热更新")
                     pluginName:@"MDKExpoUpdatePlugin"
                        atModule:MDKLocalizedString(@"Application Tools", @"应用工具")
                          handle:^(__unused NSDictionary *itemData) {
      [manager hiddenHomeWindow];
      if (diagnosticsOpenHandler != nil) {
        diagnosticsOpenHandler(MDKDiagnosticsDestinationExpoUpdate);
      }
    }];

    [manager install];
    MDKRemoveUnsupportedPlatformTools(manager);
    MDKReplaceLegacyNetworkPlugin(manager, diagnosticsOpenHandler);
    // Clean once more on the next main-queue turn so a platform entry added
    // immediately after DoKit installation cannot recreate the group.
    dispatch_async(dispatch_get_main_queue(), ^{
      MDKRemoveUnsupportedPlatformTools(manager);
    });
  });
}

+ (void)installInNavigationController:
            (UINavigationController *)navigationController
                         surfaceProvider:
            (MDKDiagnosticsSurfaceProvider)surfaceProvider {
  __weak UINavigationController *weakNavigationController =
      navigationController;
  MDKDiagnosticsSurfaceProvider retainedSurfaceProvider =
      [surfaceProvider copy];
  [self installWithOpenHandler:^(MDKDiagnosticsDestination destination) {
    void (^presentSurface)(void) = ^{
      UINavigationController *strongNavigationController =
          weakNavigationController;
      if (strongNavigationController == nil) {
        return;
      }

      NSString *initialDestination = @"storage";
      switch (destination) {
        case MDKDiagnosticsDestinationNetwork:
          initialDestination = @"network";
          break;
        case MDKDiagnosticsDestinationExpoUpdate:
          initialDestination = @"ota";
          break;
        case MDKDiagnosticsDestinationLocalState:
          break;
      }

      MDKDiagnosticsSurfaceViewController *controller =
          [[MDKDiagnosticsSurfaceViewController alloc]
              initWithInitialDestination:initialDestination
                          surfaceProvider:retainedSurfaceProvider];
      [strongNavigationController pushViewController:controller animated:YES];
    };
    if ([NSThread isMainThread]) {
      presentSurface();
    } else {
      dispatch_async(dispatch_get_main_queue(), presentSurface);
    }
  }];
}

@end
