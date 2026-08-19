#import "MobileDiagnostics.h"

#import <DoraemonKit/DoraemonKit.h>
#import <objc/runtime.h>

static void MDKIgnoreTelemetryPoint(id self, SEL command, NSString *name) {
  (void)self;
  (void)command;
  (void)name;
  // DoKit 3.1.7 has no public iOS equivalent of Android's disableUpload().
  // Replacing its internal point collector keeps diagnostics on the device.
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
    Class telemetryClass = NSClassFromString(@"DoraemonBuriedPointManager");
    SEL telemetrySelector = NSSelectorFromString(@"addPointName:");
    Method telemetryMethod =
        class_getInstanceMethod(telemetryClass, telemetrySelector);
    if (telemetryMethod != NULL) {
      method_setImplementation(telemetryMethod, (IMP)MDKIgnoreTelemetryPoint);
    }

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
