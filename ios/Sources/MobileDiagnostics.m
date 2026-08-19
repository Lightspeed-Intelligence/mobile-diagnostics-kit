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
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    Class telemetryClass = NSClassFromString(@"DoraemonBuriedPointManager");
    SEL telemetrySelector = NSSelectorFromString(@"addPointName:");
    Method telemetryMethod =
        class_getInstanceMethod(telemetryClass, telemetrySelector);
    if (telemetryMethod != NULL) {
      method_setImplementation(telemetryMethod, (IMP)MDKIgnoreTelemetryPoint);
    }

    [[DoraemonManager shareInstance] install];
  });
}

@end
