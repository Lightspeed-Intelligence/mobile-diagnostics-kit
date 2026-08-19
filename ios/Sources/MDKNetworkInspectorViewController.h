#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// A modern, on-device presentation for requests captured by DoKit.
/// Capture ownership remains with DoraemonKit; this controller only reads its
/// in-memory request models and never persists or uploads their contents.
@interface MDKNetworkInspectorViewController : UIViewController

@end

NS_ASSUME_NONNULL_END
