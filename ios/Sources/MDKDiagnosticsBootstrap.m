#import "MobileDiagnostics.h"
#import "MDKDiagnosticsURLProtocol.h"

#import <UIKit/UIKit.h>

@interface MDKDiagnosticsBootstrap : NSObject
@end

@implementation MDKDiagnosticsBootstrap

+ (void)load {
  MDKInstallDiagnosticsURLProtocol();
  dispatch_async(dispatch_get_main_queue(), ^{
    NSNotificationCenter *notifications = NSNotificationCenter.defaultCenter;
    [notifications addObserver:self
                      selector:@selector(attemptInstall)
                          name:UISceneWillConnectNotification
                        object:nil];
    [notifications addObserver:self
                      selector:@selector(attemptInstall)
                          name:UIApplicationDidBecomeActiveNotification
                        object:nil];
    [self attemptInstall];
  });
}

+ (void)attemptInstall {
  dispatch_async(dispatch_get_main_queue(), ^{
    BOOL hasWindow = NO;
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
      if (![scene isKindOfClass:UIWindowScene.class]) {
        continue;
      }
      for (UIWindow *window in ((UIWindowScene *)scene).windows) {
        if (window.rootViewController != nil) {
          hasWindow = YES;
          break;
        }
      }
      if (hasWindow) {
        break;
      }
    }
    if (hasWindow) {
      [MDKMobileDiagnostics install];
    }
  });
}

@end
