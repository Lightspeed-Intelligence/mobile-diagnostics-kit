#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT NSString *const MDKAPIBaseURLDefaultsKey;
FOUNDATION_EXPORT NSString *const MDKMockOverridesDefaultsKey;
FOUNDATION_EXPORT NSString *const MDKABConfigMockIdentifier;
FOUNDATION_EXPORT NSString *const MDKABConfigPath;
FOUNDATION_EXPORT NSString *const MDKScreenRecommendationKey;

FOUNDATION_EXPORT NSString *_Nullable MDKCanonicalAPIBaseURL(NSString *rawValue);
FOUNDATION_EXPORT NSString *_Nullable MDKSavedAPIBaseURL(void);
FOUNDATION_EXPORT BOOL MDKSaveAPIBaseURL(NSString *rawValue);
FOUNDATION_EXPORT void MDKClearAPIBaseURL(void);
FOUNDATION_EXPORT NSURL *MDKRewriteAPIURL(NSURL *url);

FOUNDATION_EXPORT NSDictionary<NSString *, id> *MDKMockOverride(NSString *identifier);
FOUNDATION_EXPORT BOOL MDKSaveMockOverride(
    NSString *identifier, BOOL enabled,
    NSDictionary<NSString *, NSString *> *values);
FOUNDATION_EXPORT BOOL MDKClearAllMockOverrides(void);
FOUNDATION_EXPORT BOOL MDKIsABConfigRequest(NSURLRequest *request);
FOUNDATION_EXPORT BOOL MDKShouldMockABConfigRequest(NSURLRequest *request);
FOUNDATION_EXPORT NSData *_Nullable MDKPatchABConfigResponse(
    NSURLRequest *request, NSData *body);

NS_ASSUME_NONNULL_END
