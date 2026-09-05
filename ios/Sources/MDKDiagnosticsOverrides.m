#import "MDKDiagnosticsOverrides.h"

NSString *const MDKAPIBaseURLDefaultsKey = @"mobile_diagnostics_api_base_url";
NSString *const MDKMockOverridesDefaultsKey = @"mobile_diagnostics_mock_overrides_v1";
NSString *const MDKABConfigMockIdentifier = @"ab_config/get_bundle_configs";
NSString *const MDKABConfigPath = @"/api/v1/ab_config/get_bundle_configs";
NSString *const MDKScreenRecommendationKey = @"enable_recsys_in_home_show_case";

static BOOL MDKIsAllowedAPIHost(NSString *host) {
  NSString *normalized = host.lowercaseString;
  return [normalized isEqualToString:@"api.tipsy.chat"] ||
         [normalized isEqualToString:@"api.dev.fantacy.live"] ||
         [normalized hasSuffix:@".api.dev.fantacy.live"];
}

static BOOL MDKMatchesPattern(NSString *value, NSString *pattern) {
  NSRegularExpression *expression =
      [NSRegularExpression regularExpressionWithPattern:pattern options:0 error:nil];
  NSRange range = NSMakeRange(0, value.length);
  return [expression firstMatchInString:value options:0 range:range] != nil;
}

NSString *MDKCanonicalAPIBaseURL(NSString *rawValue) {
  NSString *trimmed =
      [rawValue stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  NSURLComponents *components = [NSURLComponents componentsWithString:trimmed];
  NSString *scheme = components.scheme.lowercaseString;
  NSString *host = components.host.lowercaseString;
  if (![scheme isEqualToString:@"https"] || host.length == 0 ||
      !MDKIsAllowedAPIHost(host) || components.user != nil ||
      components.password != nil || components.query != nil ||
      components.fragment != nil ||
      (components.port != nil && components.port.integerValue != 443)) {
    return nil;
  }

  NSString *path = components.percentEncodedPath ?: @"";
  // Accept an origin or a display-friendly /api/vN base. Only the
  // origin is applied later, so every request keeps its own API version.
  if (path.length > 0 && ![path isEqualToString:@"/"] &&
      !MDKMatchesPattern(path, @"^/api/v[0-9]+/?$")) {
    return nil;
  }
  components.scheme = @"https";
  components.host = host;
  components.port = nil;
  components.percentEncodedPath = @"";
  return components.URL.absoluteString;
}

NSString *MDKSavedAPIBaseURL(void) {
  NSString *saved =
      [NSUserDefaults.standardUserDefaults stringForKey:MDKAPIBaseURLDefaultsKey];
  return saved == nil ? nil : MDKCanonicalAPIBaseURL(saved);
}

BOOL MDKSaveAPIBaseURL(NSString *rawValue) {
  NSString *canonical = MDKCanonicalAPIBaseURL(rawValue);
  if (canonical == nil) {
    return NO;
  }
  [NSUserDefaults.standardUserDefaults setObject:canonical
                                           forKey:MDKAPIBaseURLDefaultsKey];
  return YES;
}

void MDKClearAPIBaseURL(void) {
  [NSUserDefaults.standardUserDefaults removeObjectForKey:MDKAPIBaseURLDefaultsKey];
}

NSURL *MDKRewriteAPIURL(NSURL *url) {
  NSString *saved = MDKSavedAPIBaseURL();
  if (saved == nil || !MDKIsAllowedAPIHost(url.host ?: @"") ||
      !MDKMatchesPattern(url.path ?: @"", @"^/api/v[0-9]+(?:/.*)?$")) {
    return url;
  }

  NSURLComponents *source = [NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO];
  NSURLComponents *target = [NSURLComponents componentsWithString:saved];
  if (source == nil || target.host.length == 0) {
    return url;
  }
  source.scheme = @"https";
  source.host = target.host;
  source.port = nil;
  return source.URL ?: url;
}

static NSDictionary<NSString *, id> *MDKMockRoot(void) {
  id value = [NSUserDefaults.standardUserDefaults objectForKey:MDKMockOverridesDefaultsKey];
  return [value isKindOfClass:NSDictionary.class] ? value : @{};
}

NSDictionary<NSString *, id> *MDKMockOverride(NSString *identifier) {
  id value = MDKMockRoot()[identifier];
  return [value isKindOfClass:NSDictionary.class] ? value : @{};
}

BOOL MDKSaveMockOverride(NSString *identifier, BOOL enabled,
                         NSDictionary<NSString *, NSString *> *values) {
  NSMutableDictionary *root = [MDKMockRoot() mutableCopy];
  NSMutableDictionary<NSString *, NSString *> *normalized = [NSMutableDictionary dictionary];
  [values enumerateKeysAndObjectsUsingBlock:^(NSString *key, NSString *value, BOOL *stop) {
    (void)stop;
    if (![key isKindOfClass:NSString.class] || ![value isKindOfClass:NSString.class]) {
      return;
    }
    NSString *trimmedKey = [key stringByTrimmingCharactersInSet:
        NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (trimmedKey.length > 0) {
      normalized[trimmedKey] = value;
    }
  }];
  root[identifier] = @{
    @"enabled" : @(enabled),
    @"values" : [normalized copy],
  };
  [NSUserDefaults.standardUserDefaults setObject:root
                                           forKey:MDKMockOverridesDefaultsKey];
  return YES;
}

BOOL MDKClearAllMockOverrides(void) {
  [NSUserDefaults.standardUserDefaults removeObjectForKey:MDKMockOverridesDefaultsKey];
  return YES;
}

BOOL MDKIsABConfigRequest(NSURLRequest *request) {
  return MDKIsAllowedAPIHost(request.URL.host ?: @"") &&
         [request.HTTPMethod caseInsensitiveCompare:@"POST"] == NSOrderedSame &&
         [request.URL.path isEqualToString:MDKABConfigPath];
}

BOOL MDKShouldMockABConfigRequest(NSURLRequest *request) {
  NSDictionary *override = MDKMockOverride(MDKABConfigMockIdentifier);
  NSDictionary *values = override[@"values"];
  return MDKIsABConfigRequest(request) &&
         [override[@"enabled"] boolValue] &&
         [values isKindOfClass:NSDictionary.class] && values.count > 0;
}

NSData *MDKPatchABConfigResponse(NSURLRequest *request, NSData *body) {
  if (!MDKShouldMockABConfigRequest(request)) {
    return nil;
  }
  NSError *error = nil;
  id object = [NSJSONSerialization JSONObjectWithData:body
                                               options:NSJSONReadingMutableContainers
                                                 error:&error];
  if (error != nil || ![object isKindOfClass:NSMutableDictionary.class]) {
    return nil;
  }
  NSMutableDictionary *root = object;
  NSMutableDictionary *data = root[@"data"];
  NSMutableDictionary *configs = data[@"configs"];
  NSDictionary *values = MDKMockOverride(MDKABConfigMockIdentifier)[@"values"];
  if (![data isKindOfClass:NSMutableDictionary.class] ||
      ![configs isKindOfClass:NSMutableDictionary.class] ||
      ![values isKindOfClass:NSDictionary.class]) {
    return nil;
  }
  [values enumerateKeysAndObjectsUsingBlock:^(id key, id value, BOOL *stop) {
    (void)stop;
    if ([key isKindOfClass:NSString.class] && [value isKindOfClass:NSString.class]) {
      configs[key] = value;
    }
  }];
  return [NSJSONSerialization dataWithJSONObject:root options:0 error:nil];
}
