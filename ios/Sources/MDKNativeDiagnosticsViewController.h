#import <Foundation/Foundation.h>

#import "MobileDiagnostics.h"

NS_ASSUME_NONNULL_BEGIN

@interface MDKNativeDiagnosticsViewController : NSObject

+ (void)presentDestination:(MDKDiagnosticsDestination)destination;

@end

NS_ASSUME_NONNULL_END
