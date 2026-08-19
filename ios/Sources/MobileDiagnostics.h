#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

NS_SWIFT_NAME(MobileDiagnostics)
@interface MDKMobileDiagnostics : NSObject

/// Installs the DoKit floating entry once. Call after the active UIWindowScene
/// has connected so the entry can attach to a visible window.
+ (void)install NS_SWIFT_NAME(install());

@end

NS_ASSUME_NONNULL_END
