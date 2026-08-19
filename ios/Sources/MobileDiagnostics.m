#import "MobileDiagnostics.h"

#import <DoraemonKit/DoraemonKit.h>
#import <objc/message.h>
#import <objc/runtime.h>

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

    DoraemonManager *manager = [DoraemonManager shareInstance];
    [manager addPluginWithTitle:@"Local State"
                           icon:@"doraemon_file"
                           desc:@"Inspect allow-listed on-device state"
                     pluginName:@"MDKLocalStatePlugin"
                        atModule:@"Application Tools"
                          handle:^(__unused NSDictionary *itemData) {
      [manager hiddenHomeWindow];
      if (diagnosticsOpenHandler != nil) {
        diagnosticsOpenHandler(MDKDiagnosticsDestinationLocalState);
      }
    }];
    [manager addPluginWithTitle:@"Expo Update"
                           icon:@"doraemon_app_setting"
                           desc:@"Check and apply a compatible update"
                     pluginName:@"MDKExpoUpdatePlugin"
                        atModule:@"Application Tools"
                          handle:^(__unused NSDictionary *itemData) {
      [manager hiddenHomeWindow];
      if (diagnosticsOpenHandler != nil) {
        diagnosticsOpenHandler(MDKDiagnosticsDestinationExpoUpdate);
      }
    }];

    [[DoraemonManager shareInstance] install];
  });
}

@end
