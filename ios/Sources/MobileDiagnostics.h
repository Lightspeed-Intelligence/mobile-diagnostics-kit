#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, MDKDiagnosticsDestination) {
  MDKDiagnosticsDestinationLocalState = 0,
  MDKDiagnosticsDestinationExpoUpdate = 1,
  MDKDiagnosticsDestinationNetwork = 2,
  MDKDiagnosticsDestinationAPI = 3,
  MDKDiagnosticsDestinationMocks = 4,
};

typedef void (^MDKDiagnosticsOpenHandler)(
    MDKDiagnosticsDestination destination);
typedef UIView * _Nonnull (^MDKDiagnosticsSurfaceProvider)(
    NSString *initialDestination);

NS_SWIFT_NAME(MobileDiagnostics)
@interface MDKMobileDiagnostics : NSObject

/// Installs DoKit and registers the package's custom tools. Call after the
/// active UIWindowScene has connected so the entry can attach to a window.
+ (void)install NS_SWIFT_NAME(install());

/// The host owns presentation while this package owns the DoKit entries and
/// diagnostics UI. The handler receives only a stable, non-sensitive route.
+ (void)installWithOpenHandler:(nullable MDKDiagnosticsOpenHandler)openHandler
    NS_SWIFT_NAME(install(openHandler:));

/// Installs DoKit and lets this package own the diagnostics controller and
/// safe close behavior. The host supplies only its existing RN surface view.
+ (void)installInNavigationController:
            (UINavigationController *)navigationController
                         surfaceProvider:
            (MDKDiagnosticsSurfaceProvider)surfaceProvider
    NS_SWIFT_NAME(install(in:surfaceProvider:));

@end

NS_ASSUME_NONNULL_END
