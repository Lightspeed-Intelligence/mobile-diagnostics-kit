#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface MDKExpoUpdatesAdapter : NSObject

+ (NSDictionary<NSString *, id> *)runtimeInfo;
+ (void)checkAndApplyWithCompletion:(void (^)(NSString *result))completion;

@end

NS_ASSUME_NONNULL_END
